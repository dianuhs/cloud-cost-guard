/**
 * /api/summary
 * Proxy to external backend with compatibility fill-ins so UI sees non-zero numbers.
 */
module.exports = async (req, res) => {
  // Build target URL (preserve query string)
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `https://api.cloudandcapital.com/api/summary${qs}`;

  try {
    const resp = await fetch(target, { method: "GET" });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // If backend returned plain text, wrap it so UI doesn't crash
      data = { note: "non-json from backend", raw: text };
    }

    // ---- Compatibility fill-ins ----
    const payload = typeof data === "object" && data ? { ...data } : {};

    // normalize breakdown to an array of { service, cost_usd_30d }
    let breakdown = Array.isArray(payload.breakdown) ? payload.breakdown : [];
    // try alternative shapes
    if (!breakdown.length && Array.isArray(payload.by_service)) {
      breakdown = payload.by_service.map(r => ({
        service: r.service || r.name || r.key || "Unknown",
        cost_usd_30d: Number(r.cost_usd_30d ?? r.cost ?? r.amount ?? 0)
      }));
    } else {
      breakdown = breakdown.map(r => ({
        service: r.service ?? r.name ?? r.key ?? "Unknown",
        cost_usd_30d: Number(r.cost_usd_30d ?? r.cost ?? r.amount ?? 0)
      }));
    }

    // compute totals if missing/zero
    const sum = breakdown.reduce((acc, r) => acc + (Number(r.cost_usd_30d) || 0), 0);
    payload.totals = payload.totals || {};
    if (!Number(payload.totals.total_cost_usd_30d)) payload.totals.total_cost_usd_30d = sum;
    if (!Number(payload.totals.projected_month_end_usd)) payload.totals.projected_month_end_usd = payload.totals.total_cost_usd_30d;
    if (!Number(payload.totals.identified_savings_usd_30d)) payload.totals.identified_savings_usd_30d = Number(payload.identified_savings_usd_30d || 0);
    if (!Number(payload.totals.realized_savings_usd_30d)) payload.totals.realized_savings_usd_30d = Number(payload.realized_savings_usd_30d || 0);

    // ensure compat aliases
    payload.by_service = payload.by_service || breakdown.map(r => ({ name: r.service, cost: r.cost_usd_30d }));
    payload.breakdown = breakdown;
    payload.total = payload.totals.total_cost_usd_30d;
    payload.projected = payload.totals.projected_month_end_usd;
    payload.savings_identified = payload.totals.identified_savings_usd_30d;
    payload.savings_realized = payload.totals.realized_savings_usd_30d;
    payload.last_updated_iso = payload.last_updated_iso || new Date().toISOString();

    res.setHeader("Content-Type", "application/json");
    // return 200 so UI renders
    return res.status(200).json(payload);
  } catch (err) {
    // fall back to harmless zeros + hint
    const hint = {
      window: (req.query && req.query.window) || "30d",
      totals: {
        total_cost_usd_30d: 0,
        projected_month_end_usd: 0,
        identified_savings_usd_30d: 0,
        realized_savings_usd_30d: 0
      },
      breakdown: [],
      by_service: [],
      error: "proxy_failed",
      details: String(err && err.message || err)
    };
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(hint);
  }
};


