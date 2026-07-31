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
  // lucide-solid ships ~1600 icons as separate modules and we import it as a
  // barrel. Without pre-bundling, a cold dev server serves them one request at
  // a time and wedges the browser hard enough to look like an infinite loop.
  optimizeDeps: { include: ["lucide-solid"] },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
