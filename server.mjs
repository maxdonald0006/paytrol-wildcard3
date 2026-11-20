import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, resolve, sep } from "node:path";
import { analyzePayout, InputValidationError } from "./src/guard.mjs";
import { buildDemoData } from "./src/demo-data.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(HERE, "dist");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_BYTES = 16 * 1024;
// Seed once per process so demo policy snapshots and repeated-result checksums stay stable.
const DEMO_DATA = buildDemoData(new Date());
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function commonHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self' data: https://crs.aztec.network; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    ...extra
  };
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, commonHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  }));
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large. The demo accepts up to 16 KB.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function serveStatic(pathname, response, method = "GET") {
  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  } catch {
    return false;
  }
  if (relativePath.includes("\0")) return false;

  const fullPath = resolve(DIST_DIR, relativePath);
  if (fullPath !== DIST_DIR && !fullPath.startsWith(`${DIST_DIR}${sep}`)) return false;

  try {
    const fileInfo = await stat(fullPath);
    if (!fileInfo.isFile()) return false;
    const data = await readFile(fullPath);
    const isHtml = extname(fullPath) === ".html";
    const cacheControl = isHtml ? "no-store" : "public, max-age=300";
    response.writeHead(200, commonHeaders({
      "Content-Type": MIME_TYPES[extname(fullPath)] || "application/octet-stream",
      "Cache-Control": cacheControl,
      "Content-Length": data.length
    }));
    response.end(method === "HEAD" ? undefined : data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://paytrol.local");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true, service: "paytrol-demo-agent", version: "0.1.0", simulationOnly: true });
    return;
  }

  if (request.method === "GET" && pathname === "/api/scenarios") {
    sendJson(response, 200, { scenarios: DEMO_DATA.scenarios });
    return;
  }

  if (["/api/analyze", "/api/agent", "/agent"].includes(pathname)) {
    if (request.method !== "POST") {
      sendJson(response, 405, {
        error: { code: "METHOD_NOT_ALLOWED", message: "Send a POST with a JSON payout request." },
        acceptedMethod: "POST"
      }, { Allow: "POST" });
      return;
    }

    const contentType = request.headers["content-type"] || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      sendJson(response, 415, { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." } });
      return;
    }

    try {
      const input = await readJsonBody(request);
      const result = analyzePayout(input, { data: DEMO_DATA });
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof InputValidationError) {
        sendJson(response, 400, {
          error: { code: "INVALID_INPUT", message: error.message, field: error.field }
        });
        return;
      }
      sendJson(response, error.status || 500, {
        error: {
          code: error.status === 413 ? "BODY_TOO_LARGE" : error.status === 400 ? "INVALID_JSON" : "INTERNAL_ERROR",
          message: error.status ? error.message : "The demo could not evaluate this request."
        }
      });
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const served = await serveStatic(pathname, response, request.method);
    if (served) return;
  }

  sendJson(response, 404, { error: { code: "NOT_FOUND", message: "No route exists at this path." } });
});

server.listen(PORT, HOST, () => {
  console.log(`payTrol demo listening on http://${HOST}:${PORT}`);
  console.log("Routes: GET /health · GET /api/scenarios · POST /api/analyze · POST /api/agent");
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
