import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { zstdDecompressSync } from "node:zlib";

/** Zstandard frame magic, little-endian on disk. */
const ZSTD_MAGIC = 0xfd2fb528;

/** Tools whose call arguments name a file the call is about to mutate. */
const MUTATING_TOOLS = new Map([
  ["write", "create"],
  ["create_file", "create"],
  ["edit", "modify"],
  ["multi_edit", "modify"],
  ["str_replace_editor", "modify"],
  ["ops_write", "create"],
  ["ops_edit", "modify"],
  ["apply_patch", "patch"]
]);

/** Argument keys a mutating tool may use for its target path. */
const PATH_KEYS = ["path", "file_path", "filePath", "target_file", "target"];

/** Tools whose result proves the model had already seen a file's content. */
const READING_TOOLS = new Set(["read", "read_image", "view", "ops_read_files"]);

/**
 * Locate complete Zstandard frames without decompressing their blocks.
 *
 * Session artifacts are append-only: every durable batch is its own frame, so
 * a plain one-shot decompress of the file stops after the first one and would
 * read only the session header. This walks the frame structure — the same
 * algorithm the harness uses to recover a torn tail — and returns the byte
 * range of every complete frame.
 */
function scanFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break;
    offset += 4;
    if (offset >= buffer.length) break;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return frames;
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return frames;
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}

/**
 * Decode a stored session artifact into its raw event list.
 * @param path - the artifact path from `sessionPersistence.locate()`.
 */
export async function readSessionEvents(path) {
  const bytes = await readFile(path);
  const text = path.endsWith(".zstd")
    ? scanFrames(bytes)
        .map((frame) => {
          try {
            return zstdDecompressSync(bytes.subarray(frame.start, frame.end)).toString("utf8");
          } catch {
            return "";
          }
        })
        .join("")
    : bytes.toString("utf8");
  const events = [];
  for (const line of text.split("\n")) {
    if (line === "") continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.type === "string") events.push(parsed);
    } catch {}
  }
  return events;
}

function parseArguments(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function patchTargets(args) {
  const text = [args.patch, args.input, args.diff, args.text].find(
    (value) => typeof value === "string"
  );
  if (text === void 0) return [];
  const targets = [];
  for (const line of text.split("\n")) {
    const match = /^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$/.exec(line);
    if (match) targets.push({ path: match[1], kind: match[0].includes("Add") ? "create" : "modify" });
  }
  return targets;
}

function targetsOf(name, args) {
  if (args === null) return [];
  if (name === "apply_patch") return patchTargets(args);
  if (name === "ops_read_files" || name === "ops_write") {
    const list = Array.isArray(args.files) ? args.files : null;
    if (list !== null) {
      return list
        .map((entry) => (typeof entry?.path === "string" ? entry.path : null))
        .filter((value) => value !== null)
        .map((path) => ({ path, kind: MUTATING_TOOLS.get(name) ?? "modify" }));
    }
  }
  for (const key of PATH_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value !== "") {
      return [{ path: value, kind: MUTATING_TOOLS.get(name) ?? "modify" }];
    }
  }
  return [];
}

/**
 * Resolve one argument path against the session cwd, refusing anything that
 * escapes it: a rollback may only ever touch the workspace it belongs to.
 */
function resolveInside(cwd, raw) {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (trimmed === "") return null;
  const absolute = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  const relation = relative(cwd, absolute);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) return null;
  if (relation.split(sep).includes(".git")) return null;
  return absolute;
}

/**
 * Derive which workspace files a session touched, and whether it created them.
 *
 * A path counts as created when the session's first mutation of it is a plain
 * write with no earlier read in the same session — the harness requires a read
 * before overwriting an existing file, so a write with no prior read means the
 * file did not exist yet.
 *
 * @returns `{ cwd, items, skipped }` where every item carries the workspace
 * relative path, the classification, and how many mutations hit it.
 */
export function collectTouchedFiles(events, cwd) {
  const read = new Set();
  const order = [];
  const byPath = new Map();
  let skipped = 0;

  for (const event of events) {
    if (event.type !== "tool/call") continue;
    const data = event.data;
    if (!data || typeof data.name !== "string") continue;
    const tool = data.name;
    const args = parseArguments(data.arguments);
    const isReader = READING_TOOLS.has(tool);
    const isMutator = MUTATING_TOOLS.has(tool);
    if (!isReader && !isMutator) continue;

    for (const target of targetsOf(tool, args)) {
      const absolute = resolveInside(cwd, target.path);
      if (absolute === null) {
        skipped += 1;
        continue;
      }
      if (isReader) {
        read.add(absolute);
        continue;
      }
      const existing = byPath.get(absolute);
      if (existing !== void 0) {
        existing.count += 1;
        continue;
      }
      const entry = {
        absolute,
        path: relative(cwd, absolute).split(sep).join("/"),
        kind: target.kind === "create" && !read.has(absolute) ? "created" : "modified",
        count: 1,
        tool
      };
      byPath.set(absolute, entry);
      order.push(entry);
    }
  }

  return { cwd, items: order, skipped };
}
