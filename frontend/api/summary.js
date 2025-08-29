/**
 * /api/summary — proxy + compat
 */
module.exports = async (req, res) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `https://api.cloudandcapital.com/api/summary${qs}`;

  // pass-thru important headers
  const fwd = {};
  ["authorization","x-api-key","cookie","accept","user-agent"]
    .forEach(h => { if (req.headers[h]) fwd[h] = req.headers[h]; });

  try {
    const r = await fetch(target, { method: "GET", headers: fwd, redirect: "follow", cache: "no-store" });
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { note: "non-json from backend", raw: text }; }

    const payload = (data && typeof data === "object") ? { ...data } : {};
    // normalize breakdown
    let breakdown = Array.isArray(payload.breakdown) ? payload.breakdown : [];
    if (!breakdown.length && Array.isArray(payload.by_service)) {
      breakdown = payload.by_service.map(r => ({
        service: r.service || r.name || r.key || "Unknown",
        cost_usd_30d: Number(r.cost_usd_30d ?? r.cost ?? r.amount ?? 0),
      }));
    } else {
      breakdown = breakdown.map(r => ({
        service: r.service ?? r.name ?? r.key ?? "Unknown",
        cost_usd_30d: Number(r.cost_usd_30d ?? r.cost ?? r.amount ?? 0),
      }));
    }

    const sum = breakdown.reduce((a, r) => a + (Number(r.cost_usd_30d) || 0), 0);
    payload.totals = payload.totals || {};
    if (!Number(payload.totals.total_cost_usd_30d)) payload.totals.total_cost_usd_30d = sum;
    if (!Number(payload.totals.projected_month_end_usd)) payload.totals.projected_month_end_usd = payload.totals.total_cost_usd_30d;
    if (!Number(payload.totals.identified_savings_usd_30d)) payload.totals.identified_savings_usd_30d = Number(payload.identified_savings_usd_30d || 0);
    if (!Number(payload.totals.realized_savings_usd_30d)) payload.totals.realized_savings_usd_30d = Number(payload.realized_savings_usd_30d || 0);

    // compat aliases your UI may read
    payload.breakdown = breakdown;
    payload.by_service = payload.by_service || breakdown.map(r => ({ name: r.service, cost: r.cost_usd_30d }));
    payload.total = payload.totals.total_cost_usd_30d;
    payload.projected = payload.totals.projected_month_end_usd;
    payload.savings_identified = payload.totals.identified_savings_usd_30d;
    payload.savings_realized = payload.totals.realized_savings_usd_30d;
    payload.last_updated_iso = payload.last_updated_iso || new Date().toISOString();

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(payload);
  } catch (err) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      window: (req.query && req.query.window) || "30d",
      totals: { total_cost_usd_30d: 0, projected_month_end_usd: 0, identified_savings_usd_30d: 0, realized_savings_usd_30d: 0 },
      breakdown: [], by_service: [],
      error: "proxy_failed", details: String(err && err.message || err),
    });
  }
};

