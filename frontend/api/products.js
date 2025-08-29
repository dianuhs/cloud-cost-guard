/**
 * /api/products — proxy + compat
 */
module.exports = async (req, res) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const urls = [
    `https://api.cloudandcapital.com/api/products${qs}`,
    `https://api/cloudandcapital.com/api/movers${qs}`, // fallback path if your backend uses /movers
  ];

  const fwd = {};
  ["authorization","x-api-key","cookie","accept","user-agent"]
    .forEach(h => { if (req.headers[h]) fwd[h] = req.headers[h]; });

  try {
    let data = null, ok = false, lastText = "";
    for (const u of urls) {
      const r = await fetch(u, { method: "GET", headers: fwd, redirect: "follow", cache: "no-store" });
      lastText = await r.text();
      try { data = JSON.parse(lastText); ok = true; break; } catch {}
    }

    let arr = [];
    if (data) {
      arr = Array.isArray(data.movers) ? data.movers
          : Array.isArray(data.products) ? data.products
          : Array.isArray(data.items) ? data.items
          : [];
    }
    const movers = arr.map(m => ({
      service: m.service || m.name || m.key || "Unknown",
      delta_usd_30d: Number(m.delta_usd_30d ?? m.delta ?? m.change ?? 0),
      direction: m.direction || (Number(m.delta_usd_30d ?? m.delta ?? m.change ?? 0) >= 0 ? "up" : "down"),
    }));
    const products = movers.map(m => ({ name: m.service, delta: m.delta_usd_30d, dir: m.direction }));

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ movers, products, source_ok: ok });
  } catch (err) {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ movers: [], products: [], error: "proxy_failed", details: String(err && err.message || err) });
  }
};
