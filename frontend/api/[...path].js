// /api/* -> forwards to `${UPSTREAM_BASE}/api/*`
// Set UPSTREAM_BASE in Vercel (no trailing slash), e.g. https://api.cloudandcapital.com

const hopByHop = new Set([
  "connection","keep-alive","transfer-encoding","proxy-authenticate",
  "proxy-authorization","te","trailer","upgrade"
]);

function joinUrl(base, path) {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

module.exports = async (req, res) => {
  try {
    const upstream = process.env.UPSTREAM_BASE;
    if (!upstream) {
      res.status(500).json({ error: "UPSTREAM_BASE not set" });
      return;
    }

    const segs = Array.isArray(req.query.path) ? req.query.path : [];
    const tail = segs.join("/");
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const target = joinUrl(upstream, `/api/${tail}${qs}`);

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const outHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!hopByHop.has(k.toLowerCase())) outHeaders[k] = v;
    }

    const upstreamResp = await fetch(target, { method: req.method, headers: outHeaders, body });

    res.status(upstreamResp.status);
    upstreamResp.headers.forEach((v, k) => {
      if (!hopByHop.has(k.toLowerCase())) res.setHeader(k, v);
    });

    const buf = Buffer.from(await upstreamResp.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: "Proxy error", detail: String(err && err.message || err) });
  }
};


