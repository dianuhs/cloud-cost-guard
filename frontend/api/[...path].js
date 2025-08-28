// Vercel serverless proxy -> forwards /api/* to your UPSTREAM_BASE
// Usage: set env var UPSTREAM_BASE (e.g. https://api.cloudandcapital.com/api)

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // also strip/let node compute these
  "host",
  "content-length",
  "accept-encoding",
]);

// Disable Vercel's default body parsing so we can forward any payload (incl. CSV/multipart)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    const base = process.env.UPSTREAM_BASE;
    if (!base) {
      res
        .status(500)
        .json({ error: "Missing UPSTREAM_BASE env var on the server." });
      return;
    }

    // 1) Build target URL
    const segs = Array.isArray(req.query.path) ? req.query.path : [];
    const tail = segs.join("/");
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const upstreamBase = base.replace(/\/+$/, ""); // trim trailing slash
    const target = `${upstreamBase}/${tail}${qs}`;

    // 2) Read body only when needed
    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    // 3) Forward headers (strip hop-by-hop)
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
    }
    // Ensure a UA (some upstreams log/require it)
    if (!headers["user-agent"]) headers["user-agent"] = "CloudCostGuard/Proxy";

    // 4) Handle simple CORS (mostly a no-op if same-origin)
    if (req.method === "OPTIONS") {
      // Allow typical methods used by the app
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "*");
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.status(204).end();
      return;
    }

    // 5) Fetch upstream
    const upstreamResp = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    // 6) Pass through status & headers
    // Copy headers except hop-by-hop; forward Set-Cookie correctly
    upstreamResp.headers.forEach((val, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        // Multiple headers with same key are concatenated by default; handle Set-Cookie separately
        if (key.toLowerCase() !== "set-cookie") res.setHeader(key, val);
      }
    });

    const rawSetCookie = upstreamResp.headers.getSetCookie?.() ||
      upstreamResp.headers.raw?.()["set-cookie"] || // node-fetch style
      [];
    if (rawSetCookie.length) res.setHeader("Set-Cookie", rawSetCookie);

    // 7) Stream/return body
    const arrayBuf = await upstreamResp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    res.status(upstreamResp.status).send(buf);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).json({ error: "Bad gateway from proxy.", detail: String(err) });
  }
}
