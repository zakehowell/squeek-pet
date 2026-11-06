import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds Squeek Pet World for squeekpulse.xyz/world/ as one ES module,
// dist-world/squeek-world.js, exporting mountWorld. Its styles are inside it:
// the World draws in a shadow root. The script is left unminified so the copy
// kept in the site's source stays readable; the site's own build minifies it.

function commit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  build: {
    outDir: "dist-world",
    emptyOutDir: true,
    target: ["es2021", "safari14", "chrome105"],
    minify: false,
    cssMinify: true,
    lib: {
      entry: fileURLToPath(new URL("src/world/app.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "squeek-world.js",
    },
    rollupOptions: {
      output: {
        // A /*! comment, so the site's minifier keeps it (at the end of world.js) and
        // anyone can see which commit is live.
        banner: `/*! Squeek Pet World ${process.env.npm_package_version ?? ""} (squeek-pet ${commit()}), MIT License.\n * Built from https://github.com/zakehowell/squeek-pet (src/world) with \`npm run build:world\`; do not edit by hand. */`,
      },
    },
  },
});
