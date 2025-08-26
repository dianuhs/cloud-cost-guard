# Cloud Cost Guard (by Cloud & Capital)

Open‑source dashboard that turns cloud bills into clear actions.  
CLI‑first, CSV‑friendly, and opinionated about what to fix next.

## What it shows
- Spend & trends, unit economics
- Identified vs. realized savings
- Coverage (RIs/SPs), rightsizing, idle/orphan checks
- Export: CSV (totals, by service, by tag)

## Why it exists
Faster decisions, lower waste, and unit economics everyone agrees on.

## Quick start
```bash
# frontend
pnpm i && pnpm dev   # or npm/yarn

# backend (if applicable)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

### Config
- Set API base URL for tests via env:
  - `CLOUD_COST_GUARD_BASE_URL=http://localhost:8000`

- Provide data via one of:
  - Drop a Cost Explorer/CUR CSV into `examples/billing-sample.csv`
  - Or set `BILLING_CSV_PATH` in `.env.local`

## Data disclaimer
Demo data for portfolio purposes. All numbers illustrative unless connected to your billing export.

## Screenshots
_Add 2–3 light‑mode screenshots with purple accent here._

## License
MIT © 2025 Diana Molski, Cloud & Capital
