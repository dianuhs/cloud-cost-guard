/ frontend/api/summary.js
// Realistic local summary endpoint (CommonJS).
// - Generates coherent KPIs, daily series with weekday/weekend pattern, and a product mix that sums to total.
// - Movers and pie chart will line up with these numbers.
// - Deterministic jitter via a tiny PRNG so results are stable between builds.

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const windowParam = String(q.window || "30d");
    const days = windowParam === "7d" ? 7 : windowParam === "90d" ? 90 : 30;

    // ---------------- Knobs you can tune ----------------
    const BASE_MONTHLY_SPEND = Number(q.base || 165000);  // total for a 30-day month
    const WOW_RATE = Number(q.wow || 2.8) / 100;          // +2.8% vs previous period (used for KPIs & deltas)
    // Service mix typical of many AWS footprints (sums to 1.0):
    const SERVICE_SHARES = {
      "EC2-Instances": 0.48,
      "EBS":           0.16,
      "S3":            0.11,
      "RDS":           0.09,
      "Lambda":        0.05,
      "CloudWatch":    0.04,
      "ELB":           0.04,
      "NAT Gateway":   0.03,
    };
    // ----------------------------------------------------

    // Simple LCG PRNG for deterministic jitter (no external deps)
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Build a weekday/weekend pattern (average ~1.0)
    // Sun .. Sat multipliers
    const dayPattern = [0.93, 1.02, 1.06, 1.07, 1.04, 0.98, 0.88];

    // Trend slope across the window (gentle up and to the right)
    const windowSlope = 0.012 * (days / 30); // ~1.2% over 30d, scales by window length

    const avgPerDay30 = BASE_MONTHLY_SPEND / 30;
    const daily_series = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - (days - 1 - i));
      const dow = d.getDay();
      const pattern = dayPattern[dow];

      // linear trend around the middle of the window
      const centered = i - (days - 1) / 2;
      const trend = 1 + (windowSlope * centered) / days;

      // small deterministic noise (±3%)
      const jitter = (rand() - 0.5) * 0.06;

      const base = avgPerDay30 * pattern * trend * (days / 30);
      const amount = Math.max(0, base * (1 + jitter));
      return {
        dateISO: d.toISOString().slice(0, 10),
        cost: Number(amount.toFixed(2)),
      };
    });

    const totalWindow = daily_series.reduce((s, x) => s + x.cost, 0);
    const prevTotal = totalWindow / (1 + WOW_RATE);
    const wowPercent = prevTotal > 0 ? ((totalWindow - prevTotal) / prevTotal) * 100 : 0;

    // Distribute total across services
    const shareSum = Object.values(SERVICE_SHARES).reduce((a, b) => a + b, 0) || 1;
    const normalizedShares = {};
    Object.entries(SERVICE_SHARES).forEach(([k, v]) => (normalizedShares[k] = v / shareSum));

    // Per-service current amounts (sum to totalWindow)
    const products = Object.entries(normalizedShares).map(([name, share]) => ({
      product: name,
      amount_usd: Number((totalWindow * share).toFixed(2)),
      share,
    }));

    // Create per-product WoW deltas that sum to (totalWindow - prevTotal)
    const deltaTotal = totalWindow - prevTotal;
    // Give each product a small unique bias but keep sum exact
    let raw = products.map((p, idx) => {
      const bias = (idx % 2 === 0 ? 1 : -1) * (0.15 + 0.1 * rand()); // ±15–25%
      return { name: p.product, base: deltaTotal * p.share, bias };
    });
    // Apply bias
    raw = raw.map(r => ({ ...r, rawDelta: r.base * (1 + r.bias) }));
    // Normalize to exact deltaTotal
    const rawSum = raw.reduce((s, r) => s + r.rawDelta, 0) || 1;
    const scale = deltaTotal / rawSum;
    const deltasByName = {};
    raw.forEach(r => (deltasByName[r.name] = r.rawDelta * scale));

    // Finalize products
    const top_products = products.map(p => ({
      product: p.product,
      amount_usd: p.amount_usd,
      wow_delta: Number((deltasByName[p.product] || 0).toFixed(2)),
      percent_of_total: Number(((p.amount_usd / totalWindow) * 100).toFixed(1)),
    }));

    // Load findings and compute savings/counts
    let findings = [];
    try {
      const seedData = require("../data/findings.seed.json");
      findings = Array.isArray(seedData) ? seedData : (seedData && Array.isArray(seedData.data) ? seedData.data : []);
    } catch (_) {
      findings = [];
    }
    const savingsReady = findings.reduce((s, f) => s + Number(f.monthly_savings_usd_est || 0), 0);
    const underutilizedCount = findings.filter(f =>
      /under.?util|idle/i.test(f.title || "") || /under.?util/i.test(f.type || "")
    ).length;
    const orphansCount = findings.filter(f => /unattached|unused/i.test(f.title || "")).length;
    const recent_findings = [...findings]
      .sort((a, b) => Number(b.monthly_savings_usd_est || 0) - Number(a.monthly_savings_usd_est || 0))
      .slice(0, 5);

    const body = {
      window: windowParam,
      kpis: {
        total_30d_cost: Number(totalWindow.toFixed(2)),
        wow_percent: Number(wowPercent.toFixed(1)),
        savings_ready_usd: Number(savingsReady.toFixed(2)),
        underutilized_count: underutilizedCount,
        orphans_count: orphansCount,
        data_freshness_hours: 0.2,
        last_updated: new Date().toISOString(),
      },
      top_products,
      daily_series,
      recent_findings,
      generated_at: new Date().toISOString(),
    };

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(body);
  } catch (err) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      window: "30d",
      kpis: {
        total_30d_cost: 0, wow_percent: 0, savings_ready_usd: 0,
        underutilized_count: 0, orphans_count: 0, data_freshness_hours: 24,
        last_updated: new Date().toISOString(),
      },
      top_products: [],
      daily_series: [],
      recent_findings: [],
      error: "summary_failed",
      details: String(err && err.message || err),
    });
  }
};
