/**
 * /api/products
 * Proxy to external backend; supports /products and /movers sources.
 * Returns both `movers` and `products` shapes for UI compatibility.
 */
module.exports = async (req, res) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const targets = [
    `https://api.cloudandcapital.com/api/products${qs}`,
    `https://api.cloudandcapital.com/api/movers${qs}`
  ];

  try {
    let data = null, ok = false, rawText = "";
    for (const url of targets) {
      const r = await fetch(url, { method: "GET" });
      rawText = await r.text();
      try {
        data = JSON.parse(rawText);
        ok = true;
        break;
      } catch (_) {
        // try next
      }
    }

    let movers = [];
    if (data) {
      // Prefer array under 'movers' then 'products'
      const arr = Array.isArray(data.movers) ? data.movers
                : Array.isArray(data.products) ? data.products
                : Array.isArray(data.items) ? data.items
                : [];
      movers = arr.map(m => ({
        service: m.service || m.name || m.key || "Unknown",
        delta_usd_30d: Number(m.delta_usd_30d ?? m.delta ?? m.change ?? 0),
        direction: m.direction || (Number(m.delta_usd_30d ?? m.delta ?? m.change ?? 0) >= 0 ? "up" : "down")
      }));
    }

    const products = movers.map(m => ({ name: m.service, delta: m.delta_usd_30d, dir: m.direction }));

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ movers, products, source_ok: ok });
  } catch (err) {
    const hint = { movers: [], products: [], error: "proxy_failed", details: String(err && err.message || err) };
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(hint);
  }
};
