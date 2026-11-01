import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Tauri serves the built pages from dist/. preview.html (the pose gallery) is
// served by the dev server only and is not part of the app. The dev server port is fixed because
// src-tauri/tauri.conf.json points devUrl at it.
export default defineConfig({
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // macOS 11+ WebKit (Safari 14) and Windows WebView2 both support BigInt and ES2021.
    target: ["es2021", "safari14", "chrome105"],
    rollupOptions: {
      input: {
        pet: page("index.html"),
        hud: page("hud.html"),
        settings: page("settings.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
