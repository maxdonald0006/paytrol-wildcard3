import { createHash } from "node:crypto";
import { buildDemoData } from "./demo-data.mjs";

const MAX_AMOUNT_NGN = 1_000_000_000;
const ID_FIELDS = ["requestId", "approvalId", "vendorId", "beneficiaryId", "invoiceId"];

export class InputValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "InputValidationError";
    this.field = field;
  }
}

export function normalizeRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InputValidationError("Send a JSON object describing one payout request.");
  }

  const request = {};
  for (const field of ID_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new InputValidationError(`${field} is required.`, field);
    }
    const trimmed = value.trim();
    if (trimmed.length > 64) {
      throw new InputValidationError(`${field} must be 64 characters or fewer.`, field);
    }
    request[field] = trimmed;
  }

  const amount = typeof input.amountNgn === "number" ? input.amountNgn : Number(input.amountNgn);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT_NGN) {
    throw new InputValidationError(`amountNgn must be a whole number from 1 to ${MAX_AMOUNT_NGN}.`, "amountNgn");
  }
  request.amountNgn = amount;
  return request;
}

function makeCheck(code, label, status, detail) {
  return { code, label, status, detail };
}

function skipped(code, label, why) {
  return makeCheck(code, label, "skipped", why);
}

export function analyzePayout(input, options = {}) {
  const request = normalizeRequest(input);
  const now = options.now instanceof Date ? options.now : new Date();
  const data = options.data ?? buildDemoData(now);
  const approval = data.approvals.get(request.approvalId) ?? null;
  const vendor = data.vendors.get(request.vendorId) ?? null;
  const checks = [];

  if (approval) {
    checks.push(makeCheck(
      "APPROVAL_FOUND",
      "Approval record",
      "pass",
      `Found approval ${approval.approvalId} under ${approval.policyRef}.`
    ));
  } else {
    checks.push(makeCheck(
      "APPROVAL_FOUND",
      "Approval record",
      "warn",
      `No approval record exists for ${request.approvalId}. A human must resolve this before any payout.`
    ));
  }

  if (approval) {
    const status = approval.status === "APPROVED" ? "pass" : approval.status === "REJECTED" || approval.status === "REVOKED" ? "fail" : "warn";
    const detail = approval.status === "APPROVED"
      ? `Approval ${approval.approvalId} is marked approved.`
      : `Approval ${approval.approvalId} is ${approval.status.toLowerCase()}; it is not ready for payout.`;
    checks.push(makeCheck("APPROVAL_STATUS", "Approval status", status, detail));
  } else {
    checks.push(skipped("APPROVAL_STATUS", "Approval status", "Cannot check status without an approval record."));
  }

  if (vendor?.active) {
    checks.push(makeCheck("VENDOR_ACTIVE", "Vendor record", "pass", `${vendor.name} is active in the demo vendor register.`));
  } else {
    checks.push(makeCheck(
      "VENDOR_ACTIVE",
      "Vendor record",
      "fail",
      vendor ? `${vendor.name} is not active.` : `Vendor ${request.vendorId} is not in the demo vendor register.`
    ));
  }

  if (approval) {
    const matches = request.vendorId === approval.vendorId;
    checks.push(makeCheck(
      "VENDOR_MATCH",
      "Vendor matches approval",
      matches ? "pass" : "fail",
      matches
        ? `Request vendor ${request.vendorId} matches approval ${approval.approvalId}.`
        : `Request vendor ${request.vendorId} differs from approved vendor ${approval.vendorId}.`
    ));
  } else {
    checks.push(skipped("VENDOR_MATCH", "Vendor matches approval", "Cannot compare without an approval record."));
  }

  if (approval && vendor) {
    const matchesApproval = request.beneficiaryId === approval.beneficiaryId;
    const matchesVendor = request.beneficiaryId === vendor.beneficiaryId;
    const consistentRecords = approval.beneficiaryId === vendor.beneficiaryId;
    const passed = matchesApproval && matchesVendor && consistentRecords;
    checks.push(makeCheck(
      "BENEFICIARY_MATCH",
      "Beneficiary matches",
      passed ? "pass" : "fail",
      passed
        ? `Destination ${request.beneficiaryId} matches both the approval and vendor register.`
        : `Request destination ${request.beneficiaryId} does not match the approved vendor destination ${approval.beneficiaryId}.`
    ));
  } else if (approval) {
    const passed = request.beneficiaryId === approval.beneficiaryId;
    checks.push(makeCheck(
      "BENEFICIARY_MATCH",
      "Beneficiary matches",
      passed ? "pass" : "fail",
      passed
        ? `Destination matches approval ${approval.approvalId}.`
        : `Request destination ${request.beneficiaryId} differs from approved destination ${approval.beneficiaryId}.`
    ));
  } else {
    checks.push(skipped("BENEFICIARY_MATCH", "Beneficiary matches", "Cannot compare against an approved destination without an approval record."));
  }

  if (approval) {
    const matches = request.invoiceId === approval.invoiceId;
    checks.push(makeCheck(
      "INVOICE_MATCH",
      "Invoice matches approval",
      matches ? "pass" : "fail",
      matches
        ? `Invoice ${request.invoiceId} matches the approved invoice.`
        : `Invoice ${request.invoiceId} differs from approved invoice ${approval.invoiceId}.`
    ));
  } else {
    checks.push(skipped("INVOICE_MATCH", "Invoice matches approval", "Cannot compare without an approval record."));
  }

  if (approval) {
    const cap = Math.min(approval.amountCapNgn, vendor?.perPayoutLimitNgn ?? MAX_AMOUNT_NGN);
    const passed = request.amountNgn <= cap;
    checks.push(makeCheck(
      "AMOUNT_WITHIN_LIMIT",
      "Amount within approved limit",
      passed ? "pass" : "warn",
      passed
        ? `₦${request.amountNgn.toLocaleString("en-NG")} is within the ₦${cap.toLocaleString("en-NG")} limit.`
        : `₦${request.amountNgn.toLocaleString("en-NG")} exceeds the ₦${cap.toLocaleString("en-NG")} limit; obtain a new approval.`
    ));
  } else {
    checks.push(skipped("AMOUNT_WITHIN_LIMIT", "Amount within approved limit", "Cannot determine an approved cap without an approval record."));
  }

  if (approval) {
    const expiryTime = Date.parse(approval.expiresAt);
    const currentTime = now.getTime();
    const passed = Number.isFinite(expiryTime) && expiryTime > currentTime;
    checks.push(makeCheck(
      "APPROVAL_NOT_EXPIRED",
      "Approval window",
      passed ? "pass" : "warn",
      passed
        ? `Approval is valid until ${new Date(expiryTime).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })} Lagos time.`
        : `Approval expired at ${new Date(expiryTime).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })} Lagos time.`
    ));
  } else {
    checks.push(skipped("APPROVAL_NOT_EXPIRED", "Approval window", "Cannot check expiry without an approval record."));
  }

  const duplicate = data.settledInvoices.has(request.invoiceId);
  checks.push(makeCheck(
    "NO_DUPLICATE_INVOICE",
    "Invoice replay check",
    duplicate ? "fail" : "pass",
    duplicate
      ? `Invoice ${request.invoiceId} already appears in the demo settlement ledger.`
      : `Invoice ${request.invoiceId} was not found in the demo settlement ledger.`
  ));

  const duplicateRequest = data.processedRequests?.has(request.requestId) ?? false;
  checks.push(makeCheck(
    "NO_DUPLICATE_REQUEST",
    "Request replay check",
    duplicateRequest ? "fail" : "pass",
    duplicateRequest
      ? `Request ${request.requestId} already appears in demo request history.`
      : `Request ${request.requestId} was not found in demo request history.`
  ));

  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");
  const decision = failures.length > 0 ? "BLOCK" : warnings.length > 0 ? "HOLD" : "READY";
  const reasonCodes = checks.filter((check) => check.status === "fail" || check.status === "warn").map((check) => check.code);

  const message = decision === "READY"
    ? "All automated checks passed. This request is eligible for a human approval; no payment was sent."
    : decision === "HOLD"
      ? "Pause here. Resolve the review items and obtain any required approval before proceeding."
      : "This request conflicts with the recorded policy. Do not proceed until an authorized person resolves the mismatch.";

  const policySnapshot = {
    approvalId: approval?.approvalId ?? null,
    approvalStatus: approval?.status ?? null,
    policyRef: approval?.policyRef ?? null,
    approvedVendorId: approval?.vendorId ?? null,
    approvedBeneficiaryId: approval?.beneficiaryId ?? null,
    approvedInvoiceId: approval?.invoiceId ?? null,
    amountCapNgn: approval?.amountCapNgn ?? null,
    expiresAt: approval?.expiresAt ?? null,
    vendorId: vendor?.vendorId ?? null,
    vendorActive: vendor?.active ?? false,
    vendorBeneficiaryId: vendor?.beneficiaryId ?? null,
    vendorPerPayoutLimitNgn: vendor?.perPayoutLimitNgn ?? null,
    vendorName: vendor?.name ?? null
  };

  const receiptMaterial = JSON.stringify({
    version: "paytrol-demo-v1",
    request,
    decision,
    reasonCodes,
    checks,
    policySnapshot
  });
  const receiptHash = createHash("sha256").update(receiptMaterial).digest("hex");

  return {
    version: "paytrol-demo-v1",
    request,
    decision,
    decisionLabel: decision === "READY" ? "READY FOR HUMAN APPROVAL" : decision === "HOLD" ? "HOLD FOR REVIEW" : "BLOCK — DO NOT PROCEED",
    message,
    reasonCodes,
    checks,
    policySnapshot,
    receipt: {
      algorithm: "SHA-256",
      hash: receiptHash,
      note: "A reproducible checksum of this demo result—not a blockchain record, a zk proof, or evidence that external records are true."
    },
    createdAt: now.toISOString(),
    simulationOnly: true
  };
}
