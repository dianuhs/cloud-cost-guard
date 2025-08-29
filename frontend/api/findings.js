/**
 * Vercel Serverless Function (Root = frontend/): /api/findings
 * Robust loader that avoids module-crash:
 *  - Tries dynamic require for ../data/findings.seed.json INSIDE handler (so parse errors are caught)
 *  - Falls back to fs + import.meta.url
 *  - On any error, returns an inline diagnostic object (no 500s)
 *
 * Supports:
 *   - ?sort=savings   (desc by monthly_savings_usd_est)
 *   - ?limit=NUMBER
 */

import { createRequire } from 'module';
import fs from 'fs/promises';

export const config = {
  runtime: 'nodejs18.x'
};

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

async function tryLoadSeed() {
  // 1) Try dynamic require so bundler includes JSON if available
  try {
    const require = createRequire(import.meta.url);
    const seed = require('../data/findings.seed.json');
    if (Array.isArray(seed)) return seed;
    if (seed && Array.isArray(seed.data)) return seed.data;
  } catch (e) {
    // fall through to fs attempt
  }

  // 2) Try fs relative to this module URL
  try {
    const url = new URL('../data/findings.seed.json', import.meta.url);
    const raw = await fs.readFile(url, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    throw new Error('Seed JSON must be an array or an object with a top-level "data" array.');
  } catch (e) {
    throw e;
  }
}

export default async function handler(req, res) {
  try {
    let findings = await tryLoadSeed();

    const sortParam = req.query.sort;
    const limitParam = req.query.limit;

    findings = sortFindings(findings, sortParam);
    findings = limitFindings(findings, limitParam);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(findings);
  } catch (err) {
    const hint = {
      finding_id: 'seed-load-error',
      title: 'Could not load findings.seed.json',
      resource: 'frontend/data/findings.seed.json',
      service: 'system',
      severity: 'warning',
      monthly_savings_usd_est: 0,
      details: String(err?.message ?? err),
      next_steps: [
        'Confirm the file exists at frontend/data/findings.seed.json and is committed',
        'Ensure valid JSON (no trailing commas / comments)',
        'If this persists, try the sample from our chat to rule out JSON syntax issues'
      ],
    };
    res.setHeader('Content-Type', 'application/json');
    // Always return 200 so the UI renders a card with the diagnostic
    res.status(200).json([hint]);
  }
}

