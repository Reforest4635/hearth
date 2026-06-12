// Household Ledger add-on server v2 — SQLite-backed
// DB lives at /share/household_ledger/ledger.db (WAL mode).
// One-time migration imports the old /share state.json into tables.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const PORT = 8099;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = "/share/household_ledger";
const DB_FILE = path.join(DATA_DIR, "ledger.db");
const LEGACY_JSON = path.join(DATA_DIR, "state.json");
const LEGACY_DATA = "/data/state.json";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS bills(
    id TEXT PRIMARY KEY, list TEXT NOT NULL DEFAULT 'household',
    day INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
    auto INTEGER NOT NULL DEFAULT 0, notes TEXT DEFAULT '', link TEXT DEFAULT '',
    freq TEXT DEFAULT 'monthly', weekday INTEGER, anchorMonth INTEGER);
  CREATE TABLE IF NOT EXISTS paid(month TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY(month, key));
  CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    rate REAL NOT NULL DEFAULT 0, balance REAL NOT NULL DEFAULT 0, min REAL NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS loans(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, note TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS tasks(
    id TEXT PRIMARY KEY, domain TEXT NOT NULL DEFAULT 'maintenance',
    name TEXT NOT NULL, category TEXT DEFAULT '', interval_days INTEGER,
    last_done TEXT, notes TEXT DEFAULT '', link TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS task_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL,
    done_at TEXT NOT NULL, notes TEXT DEFAULT '');
  CREATE INDEX IF NOT EXISTS idx_log_task ON task_log(task_id, done_at DESC);
`);

// ---- one-time migration from the JSON era ----
const hasBills = db.prepare("SELECT COUNT(*) AS n FROM bills").get().n > 0;
const hasSettings = db.prepare("SELECT COUNT(*) AS n FROM settings").get().n > 0;
if (!hasBills && !hasSettings) {
  const src = fs.existsSync(LEGACY_JSON) ? LEGACY_JSON : (fs.existsSync(LEGACY_DATA) ? LEGACY_DATA : null);
  if (src) {
    try {
      const s = JSON.parse(fs.readFileSync(src, "utf8"));
      const insBill = db.prepare(`INSERT OR REPLACE INTO bills(id,list,day,name,amount,auto,notes,link,freq,weekday,anchorMonth)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
      for (const b of s.bills || []) insBill.run(b.id, "household", b.day ?? 1, b.name ?? "", b.amount ?? 0, b.auto ? 1 : 0, b.notes ?? "", b.link ?? "", b.freq ?? "monthly", b.weekday ?? null, b.anchorMonth ?? null);
      for (const b of s.work || []) insBill.run(b.id, "work", b.day ?? 1, b.name ?? "", b.amount ?? 0, b.auto ? 1 : 0, b.notes ?? "", b.link ?? "", b.freq ?? "monthly", b.weekday ?? null, b.anchorMonth ?? null);
      const insCard = db.prepare("INSERT OR REPLACE INTO cards(id,name,rate,balance,min) VALUES(?,?,?,?,?)");
      for (const c of s.cards || []) insCard.run(c.id, c.name ?? "", c.rate ?? 0, c.balance ?? 0, c.min ?? 0);
      const insPaid = db.prepare("INSERT OR IGNORE INTO paid(month,key) VALUES(?,?)");
      for (const [month, keys] of Object.entries(s.paid || {}))
        for (const [key, v] of Object.entries(keys || {})) if (v) insPaid.run(month, key);
      const insSet = db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)");
      if (s.theme) insSet.run("theme", JSON.stringify(s.theme));
      if (s.range) insSet.run("range", JSON.stringify(s.range));
      if (s.balances) insSet.run("balances", JSON.stringify(s.balances));
      fs.renameSync(src, src + ".imported"); // keep as backup, never re-import
      console.log("Imported legacy JSON state from " + src);
    } catch (e) { console.error("legacy import failed", e); }
  }
}

// ---- helpers ----
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function send(res, code, obj) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "", size = 0;
    req.on("data", (c) => { size += c.length; if (size > 2e6) { req.destroy(); reject(new Error("too large")); } body += c; });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("invalid JSON")); } });
    req.on("error", reject);
  });
}
const getSetting = (key, fallback) => {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
};
const rowToBill = (r) => ({ ...r, auto: !!r.auto });

