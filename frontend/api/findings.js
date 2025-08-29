/**
 * Vercel Serverless Function (Root = frontend/): /api/findings
 * CommonJS version (safer on Vercel): no runtime config, no ESM imports.
 * Statically requires ../data/findings.seed.json so it gets bundled.
 * Supports:
 *   - ?sort=savings   (desc by monthly_savings_usd_est)
 *   - ?limit=NUMBER
 *
 * Place this file at: frontend/api/findings.js
 * Seed file at:       frontend/data/findings.seed.json
 */

function sortFindings(findings, sortKey) {
  if (!sortKey) return findings;
  if (sortKey === 'savings') {
    return [...findings].sort((a, b) => {
      const va = Number(a && a.monthly_savings_usd_est || 0);
      const vb = Number(b && b.monthly_savings_usd_est || 0);
      return vb - va; // desc
    });
  }
  return findings;
}

function limitFindings(findings, limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return findings;
  return findings.slice(0, n);
}

module.exports = async (req, res) => {
  let findings = [];
  try {
    // Statically include JSON so the bundler packages it
    const seed = require('../data/findings.seed.json');
    if (Array.isArray(seed)) {
      findings = seed;
    } else if (seed && Array.isArray(seed.data)) {
      findings = seed.data;
    } else {
      throw new Error('Seed JSON must be an array or an object with a top-level "data" array.');
    }
  } catch (err) {
    const hint = {
      finding_id: 'seed-load-error',
      title: 'Could not import findings.seed.json',
      resource: 'frontend/data/findings.seed.json',
      service: 'system',
      severity: 'warning',
      monthly_savings_usd_est: 0,
      details: String(err && err.message || err),
      next_steps: [
        'Confirm the file exists at frontend/data/findings.seed.json and is committed',
        'Ensure valid JSON (array or { "data": [...] })',
        'Avoid comments/trailing commas in JSON',
      ],
    };
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json([hint]);
  }

  // Query params
  const sortParam = req.query && req.query.sort;
  const limitParam = req.query && req.query.limit;

  findings = sortFindings(findings, sortParam);
  findings = limitFindings(findings, limitParam);

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(findings);
};


