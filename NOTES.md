# Build and deployment notes

## Current build state

- payTrol now has a real Noir UltraHonk proof flow in the browser, separate from the existing SHA-256 receipt.
- `zk/paytrol_ready/src/main.nr` constrains all ten READY checks over the supplied request and policy witness: approval exists/reference, approved status, vendor exists/active, vendor matches, beneficiary matches both records, invoice matches, amount under both caps, approval unexpired at the as-of time, invoice not in the fixed demo settlement entry, and request ID not in the fixed processed-request entry.
- The circuit's witness values are not authenticated to any external record. No signed issuer record, Merkle root, or live policy data feed is involved. Proofs show only that the circuit constraints hold for the supplied values.
- The proof is generated and verified in the browser using NoirJS and Barretenberg WebAssembly. It exposes one randomized Pedersen commitment as its public input; the downloadable JSON includes the proof, public input, verification key, public circuit bytecode, and metadata but not the witness. The commitment hides the inputs, so the package alone does not identify which request it describes.
- The circuit uses the fixed demo replay entries `INV-26088` and `REQ-ALREADY-900`; its packed identifiers must be printable ASCII, at most 15 characters. The app may analyze longer IDs, but it will not enable proof for them.
- The existing SHA-256 checksum is preserved independently. A proof is not a checksum, does not authorize a payment, does not show funds were sent, and has not been submitted to zkVerify or a blockchain.

## Build and test commands

- `npm ci` — install pinned dependencies.
- `npm run check` — syntax checks plus automated tests (24 passing after integration).
- `npm run build` — Vite browser production build into ignored `dist/`.
- `npm start` — build, then serve the UI/API on port 4173.
- `npm run proof:compile` — compile the Noir circuit with Nargo and refresh the persisted circuit artifacts; Nargo 1.0.0-beta.18 must be available on PATH or configured via `NARGO_BIN`.
- `npm run proof:smoke` — in-memory Node/Wasm proof generation and local-verification check.
- `npm run worker:dry-run` — run checks/build and Wrangler dry-run using `dist/` assets.

## Verification performed

- Nargo compiled `main.nr`; `nargo execute` solved the synthetic `Prover.toml` witness.
- `npm run proof:smoke` generated an 8,256-byte proof with one public input and an 1,888-byte verification key; local verification passed.
- A real Chromium browser flow served from the Node app confirmed cross-origin isolation, loaded the Barretenberg worker, fetched the public CRS, generated and locally verified a proof, downloaded a proof package without request identifiers, and cleared proof state without changing the SHA-256 receipt. No browser console/request errors were seen after the CSP fix.
- `npm run build` succeeded; the proof engine is lazy-loaded after the user clicks the proof button. First proof use downloads/caches roughly 8 MB of public CRS data.
- CSP permits the public CRS host and the library's embedded `data:` WASM loader. COOP/COEP headers enable `SharedArrayBuffer` in supported browsers. These headers are set by the Node server and `public-static/_headers` for static deployment.
- The app dependencies are pinned in `package.json` and `package-lock.json`; prior npm audit reported 7 vulnerabilities (6 low, 1 high), not remediated as part of this work.
- The Dockerfile was adjusted to build the Vite assets in a multi-stage image and serve `dist/` from a minimal Node runtime. Docker is unavailable in this workspace, so the image remains untested.

## Deployment and publication

- The Cloudflare Workers demo is publicly deployed at `https://paytrol-wildcard-demo.maxdonald.workers.dev/`; `wrangler.jsonc` targets the Vite `dist/` output. Browser-side proof generation remains local to the user's browser.
- Live reviewer URLs: demo `https://paytrol-wildcard-demo.maxdonald.workers.dev/`; health `https://paytrol-wildcard-demo.maxdonald.workers.dev/health`; optional Wildcard endpoint `POST https://paytrol-wildcard-demo.maxdonald.workers.dev/api/agent`.
- Public smoke test passed: `GET /`, `GET /health`, and `GET /api/scenarios` returned HTTP 200. A synthetic `POST /api/agent` returned HTTP 200 and READY with all ten checks passing.
- The API accepts payTrol demo JSON and is not an Agent Games HMAC-signed task handler. The demo is simulation-only and does not authorize or send payments.
- Public repository: `https://github.com/maxdonald0006/paytrol-wildcard3`.
- No proof has been submitted to zkVerify or a blockchain; no smart contract has been deployed.
- Preserve scope: synthetic data only, no real money, bank access, live customer data, payment execution, or paid services.
