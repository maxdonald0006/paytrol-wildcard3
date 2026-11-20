import { proofReadinessReason } from "../src/proof-inputs.mjs";

const form = document.querySelector("#requestForm");
const scenarioList = document.querySelector("#scenarioList");
const submitButton = document.querySelector("#submitButton");
const formError = document.querySelector("#formError");
const decisionCard = document.querySelector("#decisionCard");
const resultState = document.querySelector("#resultState");
const samplePayload = document.querySelector("#samplePayload");
const endpointString = document.querySelector("#endpointString");
const proofBox = document.querySelector("#zkProofBox");
const proofStatus = document.querySelector("#proofStatus");
const proofDescription = document.querySelector("#proofDescription");
const generateProofButton = document.querySelector("#generateProofButton");
const proofDetails = document.querySelector("#proofDetails");
const proofPublicInput = document.querySelector("#proofPublicInput");
const proofSize = document.querySelector("#proofSize");
const verificationKeySize = document.querySelector("#verificationKeySize");
const proofPublicInputCount = document.querySelector("#proofPublicInputCount");
const downloadProofButton = document.querySelector("#downloadProofButton");
const clearProofButton = document.querySelector("#clearProofButton");
let scenarios = [];
let selectedScenarioId = "clean";
let currentResult = null;
let lastProofBundle = null;
let proofInProgress = false;
let analysisRunId = 0;

const fields = {
  requestId: document.querySelector("#requestId"),
  approvalId: document.querySelector("#approvalId"),
  vendorId: document.querySelector("#vendorId"),
  beneficiaryId: document.querySelector("#beneficiaryId"),
  invoiceId: document.querySelector("#invoiceId"),
  amountNgn: document.querySelector("#amountNgn")
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[char]);
}

function setFormValues(request) {
  for (const [key, element] of Object.entries(fields)) {
    element.value = request[key] ?? "";
  }
  samplePayload.textContent = JSON.stringify(request, null, 2);
}

function formPayload() {
  return {
    requestId: fields.requestId.value.trim(),
    approvalId: fields.approvalId.value.trim(),
    vendorId: fields.vendorId.value.trim(),
    beneficiaryId: fields.beneficiaryId.value.trim(),
    invoiceId: fields.invoiceId.value.trim(),
    amountNgn: Number(fields.amountNgn.value)
  };
}

function renderScenarios() {
  scenarioList.innerHTML = scenarios.map((scenario) => `
    <button class="scenario-button ${scenario.id === selectedScenarioId ? "is-selected" : ""}" type="button" data-scenario="${escapeHtml(scenario.id)}" aria-pressed="${scenario.id === selectedScenarioId}">
      <strong>${escapeHtml(scenario.title)}</strong>
      <span>${escapeHtml(scenario.description)}</span>
    </button>
  `).join("");

  scenarioList.querySelectorAll("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = scenarios.find((item) => item.id === button.dataset.scenario);
      if (!scenario) return;
      selectedScenarioId = scenario.id;
      setFormValues(scenario.request);
      renderScenarios();
      runAnalysis();
    });
  });
}

function decisionTone(decision) {
  if (decision === "READY") return "ready";
  if (decision === "HOLD") return "hold";
  return "block";
}

function statusIcon(status) {
  if (status === "pass") return "✓";
  if (status === "warn") return "!";
  if (status === "fail") return "×";
  return "–";
}

function formatNgn(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `₦${amount.toLocaleString("en-NG")}`;
}

function renderChecks(checks) {
  const passed = checks.filter((check) => check.status === "pass").length;
  document.querySelector("#checksCount").textContent = `${passed} / ${checks.length} passed`;
  document.querySelector("#checkList").innerHTML = checks.map((check) => `
    <div class="check-row check-row--${escapeHtml(check.status)}">
      <span class="check-icon" aria-hidden="true">${statusIcon(check.status)}</span>
      <div class="check-copy"><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(check.detail)}</span></div>
      <span class="check-status">${escapeHtml(check.status.toUpperCase())}</span>
    </div>
  `).join("");
}

function resetProofUI(message = "A proof can be generated only after a READY result with all ten checks passing.") {
  lastProofBundle = null;
  proofDetails.hidden = true;
  proofPublicInput.textContent = "—";
  proofSize.textContent = "—";
  verificationKeySize.textContent = "—";
  proofPublicInputCount.textContent = "—";
  proofStatus.className = "proof-status proof-status--waiting";
  proofStatus.textContent = "READY CHECK REQUIRED";
  proofDescription.textContent = message;
  generateProofButton.textContent = "Generate and verify proof";
  generateProofButton.disabled = true;
  proofBox.setAttribute("aria-busy", "false");
}

