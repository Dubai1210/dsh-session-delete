import { readFile, rm, rmdir, stat, readdir, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { collectTouchedFiles, readSessionEvents } from "./transcript.js";

export const name = "dsh-session-delete";
export const inject = ["webServer"];

const DELETE_PATH = "/dsh-session-delete/delete";
const INSPECT_PATH = "/dsh-session-delete/inspect";
const MAX_BODY_BYTES = 256 * 1024;

export function apply(ctx) {
  ctx.inject(["webServer"], (host) => {
    host.effect(() => {
      const disposers = [];
      const track = (disposer) => {
        if (typeof disposer === "function") disposers.push(disposer);
        return disposer;
      };
      track(
        host.webServer.register(
          {
            kind: "exact",
            path: INSPECT_PATH,
            handler: (request, response) => handleInspect(ctx, request, response)
          },
          "dsh-session-delete: inspect route"
        )
      );
      track(
        host.webServer.register(
          {
            kind: "exact",
            path: DELETE_PATH,
            handler: (request, response) => handleDelete(ctx, request, response)
          },
          "dsh-session-delete: delete route"
        )
      );
      return () => {
        for (const disposer of disposers.reverse()) {
          try {
            disposer();
          } catch {}
        }
      };
    }, "dsh-session-delete: routes");
  });
}

const plugin = { name, inject, apply };
export default plugin;

/** Read the session id out of a POST body, or answer 400 and return null. */
async function readSessionId(request, response) {
  if (!allowPluginRequest(request, response)) return null;
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" });
    response.end();
    return null;
  }
  let body;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid request body" });
    return null;
  }
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (sessionId === "") {
    sendJson(response, 400, { ok: false, error: "sessionId is required" });
    return null;
  }
  return { sessionId, body };
}

