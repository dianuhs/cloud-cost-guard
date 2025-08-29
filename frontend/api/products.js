/**
 * /api/products
 */
module.exports = async (req, res) => {
  const windowParam = (req.query && req.query.window) || "30d";
  const movers = [
    { service: "Lambda", delta_usd_30d: 186.73, direction: "up" },
    { service: "S3", delta_usd_30d: -122.18, direction: "down" },
    { service: "NAT Gateway", delta_usd_30d: 79.41, direction: "up" },
    { service: "EBS", delta_usd_30d: -65.90, direction: "down" },
    { service: "EC2", delta_usd_30d: 245.12, direction: "up" }
  ];

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ window: windowParam, movers });
};