function updateProofAvailability(result) {
  lastProofBundle = null;
  proofDetails.hidden = true;
  proofPublicInput.textContent = "—";
  proofSize.textContent = "—";
  verificationKeySize.textContent = "—";
  proofPublicInputCount.textContent = "—";
  const reason = proofReadinessReason(result);
  proofStatus.className = reason ? "proof-status proof-status--waiting" : "proof-status proof-status--ready";
  proofStatus.textContent = reason ? (result.decision === "READY" ? "NOT SUPPORTED" : "READY REQUIRED") : "READY TO PROVE";
  proofDescription.textContent = reason || "All ten checks pass. You can generate a local proof for the supplied request and synthetic policy values.";
  generateProofButton.textContent = "Generate and verify proof";
  generateProofButton.disabled = Boolean(reason) || proofInProgress;
  proofBox.setAttribute("aria-busy", "false");
}

function renderResult(result) {
  currentResult = result;
  const tone = decisionTone(result.decision);
  resultState.className = `result-state result-state--${tone}`;
  document.querySelector("#resultIcon").textContent = result.decision === "READY" ? "✓" : result.decision === "HOLD" ? "!" : "×";
  document.querySelector("#resultKicker").textContent = result.decision === "READY" ? "POLICY CHECK COMPLETE" : result.decision === "HOLD" ? "HUMAN REVIEW REQUIRED" : "POLICY MISMATCH FOUND";
  document.querySelector("#decisionLabel").textContent = result.decisionLabel;
  document.querySelector("#decisionMessage").textContent = result.message;
  document.querySelector("#resultRequest").textContent = result.request.requestId;
  document.querySelector("#resultVendor").textContent = result.policySnapshot.vendorName || result.request.vendorId;
  document.querySelector("#resultAmount").textContent = formatNgn(result.request.amountNgn);
  document.querySelector("#receiptHash").textContent = result.receipt.hash;
  renderChecks(result.checks);
  updateProofAvailability(result);
  decisionCard.setAttribute("aria-busy", "false");
}

function setPending(request) {
  currentResult = null;
  resetProofUI("Waiting for the new preflight result. ZK proof generation is separate from the SHA-256 receipt.");
  resultState.className = "result-state result-state--loading";
  document.querySelector("#resultIcon").textContent = "···";
  document.querySelector("#resultKicker").textContent = "CHECKING POLICY";
  document.querySelector("#decisionLabel").textContent = "Evaluating this request…";
  document.querySelector("#decisionMessage").textContent = "Comparing the request with the demo approval and vendor records.";
  document.querySelector("#resultRequest").textContent = request.requestId || "—";
  document.querySelector("#resultVendor").textContent = request.vendorId || "—";
  document.querySelector("#resultAmount").textContent = formatNgn(request.amountNgn);
  document.querySelector("#checksCount").textContent = "— / 10";
  document.querySelector("#checkList").innerHTML = '<div class="empty-checks">Checks will appear when the API responds.</div>';
  document.querySelector("#receiptHash").textContent = "Waiting for result…";
}

function renderUnavailable(message, request = null) {
  currentResult = null;
  resetProofUI("No current READY result is available, so a proof cannot be generated.");
  resultState.className = "result-state result-state--hold";
  document.querySelector("#resultIcon").textContent = "!";
  document.querySelector("#resultKicker").textContent = "NO DECISION RETURNED";
  document.querySelector("#decisionLabel").textContent = "Request not checked";
  document.querySelector("#decisionMessage").textContent = message;
  document.querySelector("#resultRequest").textContent = request?.requestId || "—";
  document.querySelector("#resultVendor").textContent = request?.vendorId || "—";
  document.querySelector("#resultAmount").textContent = request ? formatNgn(request.amountNgn) : "—";
  document.querySelector("#checksCount").textContent = "0 / 10";
  document.querySelector("#checkList").innerHTML = '<div class="empty-checks">No policy result is available. Do not treat a previous result as current.</div>';
  document.querySelector("#receiptHash").textContent = "No checksum generated.";
  decisionCard.setAttribute("aria-busy", "false");
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

async function runAnalysis() {
  const runId = ++analysisRunId;
  formError.hidden = true;
  submitButton.disabled = true;
  submitButton.innerHTML = 'Checking policy <span class="button-spinner" aria-hidden="true"></span>';
  decisionCard.setAttribute("aria-busy", "true");

  const request = formPayload();
  samplePayload.textContent = JSON.stringify(request, null, 2);
  setPending(request);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "The request could not be checked.");
    }
    if (runId !== analysisRunId) return;
    renderResult(data);
  } catch (error) {
    if (runId !== analysisRunId) return;
    const message = error.message || "Could not reach the demo API. Check the connection and try again.";
    renderUnavailable(message, request);
    showError(message);
  } finally {
    if (runId === analysisRunId) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Check this request <span aria-hidden="true">→</span>';
    }
  }
}

function bytesFromHex(hex) {
  return Math.max(0, Math.floor((String(hex || "").length - 2) / 2));
}