function fullState() {
  return {
    theme: getSetting("theme", "evergreen"),
    range: getSetting("range", { from: 1, to: 31 }),
    balances: getSetting("balances", { household: "", work: "" }),
    bills: db.prepare("SELECT * FROM bills").all().map(rowToBill),
    cards: db.prepare("SELECT * FROM cards").all(),
    loans: db.prepare("SELECT * FROM loans").all(),
    tasks: db.prepare("SELECT * FROM tasks").all(),
    paid: db.prepare("SELECT month, key FROM paid").all().reduce((acc, r) => {
      (acc[r.month] = acc[r.month] || {})[r.key] = true; return acc;
    }, {}),
  };
}

// ---- routing ----
const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  const apiIdx = urlPath.indexOf("/api/");
  if (apiIdx !== -1) {
    const parts = urlPath.slice(apiIdx + 5).split("/").filter(Boolean); // after /api/
    const m = req.method;
    try {
      // GET state
      if (parts[0] === "state" && m === "GET") return send(res, 200, fullState());

      // settings
      if (parts[0] === "settings" && m === "PUT") {
        const body = await readBody(req);
        const ins = db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)");
        for (const k of ["theme", "range", "balances"]) if (k in body) ins.run(k, JSON.stringify(body[k]));
        return send(res, 200, { ok: true });
      }

      // paid
      if (parts[0] === "paid" && parts[1] === "reset" && m === "POST") {
        const { month } = await readBody(req);
        db.prepare("DELETE FROM paid WHERE month=?").run(String(month));
        return send(res, 200, { ok: true });
      }
      if (parts[0] === "paid" && m === "POST") {
        const { month, key, paid } = await readBody(req);
        if (paid) db.prepare("INSERT OR IGNORE INTO paid(month,key) VALUES(?,?)").run(String(month), String(key));
        else db.prepare("DELETE FROM paid WHERE month=? AND key=?").run(String(month), String(key));
        return send(res, 200, { ok: true });
      }

      // generic CRUD for bills / cards / loans / tasks
      const TABLES = {
        bills: ["list", "day", "name", "amount", "auto", "notes", "link", "freq", "weekday", "anchorMonth"],
        cards: ["name", "rate", "balance", "min"],
        loans: ["name", "balance", "rate", "note"],
        tasks: ["domain", "name", "category", "interval_days", "last_done", "notes", "link"],
      };
      if (TABLES[parts[0]]) {
        const table = parts[0], cols = TABLES[table], id = parts[1];

        // task completion + history live under tasks/:id/...
        if (table === "tasks" && id && parts[2] === "done" && m === "POST") {
          const body = await readBody(req);
          const date = body.date || new Date().toISOString().slice(0, 10);
          db.prepare("UPDATE tasks SET last_done=? WHERE id=?").run(date, id);
          db.prepare("INSERT INTO task_log(task_id,done_at,notes) VALUES(?,?,?)").run(id, date, body.notes || "");
          return send(res, 200, { ok: true, last_done: date });
        }
        if (table === "tasks" && id && parts[2] === "log" && m === "GET") {
          return send(res, 200, db.prepare("SELECT id,done_at,notes FROM task_log WHERE task_id=? ORDER BY done_at DESC, id DESC LIMIT 100").all(id));
        }

        if (m === "POST" && !id) {
          const b = await readBody(req);
          const rid = b.id || "x" + Math.random().toString(36).slice(2, 10);
          const vals = cols.map((c) => (typeof b[c] === "boolean" ? (b[c] ? 1 : 0) : (b[c] ?? null)));
          db.prepare(`INSERT INTO ${table}(id,${cols.join(",")}) VALUES(?${",?".repeat(cols.length)})`).run(rid, ...vals);
          return send(res, 200, { ok: true, id: rid });
        }
        if (m === "PUT" && id) {
          const b = await readBody(req);
          const present = cols.filter((c) => c in b);
          if (present.length) {
            const vals = present.map((c) => (typeof b[c] === "boolean" ? (b[c] ? 1 : 0) : b[c]));
            db.prepare(`UPDATE ${table} SET ${present.map((c) => c + "=?").join(",")} WHERE id=?`).run(...vals, id);
          }
          return send(res, 200, { ok: true });
        }
        if (m === "DELETE" && id) {
          db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
          if (table === "tasks") db.prepare("DELETE FROM task_log WHERE task_id=?").run(id);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: "unknown endpoint" });
    } catch (e) {
      return send(res, e.message === "invalid JSON" ? 400 : 500, { error: e.message });
    }
  }

  // static
  if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
  let rel = decodeURIComponent(urlPath);
  if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": MIME[".html"] }); res.end(html);
      });
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Household Ledger v2 (SQLite) on ${PORT}, db: ${DB_FILE}`));
