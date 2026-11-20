const DAY_MS = 24 * 60 * 60 * 1000;

export const DEMO_SETTLED_INVOICES = Object.freeze(["INV-26088"]);
export const DEMO_PROCESSED_REQUESTS = Object.freeze(["REQ-ALREADY-900"]);

function atOffset(now, days) {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

export function buildDemoData(now = new Date()) {
  const vendors = new Map([
    ["V-101", {
      vendorId: "V-101",
      name: "Harbour Dispatch Co.",
      beneficiaryId: "BEN-0042",
      active: true,
      perPayoutLimitNgn: 120000
    }],
    ["V-202", {
      vendorId: "V-202",
      name: "Cedar Office Supply",
      beneficiaryId: "BEN-0087",
      active: true,
      perPayoutLimitNgn: 300000
    }]
  ]);

  const approvals = new Map([
    ["APR-204", {
      approvalId: "APR-204",
      status: "APPROVED",
      vendorId: "V-101",
      beneficiaryId: "BEN-0042",
      invoiceId: "INV-26041",
      amountCapNgn: 85000,
      expiresAt: atOffset(now, 7),
      policyRef: "OPS-POLICY-01"
    }],
    ["APR-205", {
      approvalId: "APR-205",
      status: "APPROVED",
      vendorId: "V-202",
      beneficiaryId: "BEN-0087",
      invoiceId: "INV-26052",
      amountCapNgn: 185000,
      expiresAt: atOffset(now, 5),
      policyRef: "OPS-POLICY-02"
    }],
    ["APR-206", {
      approvalId: "APR-206",
      status: "PENDING",
      vendorId: "V-101",
      beneficiaryId: "BEN-0042",
      invoiceId: "INV-26061",
      amountCapNgn: 42000,
      expiresAt: atOffset(now, 4),
      policyRef: "OPS-POLICY-01"
    }],
    ["APR-207", {
      approvalId: "APR-207",
      status: "APPROVED",
      vendorId: "V-101",
      beneficiaryId: "BEN-0042",
      invoiceId: "INV-26071",
      amountCapNgn: 72000,
      expiresAt: atOffset(now, -1),
      policyRef: "OPS-POLICY-01"
    }],
    ["APR-208", {
      approvalId: "APR-208",
      status: "APPROVED",
      vendorId: "V-202",
      beneficiaryId: "BEN-0087",
      invoiceId: "INV-26088",
      amountCapNgn: 99000,
      expiresAt: atOffset(now, 6),
      policyRef: "OPS-POLICY-02"
    }],
    ["APR-209", {
      approvalId: "APR-209",
      status: "APPROVED",
      vendorId: "V-101",
      beneficiaryId: "BEN-0042",
      invoiceId: "INV-26109",
      amountCapNgn: 41000,
      expiresAt: atOffset(now, 3),
      policyRef: "OPS-POLICY-01"
    }]
  ]);

  const settledInvoices = new Set(DEMO_SETTLED_INVOICES);
  const processedRequests = new Set(DEMO_PROCESSED_REQUESTS);

  const scenarios = [
    {
      id: "clean",
      title: "Approved payout",
      description: "Payee, invoice, amount and approval all match.",
      expectedDecision: "READY",
      request: {
        requestId: "REQ-501",
        approvalId: "APR-204",
        vendorId: "V-101",
        beneficiaryId: "BEN-0042",
        invoiceId: "INV-26041",
        amountNgn: 78000
      }
    },
    {
      id: "recipient-change",
      title: "Changed beneficiary",
      description: "The destination differs from the approved payee.",
      expectedDecision: "BLOCK",
      request: {
        requestId: "REQ-502",
        approvalId: "APR-204",
        vendorId: "V-101",
        beneficiaryId: "BEN-9911",
        invoiceId: "INV-26041",
        amountNgn: 78000
      }
    },
    {
      id: "over-limit",
      title: "Above approved cap",
      description: "The requested amount exceeds the signed-off limit.",
      expectedDecision: "HOLD",
      request: {
        requestId: "REQ-503",
        approvalId: "APR-204",
        vendorId: "V-101",
        beneficiaryId: "BEN-0042",
        invoiceId: "INV-26041",
        amountNgn: 98000
      }
    },
    {
      id: "expired",
      title: "Expired approval",
      description: "The approval window has already ended.",
      expectedDecision: "HOLD",
      request: {
        requestId: "REQ-504",
        approvalId: "APR-207",
        vendorId: "V-101",
        beneficiaryId: "BEN-0042",
        invoiceId: "INV-26071",
        amountNgn: 64000
      }
    },
    {
      id: "duplicate",
      title: "Previously settled invoice",
      description: "The invoice already appears in the demo settlement record.",
      expectedDecision: "BLOCK",
      request: {
        requestId: "REQ-505",
        approvalId: "APR-208",
        vendorId: "V-202",
        beneficiaryId: "BEN-0087",
        invoiceId: "INV-26088",
        amountNgn: 72000
      }
    },
    {
      id: "duplicate-request",
      title: "Previously processed request",
      description: "This request reference already appears in demo history.",
      expectedDecision: "BLOCK",
      request: {
        requestId: "REQ-ALREADY-900",
        approvalId: "APR-209",
        vendorId: "V-101",
        beneficiaryId: "BEN-0042",
        invoiceId: "INV-26109",
        amountNgn: 32000
      }
    },
    {
      id: "pending",
      title: "Approval still pending",
      description: "A request is not an approval; wait for an authorized reviewer.",
      expectedDecision: "HOLD",
      request: {
        requestId: "REQ-506",
        approvalId: "APR-206",
        vendorId: "V-101",
        beneficiaryId: "BEN-0042",
        invoiceId: "INV-26061",
        amountNgn: 35000
      }
    },
    {
      id: "missing-record",
      title: "No approval record",
      description: "The request cannot be matched to a recorded approval.",
      expectedDecision: "HOLD",
      request: {
        requestId: "REQ-507",
        approvalId: "APR-999",
        vendorId: "V-101",
        beneficiaryId: "BEN-0042",
        invoiceId: "INV-26100",
        amountNgn: 25000
      }
    }
  ];

  return { vendors, approvals, settledInvoices, processedRequests, scenarios };
}
