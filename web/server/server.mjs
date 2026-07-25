import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createWeekUpDatabase, maintainBackups } from "./week-up-database.mjs";
import { createAiReviewService, createCodexCliRunner } from "./ai-review-service.mjs";
import { createLearningMoreClient } from "../lib/learning-more-client.ts";
import { createLearningMoreSyncService } from "./learning-more-sync.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WEEK_UP_PORT ?? 4173);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const staticRoot = join(projectRoot, "demo-dist");
const localDataRoot = process.env.WEEK_UP_DATA_DIR
  ? resolve(process.env.WEEK_UP_DATA_DIR)
  : join(process.env.LOCALAPPDATA ?? projectRoot, "Week UP");
const store = await createWeekUpDatabase(join(localDataRoot, "data", "week-up.sqlite"));
const aiReview = createAiReviewService({ codex: createCodexCliRunner({ dataRoot: localDataRoot, projectRoot }) });
const learningMoreSync = createLearningMoreSyncService({
  store,
  client: createLearningMoreClient(process.env.LEARNING_MORE_BASE_URL ?? "http://127.0.0.1:43120"),
});

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".ico", "image/x-icon"],
]);

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function proxyLearningMore(request, response, url) {
  const target = new URL(url.pathname.replace(/^\/learning-more-api/, "") + url.search, "http://127.0.0.1:43120");
  try {
    const upstream = await fetch(target, { method: request.method, headers: { accept: request.headers.accept ?? "application/json" } });
    response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    json(response, 503, { error: "learning_more_unavailable" });
  }
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = normalize(join(staticRoot, requested));
  const rootPrefix = staticRoot.endsWith(sep) ? staticRoot : `${staticRoot}${sep}`;
  if (candidate !== staticRoot && !candidate.startsWith(rootPrefix)) return false;
  let filePath = candidate;
  try { await access(filePath); }
  catch { filePath = join(staticRoot, "index.html"); }
  response.writeHead(200, { "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream", "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable" });
  createReadStream(filePath).pipe(response);
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${HOST}:${PORT}`}`);
  if (request.headers.host?.split(":")[0]?.toLowerCase() === "localhost") {
    response.writeHead(307, { location: `http://${HOST}:${PORT}${url.pathname}${url.search}`, "cache-control": "no-store" });
    response.end();
    return;
  }
  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      json(response, 200, { status: "ok", storage: store.integrityCheck() ? "ok" : "error", revision: store.load().revision });
      return;
    }
    if (url.pathname === "/api/state" && request.method === "GET") { json(response, 200, { state: store.load() }); return; }
    if (url.pathname === "/api/learning-more/sync" && request.method === "POST") {
      json(response, 200, await learningMoreSync.runSafely());
      return;
    }
    if (url.pathname === "/api/plans" && request.method === "GET") {
      const from = url.searchParams.get("from") ?? "0000-01-01";
      const to = url.searchParams.get("to") ?? "9999-12-31";
      json(response, 200, { revision: store.load().revision, plans: store.loadPlansRange(from, to, url.searchParams.get("includeArchived") === "1") });
      return;
    }
    if (url.pathname === "/week-up-review-api/v1/status" && request.method === "GET") {
      json(response, 200, await aiReview.status({ preferredProvider: url.searchParams.get("preferredProvider") ?? "codex-cli", apiBaseUrl: url.searchParams.get("apiBaseUrl") ?? "", refresh: url.searchParams.get("refresh") === "1" }));
      return;
    }
    if (url.pathname === "/week-up-review-api/v1/harvests" && request.method === "POST") {
      json(response, 200, await aiReview.generate(await readJson(request)));
      return;
    }
    if (url.pathname === "/api/commands" && request.method === "POST") {
      const body = await readJson(request);
      const result = store.dispatchChange(body.command, { expectedRevision: body.expectedRevision, commandId: body.commandId, occurredAt: body.occurredAt });
      json(response, 200, request.headers["x-week-up-protocol"] === "patch-v1"
        ? { patch: result.patch, changed: result.changed }
        : { state: result.state });
      return;
    }
    if (url.pathname === "/api/migrations/indexed-db" && request.method === "POST") {
      const body = await readJson(request);
      const state = store.migrate(body.state);
      await maintainBackups(store, join(localDataRoot, "backups"));
      json(response, 200, { state });
      return;
    }
    if (url.pathname === "/api/state/restore" && request.method === "POST") {
      const body = await readJson(request);
      const state = store.replace(body.state);
      await maintainBackups(store, join(localDataRoot, "backups"));
      json(response, 200, { state });
      return;
    }
    if (url.pathname.startsWith("/learning-more-api/")) { await proxyLearningMore(request, response, url); return; }
    await serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    const conflict = error?.code === "REVISION_CONFLICT" || error?.code === "MIGRATION_TARGET_NOT_EMPTY";
    const message = error instanceof Error ? error.message : "internal_error";
    const invalidRequest = error instanceof SyntaxError
      || /(?:_not_found|_invalid|_empty|_immutable|_locked|_already_exists)$/.test(message)
      || message.startsWith("week_up_command_unsupported:");
    json(response, conflict ? 409 : message === "request_too_large" ? 413 : invalidRequest ? 400 : 500, {
      error: message,
      ...(error?.currentState ? { state: error.currentState } : {}),
    });
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`Week UP is ready at http://${HOST}:${PORT}/`);
  console.log(`SQLite: ${store.path}`);
  if (store.migrationBackupPath) console.log(`Pre-migration backup: ${store.migrationBackupPath}`);
  try { await maintainBackups(store, join(localDataRoot, "backups")); }
  catch (error) { console.error("Backup failed:", error); }
});

const backupTimer = setInterval(() => void maintainBackups(store, join(localDataRoot, "backups")).catch((error) => console.error("Backup failed:", error)), 6 * 60 * 60 * 1000);
backupTimer.unref();

function shutdown() {
  clearInterval(backupTimer);
  server.close(() => { store.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
