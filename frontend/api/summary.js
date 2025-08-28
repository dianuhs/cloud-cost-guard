// Debug: just show what URL we'd call (no fetch yet)
module.exports = async (req, res) => {
  const base = process.env.UPSTREAM_BASE || null;
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = base ? `${base}/api/summary${qs}` : null;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({ ok: true, base, target }));
};
