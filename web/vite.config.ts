import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/** Must exceed LLM_FETCH_TIMEOUT_MS (default 20 min) for long analysis requests */
const PROXY_TIMEOUT_MS = 25 * 60 * 1000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5174",
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
      },
    },
  },
});
