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
  // lucide-solid is imported per-icon (`lucide-solid/icons/x`), never as the
  // barrel: a barrel import makes a cold dev server stream ~1600 icon modules
  // one request at a time, and `optimizeDeps: { include: ["lucide-solid"] }`
  // cannot fix it — vite-plugin-solid force-EXCLUDES every package with a
  // `solid` export condition so it goes through the Solid compiler, and the
  // exclude wins over any include. Verified twice.
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
