/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The app calls the backend at the relative path /api; dev and preview
// servers proxy it. In Docker the target is the backend service hostname.
const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";

const apiProxy = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
