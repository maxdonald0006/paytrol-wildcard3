import { analyzePayout, InputValidationError } from "./guard.mjs";
import { buildDemoData } from "./demo-data.mjs";

const MAX_BODY_BYTES = 16 * 1024;
// Freeze the synthetic register date so separate edge isolates evaluate the same demo snapshot.
const DEMO_CLOCK = new Date("2026-11-17T12:00:00.000Z");
const DEMO_DATA = buildDemoData(DEMO_CLOCK);
const AGENT_PATHS = new Set(["/api/analyze", "/api/agent", "/agent"]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
};

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function bodyError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw bodyError("Request body is too large. The demo accepts up to 16 KB.", 413);
  }

  const reader = request.body?.getReader();
  const chunks = [];
  let total = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw bodyError("Request body is too large. The demo accepts up to 16 KB.", 413);
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw bodyError("Request body must be valid JSON.", 400);
  }
}

function apiError(error) {
  if (error instanceof InputValidationError) {
    return jsonResponse(400, {
      error: { code: "INVALID_INPUT", message: error.message, field: error.field }
    });
  }

  if (error.status === 400 || error.status === 413) {
    return jsonResponse(error.status, {
      error: {
        code: error.status === 413 ? "BODY_TOO_LARGE" : "INVALID_JSON",
        message: error.message
      }
    });
  }

  return jsonResponse(500, {
    error: { code: "INTERNAL_ERROR", message: "The demo could not evaluate this request." }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/health") {
      return jsonResponse(200, {
        ok: true,
        service: "paytrol-demo-agent",
        version: "0.1.0",
        simulationOnly: true
      });
    }

    if (request.method === "GET" && pathname === "/api/scenarios") {
      return jsonResponse(200, { scenarios: DEMO_DATA.scenarios });
    }

    if (AGENT_PATHS.has(pathname)) {
      if (request.method !== "POST") {
        return jsonResponse(405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "Send a POST with a JSON payout request." },
          acceptedMethod: "POST"
        }, { Allow: "POST" });
      }

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return jsonResponse(415, {
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." }
        });
      }

      try {
        const input = await readJsonBody(request);
        const result = analyzePayout(input, { data: DEMO_DATA, now: DEMO_CLOCK });
        result.createdAt = new Date().toISOString();
        result.policySnapshotAsOf = DEMO_CLOCK.toISOString();
        return jsonResponse(200, result);
      } catch (error) {
        return apiError(error);
      }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse(404, {
      error: { code: "NOT_FOUND", message: "No route exists at this path." }
    });
  }
};
