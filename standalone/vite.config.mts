// Builds MasCoach as ONE self-contained HTML file that needs no server: `npm run build:file`.
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");

export default defineConfig({
  root: here,
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      // Next.js pieces replaced for a file opened from disk.
      { find: /^next\/link$/, replacement: path.resolve(here, "shims/next-link.tsx") },
      { find: /^next\/navigation$/, replacement: path.resolve(here, "shims/next-navigation.ts") },
      { find: /^next\/dynamic$/, replacement: path.resolve(here, "shims/next-dynamic.tsx") },
      // Key from the browser's storage, and the /api/* code run inside the page.
      { find: /^\.\/credentials$/, replacement: path.resolve(src, "lib/intervals/credentials.browser.ts") },
      { find: /^(\.\.\/data|\.)\/transport$/, replacement: path.resolve(src, "components/data/transport.browser.ts") },
      { find: /^@\//, replacement: `${src}/` },
    ],
  },
  build: {
    outDir: path.resolve(here, "../dist-file"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
