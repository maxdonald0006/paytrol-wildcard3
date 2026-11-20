const REQUIRED_CHECK_CODES = [
  "APPROVAL_FOUND",
  "APPROVAL_STATUS",
  "VENDOR_ACTIVE",
  "VENDOR_MATCH",
  "BENEFICIARY_MATCH",
  "INVOICE_MATCH",
  "AMOUNT_WITHIN_LIMIT",
  "APPROVAL_NOT_EXPIRED",
  "NO_DUPLICATE_INVOICE",
  "NO_DUPLICATE_REQUEST"
];
const MAX_AMOUNT_NGN = 1_000_000_000;
const MAX_PACKED_ID_LENGTH = 15;

export function encodeAsciiIdentifier(value, label = "Identifier") {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing.`);
  }
  if (value.length > MAX_PACKED_ID_LENGTH) {
    throw new Error(`${label} must be ${MAX_PACKED_ID_LENGTH} characters or fewer for this circuit.`);
  }

  let packed = 0n;
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`${label} must use printable ASCII characters for this circuit.`);
    }
    packed = (packed << 8n) | BigInt(code);
  }

  return { code: packed.toString(), length: String(value.length) };
}

function validAmount(value, label) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT_NGN) {
    throw new Error(`${label} must be a whole NGN amount from 1 to ${MAX_AMOUNT_NGN}.`);
  }
  return String(amount);
}

function parseMillis(value, label) {
  const millis = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isSafeInteger(millis) || millis < 0) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return String(millis);
}

function fieldPair(inputs, name, value) {
  const encoded = encodeAsciiIdentifier(value, name);
  inputs[`${name}_code`] = encoded.code;
  inputs[`${name}_len`] = encoded.length;
}

export function proofReadinessReason(result) {
  if (!result || result.decision !== "READY") {
    return "A proof is available only when the preflight result is READY.";
  }
  if (!Array.isArray(result.checks) || result.checks.length !== REQUIRED_CHECK_CODES.length) {
    return "The proof circuit expects all ten payTrol checks.";
  }
  const checks = new Map(result.checks.map((check) => [check.code, check.status]));
  if (REQUIRED_CHECK_CODES.some((code) => checks.get(code) !== "pass")) {
    return "All ten payTrol checks must pass before a proof can be generated.";
  }

  const request = result.request;
  const policy = result.policySnapshot;
  if (!request || !policy) return "The request or synthetic policy snapshot is missing.";
  if (!policy.approvalId || !policy.approvedVendorId || !policy.vendorId) {
    return "The synthetic approval and vendor records must both be present.";
  }
  if (policy.approvalStatus !== "APPROVED" || policy.vendorActive !== true) {
    return "The supplied approval must be approved and the vendor record active.";
  }
  if (!policy.approvedBeneficiaryId || !policy.vendorBeneficiaryId || !policy.approvedInvoiceId) {
    return "The supplied beneficiary or invoice record is incomplete.";
  }
  if (policy.amountCapNgn == null || policy.vendorPerPayoutLimitNgn == null) {
    return "Both the approval cap and vendor cap are required by this circuit.";
  }

  try {
    encodeAsciiIdentifier(request.requestId, "Request reference");
    encodeAsciiIdentifier(request.approvalId, "Approval reference");
    encodeAsciiIdentifier(policy.approvalId, "Approval record reference");
    encodeAsciiIdentifier(policy.approvedVendorId, "Approved vendor reference");
    encodeAsciiIdentifier(request.vendorId, "Request vendor reference");
    encodeAsciiIdentifier(policy.vendorId, "Vendor record reference");
    encodeAsciiIdentifier(request.beneficiaryId, "Request beneficiary");
    encodeAsciiIdentifier(policy.approvedBeneficiaryId, "Approved beneficiary");
    encodeAsciiIdentifier(policy.vendorBeneficiaryId, "Vendor beneficiary");
    encodeAsciiIdentifier(request.invoiceId, "Request invoice");
    encodeAsciiIdentifier(policy.approvedInvoiceId, "Approved invoice");
    validAmount(request.amountNgn, "Requested amount");
    validAmount(policy.amountCapNgn, "Approval cap");
    validAmount(policy.vendorPerPayoutLimitNgn, "Vendor cap");
    parseMillis(result.policySnapshotAsOf ?? result.createdAt, "Policy as-of time");
    parseMillis(policy.expiresAt, "Approval expiry time");
  } catch (error) {
    return error.message;
  }

  return null;
}

export function createCircuitInputs(result, requestBlinding) {
  const reason = proofReadinessReason(result);
  if (reason) throw new Error(reason);

  let blinding;
  try {
    blinding = BigInt(requestBlinding);
  } catch {
    throw new Error("A non-zero random blinding value is required.");
  }
  if (blinding <= 0n || blinding >= (1n << 248n)) {
    throw new Error("The proof blinding value is outside the supported range.");
  }

  const { request, policySnapshot: policy } = result;
  const inputs = {};
  fieldPair(inputs, "request_id", request.requestId);
  fieldPair(inputs, "request_approval_id", request.approvalId);
  fieldPair(inputs, "approval_record_id", policy.approvalId);
  fieldPair(inputs, "approval_vendor_id", policy.approvedVendorId);
  fieldPair(inputs, "request_vendor_id", request.vendorId);
  fieldPair(inputs, "vendor_record_id", policy.vendorId);
  fieldPair(inputs, "request_beneficiary_id", request.beneficiaryId);
  fieldPair(inputs, "approval_beneficiary_id", policy.approvedBeneficiaryId);
  fieldPair(inputs, "vendor_beneficiary_id", policy.vendorBeneficiaryId);
  fieldPair(inputs, "request_invoice_id", request.invoiceId);
  fieldPair(inputs, "approval_invoice_id", policy.approvedInvoiceId);

  const statusCodes = { APPROVED: 1, PENDING: 2, REJECTED: 3, REVOKED: 4 };
  inputs.approval_exists = Boolean(policy.approvalId);
  inputs.approval_status_code = String(statusCodes[policy.approvalStatus] ?? 0);
  inputs.vendor_exists = Boolean(policy.vendorId);
  inputs.vendor_active = policy.vendorActive === true;
  inputs.amount_ngn = validAmount(request.amountNgn, "Requested amount");
  inputs.approval_cap_ngn = validAmount(policy.amountCapNgn, "Approval cap");
  inputs.vendor_cap_ngn = validAmount(policy.vendorPerPayoutLimitNgn, "Vendor cap");
  inputs.as_of_ms = parseMillis(result.policySnapshotAsOf ?? result.createdAt, "Policy as-of time");
  inputs.approval_expires_at_ms = parseMillis(policy.expiresAt, "Approval expiry time");
  inputs.request_blinding = blinding.toString();
  return inputs;
}
