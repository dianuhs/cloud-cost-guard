/**
 * Vercel Serverless Function (Root = frontend/): /api/findings
 * Reads findings from frontend/data/findings.seed.json and returns them,
 * with optional query params:
 *   - sort=savings  (sorts by monthly_savings_usd_est desc)
 *   - limit=NUMBER  (limits the number of returned findings)
 *
 * Place this file at: frontend/api/findings.js
 * Ensure your seed file is at: frontend/data/findings.seed.json
 *
 * NOTE: On Vercel, serverless functions take precedence over rewrites.
 * If you already have a rewrite like `/api/* -> https://api.cloudandcapital.com/api/*`,
 * this local function at `/api/findings` will still serve for that specific path.
 */

import fs from 'fs/promises';
import path from 'path';

/** Resolve the seed file path relative to the project root (which is `frontend/`) */
function getSeedPath() {
  // In this Vercel setup, the project root is the `frontend/` folder.
  const root = process.cwd(); // points to `frontend/` at runtime
  return path.join(root, 'data', 'findings.seed.json');
}

/** Parse utility that tolerates arrays or object with 'data' property */
async function loadFindings() {
  const p = getSeedPath();
  const raw = await fs.readFile(p, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Seed JSON parse error at ${p}: ${e.message}`);
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;

  throw new Error('Seed JSON must be an array or an object with a top-level "data" array.');
}

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

  // Unknown sort => no-op
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
    let findings = await loadFindings();

    // query params
    const sortParam = req.query.sort;
    const limitParam = req.query.limit;

    findings = sortFindings(findings, sortParam);
    findings = limitFindings(findings, limitParam);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(findings);
  } catch (err) {
    // Helpful fallback: return a tiny array with the error embedded so the UI shows *something*
    const hint = {
      finding_id: 'seed-load-error',
      title: 'Could not load findings.seed.json',
      resource: 'frontend/data/findings.seed.json',
      service: 'system',
      severity: 'warning',
      monthly_savings_usd_est: 0,
      details: String(err?.message ?? err),
      next_steps: [
        'Confirm the file exists at frontend/data/findings.seed.json',
        'Ensure it is valid JSON (array of objects, or { "data": [...] })',
        'Commit and push the file so Vercel includes it in the build',
      ],
    };

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json([hint]);
  }
}

