import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const previewHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self' data: https://crs.aztec.network; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
};

export default defineConfig({
  root: resolve(projectRoot, "public"),
  publicDir: resolve(projectRoot, "public-static"),
  plugins: [
    nodePolyfills({
      include: ["buffer", "process", "path", "stream", "util", "events"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true
    })
  ],
  resolve: {
    alias: { buffer: "buffer/" }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    headers: previewHeaders,
    fs: { allow: [projectRoot] }
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    headers: previewHeaders
  },
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      input: resolve(projectRoot, "public/index.html")
    }
  }
});
