import { rm } from "node:fs/promises";
import { dirname } from "node:path";

export const name = "dsh-session-delete";
export const inject = ["webServer"];

const ROUTE_PATH = "/dsh-session-delete/delete";
const MAX_BODY_BYTES = 256 * 1024;

export function apply(ctx) {
  ctx.inject(["webServer"], (host) => {
    host.effect(() => {
      return host.webServer.register({
        kind: "exact",
        path: ROUTE_PATH,
        handler: (request, response) => handleDelete(ctx, request, response)
      });
    }, "dsh-session-delete: delete route");
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

/**
 * Remove one session end to end: stop its live agent, delete its stored
 * transcript directory, detach it from every workspace, drop it from the
 * archived/pinned global sets, and tell connected clients the row is gone.
 */
async function deleteSession(ctx, sessionId) {
  const sessions = service(ctx, "sessions");
  const agents = service(ctx, "agents");
  const persistence = service(ctx, "sessionPersistence");
  const registry = service(ctx, "workspaceRegistry");

  let header = null;
  try {
    header = sessions?.get(sessionId)?.header ?? null;
  } catch {
    header = null;
  }
  const live = header !== null;

  const agent = agents?.get(sessionId);
  if (agent) {
    try {
      agent.cancel({ kind: "user" });
    } catch {}
    try {
      await agent.scope?.dispose?.();
    } catch {}
  }

  if (header === null && persistence) {
    try {
      const snapshots = await persistence.list();
      header = snapshots.find((snapshot) => snapshot?.header?.id === sessionId)?.header ?? null;
    } catch {}
  }

  let removedFiles = false;
  if (header !== null && persistence) {
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

  return { sessionId, live, removedFiles, cacheRows, headerFound: header !== null };
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
