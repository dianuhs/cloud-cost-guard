// /api/movers?window=30d -> compute movers using existing backend endpoints.
// Primary: products(30d) vs products(60d) -> prev30 = 60d - 30d
// Fallback: if 60d isn't distinct, pull summary(60d).top_products
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

function indexByService(list, key="service", valKey="amount_usd") {
  const map = {};
  for (const x of list || []) {
    const svc = x[key] || x.service || x.name;
    if (!svc) continue;
    map[svc] = {
      name: x.name || svc,
      amount: typeof x[valKey] === "number" ? x[valKey] : Number(x[valKey]) || 0
    };
  }
  return map;
}

module.exports = async (req, res) => {
  try {
    const base = process.env.UPSTREAM_BASE;
    if (!base) return res.status(500).json({ error: "UPSTREAM_BASE not set" });

    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const wantWindow = (qs.match(/window=([^&]+)/i) || [,"30d"])[1].toLowerCase();

    // Build URLs
    const url30 = `${base}/products${qs || "?window=30d"}`;
    const url60 = url30.replace(/window=([^&]+)/i, "window=60d");
    const urlSum60 = `${base}/summary?window=60d`;

    // Pull current(30d) and a 60d comparator
    const [p30, p60] = await Promise.all([getJson(url30), getJson(url60)]);
    let by30 = indexByService(p30);
    let by60 = indexByService(p60);

    // Detect "60d == 30d" (backend ignoring window), then fallback to summary(60d)
    const totalsEqual =
      Object.keys(by30).length &&
      Object.keys(by30).every(svc => (by60[svc]?.amount || 0) === (by30[svc]?.amount || 0));

    if (totalsEqual) {
      const s60 = await getJson(urlSum60); // { top_products: [...] }
      const top60 = Array.isArray(s60?.top_products) ? s60.top_products : [];
      by60 = indexByService(top60);
    }

    // Compute prev30 = max(0, 60d - 30d); delta = 30d - prev30
    const services = new Set([...Object.keys(by30), ...Object.keys(by60)]);
    const movers = [];
    for (const svc of services) {
      const curr = by30[svc]?.amount || 0;
      const tot60 = by60[svc]?.amount || 0;
      const prev = Math.max(0, tot60 - curr);
      const delta = curr - prev;
      const pct = prev > 0 ? (delta / prev) * 100 : null;

      movers.push({
        service: svc,
        name: by30[svc]?.name || by60[svc]?.name || svc,
        window: wantWindow,
        current_usd: Number(curr.toFixed(2)),
        prev_usd: Number(prev.toFixed(2)),
        delta_usd: Number(delta.toFixed(2)),
        delta_pct: pct === null ? null : Number(pct.toFixed(2))
      });
    }

    // Sort by absolute dollar change and cap (UI usually shows ~5–7)
    movers.sort((a, b) => Math.abs(b.delta_usd) - Math.abs(a.delta_usd));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify(movers.slice(0, 7)));
  } catch (e) {
    res.status(502).json({ error: "Proxy error", detail: String(e?.message || e) });
  }
};

