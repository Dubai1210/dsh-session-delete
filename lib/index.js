import { rm, rmdir, stat, readdir } from "node:fs/promises";
import { dirname, sep } from "node:path";
import { collectTouchedFiles, readSessionEvents } from "./transcript.js";
import { classifyTouchedFiles } from "./classify.js";

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
      sendJson(response, 200, { ok: true, cwd: null, residue: [], keep: [], skipped: 0 });
      return;
    }
    sendJson(response, 200, {
      ok: true,
      cwd: plan.cwd,
      residue: plan.items
        .filter((item) => item.role === "residue")
        .map((item) => ({ path: item.path, reason: item.reason })),
      keep: plan.items
        .filter((item) => item.role === "keep")
        .map((item) => ({ path: item.path, reason: item.reason })),
      skipped: plan.skipped
    });
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
  const clean = input.body?.clean !== false;
  try {
    const result = await deleteSession(ctx, input.sessionId, clean);
    sendJson(response, 200, { ok: true, ...result });
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
async function planSession(ctx, sessionId) {
  const persistence = service(ctx, "sessionPersistence");
  if (persistence === void 0) return null;
  const header = await findHeader(ctx, sessionId);
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
  const items = classifyTouchedFiles(collected.items, events, cwd);
  return { cwd, items, skipped: collected.skipped };
}

/**
 * Remove one session end to end: clean up the scaffolding it left in the
 * workspace, stop its live agent, delete its stored transcript, drop it from
 * every workspace and from the archived/pinned sets, then notify clients.
 */
async function deleteSession(ctx, sessionId, clean) {
  const sessions = service(ctx, "sessions");
  const agents = service(ctx, "agents");

  const header = await findHeader(ctx, sessionId);
  const live = header !== null && sessions?.get(sessionId) !== void 0;

  // Workspace cleanup comes first: the transcript is the only record of what
  // the session wrote, so it has to be read before the transcript is deleted.
  const workspace = { removed: [], kept: [], failed: [], cwd: null };
  if (clean) {
    try {
      const plan = await planSession(ctx, sessionId);
      if (plan !== null) {
        workspace.cwd = plan.cwd;
        workspace.kept = plan.items
          .filter((item) => item.role === "keep")
          .map((item) => item.path);
        const outcome = await removeFiles(plan.cwd, plan.items.filter((item) => item.role === "residue"));
        workspace.removed = outcome.removed;
        workspace.failed = outcome.failed;
      }
    } catch (error) {
      console.warn("[dsh-session-delete] workspace cleanup failed", error);
    }
  }

  const agent = agents?.get(sessionId);
  if (agent) {
    try {
      agent.cancel({ kind: "user" });
    } catch {}
    try {
      await agent.scope?.dispose?.();
    } catch {}
  }

  let removedFiles = false;
  const persistence = service(ctx, "sessionPersistence");
  if (header !== null && persistence !== void 0) {
    try {
      const located = persistence.locate({ cwd: header.cwd, id: header.id });
      if (located && typeof located.path === "string" && located.path !== "") {
        await rm(dirname(located.path), { recursive: true, force: true });
        removedFiles = true;
      }
    } catch (error) {
      console.warn("[dsh-session-delete] failed to remove session files", error);
    }
  }

  const cacheRows = await dropProjectionCache(ctx, sessionId);

  const registry = service(ctx, "workspaceRegistry");
  if (registry) {
    try {
      for (const entity of registry.list()) {
        try {
          await entity.detachSession(sessionId);
        } catch {}
      }
    } catch {}
    try {
      await registry.unarchiveSession(sessionId);
    } catch {}
    try {
      await registry.unpinSession(sessionId);
    } catch {}
  }

  try {
    ctx.emit("api-session/removed", sessionId);
  } catch {}

  return { sessionId, live, removedFiles, cacheRows, headerFound: header !== null, workspace };
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
