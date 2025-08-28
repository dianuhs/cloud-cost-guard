from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
import math
import random

app = FastAPI(title="Cloud Cost Guard API", version="1.0.0")

# CORS for your Vercel frontend (relaxed by default; tighten as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # e.g. ["https://your-vercel-domain.vercel.app"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Helpers ----------

TZ = timezone.utc  # keep server UTC; frontend renders local time and US format

AWS_SERVICES = [
    ("EC2-Instance", 0.465),
    ("RDS",          0.242),
    ("EBS",          0.095),
    ("ELB",          0.058),
    ("S3",           0.046),
    ("CloudWatch",   0.039),
    # leftover goes to "Other" if needed
]

# brand palette used by your pie
PALETTE = ["#8B6F47","#B5905C","#D8C3A5","#A8A7A7","#E98074","#C0B283","#F4E1D2","#E6B89C"]

def mmdd(d: datetime) -> str:
    return d.strftime("%m/%d")

def seed_for_month(dt: datetime) -> int:
    # deterministic per YYYY-MM so demos stay stable
    return int(dt.strftime("%Y%m"))

def window_days(label: str) -> int:
    return 7 if label == "7d" else (30 if label == "30d" else 90)

def synthesize_series(days: int, month_seed: int, base_month_total: float) -> List[Dict[str, Any]]:
    """
    Create a daily cost series with:
      - weekly pattern (Mon-Fri higher than weekend),
      - soft upward/downward drift,
      - light random noise and occasional spike.
    The sum over 'days' will be close to (base_month_total * days/30).
    """
    rng = random.Random(month_seed + days)
    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days-1)

    target_total = base_month_total * (days / 30.0)
    # baseline daily average
    avg = target_total / days

    series = []
    drift = rng.uniform(-0.004, 0.006)  # -0.4% to +0.6% per day drift
    for i in range(days):
        d = start + timedelta(days=i)

        # weekly shape: weekends ~ -18%; Wed/Thu slight +5%
        dow = d.weekday()  # 0=Mon
        weekly = 1.0
        if dow >= 5:  # Sat/Sun
            weekly *= 0.82
        elif dow in (2, 3):  # Wed/Thu
            weekly *= 1.05

        # smooth sin wobble
        wobble = 1.0 + 0.03 * math.sin(i / 2.7)

        # random noise
        noise = rng.uniform(-0.04, 0.04)

        # occasional spike (once every ~12 days)
        spike = 1.0
        if rng.random() < (1.0 / 12.0):
            spike = rng.uniform(1.10, 1.22)

        # apply drift relative to series start
        factor = (1.0 + drift) ** i

        value = avg * weekly * wobble * factor * (1.0 + noise) * spike
        series.append({"date": d, "cost": max(0, value)})

    # Normalize to hit target_total (keeps chart realistic yet stable)
    s = sum(pt["cost"] for pt in series) or 1.0
    norm = target_total / s
    for pt in series:
        pt["cost"] *= norm

    # Return with display label
    return [{"formatted_date": mmdd(pt["date"]), "cost": round(pt["cost"], 2)} for pt in series]

def split_by_service(total_amount: float, month_seed: int) -> List[Dict[str, Any]]:
    """
    Allocate monthly total into services roughly matching your PDF.
    Adds tiny jitter per month so values look alive, but keep the same order.
    """
    rng = random.Random(month_seed + 999)
    parts = []
    used = 0.0
    for idx, (name, share) in enumerate(AWS_SERVICES):
        # ±3% jitter of each share (bounded)
        jitter = rng.uniform(-0.03, 0.03)
        adj_share = max(0.01, share * (1.0 + jitter))
        parts.append((name, adj_share))
    # normalize shares to sum 1.0
    total_share = sum(x[1] for x in parts)
    parts = [(n, s/total_share) for (n, s) in parts]

    by_service = []
    for i, (name, share) in enumerate(parts):
        amount = round(total_amount * share, 2)
        by_service.append({
            "name": name,
            "value": amount,
            "percentage": round(share * 100.0, 1),
            "fill": PALETTE[i % len(PALETTE)]
        })
        used += amount

    # Adjust rounding residue on the largest service
    residue = round(total_amount - used, 2)
    if by_service:
        by_service[0]["value"] = round(by_service[0]["value"] + residue, 2)

    return by_service

