import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Tauri serves this build from the app bundle; in dev it runs a normal Vite
// server that the Rust shell points its webview at.
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: { "~": path.resolve(__dirname, "./src") },
  },
  // Tauri expects a fixed port and no automatic fallback.
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
