// frontend/api/movers.js
// Realistic movers endpoint that stays consistent with summary.js output.
// It reconstructs "previous" by reversing the per-product wow_delta.

module.exports = async (req, res) => {
  try {
    // Recompute the same product mix as summary.js so results align.
    // You can change the same knobs here if you adjust them in summary.js.
    const q = req.query || {};
    const BASE_MONTHLY_SPEND = Number(q.base || 165000);
    const days = 30; // keep a 30d basis for amounts

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
    const shareSum = Object.values(SERVICE_SHARES).reduce((a, b) => a + b, 0) || 1;
    const normalizedShares = {};
    Object.entries(SERVICE_SHARES).forEach(([k, v]) => (normalizedShares[k] = v / shareSum));

    // We can't import from summary.js here in Vercel, so we mirror its math:
    // Assume current total equals BASE_MONTHLY_SPEND scaled to 30 days.
    const totalCurrent = BASE_MONTHLY_SPEND * (days / 30);
    const productsCurrent = Object.entries(normalizedShares).map(([name, share]) => ({
      product: name,
      amount_usd: Number((totalCurrent * share).toFixed(2)),
      share,
    }));

    // Use a mild overall WoW (+2.8%) and distribute across products with small variation
    const WOW_RATE = Number(q.wow || 2.8) / 100;
    const prevTotal = totalCurrent / (1 + WOW_RATE);
    const deltaTotal = totalCurrent - prevTotal;

    // Distribute deltas roughly by share with small bias, normalized to sum exactly
    let idx = 0;
    let raw = productsCurrent.map(p => {
      const bias = (idx++ % 2 === 0 ? 1 : -1) * (0.18); // ±18% bias for variety
      return { name: p.product, base: deltaTotal * p.share, rawDelta: deltaTotal * p.share * (1 + bias) };
    });
    const rawSum = raw.reduce((s, r) => s + r.rawDelta, 0) || 1;
    const scale = deltaTotal / rawSum;
    const deltas = {};
    raw.forEach(r => (deltas[r.name] = r.rawDelta * scale));

    const movers = productsCurrent.map(p => {
      const change = deltas[p.product] || 0;
      const current = p.amount_usd;
      const previous = current - change;
      const pct = previous > 0 ? (change / previous) * 100 : 0;
      return {
        service: p.product,
        previous_cost: Number(previous.toFixed(2)),
        current_cost: Number(current.toFixed(2)),
        change_amount: Number(change.toFixed(2)),
        change_percent: Number(pct.toFixed(1)),
      };
    })
    .sort((a, b) => Math.abs(b.change_amount) - Math.abs(a.change_amount))
    .slice(0, 8);

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(movers);
  } catch (err) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ error: "movers_failed", details: String(err && err.message || err) });
  }
};
