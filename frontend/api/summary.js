/**
 * /api/summary
 */
module.exports = async (req, res) => {
  const windowParam = (req.query && req.query.window) || "30d";
  const now = new Date();
  const endISO = now.toISOString();
  const startISO = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

  const payload = {
    window: windowParam,
    last_updated_iso: endISO,
    period_start: startISO,
    period_end: endISO,
    totals: {
      total_cost_usd_30d: 9823.17,
      projected_month_end_usd: 10450.12,
      identified_savings_usd_30d: 1843.75,
      realized_savings_usd_30d: 612.40
    },
    breakdown: [
      { service: "EC2", cost_usd_30d: 4321.55 },
      { service: "S3", cost_usd_30d: 1120.22 },
      { service: "EBS", cost_usd_30d: 980.43 },
      { service: "Lambda", cost_usd_30d: 645.09 },
      { service: "CloudWatch", cost_usd_30d: 320.18 },
      { service: "Others", cost_usd_30d: 2435.70 }
    ]
  };

  res.setHeader("Content-Type", "application/json");
  res.status(200).json(payload);
};

