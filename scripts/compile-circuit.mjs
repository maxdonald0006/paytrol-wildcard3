import { spawnSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const circuitDir = resolve(root, "zk/paytrol_ready");
const nargo = process.env.NARGO_BIN || "nargo";

const compile = spawnSync(nargo, ["compile"], {
  cwd: circuitDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (compile.error) {
  console.error(`Could not run Nargo (${nargo}). Install Noir/Nargo or set NARGO_BIN to its executable path.`);
  process.exit(1);
}
if (compile.status !== 0) process.exit(compile.status ?? 1);

const generated = resolve(circuitDir, "target/paytrol_ready.json");
const committedArtifact = resolve(circuitDir, "artifacts/paytrol_ready.json");
const browserArtifact = resolve(root, "public-static/paytrol_ready.json");
await mkdir(dirname(committedArtifact), { recursive: true });
await mkdir(dirname(browserArtifact), { recursive: true });
await copyFile(generated, committedArtifact);
await copyFile(generated, browserArtifact);
console.log("Compiled circuit copied to zk/paytrol_ready/artifacts and public-static.");
