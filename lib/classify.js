import { existsSync } from "node:fs";
import { dirname, relative, sep } from "node:path";

/** Directories whose contents are build/tool scaffolding, never a deliverable. */
const SCRATCH_SEGMENTS = new Set([
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".cache",
  ".tmp",
  "tmp",
  "temp",
  ".next",
  ".nuxt",
  ".turbo",
  ".parcel-cache"
]);

/** Helper sources a session writes while working but nobody asks to keep. */
const SCRIPT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".pyw",
  ".ps1",
  ".psm1",
  ".sh",
  ".bash",
  ".zsh",
  ".bat",
  ".cmd",
  ".vbs",
  ".ahk",
  ".rb",
  ".pl",
  ".php",
  ".lua",
  ".go",
  ".rs",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".java",
  ".kt",
  ".groovy",
  ".cmake",
  ".mk"
]);

/** Things a session downloads or builds to get the job done. */
const ARTIFACT_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".iso",
  ".img",
  ".apk",
  ".deb",
  ".rpm",
  ".jar",
  ".whl",
  ".zip",
  ".7z",
  ".rar",
  ".tar",
  ".gz",
  ".tgz",
  ".xz",
  ".bz2",
  ".zst",
  ".part",
  ".crdownload",
  ".torrent",
  ".pdb",
  ".o",
  ".obj",
  ".class",
  ".pyc"
]);

/** Scratch output: logs, backups, editor droppings. */
const TEMP_EXTENSIONS = new Set([
  ".log",
  ".bak",
  ".tmp",
  ".temp",
  ".cache",
  ".lock",
  ".pid",
  ".map",
  ".out",
  ".err",
  ".orig",
  ".rej",
  ".swp",
  ".dump"
]);

/** Documents and media: the kind of file a session exists to produce. */
const DOCUMENT_EXTENSIONS = new Set([
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".pdf",
  ".md",
  ".txt",
  ".csv",
  ".tsv",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
  ".epub",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".ico",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".mp3",
  ".wav",
  ".m4a",
  ".flac",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".xml",
  ".html",
  ".css"
]);

function extensionOf(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

function isInsideGitTree(cwd, absolute) {
  let current = dirname(absolute);
  const stop = cwd;
  for (let depth = 0; depth < 24; depth += 1) {
    if (existsSync(current + sep + ".git")) return true;
    if (current === stop) break;
    const parent = dirname(current);
    if (parent === current) break;
    if (relative(cwd, parent).startsWith("..")) break;
    current = parent;
  }
  return false;
}

/** Paths the session handed to the user as a deliverable (`present`). */
export function collectPresented(events) {
  const presented = new Set();
  for (const event of events) {
    if (event.type !== "tool/call") continue;
    const data = event.data;
    if (!data || typeof data.name !== "string") continue;
    if (!/present/i.test(data.name)) continue;
    let args = null;
    try {
      args = typeof data.arguments === "string" ? JSON.parse(data.arguments) : data.arguments;
    } catch {
      continue;
    }
    const files = Array.isArray(args?.files) ? args.files : [];
    for (const entry of files) {
      if (typeof entry === "string") presented.add(entry);
      else if (typeof entry?.path === "string") presented.add(entry.path);
    }
  }
  return presented;
}

/** Text of the last few assistant replies, used to spot files it called results. */
export function collectFinalText(events) {
  const replies = [];
  for (let index = events.length - 1; index >= 0 && replies.length < 3; index -= 1) {
    const event = events[index];
    if (event.type !== "assistant/message") continue;
    const content = event.data?.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
    if (text.trim() !== "") replies.push(text);
  }
  return replies.join("\n");
}

/**
 * Split the files a session touched into deliverables to keep and scaffolding
 * to clean up.
 *
 * Order matters: an explicit hand-off, a version-controlled tree, or a mutated
 * existing file always wins over the extension heuristics, because losing one
 * of those is unrecoverable while leaving a stray script behind is not.
 *
 * @returns the same items, each with `role` (`keep` | `residue`) and `reason`.
 */
export function classifyTouchedFiles(items, events, cwd) {
  const presented = collectPresented(events);
  const finalText = collectFinalText(events);
  const presentedAbsolute = new Set();
  const referencedAbsolute = new Set();

  for (const raw of presented) {
    presentedAbsolute.add(raw.replace(/\\/g, "/"));
    presentedAbsolute.add(raw);
  }

  return items.map((item) => {
    const normalized = item.path;
    const base = normalized.slice(normalized.lastIndexOf("/") + 1);
    const ext = extensionOf(normalized);
    const segments = normalized.split("/");
    const keep = (reason) => ({ ...item, role: "keep", reason });
    const drop = (reason) => ({ ...item, role: "residue", reason });

    if (item.kind === "modified") return keep("edited");
    if (
      presentedAbsolute.has(normalized) ||
      presentedAbsolute.has(item.absolute) ||
      presentedAbsolute.has(item.absolute.replace(/\\/g, "/"))
    ) {
      return keep("presented");
    }
    if (finalText !== "" && (finalText.includes(base) || finalText.includes(normalized))) {
      referencedAbsolute.add(normalized);
      return keep("referenced");
    }
    if (isInsideGitTree(cwd, item.absolute)) return keep("versioned");
    if (segments.some((segment) => SCRATCH_SEGMENTS.has(segment))) return drop("scratch-dir");
    if (base.startsWith(".")) return drop("hidden");
    if (SCRIPT_EXTENSIONS.has(ext)) return drop("script");
    if (ARTIFACT_EXTENSIONS.has(ext)) return drop("artifact");
    if (TEMP_EXTENSIONS.has(ext)) return drop("temp");
    if (DOCUMENT_EXTENSIONS.has(ext)) return keep("document");
    return keep("unknown");
  });
}
