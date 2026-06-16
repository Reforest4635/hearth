import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Home Assistant Ingress rejects subresource requests that carry the
// `crossorigin` attribute (the session isn't applied to them), which makes the
// JS bundle 403 and the page render blank. Vite always adds crossorigin to its
// module script, so we strip it from the final HTML.
const stripCrossorigin = () => ({
  name: "strip-crossorigin",
  transformIndexHtml: {
    order: "post",
    handler: (html) => html.replace(/\s+crossorigin/g, ""),
  },
});

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
