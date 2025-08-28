import React from "react";

/**
 * Cloud Cost Guard — Single-file App.js
 * - Same-origin API base: /api
 * - Fetches: /api/summary, /api/products, /api/findings, /api/movers
 * - Adds Top Movers section (computed on Vercel function)
 *
 * Notes:
 * - If you already have separate components (Cards/Charts), you can replace the simple render
 *   blocks below with your components and just keep the state + fetch logic.
 */

const API = "/api"; // same-origin proxy via serverless functions

// ---------- tiny helpers ----------
async function getJSON(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}
function fmtUSD(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function cls(...xs) { return xs.filter(Boolean).join(" "); }

// ---------- API wrappers ----------
async function fetchSummary(window = "30d") {
  const url = `${API}/summary?window=${encodeURIComponent(window)}`;
  console.log("[Cloud Cost Guard] Fetch:", url);
  return getJSON(url);
}
async function fetchProducts(window = "30d") {
  const url = `${API}/products?window=${encodeURIComponent(window)}`;
  console.log("[Cloud Cost Guard] Fetch:", url);
  return getJSON(url);
}
async function fetchFindings({ sort = "savings", limit = 10 } = {}) {
  const url = `${API}/findings?sort=${encodeURIComponent(sort)}&limit=${encodeURIComponent(limit)}`;
  console.log("[Cloud Cost Guard] Fetch:", url);
  return getJSON(url);
}
async function fetchMovers(window = "30d") {
  const url = `${API}/movers?window=${encodeURIComponent(window)}`;
  console.log("[Cloud Cost Guard] Fetch:", url);
  return getJSON(url);
}

// ---------- Lightweight UI blocks (swap with your components anytime) ----------
function KPI({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

function ProductsList({ items = [] }) {
  if (!items.length) return <div className="muted">No products.</div>;
  return (
    <div className="list two-col">
      {items.map((p) => (
        <div key={p.service} className="row">
          <div className="primary">{p.name || p.service}</div>
          <div className="meta">{fmtUSD(p.amount_usd)}</div>
        </div>
      ))}
    </div>
  );
}

function FindingsList({ items = [] }) {
  if (!items.length) return <div className="muted">No findings.</div>;
  const badge = (sev) =>
    <span className={cls("badge", sev)}>{sev?.toUpperCase?.() || "INFO"}</span>;
  return (
    <div className="list">
      {items.map((f) => (
        <div key={f.finding_id} className="row">
          <div className="primary">
            {badge(f.severity)} {f.title}
          </div>
          <div className="meta">
            {fmtUSD(f.monthly_savings_usd_est)} · {f.service}
          </div>
        </div>
      ))}
    </div>
  );
}

function MoversList({ items = [] }) {
  if (!items.length) return <div className="muted">No movers yet.</div>;
  return (
    <div className="list two-col">
      {items.map((m) => (
        <div key={m.service} className="row">
          <div className="primary">{m.name || m.service}</div>
          <div className="meta">
            {fmtUSD(m.change_usd ?? m.delta_usd)} ({(m.change_pct ?? m.delta_pct)?.toFixed?.(2)}%)
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const [windowSel, setWindowSel] = React.useState("30d");

  const [summary, setSummary] = React.useState(null);
  const [products, setProducts] = React.useState([]);
  const [findings, setFindings] = React.useState([]);
  const [movers, setMovers] = React.useState([]);

  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    async function loadAll() {
      try {
        setLoading(true);
        setErr("");
        const [s, p, f, mv] = await Promise.all([
          fetchSummary(windowSel),
          fetchProducts(windowSel),
          fetchFindings({ sort: "savings", limit: 10 }),
          fetchMovers(windowSel)
        ]);
        if (!alive) return;
        setSummary(s || null);
        setProducts(Array.isArray(p) ? p : []);
        setFindings(Array.isArray(f) ? f : []);
        setMovers(Array.isArray(mv) ? mv : []);
      } catch (e) {
        console.error(e);
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadAll();
    return () => { alive = false; };
  }, [windowSel]);

  const k = summary?.kpis || {};
  const wow = k.wow_percent;
  const mom = k.mom_percent;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <img className="brand-logo" src="/logo192.png" alt="Cloud Cost Guard" />
          <div className="brand-title">Cloud Cost Guard</div>
        </div>
        <div className="controls">
          <label className="lbl">Window</label>
          <select
            value={windowSel}
            onChange={(e) => setWindowSel(e.target.value)}
            className="select"
          >
            <option value="30d">Last 30d</option>
            <option value="60d">Last 60d</option>
            <option value="7d">Last 7d</option>
          </select>
        </div>
      </header>

      {/* Error */}
      {err ? <div className="error">Error: {err}</div> : null}

      {/* KPIs */}
      <section className="section">
        <h2>Summary</h2>
        <div className="kpis">
          <KPI label="Total (30d)" value={fmtUSD(k.total_30d_cost)} />
          <KPI label="WoW" value={wow === undefined ? "—" : `${wow.toFixed?.(2)}%`} />
          <KPI label="MoM" value={mom === undefined ? "—" : `${mom.toFixed?.(2)}%`} />
          <KPI label="Savings Ready" value={fmtUSD(k.savings_ready_usd)} />
          <KPI label="Underutilized" value={k.underutilized_count ?? "—"} />
          <KPI label="Orphans" value={k.orphans_count ?? "—"} />
        </div>
      </section>

      {/* Movers */}
      <section className="section">
        <h2>Top Movers</h2>
        <MoversList items={movers} />
      </section>

      {/* Products */}
      <section className="section">
        <h2>Top Products</h2>
        <ProductsList items={products} />
      </section>

      {/* Findings */}
      <section className="section">
        <h2>Recent Findings</h2>
        <FindingsList items={findings} />
      </section>

      {/* Footer */}
      <footer className="footer">
        <div>Window: {windowSel} • Data via /api/*</div>
      </footer>

      {/* Quick styles to keep things readable; replace with your CSS */}
      <style>{`
        :root { --fg:#111; --muted:#666; --bd:#e5e7eb; --card:#fff; --bg:#fafafa; }
        * { box-sizing: border-box; }
        body, html, #root { height: 100%; }
        .app { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: var(--fg); background: var(--bg); min-height: 100%; }
        .header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--bd); background: #fff; position: sticky; top: 0; z-index: 10; }
        .brand { display:flex; align-items:center; gap:12px; }
        .brand-logo { height:28px; width:auto; }
        .brand-title { font-weight:600; font-size:18px; letter-spacing:.2px; }
        .controls { display:flex; align-items:center; gap:10px; }
        .lbl { font-size:12px; text-transform:uppercase; color:var(--muted); }
        .select { padding:6px 8px; border:1px solid var(--bd); border-radius:8px; background:#fff; }
        .section { padding:20px; }
        h2 { margin:0 0 12px 0; font-size:18px; }
        .kpis { display:grid; grid-template-columns: repeat(6, minmax(120px,1fr)); gap:12px; }
        .kpi { background:var(--card); border:1px solid var(--bd); border-radius:12px; padding:12px; }
        .kpi-label { font-size:12px; color:var(--muted); margin-bottom:6px; }
        .kpi-value { font-size:18px; font-weight:600; }
        .kpi-sub { font-size:12px; color:var(--muted); }
        .list { background:var(--card); border:1px solid var(--bd); border-radius:12px; }
        .list.two-col .row { display:grid; grid-template-columns: 1fr auto; }
        .row { padding:12px 14px; border-bottom:1px solid var(--bd); display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .row:last-child { border-bottom:none; }
        .primary { font-weight:500; }
        .meta { color:var(--muted); font-variant-numeric: tabular-nums; }
        .badge { display:inline-block; font-size:11px; padding:2px 6px; border-radius:999px; margin-right:6px; background:#eef2ff; color:#3730a3; border:1px solid #e5e7eb; }
        .badge.high { background:#fee2e2; color:#991b1b; }
        .badge.medium { background:#fef3c7; color:#92400e; }
        .badge.low { background:#ecfeff; color:#155e75; }
        .muted { color:var(--muted); }
        .error { margin:12px 20px; padding:10px 12px; background:#fff5f5; border:1px solid #fecaca; border-radius:8px; color:#7f1d1d; }
        .footer { padding:24px 20px; color:var(--muted); }
        @media (max-width: 980px) {
          .kpis { grid-template-columns: repeat(2, minmax(120px,1fr)); }
        }
      `}</style>
    </div>
  );
}

