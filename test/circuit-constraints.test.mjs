import test from "node:test";
import assert from "node:assert/strict";
import { Noir } from "@noir-lang/noir_js";
import circuit from "../zk/paytrol_ready/artifacts/paytrol_ready.json" with { type: "json" };
import { analyzePayout } from "../src/guard.mjs";
import { buildDemoData } from "../src/demo-data.mjs";
import { createCircuitInputs, encodeAsciiIdentifier } from "../src/proof-inputs.mjs";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const DATA = buildDemoData(NOW);
const request = DATA.scenarios.find((item) => item.id === "clean").request;
const result = analyzePayout(request, { now: NOW, data: DATA });
const validInputs = createCircuitInputs(result, "12345678901234567890");

function changed(changes) {
  return { ...validInputs, ...changes };
}

const otherVendor = encodeAsciiIdentifier("V-999");
const otherBeneficiary = encodeAsciiIdentifier("BEN-9999");
const otherInvoice = encodeAsciiIdentifier("INV-26042");
const settledInvoice = encodeAsciiIdentifier("INV-26088");
const processedRequest = encodeAsciiIdentifier("REQ-ALREADY-900");

const failingWitnesses = [
  ["approval missing", changed({ approval_exists: false })],
  ["approval not approved", changed({ approval_status_code: "2" })],
  ["vendor missing", changed({ vendor_exists: false })],
  ["inactive vendor", changed({ vendor_active: false })],
  ["vendor mismatch", changed({ request_vendor_id_code: otherVendor.code, request_vendor_id_len: otherVendor.length })],
  ["beneficiary mismatch", changed({ request_beneficiary_id_code: otherBeneficiary.code, request_beneficiary_id_len: otherBeneficiary.length })],
  ["invoice mismatch", changed({ request_invoice_id_code: otherInvoice.code, request_invoice_id_len: otherInvoice.length })],
  ["approval cap exceeded", changed({ amount_ngn: "85001" })],
  ["vendor cap exceeded", changed({ amount_ngn: "120001", approval_cap_ngn: "130000" })],
  ["approval expired", changed({ approval_expires_at_ms: validInputs.as_of_ms })],
  ["settled invoice replay", changed({
    request_invoice_id_code: settledInvoice.code,
    request_invoice_id_len: settledInvoice.length,
    approval_invoice_id_code: settledInvoice.code,
    approval_invoice_id_len: settledInvoice.length
  })],
  ["processed request replay", changed({ request_id_code: processedRequest.code, request_id_len: processedRequest.length })]
];

test("compiled Noir circuit accepts the clean witness and rejects each failed READY condition", async () => {
  const noir = new Noir(circuit);
  const validResult = await noir.execute(validInputs);
  assert.ok(validResult.witness instanceof Uint8Array);
  assert.equal(validResult.witness.length > 0, true);

  for (const [label, inputs] of failingWitnesses) {
    await assert.rejects(noir.execute(inputs), undefined, `circuit should reject ${label}`);
  }
});
