// Proxies /api/findings?... -> `${UPSTREAM_BASE}/findings?...`
const https = require("https");
const { URL } = require("url");

function getRaw(url) {
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
        resp.on("data", (chunk) => (data += chunk));
        resp.on("end", () =>
          resolve({ statusCode: resp.statusCode || 200, headers: resp.headers, body: data })
        );
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
    const target = `${base}/findings${qs}`;

    const upstream = await getRaw(target);
    res.status(upstream.statusCode);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(upstream.body);
  } catch (e) {
    res.status(502).json({ error: "Proxy error", detail: String(e?.message || e) });
  }
};
