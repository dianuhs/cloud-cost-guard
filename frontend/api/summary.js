// Proxies /api/summary?window=30d -> `${UPSTREAM_BASE}/api/summary?window=30d`
module.exports = async (req, res) => {
  try {
    const base = process.env.UPSTREAM_BASE;
    if (!base) return res.status(500).json({ error: "UPSTREAM_BASE not set" });

    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const url = `${base}/api/summary${qs}`;

    const r = await fetch(url, { headers: { accept: "application/json" } });
    res.status(r.status);
    r.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: "Proxy error", detail: String(e?.message || e) });
  }
};

