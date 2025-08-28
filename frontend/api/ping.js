module.exports = (req, res) => {
  res.setHeader("content-type", "application/json");
  res.status(200).send(JSON.stringify({ ok: true, time: new Date().toISOString() }));
};
