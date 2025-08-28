module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.status(200).send(JSON.stringify({ ok: true, via: "summary.js", qs }));
};
