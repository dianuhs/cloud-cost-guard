// frontend/api/[...path].js
// Serverless proxy to the preview backend so the frontend can call /api/*
// Works on Vercel with Node 20+ (fetch is built-in)

module.exports = async (req, res) => {
  try {
    const segs = Array.isArray(req.query.path) ? req.query.path : [];
    const tail = segs.join("/");
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const target = `https://cloudcostguard.preview.emergentagent.com/api/${tail}${qs}`;

    // Collect body (for non-GET/HEAD, though your dashboard only does GETs)
    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    // Forward a minimal, safe header set
    const fwdHeaders = {
      "content-type": req.headers["content-type"] || undefined,
      "authorization": req.headers["authorization"] || undefined,
      "accept": req.headers["accept"] || "application/json",
    };

    const resp = await fetch(target, {
      method: req.method,
      headers: fwdHeaders,
      body,
      redirect: "manual",
    });

    // Pass through status and important headers
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
