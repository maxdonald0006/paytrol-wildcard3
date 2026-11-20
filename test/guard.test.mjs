import test from "node:test";
import assert from "node:assert/strict";
import { analyzePayout, normalizeRequest, InputValidationError } from "../src/guard.mjs";
import { buildDemoData } from "../src/demo-data.mjs";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const DATA = buildDemoData(NOW);
const scenario = (id) => DATA.scenarios.find((item) => item.id === id).request;
const evaluate = (id) => analyzePayout(scenario(id), { now: NOW, data: DATA });

test("all configured demo scenarios match their documented decisions", () => {
  for (const item of DATA.scenarios) {
    const result = analyzePayout(item.request, { now: NOW, data: DATA });
    assert.equal(result.decision, item.expectedDecision, item.id);
    assert.equal(result.checks.length, 10, item.id);
  }
});

test("clean payout is only marked ready for a human approver", () => {
  const result = evaluate("clean");
  assert.equal(result.decision, "READY");
  assert.match(result.message, /human approval/);
  assert.equal(result.simulationOnly, true);
  assert.equal(result.checks.filter((check) => check.status === "pass").length, 10);
});

test("changed beneficiary is blocked", () => {
  const result = evaluate("recipient-change");
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasonCodes.includes("BENEFICIARY_MATCH"));
});

test("amount above approval cap is held for a new approval", () => {
  const result = evaluate("over-limit");
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasonCodes.includes("AMOUNT_WITHIN_LIMIT"));
});

test("expired approval is held", () => {
  const result = evaluate("expired");
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasonCodes.includes("APPROVAL_NOT_EXPIRED"));
});

test("previously settled invoice is blocked", () => {
  const result = evaluate("duplicate");
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasonCodes.includes("NO_DUPLICATE_INVOICE"));
});

test("previously processed request reference is blocked", () => {
  const result = evaluate("duplicate-request");
  assert.equal(result.decision, "BLOCK");
  assert.ok(result.reasonCodes.includes("NO_DUPLICATE_REQUEST"));
});

test("pending approval is held", () => {
  const result = evaluate("pending");
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasonCodes.includes("APPROVAL_STATUS"));
});

test("missing approval record is held rather than approved", () => {
  const result = evaluate("missing-record");
  assert.equal(result.decision, "HOLD");
  assert.ok(result.reasonCodes.includes("APPROVAL_FOUND"));
});

test("receipt hash is a 64-character SHA-256 checksum and is reproducible", () => {
  const first = evaluate("clean");
  const second = evaluate("clean");
  assert.match(first.receipt.hash, /^[a-f0-9]{64}$/);
  assert.equal(first.receipt.hash, second.receipt.hash);
  assert.match(first.receipt.note, /not a blockchain record/);
});

test("invalid amounts are rejected", () => {
  assert.throws(() => normalizeRequest({ ...scenario("clean"), amountNgn: 0 }), InputValidationError);
  assert.throws(() => normalizeRequest({ ...scenario("clean"), amountNgn: 12.5 }), InputValidationError);
});

test("missing identifiers are rejected", () => {
  const request = { ...scenario("clean") };
  delete request.beneficiaryId;
  assert.throws(() => normalizeRequest(request), /beneficiaryId is required/);
});
