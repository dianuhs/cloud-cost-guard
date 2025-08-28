// /api/movers?window=30d  -> computes movers from `${UPSTREAM_BASE}/products`
// Logic: prev30 = products(60d) - products(30d); delta = curr30 - prev30; pct = delta/prev30
const https = require("https");
const { URL } = require("url");

function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        method: "GET",
        headers: { Accept: "application/json" }
      },
      (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Bad JSON from ${url}: ${e.message}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    const base = process.env.UPSTREAM_BASE;
    if (!base) return res.status(500).json({ error: "UPSTREAM_BASE not set" });

    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const url30 = `${base}/products${qs}`;
    // swap window=30d -> 60d for the prior-period calc
    const url60 = url30.replace(/window=30d/i, "window=60d");

    const [p30, p60] = await Promise.all([getJson(url30), getJson(url60)]);

    // index by service
    const bySvc30 = Object.fromEntries(p30.map(x => [x.service, x]));
    const bySvc60 = Object.fromEntries(p60.map(x => [x.service, x]));

    const movers = [];
    for (const svc of new Set([...Object.keys(bySvc30), ...Object.keys(bySvc60)])) {
      const curr = bySvc30[svc]?.amount_usd ?? 0;
      const tot60 = bySvc60[svc]?.amount_usd ?? 0;
      const prev = Math.max(0, tot60 - curr); // prior 30 days
      const delta = curr - prev;
      const pct = prev > 0 ? delta / prev : null;
      movers.push({
        service: svc,
        name: bySvc30[svc]?.name || bySvc60[svc]?.name || svc,
        window: "30d",
        current_usd: Number(curr.toFixed(2)),
        prev_usd: Number(prev.toFixed(2)),
        delta_usd: Number(delta.toFixed(2)),
        delta_pct: pct === null ? null : Number((pct * 100).toFixed(2))
      });
    }

    // sort by absolute dollar change, top 7 (tweak if you want)
    movers.sort((a, b) => Math.abs(b.delta_usd) - Math.abs(a.delta_usd));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify(movers.slice(0, 7)));
  } catch (e) {
    res.status(502).json({ error: "Proxy error", detail: String(e?.message || e) });
  }
};
