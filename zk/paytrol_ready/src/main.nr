// payTrol's private-input payout-preflight circuit.
// This circuit checks the ten conditions for a READY result over the values
// supplied in its witness. It does not authenticate external records: without
// a signed record or committed database root, a prover can supply invented
// approval/vendor values. This build uses synthetic demo data only.

use std::hash::pedersen_hash;

global POLICY_VERSION: Field = 20261117;
global REQUEST_DOMAIN: Field = 1;
global APPROVED_STATUS_CODE: u8 = 1;
global MAX_AMOUNT_NGN: u32 = 1_000_000_000;

// These are the two entries in the demo-only replay history. Keep in sync with
// src/demo-data.mjs. This circuit intentionally has no live settlement feed.
global SETTLED_INVOICE_ID_CODE: u128 = 0x494e562d3236303838; // INV-26088
global SETTLED_INVOICE_ID_LEN: u32 = 9;
global PROCESSED_REQUEST_ID_CODE: u128 = 0x5245512d414c52454144592d393030; // REQ-ALREADY-900
global PROCESSED_REQUEST_ID_LEN: u32 = 15;

fn main(
    request_id_code: u128,
    request_id_len: u32,
    request_approval_id_code: u128,
    request_approval_id_len: u32,
    approval_exists: bool,
    approval_record_id_code: u128,
    approval_record_id_len: u32,
    approval_status_code: u8,
    approval_vendor_id_code: u128,
    approval_vendor_id_len: u32,
    request_vendor_id_code: u128,
    request_vendor_id_len: u32,
    vendor_record_id_code: u128,
    vendor_record_id_len: u32,
    vendor_exists: bool,
    vendor_active: bool,
    request_beneficiary_id_code: u128,
    request_beneficiary_id_len: u32,
    approval_beneficiary_id_code: u128,
    approval_beneficiary_id_len: u32,
    vendor_beneficiary_id_code: u128,
    vendor_beneficiary_id_len: u32,
    request_invoice_id_code: u128,
    request_invoice_id_len: u32,
    approval_invoice_id_code: u128,
    approval_invoice_id_len: u32,
    amount_ngn: u32,
    approval_cap_ngn: u32,
    vendor_cap_ngn: u32,
    as_of_ms: u64,
    approval_expires_at_ms: u64,
    request_blinding: Field,
) -> pub Field {
    // 1. An approval record was supplied, and its reference matches the request.
    assert(approval_exists);
    assert(request_approval_id_code == approval_record_id_code);
    assert(request_approval_id_len == approval_record_id_len);

    // 2. The supplied approval status is APPROVED.
    assert(approval_status_code == APPROVED_STATUS_CODE);

    // 3. A vendor record was supplied and is marked active.
    assert(vendor_exists);
    assert(vendor_active);

    // 4. The requested vendor, approval vendor, and vendor record all match.
    assert(request_vendor_id_code == approval_vendor_id_code);
    assert(request_vendor_id_len == approval_vendor_id_len);
    assert(request_vendor_id_code == vendor_record_id_code);
    assert(request_vendor_id_len == vendor_record_id_len);

    // 5. The requested beneficiary matches both supplied records.
    assert(request_beneficiary_id_code == approval_beneficiary_id_code);
    assert(request_beneficiary_id_len == approval_beneficiary_id_len);
    assert(request_beneficiary_id_code == vendor_beneficiary_id_code);
    assert(request_beneficiary_id_len == vendor_beneficiary_id_len);

    // 6. The requested invoice matches the supplied approval.
    assert(request_invoice_id_code == approval_invoice_id_code);
    assert(request_invoice_id_len == approval_invoice_id_len);

    // 7. The positive amount is within both the approval cap and vendor cap.
    assert(amount_ngn > 0);
    assert(amount_ngn <= MAX_AMOUNT_NGN);
    assert(amount_ngn <= approval_cap_ngn);
    assert(amount_ngn <= vendor_cap_ngn);

    // 8. The approval has not expired at the supplied policy-as-of time.
    assert(approval_expires_at_ms > as_of_ms);

    // 9. The invoice is not the demo ledger's settled invoice.
    assert((request_invoice_id_code != SETTLED_INVOICE_ID_CODE) | (request_invoice_id_len != SETTLED_INVOICE_ID_LEN));

    // 10. The request reference is not the demo history's processed request.
    assert((request_id_code != PROCESSED_REQUEST_ID_CODE) | (request_id_len != PROCESSED_REQUEST_ID_LEN));

    // IDs are packed as printable ASCII into u128 values. Fifteen bytes fit.
    assert(request_id_len > 0 & request_id_len <= 15);
    assert(request_approval_id_len > 0 & request_approval_id_len <= 15);
    assert(approval_record_id_len > 0 & approval_record_id_len <= 15);
    assert(approval_vendor_id_len > 0 & approval_vendor_id_len <= 15);
    assert(request_vendor_id_len > 0 & request_vendor_id_len <= 15);
    assert(vendor_record_id_len > 0 & vendor_record_id_len <= 15);
    assert(request_beneficiary_id_len > 0 & request_beneficiary_id_len <= 15);
    assert(approval_beneficiary_id_len > 0 & approval_beneficiary_id_len <= 15);
    assert(vendor_beneficiary_id_len > 0 & vendor_beneficiary_id_len <= 15);
    assert(request_invoice_id_len > 0 & request_invoice_id_len <= 15);
    assert(approval_invoice_id_len > 0 & approval_invoice_id_len <= 15);
    assert(request_blinding != 0);

    // A randomized Pedersen commitment is the circuit's one public input. The
    // request and supplied policy-record values remain private in the witness.
    let request_commitment = pedersen_hash([
        REQUEST_DOMAIN,
        POLICY_VERSION,
        request_id_code as Field,
        request_id_len as Field,
        request_approval_id_code as Field,
        request_approval_id_len as Field,
        approval_record_id_code as Field,
        approval_record_id_len as Field,
        approval_status_code as Field,
        approval_vendor_id_code as Field,
        approval_vendor_id_len as Field,
        request_vendor_id_code as Field,
        request_vendor_id_len as Field,
        vendor_record_id_code as Field,
        vendor_record_id_len as Field,
        request_beneficiary_id_code as Field,
        request_beneficiary_id_len as Field,
        approval_beneficiary_id_code as Field,
        approval_beneficiary_id_len as Field,
        vendor_beneficiary_id_code as Field,
        vendor_beneficiary_id_len as Field,
        request_invoice_id_code as Field,
        request_invoice_id_len as Field,
        approval_invoice_id_code as Field,
        approval_invoice_id_len as Field,
        amount_ngn as Field,
        approval_cap_ngn as Field,
        vendor_cap_ngn as Field,
        as_of_ms as Field,
        approval_expires_at_ms as Field,
        request_blinding,
    ]);

    request_commitment
}
