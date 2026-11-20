import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";
import { createCircuitInputs, proofReadinessReason } from "../src/proof-inputs.mjs";

const baseUrl = "https://paytrol.example";
const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      return new Response(`asset:${url.pathname}`, {
        status: url.pathname === "/" ? 200 : 404,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }
};

function makeRequest(path, options = {}) {
  return new Request(new URL(path, baseUrl), options);
}

async function call(path, options = {}) {
  return worker.fetch(makeRequest(path, options), env);
}

async function postJson(path, payload) {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

test("Cloudflare Worker health route returns safe liveness metadata", async () => {
  const response = await call("/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.simulationOnly, true);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("static browser paths are delegated to the Cloudflare assets binding", async () => {
  const response = await call("/");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset:/");
});

test("all eight scenarios work through the public Worker API", async () => {
  const scenariosResponse = await call("/api/scenarios");
  assert.equal(scenariosResponse.status, 200);
  const { scenarios } = await scenariosResponse.json();
  assert.equal(scenarios.length, 8);

  for (const scenario of scenarios) {
    const response = await postJson("/api/agent", scenario.request);
    const result = await response.json();
    assert.equal(response.status, 200, scenario.id);
    assert.equal(result.decision, scenario.expectedDecision, scenario.id);
    assert.equal(result.checks.length, 10, scenario.id);
    assert.equal(result.simulationOnly, true, scenario.id);
    assert.equal(result.policySnapshotAsOf, "2026-11-17T12:00:00.000Z", scenario.id);
  }
});

test("READY Worker response can build the same ten-check ZK witness at its fixed policy time", async () => {
  const { scenarios } = await (await call("/api/scenarios")).json();
  const request = scenarios.find((scenario) => scenario.id === "clean").request;
  const response = await postJson("/api/agent", request);
  const result = await response.json();
  assert.equal(result.decision, "READY");
  assert.equal(result.policySnapshotAsOf, "2026-11-17T12:00:00.000Z");
  assert.equal(proofReadinessReason(result), null);
  const inputs = createCircuitInputs(result, "123456789");
  assert.equal(inputs.as_of_ms, String(Date.parse(result.policySnapshotAsOf)));
});

test("Worker receipt checksums are stable for repeated inputs", async () => {
  const { scenarios } = await (await call("/api/scenarios")).json();
  const request = scenarios.find((scenario) => scenario.id === "clean").request;
  const first = await (await postJson("/api/agent", request)).json();
  const second = await (await postJson("/api/agent", request)).json();
  assert.match(first.receipt.hash, /^[a-f0-9]{64}$/);
  assert.equal(first.receipt.hash, second.receipt.hash);
});

test("Worker API enforces method and content-type requirements", async () => {
  const wrongMethod = await call("/api/agent");
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("Allow"), "POST");

  const wrongType = await call("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}"
  });
  assert.equal(wrongType.status, 415);
});

test("Worker API returns clear JSON errors for malformed, oversized, and invalid requests", async () => {
  const invalidJson = await call("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad json"
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "INVALID_JSON");

  const oversized = await call("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(16 * 1024 + 1)
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "BODY_TOO_LARGE");

  const invalidInput = await postJson("/api/agent", { amountNgn: 0 });
  assert.equal(invalidInput.status, 400);
  assert.equal((await invalidInput.json()).error.code, "INVALID_INPUT");
});
