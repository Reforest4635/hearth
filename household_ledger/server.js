// Household Ledger add-on server
// Serves the built React app and persists state to /data/state.json
// (the /data volume survives add-on restarts and updates).
// No dependencies — plain Node.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8099;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = "/data/state.json";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function send(res, code, body, type) {
  res.writeHead(code, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readState(res) {
  fs.readFile(DATA_FILE, "utf8", (err, data) => {
    if (err) return send(res, 200, "null", MIME[".json"]); // first run: no state yet
    send(res, 200, data, MIME[".json"]);
  });
}

function writeState(req, res) {
  let body = "";
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) { req.destroy(); return; } // 5MB cap
    body += chunk;
  });
  req.on("end", () => {
    try {
      JSON.parse(body); // validate before persisting
    } catch {
      return send(res, 400, JSON.stringify({ error: "invalid JSON" }), MIME[".json"]);
    }
    // Atomic write: temp file then rename, so a crash can't corrupt the ledger
    const tmp = DATA_FILE + ".tmp";
    fs.writeFile(tmp, body, (err) => {
      if (err) return send(res, 500, JSON.stringify({ error: "write failed" }), MIME[".json"]);
      fs.rename(tmp, DATA_FILE, (err2) => {
        if (err2) return send(res, 500, JSON.stringify({ error: "rename failed" }), MIME[".json"]);
        send(res, 200, JSON.stringify({ ok: true }), MIME[".json"]);
      });
    });
  });
}

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden"); // no path traversal
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback: unknown paths get the app shell
      return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, html) => {
        if (e2) return send(res, 404, "Not found");
        send(res, 200, html, MIME[".html"]);
      });
    }
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  // Ingress strips its token prefix, but be lenient and match any */api/state
  if (url.endsWith("/api/state") || url === "/api/state") {
    if (req.method === "GET") return readState(res);
    if (req.method === "PUT" || req.method === "POST") return writeState(req, res);
    return send(res, 405, "Method not allowed");
  }
  if (req.method !== "GET") return send(res, 405, "Method not allowed");
  serveStatic(res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Household Ledger listening on ${PORT}`);
});