/** Dry run: what a delete would clean up, and what it would leave alone. */
async function handleInspect(ctx, request, response) {
  const input = await readSessionId(request, response);
  if (input === null) return;
  try {
    const plan = await planSession(ctx, input.sessionId);
    if (plan === null) {
      sendJson(response, 200, { ok: true, cwd: null, files: [], skipped: 0 });
      return;
    }
    sendJson(response, 200, { ok: true, cwd: plan.cwd, files: plan.items, skipped: plan.skipped });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleDelete(ctx, request, response) {
  const input = await readSessionId(request, response);
  if (input === null) return;
  const requested = Array.isArray(input.body?.files)
    ? input.body.files.filter((item) => typeof item === "string" && item !== "")
    : null;
  try {
    const result = await deleteSession(ctx, input.sessionId, requested);
    sendJson(response, result.error === null ? 200 : 404, { ok: result.error === null, ...result });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Resolve a session header from the live store first, then from disk. */
async function findHeader(ctx, sessionId) {
  const sessions = service(ctx, "sessions");
  const persistence = service(ctx, "sessionPersistence");
  try {
    const live = sessions?.get(sessionId)?.header;
    if (live) return live;
  } catch {}
  if (persistence === void 0) return null;
  try {
    const snapshots = await persistence.list();
    return snapshots.find((snapshot) => snapshot?.header?.id === sessionId)?.header ?? null;
  } catch {
    return null;
  }
}

/**
 * Classify the workspace files a session touched into scaffolding to clean up
 * and deliverables to keep. Read-only: nothing is removed here.
 */
export async function planSession(ctx, sessionId) {
  const persistence = service(ctx, "sessionPersistence");
  if (persistence === void 0) return null;
  const { header } = await resolveMeta(ctx, sessionId);
  if (header === null) return null;
  const cwd = typeof header.cwd === "string" && header.cwd !== "" ? header.cwd : null;
  if (cwd === null) return null;
  const located = persistence.locate({ cwd: header.cwd, id: header.id });
  if (!located || typeof located.path !== "string" || located.path === "") return null;

  let events;
  try {
    events = await readSessionEvents(located.path);
  } catch {
    return null;
  }

  const collected = collectTouchedFiles(events, cwd);
  const items = [];
  for (const item of collected.items) {
    let exists = false;
    let size = 0;
    try {
      const info = await stat(item.absolute);
      exists = info.isFile();
      size = exists ? info.size : 0;
    } catch {}
    items.push({
      path: item.path,
      absolute: item.absolute,
      kind: item.kind,
      tool: item.tool,
      count: item.count,
      exists,
      size
    });
  }
  return { cwd, items, skipped: collected.skipped };
}

/**
 * Remove one session end to end: clean up the scaffolding it left in the
 * workspace, stop its live agent, delete its stored transcript, drop it from
 * every workspace and from the archived/pinned sets, then notify clients.
 */
const STOP_SETTLE_MS = 350;
const RM_RETRY = 3;
const RM_RETRY_GAP_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve a session's creation header. A live session has it in memory; a cold
 * one comes from `sessionPersistence.stat()` (the authoritative per-id lookup),
 * with `list()` only as a fallback for backends that do not implement `stat`.
 */
async function resolveMeta(ctx, sessionId) {
  const sessions = service(ctx, "sessions");
  try {
    const live = sessions?.get(sessionId);
    if (live?.header) return { header: live.header, live: true };
  } catch {}
  const persistence = service(ctx, "sessionPersistence");
  if (persistence === void 0) return { header: null, live: false };
  try {
    if (typeof persistence.stat === "function") {
      const found = await persistence.stat(sessionId);
      if (found?.header) {
        const location = typeof found.location?.path === "string" ? found.location.path : null;
        return { header: found.header, live: false, location };
      }
    }
  } catch {}
  try {
    const snapshots = await persistence.list();
    const hit = Array.isArray(snapshots)
      ? snapshots.find((snapshot) => snapshot?.header?.id === sessionId)
      : void 0;
    if (hit?.header) return { header: hit.header, live: false };
  } catch {}
  return { header: null, live: false, location: null };
}

/**
 * Drop the in-memory Session record. Deleting the files is not enough: the
 * session store keeps the object, and every list refresh re-publishes it to the
 * client (a workspace-less ghost under the ungrouped bucket).
 */
function forgetSession(ctx, sessionId) {
  const store = service(ctx, "sessions");
  if (store === void 0) return false;
  try {
    const bag = store.store;
    const entry = bag instanceof Map ? bag.get(sessionId) : void 0;
    if (entry === void 0) return false;
    if (typeof store.detachEntered === "function") {
      store.detachEntered(entry);
      return true;
    }
  } catch (error) {
    console.warn("[dsh-session-delete] failed to drop the in-memory session record", error);
  }
  return false;
}

/** Last resort: find <root>/<project>/<sessionId> by name when no header loads. */
async function scanSessionDir(persistence, sessionId) {
  const root = persistence?.root;
  if (typeof root !== "string" || root === "") return null;
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const dir = join(root, project.name);
    let children;
    try {
      children = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (child.isDirectory() && child.name === sessionId) return join(dir, child.name);
    }
  }
  return null;
}

/** Recursive remove that survives a transient Windows AV/index lock. */
async function rmWithRetry(target) {
  let lastError = null;
  for (let attempt = 0; attempt < RM_RETRY; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return true;
    } catch (error) {
      lastError = error;
      await sleep(RM_RETRY_GAP_MS);
    }
  }
  throw lastError ?? new Error("remove failed");
}

/**
 * Drop the session's row from dsh-context's overview cache
 * (`storages/dsh-context/overview-cache.v1.json`), which is what the context
 * inspector lists. Best effort: a stale cache only costs a rescan.
 */
async function dropContextCache(ctx, sessionId) {
  const persistence = service(ctx, "sessionPersistence");
  const root = persistence?.root;
  if (typeof root !== "string" || root === "") return false;
  const file = join(dirname(root), "storages", "dsh-context", "overview-cache.v1.json");
  try {
    const raw = await readFile(file, "utf8");
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc?.sessions)) return false;
    const kept = doc.sessions.filter((row) => {
      const id = row?.session?.id ?? row?.sessionId ?? row?.id;
      return id !== sessionId;
    });
    if (kept.length === doc.sessions.length) return false;
    doc.sessions = kept;
    doc.savedAt = Date.now();
    await writeFile(file, JSON.stringify(doc), "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete one session: stop activity, drop every index entry that points at it,
 * then remove the transcript directory.
 *
 * Order matters. The transcript is the only record of which workspace files the
 * session wrote, so the residue plan is read first; the stop happens before the
 * remove so no pending flush recreates the directory; and a missing header is
 * reported as a failure instead of a silent success.
 */
export async function deleteSession(ctx, sessionId, requested) {
  const persistence = service(ctx, "sessionPersistence");
  const resolved = await resolveMeta(ctx, sessionId);
  const header = resolved.header;
  const live = resolved.live;
  const knownPath = typeof resolved.location === "string" ? resolved.location : null;

  /* Workspace files are read from the transcript first: it is the only record
   * of what this session touched, and it disappears with the session. */
  const workspace = { removed: [], kept: [], failed: [], cwd: null, unknown: [] };
  const wanted = Array.isArray(requested) ? new Set(requested) : null;
  if (wanted !== null) {
    try {
      const plan = await planSession(ctx, sessionId);
      if (plan !== null) {
        workspace.cwd = plan.cwd;
        const known = new Set(plan.items.map((item) => item.path));
        for (const path of wanted) if (!known.has(path)) workspace.unknown.push(path);
        const selected = plan.items.filter((item) => wanted.has(item.path));
        workspace.kept = plan.items
          .filter((item) => !wanted.has(item.path))
          .map((item) => item.path);
        const outcome = await removeFiles(plan.cwd, selected);
        workspace.removed = outcome.removed;
        workspace.failed = outcome.failed;
      }
    } catch (error) {
      console.warn("[dsh-session-delete] workspace cleanup failed", error);
    }
  }

  // Stop activity through the registry hook (the sanctioned path), falling back
  // to the live agent when the runner is not mounted.
  let stopped = false;
  try {
    await ctx.parallel("workspace/session-stop", { sessionId });
    stopped = true;
  } catch {}
  if (!stopped) {
    const agent = service(ctx, "agents")?.get(sessionId);
    if (agent) {
      try {
        agent.cancel({ kind: "user" });
        await agent.scope?.dispose?.();
        stopped = true;
      } catch {}
    }
  }
  // Let the cancel-triggered flush land before the files disappear.
  await sleep(STOP_SETTLE_MS);

  const registry = service(ctx, "workspaceRegistry");
  if (registry) {
    for (const entity of registry.list()) {
      try {
        await entity.detachSession(sessionId);
      } catch {}
    }
    try {
      await registry.unarchiveSession(sessionId);
    } catch {}
    try {
      await registry.unpinSession(sessionId);
    } catch {}
  }

  const cacheRows = await dropProjectionCache(ctx, sessionId);
  const contextCacheDropped = await dropContextCache(ctx, sessionId);

  // Resolve the directory: live header -> locate(), cold header -> locate(),
  // no header -> directory scan. Only then is anything reported as deleted.
  let target = knownPath === null ? null : dirname(knownPath);
  if (target === null && header !== null && persistence !== void 0) {
    try {
      const located = persistence.locate({ cwd: header.cwd, id: header.id });
      if (located && typeof located.path === "string" && located.path !== "") {
        target = dirname(located.path);
      }
    } catch {}
  }
  if (target === null) target = await scanSessionDir(persistence, sessionId);

  let removedFiles = false;
  let error = null;
  if (target === null) {
    error = header === null ? "session not found" : "transcript directory not found";
  } else {
    try {
      await rmWithRetry(target);
      removedFiles = true;
    } catch (caught) {
      error = String(caught?.message ?? caught);
      console.warn("[dsh-session-delete] failed to remove session files", caught);
    }
  }

  // A record without files is exactly the ghost row we must not leave behind,
  // so the in-memory drop also covers "directory already gone" retries.
  const forgotten = forgetSession(ctx, sessionId);
  if (removedFiles || forgotten) {
    try {
      ctx.emit("api-session/removed", sessionId);
    } catch {}
  }
  if (!removedFiles && forgotten) error = null;

  return {
    sessionId,
    live,
    stopped,
    removedFiles,
    cacheRows,
    contextCacheDropped,
    forgotten,
    headerFound: header !== null,
    workspace,
    error
  };
}

/**
 * Delete the given files, then prune the directories that removal left empty
 * (never above the session's cwd).
 */
export async function removeFiles(cwd, items) {
  if (cwd === null || items.length === 0) return { removed: [], failed: [] };
  const removed = [];
  const failed = [];
  const parents = new Set();

  for (const item of items) {
    try {
      const info = await stat(item.absolute);
      if (!info.isFile()) continue;
      await rm(item.absolute, { force: true });
      removed.push(item.path);
      parents.add(dirname(item.absolute));
    } catch {
      failed.push(item.path);
    }
  }

  for (const start of parents) {
    let current = start;
    while (current !== cwd && current.startsWith(cwd + sep)) {
      try {
        if ((await readdir(current)).length > 0) break;
        await rmdir(current);
      } catch {
        break;
      }
      current = dirname(current);
    }
  }

  return { removed, failed };
}

/**
 * Drop the session's projection-cache row so no projected message text is left
 * behind in `storages/session_projcache`.
 */
async function dropProjectionCache(ctx, sessionId) {
  const facility = service(ctx, "storageDomain");
  if (!facility) return 0;
  try {
    const domain = facility.get("session_projcache");
    if (!domain) return 0;
    const removed = await domain.table("sessions").delete(sessionId);
    return removed ? 1 : 0;
  } catch (error) {
    console.warn("[dsh-session-delete] failed to drop projection cache row", error);
    return 0;
  }
}

function service(ctx, key) {
  try {
    return ctx.get(key, false);
  } catch {
    return void 0;
  }
}

function headerOf(request, name) {
  const headers = request?.headers;
  if (!headers) return "";
  const value = headers[name] ?? headers[String(name).toLowerCase()];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function denyCrossOrigin(response) {
  sendJson(response, 403, { ok: false, error: "cross-origin blocked" });
}

function allowPluginRequest(request, response) {
  const site = headerOf(request, "sec-fetch-site");
  if (site === "cross-site") {
    denyCrossOrigin(response);
    return false;
  }
  const origin = headerOf(request, "origin");
  if (origin === "null") {
    denyCrossOrigin(response);
    return false;
  }
  if (origin === "") return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    denyCrossOrigin(response);
    return false;
  }
  if (parsed.host !== headerOf(request, "host")) {
    denyCrossOrigin(response);
    return false;
  }
  return true;
}

async function readJsonBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
