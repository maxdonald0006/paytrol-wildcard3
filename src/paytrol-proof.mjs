import { Noir } from "@noir-lang/noir_js";
import {
  BackendType,
  Barretenberg,
  UltraHonkBackend,
  UltraHonkVerifierBackend
} from "@aztec/bb.js";
import circuit from "../zk/paytrol_ready/artifacts/paytrol_ready.json" with { type: "json" };
import { createCircuitInputs } from "./proof-inputs.mjs";

const PROVER_TARGET = "evm";
const PROVER_SRS_POINTS = 2 ** 16;

function randomBlindingField() {
  const bytes = new Uint8Array(31);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return BigInt(`0x${hex}`).toString();
}

function toHex(bytes) {
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function progress(onProgress, message) {
  if (typeof onProgress === "function") onProgress(message);
}

export async function generateAndVerifyPaytrolProof(result, onProgress = () => {}) {
  if (typeof Worker === "undefined" && typeof window !== "undefined") {
    throw new Error("This browser does not support the Web Workers needed for local proof generation.");
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("A secure browser random-number generator is required for proof blinding.");
  }

  const circuitInputs = createCircuitInputs(result, randomBlindingField());
  const noir = new Noir(circuit);
  progress(onProgress, "Building a private witness from this request and the supplied synthetic records…");
  const { witness } = await noir.execute(circuitInputs);

  let api;
  const previousDefaultSrsSize = Barretenberg.prototype.getDefaultSrsSize;
  try {
    // This small demo circuit has been smoke-tested at 2^16 SRS points. Keeping
    // the CRS small avoids the default 2^20 download on first use.
    Barretenberg.prototype.getDefaultSrsSize = () => PROVER_SRS_POINTS;
    progress(onProgress, "Starting the browser prover. First use downloads and caches about 8 MB of public CRS data…");
    const backend = typeof window === "undefined" ? BackendType.Wasm : BackendType.WasmWorker;
    api = await Barretenberg.new({
      backend,
      threads: 2,
      logger: (message) => {
        if (/fetching|compiling|initializ|crs/i.test(String(message))) progress(onProgress, "Preparing the local proof engine…");
      }
    });
  } finally {
    Barretenberg.prototype.getDefaultSrsSize = previousDefaultSrsSize;
  }

  try {
    const honk = new UltraHonkBackend(circuit.bytecode, api);
    const proofOptions = { verifierTarget: PROVER_TARGET };
    progress(onProgress, "Generating a zero-knowledge proof locally. This may take a little while…");
    const proofData = await honk.generateProof(witness, proofOptions);

    progress(onProgress, "Computing the verification key and checking the proof locally…");
    const verificationKey = await honk.getVerificationKey(proofOptions);
    const verifier = new UltraHonkVerifierBackend(api);
    const verified = await verifier.verifyProof({ ...proofData, verificationKey }, proofOptions);
    if (!verified) throw new Error("The generated proof did not pass local verification.");

    return {
      format: "paytrol-zk-proof-v1",
      proofSystem: "Noir UltraHonk",
      verifierTarget: "EVM (Keccak, zero-knowledge enabled)",
      circuit: "paytrol_ready / policy version 20261117",
      noirVersion: circuit.noir_version,
      circuitArtifactHash: circuit.hash,
      circuitBytecode: circuit.bytecode,
      localVerification: "passed",
      generatedAt: new Date().toISOString(),
      proof: toHex(proofData.proof),
      publicInputs: proofData.publicInputs,
      verificationKey: toHex(verificationKey),
      privacyNote: "This package includes only the proof, public inputs, and verification key; it omits the private witness."
    };
  } finally {
    await api?.destroy();
  }
}
