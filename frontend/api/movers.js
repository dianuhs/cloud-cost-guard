// Local movers endpoint (CommonJS). Uses the same product mix as summary.js
// so Top Movers renders with real values.

module.exports = async (req, res) => {
  try {
    const windowParam = (req.query && String(req.query.window)) || "7d";

    // Mirror the product set from summary.js so charts align
    const products = [
      { product: "EC2-Instances", amount_usd: 92543.25, wow_delta: -1832.10 },
      { product: "EBS",            amount_usd: 31845.22, wow_delta:  622.77  },
      { product: "S3",             amount_usd: 22790.14, wow_delta: -312.45  },
      { product: "RDS",            amount_usd: 16421.88, wow_delta:  512.33  },
      { product: "Lambda",         amount_usd:  9580.66, wow_delta:  241.12  },
      { product: "CloudWatch",     amount_usd:  6422.03, wow_delta:  -54.39  },
      { product: "ELB",            amount_usd:  4891.70, wow_delta:  102.80  },
      { product: "NAT Gateway",    amount_usd:  3888.90, wow_delta:  -75.00  },
    ];

    const movers = products
      .map(p => {
        const prev = p.amount_usd - (p.wow_delta || 0);
        return {
          service: p.product,
          previous_cost: Number(prev.toFixed(2)),
          current_cost: Number(p.amount_usd.toFixed(2)),
          change_amount: Number((p.wow_delta || 0).toFixed(2)),
          change_percent: prev > 0 ? Number(((p.wow_delta / prev) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => Math.abs(b.change_amount) - Math.abs(a.change_amount))
      .slice(0, 8);

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(movers);
  } catch (err) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ error: "movers_failed", details: String(err && err.message || err), window: "7d" });
  }
};
