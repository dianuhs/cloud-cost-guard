
// /api/movers?window=30d -> compute "Top Movers" from your existing backend endpoints
// Primary method: products(30d) and products(60d), where prev30 = 60d - 30d
// Fallback: if 60d looks identical to 30d (backend ignoring window), use summary(60d).top_products
const https = require("https");
const { URL } = require("url");

/** GET JSON via Node https */
function getJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + (u.search || ""),
        method: "GET",
        headers: { Accept: "application/json" }
      },
      (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => {
          try {
            resolve(JSON.parse(data || "null"));
          } catch (e) {
            reject(new Error(`Bad JSON from ${url}: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/** Index a product list by service -> { name, amount } */
function indexByService(list, key = "service", valKey = "amount_usd") {
  const map = {};
  for (const x of Array.isArray(list) ? list : []) {
    const svc = x[key] || x.service || x.name;
    if (!svc) continue;
    const amtRaw = x[valKey];
    const amt = typeof amtRaw === "number" ? amtRaw : Number(amtRaw) || 0;
    map[svc] = { name: x.name || svc, amount: amt };
  }
  return map;
}

/** Extract window=??? and return lowercase string (default "30d") */
function getWindowFromQs(qs) {
  const m = (qs || "").match(/(?:^|[?&])window=([^&]+)/i);
  return (m ? m[1] : "30d").toLowerCase();
}

/** Double a "Nd" window string (e.g., "30d" -> "60d"), else sensible fallback */
function doubleWindow(win) {
  const m = (win || "").match(/^(\d+)([dwmy])$/i);
  if (m && m[2].toLowerCase() === "d") {
    return `${Number(m[1]) * 2}d`;
  }
  // default: if already "30d", use "60d"; otherwise just use "60d" as a comparator
  return win === "30d" ? "60d" : "60d";
}

/** Build a URL with an adjusted window parameter */
function buildUrlWithWindow(base, path, qs, win) {
  if (qs && /(?:^|[?&])window=/.test(qs)) {
    return `${base}${path}${qs.replace(/window=([^&]+)/i, `window=${win}`)}`;
  }
  const sep = qs ? "&" : "?";
  return `${base}${path}${qs || "?"}window=${win}`;
}

module.exports = async (req, res) => {
  try {
    const base = process.env.UPSTREAM_BASE;
    if (!base) {
      res.status(500).json({ error: "UPSTREAM_BASE not set" });
      return;
    }

    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const wantWindow = getWindowFromQs(qs);     // e.g., "30d"
    const compWindow = doubleWindow(wantWindow); // e.g., "60d"

    // Build source URLs
    const url30 = buildUrlWithWindow(base, "/products", qs, wantWindow);
    const url60 = buildUrlWithWindow(base, "/products", qs, compWindow);
    const urlSum60 = buildUrlWithWindow(base, "/summary", "", compWindow);

    // Pull current 30d and a 60d comparator
    const [p30, p60] = await Promise.all([getJson(url30), getJson(url60)]);
    let by30 = indexByService(p30);
    let by60 = indexByService(p60);

    // Detect if 60d equals 30d (backend may be ignoring the window param); fallback to summary(60d)
    const servicesSeen = new Set([...Object.keys(by30), ...Object.keys(by60)]);
    const looksIdentical =
      servicesSeen.size > 0 &&
      Array.from(servicesSeen).every((svc) => {
        const a = by30[svc]?.amount || 0;
        const b = by60[svc]?.amount || 0;
        return a === b;
      });

    if (looksIdentical) {
      const s60 = await getJson(urlSum60); // { top_products: [...] }
      const top60 = Array.isArray(s60?.top_products) ? s60.top_products : [];
      by60 = indexByService(top60);
    }

    // Compute movers
    const movers = [];
    for (const svc of new Set([...Object.keys(by30), ...Object.keys(by60)])) {
      const curr = by30[svc]?.amount || 0;      // current window (e.g., 30d)
      const tot60 = by60[svc]?.amount || 0;     // total over comparator (e.g., 60d)
      const prev = Math.max(0, tot60 - curr);   // prior window (e.g., previous 30d)
      const delta = curr - prev;

      // If there's no previous spend, treat change% as 100 when current > 0, else 0
      const pct = prev > 0 ? (delta / prev) * 100 : (curr > 0 ? 100 : 0);

      movers.push({
        service: svc,
        name: by30[svc]?.name || by60[svc]?.name || svc,
        window: wantWindow,
        current_usd: Number(curr.toFixed(2)),
        prev_usd: Number(prev.toFixed(2)),
        delta_usd: Number(delta.toFixed(2)),
        delta_pct: Number(pct.toFixed(2)),

        // aliases some charts expect
        amount_usd: Number(curr.toFixed(2)),
        change_usd: Number(delta.toFixed(2)),
        change_pct: Number(pct.toFixed(2))
      });
    }

    // Sort by absolute dollar change and cap at top 7
    movers.sort((a, b) => Math.abs(b.delta_usd) - Math.abs(a.delta_usd));
    const top = movers.slice(0, 7);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify(top));
  } catch (e) {
    res.status(502).json({ error: "Proxy error", detail: String(e?.message || e) });
  }
};
