import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzePayout } from "../src/guard.mjs";
import { buildDemoData, DEMO_PROCESSED_REQUESTS, DEMO_SETTLED_INVOICES } from "../src/demo-data.mjs";
import { createCircuitInputs, encodeAsciiIdentifier, proofReadinessReason } from "../src/proof-inputs.mjs";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const DATA = buildDemoData(NOW);
const clean = DATA.scenarios.find((item) => item.id === "clean").request;
const result = analyzePayout(clean, { now: NOW, data: DATA });

function blinding() {
  return "12345678901234567890";
}

test("proof witness encodes the clean result and all ten passing checks", () => {
  assert.equal(proofReadinessReason(result), null);
  const inputs = createCircuitInputs(result, blinding());
  assert.equal(inputs.request_id_code, "23157163043401777");
  assert.equal(inputs.request_id_len, "7");
  assert.equal(inputs.approval_exists, true);
  assert.equal(inputs.approval_status_code, "1");
  assert.equal(inputs.vendor_exists, true);
  assert.equal(inputs.vendor_active, true);
  assert.equal(inputs.amount_ngn, "78000");
  assert.equal(inputs.approval_cap_ngn, "85000");
  assert.equal(inputs.vendor_cap_ngn, "120000");
  assert.equal(inputs.as_of_ms, String(NOW.getTime()));
  assert.equal(inputs.approval_expires_at_ms, String(Date.parse(DATA.approvals.get("APR-204").expiresAt)));
});

test("proof readiness is restricted to all-ten-check READY results", () => {
  const blocked = analyzePayout(DATA.scenarios.find((item) => item.id === "recipient-change").request, { now: NOW, data: DATA });
  assert.match(proofReadinessReason(blocked), /only when the preflight result is READY/);
  assert.throws(() => createCircuitInputs(blocked, blinding()), /only when the preflight result is READY/);

  const partial = { ...result, checks: result.checks.slice(1) };
  assert.match(proofReadinessReason(partial), /all ten/);
});

test("packed circuit identifiers must be short printable ASCII", () => {
  assert.deepEqual(encodeAsciiIdentifier("INV-26041"), { code: "1352257066257433506865", length: "9" });
  assert.throws(() => encodeAsciiIdentifier("A".repeat(16)), /15 characters or fewer/);
  assert.throws(() => encodeAsciiIdentifier("BËN-0042"), /printable ASCII/);
});

test("Noir circuit includes all ten check constraints and the fixed demo replay entries", async () => {
  const circuit = await readFile(resolve("zk/paytrol_ready/src/main.nr"), "utf8");
  for (const phrase of [
    "approval_exists",
    "approval_status_code == APPROVED_STATUS_CODE",
    "vendor_exists",
    "vendor_active",
    "request_vendor_id_code == approval_vendor_id_code",
    "request_beneficiary_id_code == approval_beneficiary_id_code",
    "request_invoice_id_code == approval_invoice_id_code",
    "amount_ngn <= approval_cap_ngn",
    "approval_expires_at_ms > as_of_ms",
    "SETTLED_INVOICE_ID_CODE",
    "PROCESSED_REQUEST_ID_CODE"
  ]) assert.ok(circuit.includes(phrase), `missing circuit constraint: ${phrase}`);

  assert.equal(DEMO_SETTLED_INVOICES.length, 1, "circuit currently supports one synthetic settled invoice");
  assert.equal(DEMO_PROCESSED_REQUESTS.length, 1, "circuit currently supports one synthetic processed request");
  const settledCode = `0x${BigInt(encodeAsciiIdentifier(DEMO_SETTLED_INVOICES[0]).code).toString(16)}`;
  const processedCode = `0x${BigInt(encodeAsciiIdentifier(DEMO_PROCESSED_REQUESTS[0]).code).toString(16)}`;
  assert.ok(circuit.includes(`SETTLED_INVOICE_ID_CODE: u128 = ${settledCode}`));
  assert.ok(circuit.includes(`PROCESSED_REQUEST_ID_CODE: u128 = ${processedCode}`));
});
