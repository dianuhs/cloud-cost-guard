/**
 * Vercel Serverless Function (Root = frontend/): /api/findings
 * Statically imports ../data/findings.seed.json so the file is bundled.
 * Supports:
 *   - ?sort=savings   (desc by monthly_savings_usd_est)
 *   - ?limit=NUMBER
 *
 * Place this file at: frontend/api/findings.js
 * Seed file lives at: frontend/data/findings.seed.json
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const findingsSeed = require('../data/findings.seed.json');

/** Sorting helpers */
function sortFindings(findings, sortKey) {
  if (!sortKey) return findings;
  if (sortKey === 'savings') {
    return [...findings].sort((a, b) => {
      const va = Number(a?.monthly_savings_usd_est ?? 0);
      const vb = Number(b?.monthly_savings_usd_est ?? 0);
      return vb - va; // desc
    });
  }
  return findings;
}

/** Apply limit */
function limitFindings(findings, limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return findings;
  return findings.slice(0, n);
}

export default async function handler(req, res) {
  try {
    let findings = Array.isArray(findingsSeed)
      ? findingsSeed
      : Array.isArray(findingsSeed?.data)
      ? findingsSeed.data
      : [];

    const sortParam = req.query.sort;
    const limitParam = req.query.limit;

    findings = sortFindings(findings, sortParam);
    findings = limitFindings(findings, limitParam);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(findings);
  } catch (err) {
    const hint = {
      finding_id: 'seed-load-error',
      title: 'Could not import findings.seed.json',
      resource: 'frontend/data/findings.seed.json',
      service: 'system',
      severity: 'warning',
      monthly_savings_usd_est: 0,
      details: String(err?.message ?? err),
      next_steps: [
        'Confirm the file exists at frontend/data/findings.seed.json',
        'Ensure it is valid JSON (array or { "data": [...] })',
        'Commit and push the file so Vercel includes it in the build',
      ],
    };
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json([hint]);
  }
}
