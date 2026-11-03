import { rm, rmdir, stat, readdir } from "node:fs/promises";
import { dirname, sep } from "node:path";
import { collectTouchedFiles, readSessionEvents } from "./transcript.js";

export const name = "dsh-session-delete";
export const inject = ["webServer"];

const DELETE_PATH = "/dsh-session-delete/delete";
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
        host.webServer.register({
          kind: "exact",
          path: DELETE_PATH,
          handler: (request, response) => handleDelete(ctx, request, response)
        }, "dsh-session-delete: delete route")
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

async function handleDelete(ctx, request, response) {
  if (!allowPluginRequest(request, response)) return;
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" });
    response.end();
    return;
  }
  let body;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    sendJson(response, 400, { ok: false, error: "invalid request body" });
    return;
  }
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (sessionId === "") {
    sendJson(response, 400, { ok: false, error: "sessionId is required" });
    return;
  }
  try {
    const result = await deleteSession(ctx, sessionId);
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
 * Remove one session end to end: delete the workspace files it touched, stop
 * its live agent, delete its stored transcript, drop it from every workspace
 * and from the archived/pinned sets, then tell connected clients.
 */
async function deleteSession(ctx, sessionId) {
  const sessions = service(ctx, "sessions");
  const agents = service(ctx, "agents");
  const persistence = service(ctx, "sessionPersistence");
  const registry = service(ctx, "workspaceRegistry");

  const header = await findHeader(ctx, sessionId);
  const live = header !== null && sessions?.get(sessionId) !== void 0;

  // Workspace files first: the transcript is the only record of what the
  // session wrote, so it has to be read before the transcript is deleted.
  const workspace = { removed: 0, failed: [], cwd: null };
  if (header !== null && persistence !== void 0) {
    try {
      Object.assign(workspace, await removeTouchedFiles(persistence, header));
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
 * Delete every workspace file the session created or edited, then prune the
 * directories that removal left empty (never above the session's cwd).
 */
export async function removeTouchedFiles(persistence, header) {
  const cwd = typeof header?.cwd === "string" && header.cwd !== "" ? header.cwd : null;
  if (cwd === null) return { removed: 0, failed: [], cwd: null };

  const located = persistence.locate({ cwd: header.cwd, id: header.id });
  if (located === null || typeof located.path !== "string") {
    return { removed: 0, failed: [], cwd };
  }

  let events;
  try {
    events = await readSessionEvents(located.path);
  } catch {
    return { removed: 0, failed: [], cwd };
  }

  const collected = collectTouchedFiles(events, cwd);
  let removed = 0;
  const failed = [];
  const parents = new Set();

  for (const item of collected.items) {
    try {
      const info = await stat(item.absolute);
      if (!info.isFile()) continue;
      await rm(item.absolute, { force: true });
      removed += 1;
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

  return { removed, failed, cwd };
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
