/**
 * Vercel Serverless Function: /api/findings
 * Reads findings from backend/data/findings.seed.json and returns them,
 * with optional query params:
 *   - sort=savings  (sorts by monthly_savings_usd_est desc)
 *   - limit=NUMBER  (limits the number of returned findings)
 *
 * Place this file at: api/findings.js  (project root)
 * Ensure your seed file is at: backend/data/findings.seed.json
 */

import fs from 'fs/promises';
import path from 'path';

/** Resolve the seed file path relative to the repository root */
function getSeedPath() {
  // In Vercel, process.cwd() is the project root for serverless functions
  const root = process.cwd();
  // Your user placed the seed at backend/data/findings.seed.json
  return path.join(root, 'backend', 'data', 'findings.seed.json');
}

/** Parse utility that tolerates arrays or object with 'data' property */
async function loadFindings() {
  const p = getSeedPath();
  const raw = await fs.readFile(p, 'utf-8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  return [];
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace?.(/[^0-9.\-]/g, '') ?? v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Sort helpers */
function sortBySavingsDesc(a, b) {
  return toNumber(b.monthly_savings_usd_est) - toNumber(a.monthly_savings_usd_est);
}

export default async function handler(req, res) {
  try {
    const findings = await loadFindings();

    // Query params
    const { sort, limit } = req.query || {};

    let out = findings.slice();

    if (sort === 'savings') {
      out.sort(sortBySavingsDesc);
    }

    const lim = Number(limit);
    if (Number.isFinite(lim) && lim > 0) {
      out = out.slice(0, lim);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(out);
  } catch (err) {
    console.error('GET /api/findings error:', err);
    res.status(500).json({ error: 'Failed to load findings.' });
  }
}
