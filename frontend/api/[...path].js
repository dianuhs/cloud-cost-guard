// Generic serverless proxy: forwards /api/* on YOUR domain to an upstream backend.
// No vendor names hardcoded. Configure the target via env var UPSTREAM_BASE.

module.exports = async (req, res) => {
  try {
    const upstream = process.env.UPSTREAM_BASE; // e.g. https://api.guard.cloudandcapital.com
    if (!upstream) {
      res
        .status(500)
        .json({ error: "UPSTREAM_BASE env var not set for proxy" });
      return;
    }

    // Build target URL: <UPSTREAM_BASE>/api/<tail>?<qs>
    const segs = Array.isArray(req.query.path) ? req.query.path : [];
    const tail = segs.join("/");
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const target = `${upstream.replace(/\/+$/, "")}/api/${tail}${qs}`;

    // Read body for non-GET/HEAD
    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const resp = await fetch(target, {
      method: req.method,
      headers: {
        // Pass through only safe headers
        "content-type": req.headers["content-type"] || undefined,
        "accept": req.headers["accept"] || "application/json",
        // If your upstream needs auth, put a static token in an env var instead:
        // "authorization": process.env.UPSTREAM_AUTH || undefined,
      },
      body,
      redirect: "manual",
    });

    res.status(resp.status);
    const ct = resp.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    const cc = resp.headers.get("cache-control");
    if (cc) res.setHeader("cache-control", cc);

    const buf = Buffer.from(await resp.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).json({ error: "Upstream fetch failed" });
  }
};