def calc_movers(by_service_now: List[Dict[str, Any]], by_service_prev: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    prev_map = {s["name"]: s["value"] for s in by_service_prev}
    now_map  = {s["name"]: s["value"] for s in by_service_now}
    names = set(prev_map) | set(now_map)
    movers = []
    for n in names:
        prev = float(prev_map.get(n, 0.0))
        curr = float(now_map.get(n, 0.0))
        delta = round(curr - prev, 2)
        pct = round(((delta / prev) * 100.0) if prev > 0 else (100.0 if curr > 0 else 0.0), 1)
        movers.append({
            "service": n,
            "previous_cost": round(prev, 2),
            "current_cost": round(curr, 2),
            "change_amount": delta,
            "change_percent": pct
        })
    # biggest absolute $ change first
    movers.sort(key=lambda m: abs(m["change_amount"]), reverse=True)
    return movers

def now_iso() -> str:
    return datetime.now(TZ).isoformat()

# ---------- Core “realistic” model ----------

def model_for_window(window_label: str) -> Dict[str, Any]:
    """
    Produce a coherent snapshot for a given window (7d/30d/90d).
    Totals align across:
      - summary.kpis.total_30d_cost (or N-day cost)
      - service breakdown (sums to total)
      - cost trend (sums to total)
      - movers based on prev vs curr allocations
    """
    days = window_days(window_label)
    today = datetime.now(TZ)
    month_seed = seed_for_month(today)

    # Choose a believable monthly baseline around ~150k with ±10% monthly drift
    rng = random.Random(month_seed)
    month_baseline = 150_000.0 * rng.uniform(0.9, 1.1)

    # If window != 30, scale to N days
    window_total = month_baseline * (days / 30.0)

    # Daily series (MM/DD labels)
    series = synthesize_series(days, month_seed, month_baseline)

    # Use series sum (after synth) as truth for the window total
    series_total = round(sum(pt["cost"] for pt in series), 2)
    window_total = series_total

    # Service breakdown for current and previous window
    current_services = split_by_service(window_total, month_seed)
    prev_services    = split_by_service(window_total * rng.uniform(0.92, 1.08), month_seed - 1)

    # Movers
    movers = calc_movers(current_services, prev_services)

    # Wow percent (prev N vs current N)
    prev_total = round(sum(s["value"] for s in prev_services), 2)
    wow = ((window_total - prev_total) / prev_total) * 100.0 if prev_total > 0 else 0.0

    # Savings and counts (believable ranges)
    savings_ready = round(window_total * rng.uniform(0.08, 0.14), 2)  # 8–14% of N-day total (≈ monthly potential)
    underutilized = int(20 + rng.random() * 40)  # 20–60
    orphans = int(8 + rng.random() * 18)         # 8–26

    # Key insights (project month end from last 7 days avg)
    last_7 = series[-7:] if len(series) >= 7 else series
    last_7_avg = sum(pt["cost"] for pt in last_7) / max(1, len(last_7))
    projected_month_end = round(last_7_avg * 30.0, 2)
    highest_pt = max(series, key=lambda p: p["cost"]) if series else {"formatted_date": "-", "cost": 0}

    # Build “top_products” for table (with WoW deltas and % of total)
    total_curr = max(1.0, sum(s["value"] for s in current_services))
    total_prev = max(1.0, sum(s["value"] for s in prev_services))
    prev_lookup = {s["name"]: s["value"] for s in prev_services}

    top_products = []
    for s in current_services:
        name = s["name"]
        curr_val = s["value"]
        prev_val = prev_lookup.get(name, 0.0)
        wow_delta = round(curr_val - prev_val, 2)
        pct_total = round((curr_val / total_curr) * 100.0, 1)
        top_products.append({
            "product": name,
            "amount_usd": curr_val,
            "wow_delta": wow_delta,
            "percent_of_total": pct_total,
        })
    # sort for table
    top_products.sort(key=lambda x: x["amount_usd"], reverse=True)

    # Findings: a few realistic items
    findings = [
        {
            "finding_id": "ri-m5-4xlarge",
            "title": "Reserved Instance opportunity for m5.4xlarge workloads",
            "type": "compute",
            "severity": "medium",
            "confidence": "high",
            "monthly_savings_usd_est": round(120 + rng.uniform(-20, 30), 2),
            "risk_level": "Low",
            "implementation_time": "4-6 hours",
            "last_analyzed": now_iso(),
            "methodology": "Analysis of 30-day usage patterns and RI pricing comparison",
            "evidence": {
                "resource_id": "i-0x9y8z7a6b5c4dabc",
                "instance_type": "m5.4xlarge",
                "region": "us-east-1",
            },
            "commands": [
                "aws ec2 describe-reserved-instances-offerings --instance-type m5.4xlarge --region us-east-1"
            ],
            "suggested_action": "Purchase 1-year RI for stable 24/7 workloads to reduce compute cost."
        },
        {
            "finding_id": "logs-retention",
            "title": "CloudWatch logs with indefinite retention",
            "type": "observability",
            "severity": "high",
            "confidence": "high",
            "monthly_savings_usd_est": round(60 + rng.uniform(-10, 20), 2),
            "risk_level": "Low",
            "implementation_time": "1-2 hours",
            "last_analyzed": now_iso(),
            "methodology": "Identify active log groups older than 180 days with hot retention.",
            "evidence": { "region": "us-west-2" },
            "commands": [
                "aws logs put-retention-policy --log-group-name <group> --retention-in-days 30"
            ],
            "suggested_action": "Set retention to 30–60 days for non-audit streams."
        },
        {
            "finding_id": "ebs-gp3",
            "title": "EBS gp2 volumes can be upgraded to gp3",
            "type": "storage",
            "severity": "low",
            "confidence": "medium",
            "monthly_savings_usd_est": round(40 + rng.uniform(-8, 15), 2),
            "risk_level": "Low",
            "implementation_time": "2-3 hours",
            "last_analyzed": now_iso(),
            "methodology": "Compare gp2 vs gp3 $/GB-month across attached volumes.",
            "evidence": { "region": "us-east-2" },
            "commands": [
                "aws ec2 modify-volume --volume-type gp3 --volume-id <vol-id>"
            ],
            "suggested_action": "Migrate gp2 volumes to gp3 where IOPS/throughput needs allow."
        },
    ]

    out = {
        "window": window_label,
        "series": series,
        "services_now": current_services,
        "services_prev": prev_services,
        "movers": movers,
        "findings": findings,
        "kpis": {
            "total_30d_cost": round(window_total, 2),
            "wow_percent": round(wow, 1),
            "mom_percent": round(wow * 0.6, 1),  # simple proxy
            "savings_ready_usd": savings_ready,
            "underutilized_count": underutilized,
            "orphans_count": orphans,
            "data_freshness_hours": rng.choice([0, 0.5, 1, 2]),
            "last_updated": now_iso(),
        },
        "top_products": top_products,
        "key_insights": {
            "highest_single_day": {
                "date": highest_pt["formatted_date"],
                "amount": round(highest_pt["cost"], 2),
            },
            "projected_month_end": projected_month_end,
            "mtd_actual": round(sum(pt["cost"] for pt in series[-min(len(series), datetime.now(TZ).day):]), 2),
            "monthly_budget": round(month_baseline * 1.08, 2),
            "budget_variance": round(projected_month_end - (month_baseline * 1.08), 2),
        },
        "generated_at": now_iso(),
    }
    return out

# ---------- API Routes ----------

@app.get("/api/summary")
def get_summary(window: str = Query("30d", regex="^(7d|30d|90d)$")):
    m = model_for_window(window)
    return {
        "kpis": m["kpis"],
        "top_products": m["top_products"],
        "recent_findings": m["findings"][:3],
        "window": window,
        "generated_at": m["generated_at"],
    }

@app.get("/api/cost-trend")
def get_cost_trend(days: int = Query(30, ge=7, le=90)):
    window = "7d" if days == 7 else ("30d" if days == 30 else "90d")
    m = model_for_window(window)
    # Ensure labels are in US mm/dd format (already done in synthesize_series)
    return m["series"]

@app.get("/api/service-breakdown")
def get_service_breakdown(window: str = Query("30d", regex="^(7d|30d|90d)$")):
    m = model_for_window(window)
    total = round(sum(s["value"] for s in m["services_now"]), 2)
    return {
        "data": m["services_now"],
        "total": total
    }

@app.get("/api/top-movers")
def get_top_movers(days: int = Query(7, ge=7, le=90)):
    window = "7d" if days == 7 else ("30d" if days == 30 else "90d")
    m = model_for_window(window)
    return m["movers"][:10]

# Alias to support earlier frontend versions
@app.get("/api/movers")
def get_movers(window: str = Query("7d", regex="^(7d|30d|90d)$")):
    m = model_for_window(window)
    return m["movers"][:10]

@app.get("/api/findings")
def get_findings(sort: str = "savings", limit: int = 50):
    m = model_for_window("30d")
    items = m["findings"]
    if sort == "savings":
        items = sorted(items, key=lambda x: x["monthly_savings_usd_est"], reverse=True)
    return items[:limit]

@app.get("/api/key-insights")
def get_key_insights(window: str = Query("30d", regex="^(7d|30d|90d)$")):
    m = model_for_window(window)
    return m["key_insights"]

@app.get("/")
def health():
    return {"status": "ok", "time": now_iso()}
