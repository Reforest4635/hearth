import React, { useState, useEffect, useMemo, useRef } from "react";

// ---------- Helpers ----------

const fmt = (n) =>
  (n < 0 ? "-$" : "$") +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const uid = () => "x" + Math.random().toString(36).slice(2, 10);
const FREQ_LABEL = { weekly: "weekly", bimonthly: "every 2 mo", yearly: "yearly" };
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- API ----------

const API_BASE = (() => {
  const p = window.location.pathname;
  return p.endsWith("/") ? p : p.slice(0, p.lastIndexOf("/") + 1);
})();

async function api(path, method = "GET", body) {
  const r = await fetch(API_BASE + "api/" + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
  return r.json();
}
const quietly = (p) => p.catch((e) => console.error(e));

// ---------- Themes ----------

const THEME_ORDER = ["evergreen", "solarized-dark", "solarized-light"];
const THEME_NAME = { "evergreen": "Evergreen", "solarized-dark": "Solarized Dark", "solarized-light": "Solarized Light" };

const THEMES = {
  "evergreen": {
    "--ink": "#f4f9f5", "--paper": "#0e1712", "--card": "#18251d", "--line": "#354a3d",
    "--muted": "#a3b8aa", "--green": "#7ed29e", "--green-soft": "#1d3326",
    "--accent": "#36805a", "--on-accent": "#ffffff",
    "--amber": "#e2b26c", "--amber-soft": "#352a18", "--red": "#e28579", "--red-soft": "#38231e",
    "--modal": "#1c2a22", "--check-ink": "#0e1712", "--late-border": "#6a443c",
    "--freq-bg": "#214232", "--freq-fg": "#9adcb4", "--tag-fg": "#c3d3c8", "--late-fg": "#1c100e",
  },
  "solarized-dark": {
    "--ink": "#eee8d5", "--paper": "#002b36", "--card": "#073642", "--line": "#14515f",
    "--muted": "#93a1a1", "--green": "#859900", "--green-soft": "#173a1f",
    "--accent": "#2aa198", "--on-accent": "#002b36",
    "--amber": "#b58900", "--amber-soft": "#2c2a12", "--red": "#dc322f", "--red-soft": "#3a1a1c",
    "--modal": "#0a3b47", "--check-ink": "#002b36", "--late-border": "#6b3231",
    "--freq-bg": "#0e4a52", "--freq-fg": "#6ec6bd", "--tag-fg": "#aab6b0", "--late-fg": "#fdf6e3",
  },
  "solarized-light": {
    "--ink": "#073642", "--paper": "#fdf6e3", "--card": "#fffbf0", "--line": "#e3dac0",
    "--muted": "#6e7e84", "--green": "#738600", "--green-soft": "#eef0d7",
    "--accent": "#157a73", "--on-accent": "#fdf6e3",
    "--amber": "#b58900", "--amber-soft": "#f3ead0", "--red": "#dc322f", "--red-soft": "#f8e2dc",
    "--modal": "#fffbf0", "--check-ink": "#fdf6e3", "--late-border": "#dba9a0",
    "--freq-bg": "#dcebe2", "--freq-fg": "#1f6e57", "--tag-fg": "#6e7e84", "--late-fg": "#fdf6e3",
  },
};

// Which days of the given month a bill occurs on (empty if not due that month)
function occDays(bill, year, month) {
  const freq = bill.freq || "monthly";
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (freq === "weekly") {
    const wd = bill.weekday ?? 5;
    const out = [];
    for (let d = 1; d <= daysInMonth; d++) if (new Date(year, month, d).getDay() === wd) out.push(d);
    return out;
  }
  if (freq === "bimonthly") {
    const a = bill.anchorMonth ?? 0;
    if ((((month - a) % 2) + 2) % 2 !== 0) return [];
    return [Math.min(bill.day, daysInMonth)];
  }
  if (freq === "yearly") {
    if ((bill.anchorMonth ?? 0) !== month) return [];
    return [Math.min(bill.day, daysInMonth)];
  }
  return [Math.min(bill.day, daysInMonth)];
}

// Days until a task is due (negative = overdue)
function taskDue(t) {
  if (!t.interval_days) return { d: null, label: "unscheduled", cls: "" };
  if (!t.last_done) return { d: -99999, label: "never logged", cls: "over" };
  const last = new Date(t.last_done + "T00:00:00");
  const due = new Date(last.getTime() + t.interval_days * 86400000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = Math.round((due - today) / 86400000);
  if (d < 0) return { d, label: `${-d}d overdue`, cls: "over" };
  if (d === 0) return { d, label: "due today", cls: "over" };
  if (d <= 7) return { d, label: `due in ${d}d`, cls: "soon" };
  return { d, label: `in ${d}d`, cls: "ok" };
}

// ---------- Components ----------

function BillRow({ bill, day, paid, today, onToggle, onDelete, onEdit }) {
  const overdue = !paid && day < today;
  const dueSoon = !paid && day >= today && day <= today + 3;
  const freqTag = FREQ_LABEL[bill.freq];
  return (
    <div className={"billrow" + (paid ? " is-paid" : "") + (overdue ? " is-late" : "")}>
      <div className="day">{day}</div>
      <button className={"check" + (paid ? " on" : "")} onClick={onToggle} aria-label={paid ? "Mark unpaid" : "Mark paid"}>
        {paid ? "✓" : ""}
      </button>
      <div className="billmain">
        <div className="billname">
          {bill.name}
          {freqTag && <span className="tag freq">{freqTag}</span>}
          {bill.auto && <span className="tag">auto</span>}
          {overdue && <span className="tag late">past due</span>}
          {dueSoon && <span className="tag soon">due soon</span>}
        </div>
        {bill.notes ? <div className="billnote">{bill.notes}</div> : null}
      </div>
      <div className="amt">{fmt(bill.amount)}</div>
      <div className="rowacts">
        {bill.link && (
          <a className="mini paylink" href={bill.link} target="_blank" rel="noopener noreferrer"
            title={"Open " + bill.link}>pay ↗</a>
        )}
        <button className="mini" onClick={onEdit}>edit</button>
        <button className="mini" onClick={onDelete}>×</button>
      </div>
    </div>
  );
}

function EditModal({ draft, setDraft, onSave, onCancel }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{draft.id ? "Edit bill" : "Add bill"}</h3>
        <label>Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label>Repeats
          <select value={draft.freq || "monthly"}
            onChange={(e) => {
              const freq = e.target.value;
              setDraft({
                ...draft, freq,
                anchorMonth: (freq === "bimonthly" || freq === "yearly")
                  ? (draft.anchorMonth ?? new Date().getMonth())
                  : draft.anchorMonth,
              });
            }}>
            <option value="monthly">Every month</option>
            <option value="weekly">Every week</option>
            <option value="bimonthly">Every other month</option>
            <option value="yearly">Once a year</option>
          </select>
        </label>
        {(draft.freq || "monthly") === "weekly" ? (
          <div className="modalrow">
            <label>Day of week
              <select value={draft.weekday ?? 5} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
            </label>
            <label>Amount (each week)
              <input type="number" step="0.01" value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
            </label>
          </div>
        ) : (
          <div className="modalrow">
            <label>Day due
              <input type="number" min="1" max="31" value={draft.day}
                onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} />
            </label>
            <label>Amount
              <input type="number" step="0.01" value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
            </label>
          </div>
        )}
        {(draft.freq === "bimonthly" || draft.freq === "yearly") && (
          <label>{draft.freq === "yearly" ? "Month it's due" : "A month it's due (sets the every-other pattern)"}
            <select value={draft.anchorMonth ?? new Date().getMonth()}
              onChange={(e) => setDraft({ ...draft, anchorMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </label>
        )}
        <label className="checkline">
          <input type="checkbox" checked={draft.auto}
            onChange={(e) => setDraft({ ...draft, auto: e.target.checked })} /> Pays automatically
        </label>
        <label>Notes
          <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <label>Payment link
          <input value={draft.link || ""} placeholder="discover.com or https://…" inputMode="url"
            onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
        </label>
        <div className="modalacts">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={onSave} disabled={!draft.name || !draft.amount}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ draft, setDraft, onSave, onCancel, domainLabel }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{draft.id ? "Edit task" : "Add " + domainLabel + " task"}</h3>
        <label>Task
          <input value={draft.name} placeholder="Change HVAC filter"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <div className="modalrow">
          <label>Repeat every (days)
            <input type="number" min="1" value={draft.interval_days ?? ""} placeholder="90"
              onChange={(e) => setDraft({ ...draft, interval_days: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label>Last done
            <input type="date" value={draft.last_done || ""}
              onChange={(e) => setDraft({ ...draft, last_done: e.target.value || null })} />
          </label>
        </div>
        <label>Category
          <input value={draft.category || ""} placeholder="HVAC, lawn, beds…"
            onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
        </label>
        <label>Link
          <input value={draft.link || ""} placeholder="manual, store page…" inputMode="url"
            onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
        </label>
        <label>Notes
          <input value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <div className="modalacts">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={onSave} disabled={!draft.name}>Save</button>
        </div>
      </div>
    </div>
  );
}

function DebtModal({ draft, setDraft, onSave, onCancel }) {
  const isCard = draft.kind === "card";
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{draft.id ? "Edit " : "Add "}{isCard ? "card" : "loan"}</h3>
        <label>Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <div className="modalrow">
          <label>Balance
            <input type="number" step="0.01" value={draft.balance}
              onChange={(e) => setDraft({ ...draft, balance: Number(e.target.value) })} />
          </label>
          <label>APR %
            <input type="number" step="0.01" value={draft.rate}
              onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })} />
          </label>
        </div>
        {isCard ? (
          <label>Minimum payment
            <input type="number" step="0.01" value={draft.min}
              onChange={(e) => setDraft({ ...draft, min: Number(e.target.value) })} />
          </label>
        ) : (
          <label>Note
            <input value={draft.note || ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
        )}
        <div className="modalacts">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={onSave} disabled={!draft.name}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, log, onDone, onEdit, onDelete, onToggleLog }) {
  const due = taskDue(task);
  return (
    <div className={"billrow taskrow" + (due.cls === "over" ? " is-late" : "")}>
      <div className="taskhead">
        <button className="check taskcheck" onClick={onDone} title="Mark done today">✓</button>
        <div className="billmain">
          <div className="billname">
            {task.name}
            {task.category && <span className="tag">{task.category}</span>}
            {task.interval_days && <span className="tag freq">every {task.interval_days}d</span>}
            <span className={"tag due-" + (due.cls || "none")}>{due.label}</span>
          </div>
          <div className="billnote">
            {task.last_done ? "last done " + task.last_done : "no completions yet"}
            {task.notes ? " — " + task.notes : ""}
          </div>
        </div>
        <div className="rowacts">
          {task.link && (
            <a className="mini paylink" href={task.link} target="_blank" rel="noopener noreferrer">open ↗</a>
          )}
          <button className="mini" onClick={onToggleLog}>{log ? "hide" : "history"}</button>
          <button className="mini" onClick={onEdit}>edit</button>
          <button className="mini" onClick={onDelete}>×</button>
        </div>
      </div>
      {log && (
        <div className="tasklog">
          {log.length === 0 && <div className="billnote">No history yet.</div>}
          {log.map((l) => (
            <div key={l.id} className="logline">
              <span className="logdate">{l.done_at}</span>
              {l.notes && <span className="billnote">{l.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Main app ----------

export default function FinanceApp() {
  const now = new Date();
  const today = now.getDate();

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const monthKey = `${viewYear}-${viewMonth}`;
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const isPastMonth = viewYear < now.getFullYear() || (viewYear === now.getFullYear() && viewMonth < now.getMonth());
  const effectiveToday = isCurrentMonth ? today : (isPastMonth ? 40 : -10);

  const stepMonth = (dir) => {
    let m = viewMonth + dir, y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y);
  };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState("bills");
  const [bills, setBills] = useState([]);     // all bills, both lists; filter by .list
  const [cards, setCards] = useState([]);
  const [loans, setLoans] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [paid, setPaid] = useState({});
  const [balances, setBalances] = useState({ household: "", work: "" });
  const [range, setRange] = useState({ from: 1, to: 31 });
  const [theme, setTheme] = useState("evergreen");
  const [draft, setDraft] = useState(null);
  const [draftList, setDraftList] = useState("household");
  const [taskDraft, setTaskDraft] = useState(null);
  const [debtDraft, setDebtDraft] = useState(null);
  const [openLogs, setOpenLogs] = useState({}); // taskId -> rows

  const balTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await api("state");
        setBills(s.bills || []);
        setCards(s.cards || []);
        setLoans(s.loans || []);
        setTasks(s.tasks || []);
        setPaid(s.paid || {});
        if (s.balances) setBalances(s.balances);
        if (s.range) setRange(s.range);
        if (s.theme && THEMES[s.theme]) setTheme(s.theme);
      } catch (e) {
        console.error(e); setLoadError(true);
      }
      setLoading(false);
    })();
  }, []);

  // ---- settings ----
  const changeTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next); quietly(api("settings", "PUT", { theme: next }));
  };
  const changeRange = (r) => { setRange(r); quietly(api("settings", "PUT", { range: r })); };
  const changeBalances = (b) => {
    setBalances(b);
    clearTimeout(balTimer.current);
    balTimer.current = setTimeout(() => quietly(api("settings", "PUT", { balances: b })), 500);
  };

  // ---- paid ----
  const monthPaid = paid[monthKey] || {};
  const togglePaid = (key) => {
    const next = !monthPaid[key];
    setPaid({ ...paid, [monthKey]: { ...monthPaid, [key]: next } });
    quietly(api("paid", "POST", { month: monthKey, key, paid: next }));
  };
  const resetMonth = () => {
    setPaid({ ...paid, [monthKey]: {} });
    quietly(api("paid/reset", "POST", { month: monthKey }));
  };

  // ---- bills ----
  const listKey = tab === "work" ? "work" : "household";
  const activeList = useMemo(() => bills.filter((b) => (b.list || "household") === listKey), [bills, listKey]);

  const saveDraft = () => {
    const clean = { ...draft, list: draftList };
    if (clean.link) {
      clean.link = clean.link.trim();
      if (clean.link && !/^https?:\/\//i.test(clean.link)) clean.link = "https://" + clean.link;
    }
    if ((clean.freq === "bimonthly" || clean.freq === "yearly") && clean.anchorMonth == null) {
      clean.anchorMonth = new Date().getMonth();
    }
    if (clean.id) {
      setBills(bills.map((b) => (b.id === clean.id ? clean : b)));
      quietly(api(`bills/${clean.id}`, "PUT", clean));
    } else {
      clean.id = uid();
      setBills([...bills, clean]);
      quietly(api("bills", "POST", clean));
    }
    setDraft(null);
  };
  const deleteBill = (b) => {
    if (!confirm(`Delete ${b.name}?`)) return;
    setBills(bills.filter((x) => x.id !== b.id));
    quietly(api(`bills/${b.id}`, "DELETE"));
  };

  // ---- tasks ----
  const domain = tab === "garden" ? "garden" : "maintenance";
  const domainLabel = tab === "garden" ? "garden" : "home";
  const domainTasks = useMemo(() => {
    const list = tasks.filter((t) => (t.domain || "maintenance") === domain);
    return list.sort((a, b) => {
      const da = taskDue(a).d, dbb = taskDue(b).d;
      if (da === null && dbb === null) return a.name.localeCompare(b.name);
      if (da === null) return 1;
      if (dbb === null) return -1;
      return da - dbb;
    });
  }, [tasks, domain]);

  const saveTask = () => {
    const clean = { ...taskDraft, domain };
    if (clean.link) {
      clean.link = clean.link.trim();
      if (clean.link && !/^https?:\/\//i.test(clean.link)) clean.link = "https://" + clean.link;
    }
    if (clean.id) {
      setTasks(tasks.map((t) => (t.id === clean.id ? clean : t)));
      quietly(api(`tasks/${clean.id}`, "PUT", clean));
    } else {
      clean.id = uid();
      setTasks([...tasks, clean]);
      quietly(api("tasks", "POST", clean));
    }
    setTaskDraft(null);
  };
  const completeTask = (t) => {
    const date = todayISO();
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, last_done: date } : x)));
    if (openLogs[t.id]) setOpenLogs({ ...openLogs, [t.id]: [{ id: "tmp" + Date.now(), done_at: date, notes: "" }, ...openLogs[t.id]] });
    quietly(api(`tasks/${t.id}/done`, "POST", { date }));
  };
  const deleteTask = (t) => {
    if (!confirm(`Delete ${t.name}?`)) return;
    setTasks(tasks.filter((x) => x.id !== t.id));
    quietly(api(`tasks/${t.id}`, "DELETE"));
  };
  const toggleLog = async (t) => {
    if (openLogs[t.id]) { const n = { ...openLogs }; delete n[t.id]; setOpenLogs(n); return; }
    try { setOpenLogs({ ...openLogs, [t.id]: await api(`tasks/${t.id}/log`) }); }
    catch (e) { console.error(e); }
  };

  // ---- debts ----
  const saveDebt = () => {
    const d = { ...debtDraft };
    const isCard = d.kind === "card";
    const payload = isCard
      ? { name: d.name, balance: d.balance || 0, rate: d.rate || 0, min: d.min || 0 }
      : { name: d.name, balance: d.balance || 0, rate: d.rate || 0, note: d.note || "" };
    if (d.id) {
      if (isCard) { setCards(cards.map((c) => (c.id === d.id ? { ...c, ...payload } : c))); quietly(api(`cards/${d.id}`, "PUT", payload)); }
      else { setLoans(loans.map((l) => (l.id === d.id ? { ...l, ...payload } : l))); quietly(api(`loans/${d.id}`, "PUT", payload)); }
    } else {
      const id = uid();
      if (isCard) { setCards([...cards, { id, ...payload }]); quietly(api("cards", "POST", { id, ...payload })); }
      else { setLoans([...loans, { id, ...payload }]); quietly(api("loans", "POST", { id, ...payload })); }
    }
    setDebtDraft(null);
  };
  const deleteDebt = (kind, item) => {
    if (!confirm(`Delete ${item.name}?`)) return;
    if (kind === "card") { setCards(cards.filter((c) => c.id !== item.id)); quietly(api(`cards/${item.id}`, "DELETE")); }
    else { setLoans(loans.filter((l) => l.id !== item.id)); quietly(api(`loans/${item.id}`, "DELETE")); }
  };

  // ---- bill occurrences & totals ----
  const occurrences = useMemo(() => {
    const out = [];
    for (const b of activeList) {
      for (const day of occDays(b, viewYear, viewMonth)) {
        out.push({ key: (b.freq === "weekly") ? `${b.id}@${day}` : b.id, bill: b, day });
      }
    }
    return out.sort((a, b) => a.day - b.day || a.bill.name.localeCompare(b.bill.name));
  }, [activeList, viewYear, viewMonth]);

  const inRange = (day) =>
    range.from <= range.to ? day >= range.from && day <= range.to : day >= range.from || day <= range.to;
  const filtered = useMemo(() => occurrences.filter((o) => inRange(o.day)), [occurrences, range]);
  const isFullMonth = range.from === 1 && range.to === 31;

  const totals = useMemo(() => {
    const t = { due: 0, paidAmt: 0, left: 0, count: filtered.length, paidCount: 0 };
    for (const o of filtered) {
      t.due += o.bill.amount;
      if (monthPaid[o.key]) { t.paidAmt += o.bill.amount; t.paidCount++; }
      else t.left += o.bill.amount;
    }
    return t;
  }, [filtered, monthPaid]);

  const balKey = tab === "work" ? "work" : "household";
  const balance = parseFloat(balances[balKey]) || 0;
  const afterBills = balance - totals.left;

  const cardTotals = useMemo(() => ({
    bal: cards.reduce((s, c) => s + c.balance, 0),
    mins: cards.reduce((s, c) => s + c.min, 0),
  }), [cards]);
  const loanTotal = loans.reduce((s, l) => s + l.balance, 0);
  const maxCardBal = Math.max(1, ...cards.map((c) => c.balance));

  const taskStats = useMemo(() => {
    const overdue = domainTasks.filter((t) => { const d = taskDue(t).d; return d !== null && d <= 0; }).length;
    const week = domainTasks.filter((t) => { const d = taskDue(t).d; return d !== null && d > 0 && d <= 7; }).length;
    return { overdue, week, total: domainTasks.length };
  }, [domainTasks]);

  if (loading) return <div className="app"><style>{CSS}</style><div className="loadmsg">Loading…</div></div>;
  if (loadError) return <div className="app"><style>{CSS}</style><div className="loadmsg">Couldn't reach the server. Check the add-on log, then reload.</div></div>;

  const isBillTab = tab === "bills" || tab === "work";
  const isTaskTab = tab === "maintenance" || tab === "garden";
  const pct = totals.count ? Math.round((totals.paidCount / totals.count) * 100) : 0;

  return (
    <div className="app" style={THEMES[theme]}>
      <style>{CSS}</style>

      <header>
        <div className="topline">
          <span className="eyebrow">Hearth</span>
          <button className="themebtn" onClick={changeTheme} title="Switch theme">◐ {THEME_NAME[theme]}</button>
        </div>
        {isBillTab ? (
          <>
            <div className="monthnav">
              <button className="navbtn" onClick={() => stepMonth(-1)} aria-label="Previous month">‹</button>
              <h1>{MONTHS[viewMonth]} {viewYear}</h1>
              <button className="navbtn" onClick={() => stepMonth(1)} aria-label="Next month">›</button>
              {!isCurrentMonth && (
                <button className="todaybtn" onClick={() => { setViewMonth(now.getMonth()); setViewYear(now.getFullYear()); }}>
                  Back to today
                </button>
              )}
            </div>
            {!isCurrentMonth && (
              <div className="monthhint">{isPastMonth ? "Viewing a past month" : "Planning ahead — totals are projected"}</div>
            )}
            <div className="progresswrap" aria-label={`${pct}% of bills paid`}>
              <div className="progress"><div className="fill" style={{ width: pct + "%" }} /></div>
              <span className="pct">{totals.paidCount} of {totals.count} paid</span>
            </div>
          </>
        ) : (
          <h1>{tab === "debts" ? "Debts" : tab === "garden" ? "Garden" : "Home upkeep"}</h1>
        )}
      </header>

      <nav className="tabs">
        {[["bills", "Bills"], ["work", "Evergreen"], ["debts", "Debts"], ["maintenance", "Home"], ["garden", "Garden"]].map(([k, label]) => (
          <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {isBillTab && (
        <>
          <section className="rangebar">
            <span className="rangelabel">Pay period</span>
            <div className="chips">
              {[["1–14", 1, 14], ["15–31", 15, 31], ["Full month", 1, 31]].map(([label, f, t]) => (
                <button key={label}
                  className={"chip" + (range.from === f && range.to === t ? " on" : "")}
                  onClick={() => changeRange({ from: f, to: t })}>{label}</button>
              ))}
            </div>
            <div className="rangeinputs">
              <input type="number" min="1" max="31" value={range.from} aria-label="From day"
                onChange={(e) => changeRange({ ...range, from: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
              <span>to</span>
              <input type="number" min="1" max="31" value={range.to} aria-label="To day"
                onChange={(e) => changeRange({ ...range, to: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
            {range.from > range.to && <div className="wrapnote">Wraps month end: {range.from}–31, then 1–{range.to}</div>}
          </section>

          <section className="strip">
            <div className="cell">
              <label htmlFor="bal">{tab === "work" ? "Evergreen balance" : "Checking balance"}</label>
              <div className="balinput">
                <span>$</span>
                <input id="bal" type="number" step="0.01" placeholder="0.00"
                  value={balances[balKey]}
                  onChange={(e) => changeBalances({ ...balances, [balKey]: e.target.value })} />
              </div>
            </div>
            <div className="cell">
              <label>{isFullMonth ? "Still unpaid" : "Unpaid this period"}</label>
              <div className="big">{fmt(totals.left)}</div>
            </div>
            <div className="cell">
              <label>After bills</label>
              <div className={"big " + (afterBills < 0 ? "neg" : "pos")}>
                {balances[balKey] === "" ? "—" : fmt(afterBills)}
              </div>
            </div>
          </section>

          <section className="list">
            {filtered.map((o) => (
              <BillRow key={o.key} bill={o.bill} day={o.day} paid={!!monthPaid[o.key]} today={effectiveToday}
                onToggle={() => togglePaid(o.key)}
                onDelete={() => deleteBill(o.bill)}
                onEdit={() => { setDraftList(listKey); setDraft({ ...o.bill }); }} />
            ))}
            {filtered.length === 0 && (
              <div className="empty">
                {activeList.length === 0 ? "No bills yet. Add your first one below." : `No bills due between the ${range.from} and ${range.to}.`}
              </div>
            )}
          </section>

          <div className="footacts">
            <button className="btn solid" onClick={() => { setDraftList(listKey); setDraft({ id: null, day: 1, name: "", amount: 0, auto: false, notes: "", link: "", freq: "monthly", weekday: 5, anchorMonth: viewMonth }); }}>
              + Add bill
            </button>
            <button className="btn ghost" onClick={resetMonth}>Reset month</button>
            <div className="monthtotal">{isFullMonth ? "Month total" : "Period total"} <strong>{fmt(totals.due)}</strong></div>
          </div>
        </>
      )}

      {isTaskTab && (
        <>
          <section className="strip">
            <div className="cell">
              <label>Overdue</label>
              <div className={"big " + (taskStats.overdue ? "neg" : "pos")}>{taskStats.overdue}</div>
            </div>
            <div className="cell">
              <label>Due this week</label>
              <div className="big">{taskStats.week}</div>
            </div>
            <div className="cell">
              <label>Tracked tasks</label>
              <div className="big">{taskStats.total}</div>
            </div>
          </section>

          <section className="list">
            {domainTasks.map((t) => (
              <TaskRow key={t.id} task={t} log={openLogs[t.id]}
                onDone={() => completeTask(t)}
                onEdit={() => setTaskDraft({ ...t })}
                onDelete={() => deleteTask(t)}
                onToggleLog={() => toggleLog(t)} />
            ))}
            {domainTasks.length === 0 && (
              <div className="empty">No {domainLabel} tasks yet — add your first one below.</div>
            )}
          </section>

          <div className="footacts">
            <button className="btn solid"
              onClick={() => setTaskDraft({ id: null, name: "", category: "", interval_days: null, last_done: null, notes: "", link: "" })}>
              + Add task
            </button>
          </div>
        </>
      )}

      {tab === "debts" && (
        <>
          <section className="strip">
            <div className="cell"><label>Credit cards</label><div className="big">{fmt(cardTotals.bal)}</div></div>
            <div className="cell"><label>Min payments / mo</label><div className="big">{fmt(cardTotals.mins)}</div></div>
            <div className="cell"><label>Loans + mortgage</label><div className="big">{fmt(loanTotal)}</div></div>
          </section>

          <h2 className="sechead">Credit cards <span>highest balance first</span></h2>
          <section className="list">
            {[...cards].sort((a, b) => b.balance - a.balance).map((c) => (
              <div key={c.id} className="cardrow">
                <div className="cardmain">
                  <div className="billname">{c.name}{c.rate > 0 && <span className="tag">{c.rate.toFixed(2)}% APR</span>}</div>
                  <div className="cardbar"><div className="cardfill" style={{ width: Math.min(100, (c.balance / maxCardBal) * 100) + "%" }} /></div>
                </div>
                <div className="cardnums">
                  <div className="amt">{fmt(c.balance)}</div>
                  <div className="minlabel">min {fmt(c.min)}</div>
                </div>
                <div className="rowacts">
                  <button className="mini" onClick={() => setDebtDraft({ ...c, kind: "card" })}>edit</button>
                  <button className="mini" onClick={() => deleteDebt("card", c)}>×</button>
                </div>
              </div>
            ))}
            {cards.length === 0 && <div className="empty">No cards tracked.</div>}
          </section>

          <h2 className="sechead">Loans</h2>
          <section className="list">
            {loans.map((l) => (
              <div key={l.id} className="cardrow">
                <div className="cardmain">
                  <div className="billname">{l.name}{l.rate > 0 && <span className="tag">{l.rate.toFixed(2)}%</span>}</div>
                  {l.note ? <div className="billnote">{l.note}</div> : null}
                </div>
                <div className="cardnums"><div className="amt">{fmt(l.balance)}</div></div>
                <div className="rowacts">
                  <button className="mini" onClick={() => setDebtDraft({ ...l, kind: "loan" })}>edit</button>
                  <button className="mini" onClick={() => deleteDebt("loan", l)}>×</button>
                </div>
              </div>
            ))}
            {loans.length === 0 && <div className="empty">No loans tracked.</div>}
          </section>

          <div className="footacts">
            <button className="btn solid" onClick={() => setDebtDraft({ id: null, kind: "card", name: "", balance: 0, rate: 0, min: 0 })}>+ Add card</button>
            <button className="btn ghost" onClick={() => setDebtDraft({ id: null, kind: "loan", name: "", balance: 0, rate: 0, note: "" })}>+ Add loan</button>
          </div>

          <div className="grandtotal">
            Total debt <strong>{fmt(cardTotals.bal + loanTotal)}</strong>
          </div>
        </>
      )}

      {draft && <EditModal draft={draft} setDraft={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />}
      {taskDraft && <TaskModal draft={taskDraft} setDraft={setTaskDraft} onSave={saveTask} onCancel={() => setTaskDraft(null)} domainLabel={domainLabel} />}
      {debtDraft && <DebtModal draft={debtDraft} setDraft={setDebtDraft} onSave={saveDebt} onCancel={() => setDebtDraft(null)} />}
    </div>
  );
}

// ---------- Styles ----------

const CSS = `
* { box-sizing:border-box; margin:0; }
.app {
  min-height:100vh; background:var(--paper); color:var(--ink);
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width:680px; margin:0 auto; padding:20px 14px 60px;
  transition:background .25s ease, color .25s ease;
}
.topline { display:flex; align-items:center; justify-content:space-between; }
.themebtn {
  border:1px solid var(--line); background:var(--card); color:var(--muted);
  font-size:11.5px; font-weight:700; letter-spacing:.04em; padding:5px 10px;
  border-radius:999px; cursor:pointer;
}
.themebtn:hover { color:var(--ink); }
.themebtn:focus-visible { outline:2px solid var(--green); outline-offset:2px; }
.loadmsg { padding:60px 0; text-align:center; color:var(--muted); }
header { padding:8px 4px 14px; }
.eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
h1 { font-size:26px; font-weight:750; letter-spacing:-0.01em; }
.monthnav { display:flex; align-items:center; gap:8px; margin-top:2px; }
.navbtn {
  width:32px; height:32px; border:1px solid var(--line); background:var(--card);
  border-radius:8px; font-size:18px; font-weight:700; color:var(--ink); cursor:pointer; line-height:1;
}
.navbtn:hover { background:var(--line); }
.navbtn:focus-visible, .todaybtn:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
.todaybtn {
  margin-left:auto; border:none; background:transparent; color:var(--muted);
  font-size:12.5px; font-weight:600; cursor:pointer; text-decoration:underline; padding:4px;
}
.todaybtn:hover { color:var(--ink); }
.monthhint { font-size:12px; color:var(--amber); margin-top:4px; }
.progresswrap { display:flex; align-items:center; gap:10px; margin-top:10px; }
.progress { flex:1; height:6px; background:var(--line); border-radius:3px; overflow:hidden; }
.fill { height:100%; background:var(--green); border-radius:3px; transition:width .35s ease; }
.pct { font-size:12px; color:var(--muted); white-space:nowrap; font-variant-numeric:tabular-nums; }

.tabs { display:flex; gap:6px; margin:6px 0 14px; flex-wrap:wrap; }
.tab {
  flex:1 1 30%; padding:9px 0; border:1px solid var(--line); background:var(--card);
  border-radius:8px; font-size:14px; font-weight:600; color:var(--muted); cursor:pointer;
}
.tab.on { background:var(--accent); border-color:var(--accent); color:var(--on-accent); }
.tab:focus-visible, .check:focus-visible, .btn:focus-visible, .mini:focus-visible, .chip:focus-visible { outline:2px solid var(--green); outline-offset:2px; }

.rangebar {
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  background:var(--card); border:1px solid var(--line); border-radius:10px;
  padding:10px 12px; margin-bottom:8px;
}
.rangelabel { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:700; }
.chips { display:flex; gap:6px; }
.chip {
  border:1px solid var(--line); background:var(--card); border-radius:999px;
  padding:5px 12px; font-size:12.5px; font-weight:600; color:var(--muted); cursor:pointer;
}
.chip.on { background:var(--accent); border-color:var(--accent); color:var(--on-accent); }
.rangeinputs { display:flex; align-items:center; gap:6px; margin-left:auto; font-size:12px; color:var(--muted); }
.rangeinputs input {
  width:48px; border:1px solid var(--line); border-radius:7px; padding:5px 6px;
  font-size:13px; font-weight:700; text-align:center; color:var(--ink); background:var(--paper);
  font-family:ui-monospace, Menlo, monospace;
}
.rangeinputs input:focus { outline:none; border-color:var(--green); }
.wrapnote { width:100%; font-size:11.5px; color:var(--amber); }

.strip { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:14px; }
.cell { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
.cell label { display:block; font-size:11px; color:var(--muted); letter-spacing:.04em; text-transform:uppercase; margin-bottom:4px; }
.big { font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; font-family:ui-monospace, "SF Mono", Menlo, monospace; }
.big.neg { color:var(--red); } .big.pos { color:var(--green); }
.balinput { display:flex; align-items:baseline; gap:2px; font-family:ui-monospace, Menlo, monospace; }
.balinput span { font-weight:700; }
.balinput input {
  width:100%; border:none; border-bottom:1.5px solid var(--line); background:transparent;
  font:inherit; font-size:17px; font-weight:700; padding:0 0 1px; color:var(--ink);
}
.balinput input:focus { outline:none; border-bottom-color:var(--green); }

.list { display:flex; flex-direction:column; gap:6px; }
.billrow, .cardrow {
  display:flex; align-items:center; gap:10px; background:var(--card);
  border:1px solid var(--line); border-radius:10px; padding:10px 12px;
}
.billrow.is-late { border-color:var(--late-border); background:var(--red-soft); }
.billrow.is-paid { opacity:.55; }
.billrow.is-paid .billname { text-decoration:line-through; }
.taskrow { flex-direction:column; align-items:stretch; gap:6px; }
.taskhead { display:flex; align-items:center; gap:10px; }
.taskcheck { color:var(--muted); }
.taskcheck:hover { background:var(--green); border-color:var(--green); color:var(--check-ink); }
.tasklog { border-top:1px dashed var(--line); padding-top:8px; display:flex; flex-direction:column; gap:4px; }
.logline { display:flex; gap:10px; align-items:baseline; }
.logdate { font-family:ui-monospace, Menlo, monospace; font-size:12.5px; font-weight:700; color:var(--green); }
.tag.due-over { background:var(--red); color:var(--late-fg); }
.tag.due-soon { background:var(--amber-soft); color:var(--amber); }
.tag.due-ok { background:var(--green-soft); color:var(--green); }
.tag.due-none { background:var(--line); color:var(--tag-fg); }
.day {
  width:26px; text-align:right; font-family:ui-monospace, Menlo, monospace;
  font-size:13px; font-weight:700; color:var(--muted); flex-shrink:0;
}
.check {
  width:26px; height:26px; border-radius:7px; border:1.5px solid var(--line);
  background:var(--paper); cursor:pointer; flex-shrink:0; font-size:14px; color:transparent; line-height:1;
}
.check.on { background:var(--green); border-color:var(--green); color:var(--check-ink); font-weight:800; }
.taskcheck { color:var(--muted); }
.billmain, .cardmain { flex:1; min-width:0; }
.billname { font-size:14.5px; font-weight:600; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.billnote { font-size:12px; color:var(--muted); margin-top:2px; }
.tag {
  font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  background:var(--line); color:var(--tag-fg); padding:2px 6px; border-radius:5px;
}
.tag.late { background:var(--red); color:var(--late-fg); }
.tag.soon { background:var(--amber-soft); color:var(--amber); }
.tag.freq { background:var(--freq-bg); color:var(--freq-fg); }
.amt { font-family:ui-monospace, Menlo, monospace; font-size:14.5px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rowacts { display:flex; gap:4px; }
.mini {
  border:none; background:transparent; color:var(--muted); font-size:12px; cursor:pointer;
  padding:4px 6px; border-radius:6px;
}
.mini:hover { background:var(--line); color:var(--ink); }
.paylink { color:var(--green); text-decoration:none; font-weight:700; }
.paylink:hover { background:var(--green-soft); color:var(--green); }

.footacts { display:flex; align-items:center; gap:10px; margin-top:16px; flex-wrap:wrap; }
.btn { border-radius:8px; padding:9px 16px; font-size:14px; font-weight:650; cursor:pointer; }
.btn.solid { background:var(--accent); color:var(--on-accent); border:1px solid var(--accent); }
.btn.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
.btn:disabled { opacity:.4; cursor:default; }
.monthtotal { margin-left:auto; font-size:13px; color:var(--muted); }
.monthtotal strong { color:var(--ink); font-family:ui-monospace, Menlo, monospace; }

.sechead { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:18px 2px 8px; }
.sechead span { font-weight:400; text-transform:none; letter-spacing:0; }
.cardbar { height:4px; background:var(--line); border-radius:2px; margin-top:6px; overflow:hidden; }
.cardfill { height:100%; background:var(--amber); border-radius:2px; }
.cardnums { text-align:right; }
.minlabel { font-size:11px; color:var(--muted); margin-top:1px; }
.grandtotal {
  margin-top:18px; padding:14px; text-align:center; background:var(--accent); color:var(--on-accent);
  border-radius:10px; font-size:14px;
}
.grandtotal strong { font-family:ui-monospace, Menlo, monospace; font-size:17px; margin-left:8px; }
.empty { text-align:center; color:var(--muted); padding:30px 0; }

.overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; padding:16px; z-index:10; }
.modal { background:var(--modal); border:1px solid var(--line); border-radius:12px; padding:20px; width:100%; max-width:380px; display:flex; flex-direction:column; gap:12px; max-height:90vh; overflow-y:auto; }
.modal h3 { font-size:17px; }
.modal label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; color:var(--muted); }
.modal input[type=number], .modal input[type=text], .modal input[type=date], .modal input:not([type]), .modal select {
  border:1px solid var(--line); border-radius:7px; padding:8px 10px; font-size:14px; color:var(--ink);
  background:var(--paper); font-family:inherit;
}
.modal input:focus, .modal select:focus { outline:none; border-color:var(--green); }
.modalrow { display:flex; gap:10px; } .modalrow label { flex:1; }
.checkline { flex-direction:row !important; align-items:center; font-size:13px !important; }
.modalacts { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }

@media (max-width:480px) {
  .strip { grid-template-columns:1fr 1fr; }
  .strip .cell:first-child { grid-column:1 / -1; }
  .rowacts { flex-wrap:wrap; justify-content:flex-end; }
}
@media (prefers-reduced-motion: reduce) { .fill { transition:none; } }
`;
