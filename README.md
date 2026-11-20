# payTrol — payout preflight for small teams

payTrol is a deterministic, no-money-moves demo agent. It checks a proposed contractor or supplier payout against a small, synthetic vendor and approval register, then returns **READY**, **HOLD**, or **BLOCK** with the reason for each check.

> **Simulation only.** payTrol does not connect to bank accounts, send or approve real payments, or confirm that an external payment record is true. **READY** means only “eligible to continue to a human approver.”

## What the demo checks

The rules engine evaluates ten checks:

1. An approval record exists.
2. Its status is approved.
3. The vendor record exists and is active.
4. The request vendor matches the approved vendor.
5. The beneficiary matches both the approval and vendor record.
6. The invoice matches the approval.
7. The amount is within both the approval and vendor caps.
8. The approval has not expired.
9. The invoice is not in the seeded demo settlement history.
10. The request reference is not in the seeded demo request history.

A mismatch blocks the request; missing, pending, expired, or over-limit approvals are held for review. The separate SHA-256 receipt is a reproducible checksum of the demo result and synthetic policy snapshot. **It is not a zero-knowledge proof, blockchain record, or evidence that external records are true.**

## Real zero-knowledge proof demo

The browser app can generate a real **Noir UltraHonk** proof and verify it locally, using the compiled circuit in `zk/paytrol_ready/src/main.nr`. This is separate from the SHA-256 receipt.

- A proof button is enabled only when the result is **READY** and all ten checks pass.
- The circuit constrains the request and supplied policy values for all ten checks. It publishes one randomized Pedersen commitment; the request fields and policy witness are not included in the downloadable proof package.
- Proof generation and verification run locally in a browser Web Worker using Barretenberg WebAssembly. The preflight request is separately sent to the same-origin demo API for its rules-engine result; the proof witness is not sent to a prover service.
- The multi-megabyte JavaScript/WebAssembly prover is lazy-loaded when the button is clicked. On first use, the browser also downloads about **8 MB of public CRS data** from `https://crs.aztec.network` and caches it in IndexedDB. No paid service or API key is used.
- Identifiers used in this circuit must be printable ASCII and at most 15 characters. The regular preflight API accepts longer IDs, but those cannot be proved by this circuit.
- The replay checks are tied to the two fixed synthetic history entries in the circuit. This is not a live settlement or request database.
- The circuit proves that its constraints hold for the supplied witness. It does **not** authenticate the approval/vendor records, prove that they are truthful, authorize a payment, or show that funds were sent. This prototype must not be used to authorize real payouts.
- No proof has been submitted to zkVerify or any blockchain.

The proof package contains the proof, public input commitment, verification key, public circuit bytecode, and metadata. It omits the private witness. The randomized commitment hides the request and policy values, so the package alone does not identify which request it describes. The proof remains in page memory unless the user downloads it; it is not stored by the app.

### Circuit development

The compiled circuit artifact is checked in at `zk/paytrol_ready/artifacts/paytrol_ready.json` and copied to `public-static/paytrol_ready.json` for the browser build. If you edit `src/main.nr`, compile it with Noir/Nargo 1.0.0-beta.18 and refresh those artifacts:

```bash
npm run proof:compile
```

Nargo must be installed and available on `PATH`; otherwise set `NARGO_BIN` to its executable path. `Prover.toml` contains only synthetic example inputs.

To run an optional in-memory proof-generation and verification smoke test in Node:

```bash
npm run proof:smoke
```

That command also downloads/caches the public CRS as needed. It does not submit the proof anywhere.

## Run locally

Requires Node.js 18 or newer. Install the pinned, open-source project dependencies, then start the app:

```bash
npm ci
npm start
```

`npm start` builds the browser bundle and serves the app/API at `http://localhost:4173`. The static response headers enable the browser features needed by the local proof engine; the published static host must preserve the headers in `public-static/_headers`.

Run the automated checks with:

```bash
npm test
# or
npm run check
```

## Demo API

- `GET /health` — liveness.
- `GET /api/scenarios` — synthetic requests for the interactive demo.
- `POST /api/analyze` — evaluate a payout request.
- `POST /api/agent` (also `/agent`) — the same demo handler.

Example request:

```json
{
  "requestId": "REQ-501",
  "approvalId": "APR-204",
  "vendorId": "V-101",
  "beneficiaryId": "BEN-0042",
  "invoiceId": "INV-26041",
  "amountNgn": 78000
}
```

The API returns the verdict, policy snapshot, check-by-check reasons, and SHA-256 checksum. Inputs are evaluated in memory and are not saved; duplicate checks compare against fixed synthetic history only.

## Free public HTTPS deployment

The signed-in Wildcard form (checked 2026-11-17) marks **Agent Endpoint optional**. If supplied, it asks for a reachable HTTPS URL with the **full handler path** and says off-chain agents may leave it blank. For payTrol, the intended reviewer API is `POST https://<your-worker>.workers.dev/api/agent`; the browser demo is at the base URL `/`.

This project includes a Cloudflare Workers adapter (`src/worker.mjs`) and configuration (`wrangler.jsonc`). It serves the built `dist` directory as static assets and handles `/health`, `/api/scenarios`, `POST /api/agent`, and the compatible API aliases. The browser proof is generated locally; the Worker only runs the existing deterministic demo checks. Cloudflare's published Workers Free allowance is 100,000 Worker requests per day and 10 ms CPU per invocation; static assets are free. Keep the account on the Free plan and check its usage limits. See [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [limits](https://developers.cloudflare.com/workers/platform/limits/).

After creating/signing into your own Cloudflare account, use a terminal in the project root with Node.js 20.3 or newer:

```bash
npm run worker:dry-run
npx --yes wrangler@4.86.0 login
npm run worker:deploy
```

Approve the sign-in directly on Cloudflare; do not share passwords or tokens. Wrangler will print the new `workers.dev` base URL. Put that base URL plus `/api/agent` in the Wildcard **Agent Endpoint** field; put the base URL itself in **Additional Links** so judges can open the UI. The project has not been deployed to Cloudflare, so there is no permanent public URL to submit.

The Worker uses a fixed synthetic policy snapshot dated 2026-11-17 12:00 UTC so separate edge instances give the same demo decisions; it stores no customer inputs and needs no platform secret. Its endpoint accepts the payTrol demo JSON format. It is **not** an Agent Games HMAC task handler. The general platform rules still require HMAC-signed messages and task-ID idempotency for agents registered to receive platform tasks; the Wildcard form's optional endpoint field does not describe that protocol. Do not claim platform-task compatibility unless a separate adapter is implemented and tested.

## Current limitations

- Only synthetic vendor, approval, processed-request, and settlement records are included.
- There is no bank, accounting, invoice-storage, or payment-provider integration.
- The demo does not perform human approval or move funds.
- The SHA-256 receipt is a checksum; the local proof only establishes that the included circuit's constraints hold for supplied inputs.
- No proof has been submitted to zkVerify; no blockchain verification or deployment has occurred.
- The API is a prototype and must not be used to authorize real payments.
