import { analyzePayout } from "../src/guard.mjs";
import { buildDemoData } from "../src/demo-data.mjs";
import { generateAndVerifyPaytrolProof } from "../src/paytrol-proof.mjs";

const now = new Date("2026-11-17T12:00:00.000Z");
const data = buildDemoData(now);
const request = data.scenarios.find((scenario) => scenario.id === "clean").request;
const result = analyzePayout(request, { now, data });
if (result.decision !== "READY") throw new Error("Synthetic clean request did not pass the payTrol checks.");

const proof = await generateAndVerifyPaytrolProof(result, (message) => console.log(message));
console.log(JSON.stringify({
  proofSystem: proof.proofSystem,
  publicInputCount: proof.publicInputs.length,
  proofBytes: (proof.proof.length - 2) / 2,
  verificationKeyBytes: (proof.verificationKey.length - 2) / 2,
  localVerification: proof.localVerification
}, null, 2));
if (proof.localVerification !== "passed") process.exit(1);