function downloadProofBundle() {
  if (!lastProofBundle || !currentResult) return;
  const blob = new Blob([JSON.stringify(lastProofBundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeRequestId = currentResult.request.requestId.replace(/[^A-Za-z0-9_-]+/g, "-");
  link.href = url;
  link.download = `paytrol-zk-proof-${safeRequestId || "request"}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

generateProofButton.addEventListener("click", async () => {
  const proofResult = currentResult;
  if (!proofResult || proofInProgress) return;
  const reason = proofReadinessReason(proofResult);
  if (reason) {
    updateProofAvailability(proofResult);
    return;
  }

  proofInProgress = true;
  lastProofBundle = null;
  proofDetails.hidden = true;
  proofStatus.className = "proof-status proof-status--working";
  proofStatus.textContent = "GENERATING LOCALLY";
  proofDescription.textContent = "Loading the browser proof engine…";
  proofBox.setAttribute("aria-busy", "true");
  generateProofButton.disabled = true;
  generateProofButton.innerHTML = 'Proving locally <span class="button-spinner" aria-hidden="true"></span>';

  try {
    const { generateAndVerifyPaytrolProof } = await import("../src/paytrol-proof.mjs");
    const bundle = await generateAndVerifyPaytrolProof(proofResult, (message) => {
      if (currentResult === proofResult) proofDescription.textContent = message;
    });
    if (currentResult !== proofResult) return;

    lastProofBundle = bundle;
    proofStatus.className = "proof-status proof-status--verified";
    proofStatus.textContent = "LOCAL VERIFICATION PASSED";
    proofDescription.textContent = "The browser generated a Noir UltraHonk proof and verified it locally. Proof generation did not send the witness to a prover service; the preflight request was separately checked by this demo API.";
    proofPublicInput.textContent = bundle.publicInputs.join(" · ") || "No public inputs";
    proofSize.textContent = `${bytesFromHex(bundle.proof).toLocaleString("en-NG")} bytes`;
    verificationKeySize.textContent = `${bytesFromHex(bundle.verificationKey).toLocaleString("en-NG")} bytes`;
    proofPublicInputCount.textContent = String(bundle.publicInputs.length);
    proofDetails.hidden = false;
    generateProofButton.textContent = "Generate another proof";
  } catch (error) {
    if (currentResult === proofResult) {
      proofStatus.className = "proof-status proof-status--error";
      proofStatus.textContent = "PROOF NOT GENERATED";
      proofDescription.textContent = error?.message || "The browser could not generate or verify a proof. Please try again.";
    }
  } finally {
    proofInProgress = false;
    proofBox.setAttribute("aria-busy", "false");
    if (currentResult) {
      generateProofButton.disabled = Boolean(proofReadinessReason(currentResult));
      if (!lastProofBundle) generateProofButton.textContent = "Generate and verify proof";
      else generateProofButton.textContent = "Generate another proof";
    }
  }
});

downloadProofButton.addEventListener("click", downloadProofBundle);
clearProofButton.addEventListener("click", () => {
  lastProofBundle = null;
  proofDetails.hidden = true;
  if (currentResult) updateProofAvailability(currentResult);
  else resetProofUI();
  proofDescription.textContent = "Proof data cleared from this page's memory. It was not stored on the server.";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  selectedScenarioId = "";
  renderScenarios();
  runAnalysis();
});

const cleanButton = document.querySelector(".button-dark");
cleanButton.addEventListener("click", () => {
  const clean = scenarios.find((item) => item.id === "clean");
  if (!clean) return;
  selectedScenarioId = clean.id;
  setFormValues(clean.request);
  renderScenarios();
  runAnalysis();
});

const endpointUrl = `${window.location.origin}/api/agent`;
const endpointHost = window.location.hostname.toLowerCase();
const isLocalHost = endpointHost === "localhost" || endpointHost === "127.0.0.1" || endpointHost === "::1";
const isArenaPreview = endpointHost.endsWith(".e2b.app");
document.querySelector("#apiStatusLabel").textContent = isLocalHost
  ? "LOCAL API"
  : isArenaPreview
    ? "ARENA PREVIEW"
    : window.location.protocol === "https:"
      ? "PUBLIC HTTPS API"
      : "HOSTED API";
endpointString.textContent = endpointUrl;
document.querySelector("#copyEndpoint").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(endpointUrl);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Select URL";
    const range = document.createRange();
    range.selectNodeContents(endpointString);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  window.setTimeout(() => { button.textContent = "Copy URL"; }, 1600);
});

async function initialise() {
  resetProofUI();
  try {
    const response = await fetch("/api/scenarios");
    if (!response.ok) throw new Error("Demo cases could not be loaded.");
    const data = await response.json();
    scenarios = data.scenarios || [];
    if (!scenarios.length) throw new Error("No demo cases are configured.");
    const initial = scenarios.find((item) => item.id === "clean") || scenarios[0];
    selectedScenarioId = initial.id;
    setFormValues(initial.request);
    renderScenarios();
    await runAnalysis();
  } catch (error) {
    const message = error.message || "Could not load demo cases.";
    scenarioList.innerHTML = `<div class="scenario-loading">${escapeHtml(message)}</div>`;
    renderUnavailable("The demo API is not available yet. Refresh the page in a moment.");
    showError("The demo API is not available yet. Refresh the page in a moment.");
  }
}

initialise();
