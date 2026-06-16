import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Stable, unhashed filenames so a partial/manual deploy can never leave
    // index.html pointing at an asset hash that no longer exists. The add-on
    // server sends Cache-Control: no-store, so stale caching isn't a concern.
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
