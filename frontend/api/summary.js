// frontend/api/summary.js
// SAFE, KNOWN-GOOD version (simple, realistic numbers).
// - No fancy math, minimal logic, works on Vercel Node runtime.
// - Uses your findings.seed.json if present (optional).

module.exports = async (req, res) => {
  try {
    const windowParam = (req.query && String(req.query.window)) || "30d";
    const days = windowParam === "7d" ? 7 : windowParam === "90d" ? 90 : 30;

    // Try to load your findings seed for KPI counts/savings.
    let findings = [];
    try {
      const seed = require("../data/findings.seed.json");
      findings = Array.isArray(seed) ? seed : (seed && Array.isArray(seed.data) ? seed.data : []);
    } catch (_) {
      findings = [];
    }

    // Realistic but static product mix (sum ≈ $189K/mo when used for 30d)
    const top_products = [
      { product: "EC2-Instances", amount_usd: 92543.25, wow_delta: -1832.10 },
      { product: "EBS",            amount_usd: 31845.22, wow_delta:  622.77  },
      { product: "S3",             amount_usd: 22790.14, wow_delta: -312.45  },
      { product: "RDS",            amount_usd: 16421.88, wow_delta:  512.33  },
      { product: "Lambda",         amount_usd:  9580.66, wow_delta:  241.12  },
      { product: "CloudWatch",     amount_usd:  6422.03, wow_delta:  -54.39  },
      { product: "ELB",            amount_usd:  4891.70, wow_delta:  102.80  },
      { product: "NAT Gateway",    amount_usd:  3888.90, wow_delta:  -75.00  },
    ];

    const total = top_products.reduce((s, p) => s + Number(p.amount_usd || 0), 0);
    const wowSum = top_products.reduce((s, p) => s + Number(p.wow_delta || 0), 0);
    const prevTotal = total - wowSum;
    const wowPercent = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

    top_products.forEach(p => {
      p.percent_of_total = total ? Number(((p.amount_usd / total) * 100).toFixed(1)) : 0;
    });

    // Daily series for the selected window (soft sine + small noise around avg/day)
    const avgPerDay = total / 30; // stable baseline
    const daily_series = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const wave = avgPerDay * 0.12 * Math.sin(i / 3);
      const jitter = avgPerDay * 0.04 * (Math.random() - 0.5);
      const amount = Math.max(0, avgPerDay + wave + jitter);
      return { dateISO: d.toISOString().slice(0, 10), cost: Number(amount.toFixed(2)) };
    });

    // Findings-derived KPIs
    const savingsReady = findings.reduce((s, f) => s + Number(f.monthly_savings_usd_est || 0), 0);
    const underutilizedCount = findings.filter(f =>
      /under.?util|idle/i.test(f.title || "") || /under.?util/i.test(f.type || "")
    ).length;
    const orphansCount = findings.filter(f =>
      /unattached|unused/i.test(f.title || "")
    ).length;

    const recent_findings = [...findings]
      .sort((a, b) => Number(b.monthly_savings_usd_est || 0) - Number(a.monthly_savings_usd_est || 0))
      .slice(0, 5);

    const body = {
      window: windowParam,
      kpis: {
        total_30d_cost: Number(total.toFixed(2)),
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
