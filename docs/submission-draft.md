# Wildcard submission draft — payTrol

## Working title
**payTrol — payout preflight for small teams**

## One-line description
A deterministic agent that checks a proposed supplier or contractor payout against a synthetic approval, vendor, beneficiary, amount limit, expiry, duplicate-request and duplicate-invoice history, then returns READY, HOLD or BLOCK with check-by-check reasons.

## Who it is for
Small businesses and operations teams that want a second check before a person sends a contractor or vendor payment.

## What is implemented
- An interactive web demo with eight synthetic request cases.
- A Node.js JSON API and a Cloudflare Workers adapter at `POST /api/agent` (also `POST /api/analyze`).
- A deterministic rules engine that evaluates ten checks.
- A browser-side Noir UltraHonk proof flow for all-ten-check READY results, with local verification and a downloadable proof package.
- A separate SHA-256 checksum of the result and synthetic policy snapshot.
- Automated unit/handler and circuit-witness tests. The Node smoke command and a real Chromium browser flow have generated and locally verified proofs.

## Safety and limitations
- Synthetic records only; no bank, accounting, identity or payment-provider connection.
- The app never sends money or approves a real payment; READY means eligible to continue to a human approver.
- The circuit checks relationships and conditions for supplied witness values. It does not authenticate the records or prove they are truthful.
- The SHA-256 checksum is a receipt checksum, not a zk proof. The proof generation is a separate local browser flow.
- No proof has been submitted to zkVerify or a blockchain.
- The Wildcard form marks Agent Endpoint optional and asks for a reachable HTTPS URL with the full handler path; off-chain agents may leave it blank. This endpoint field does not describe an HMAC task protocol.
- The demo API accepts payTrol JSON and is not a platform-signed task handler. The separate Agent Games agent rules require HMAC for registered task agents; do not claim that integration unless implemented and tested.

## Reviewer links
- Demo UI: [Open payTrol](https://paytrol-wildcard-demo.maxdonald.workers.dev/)
- Public repository: https://github.com/maxdonald0006/paytrol-wildcard3
- Agent endpoint (optional): `POST https://paytrol-wildcard-demo.maxdonald.workers.dev/api/agent`
- Health check: [GET /health](https://paytrol-wildcard-demo.maxdonald.workers.dev/health)
- On-chain proof reference: none; no zkVerify or blockchain submission has been made.

The live HTTPS demo was smoke-tested: `GET /`, `GET /health`, and `GET /api/scenarios` returned HTTP 200. A synthetic example `POST /api/agent` returned HTTP 200 with a READY result and all ten checks passing. This endpoint accepts payTrol demo JSON; it is not an Agent Games HMAC-signed task handler.
