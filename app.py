from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
import math
import random

app = FastAPI(title="Cloud Cost Guard API", version="1.0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later to your Vercel domain if you want
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TZ = timezone.utc

AWS_SERVICES = [
    ("EC2-Instance", 0.465),
    ("RDS",          0.242),
    ("EBS",          0.095),
    ("ELB",          0.058),
    ("S3",           0.046),
    ("CloudWatch",   0.039),
]

PALETTE = ["#8B6F47","#B5905C","#D8C3A5","#A8A7A7","#E98074","#C0B283","#F4E1D2","#E6B89C"]

def mmdd(d: datetime) -> str:
    return d.strftime("%m/%d")

def seed_for_month(dt: datetime) -> int:
    return int(dt.strftime("%Y%m"))

def window_days(label: str) -> int:
    return 7 if label == "7d" else (30 if label == "30d" else 90)

def synthesize_series(days: int, month_seed: int, base_month_total: float) -> List[Dict[str, Any]]:
    rng = random.Random(month_seed + days)
    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days-1)

    target_total = base_month_total * (days / 30.0)
    avg = target_total / days

    raw_series = []
    drift = rng.uniform(-0.004, 0.006)
    for i in range(days):
        d = start + timedelta(days=i)
        dow = d.weekday()
        weekly = 1.0
        if dow >= 5: weekly *= 0.82
        elif dow in (2, 3): weekly *= 1.05

        wobble = 1.0 + 0.03 * math.sin(i / 2.7)
        noise = rng.uniform(-0.04, 0.04)
        spike = 1.0
        if rng.random() < (1.0/12.0):
            spike = rng.uniform(1.10, 1.22)
        factor = (1.0 + drift) ** i

        value = avg * weekly * wobble * factor * (1.0 + noise) * spike
        raw_series.append({"date": d, "cost": max(0, value)})

    s = sum(pt["cost"] for pt in raw_series) or 1.0
    norm = target_total / s
    series = []
    for pt in raw_series:
        v = round(pt["cost"] * norm, 2)
        series.append({
            "formatted_date": mmdd(pt["date"]),      # MM/DD for chart axis
            "date_iso": pt["date"].date().isoformat(),  # YYYY-MM-DD for insights
            "cost": v
        })
    return series

def split_by_service(total_amount: float, month_seed: int) -> List[Dict[str, Any]]:
    rng = random.Random(month_seed + 999)
    parts = []
    for name, share in AWS_SERVICES:
        jitter = rng.uniform(-0.03, 0.03)
        parts.append((name, max(0.01, share * (1.0 + jitter))))
    total_share = sum(s for _, s in parts)
    parts = [(n, s/total_share) for (n, s) in parts]

    used = 0.0
    out = []
    for i, (name, share) in enumerate(parts):
        amt = round(total_amount * share, 2)
        out.append({
            "name": name,
            "value": amt,
            "percentage": round(share * 100.0, 1),
            "fill": PALETTE[i % len(PALETTE)]
        })
        used += amt
    residue = round(total_amount - used, 2)
    if out:
        out[0]["value"] = round(out[0]["value"] + residue, 2)
    return out

def calc_movers(now_services: List[Dict[str, Any]], prev_services: List[Dict[str, Any]]):
    prev_map = {s["name"]: s["value"] for s in prev_services}
    now_map = {s["name"]: s["value"] for s in now_services}
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
    movers.sort(key=lambda m: abs(m["change_amount"]), reverse=True)
    return movers

def now_iso() -> str:
    return datetime.now(TZ).isoformat()

def model_for_window(window_label: str) -> Dict[str, Any]:
    days = window_days(window_label)
    today = datetime.now(TZ)
    month_seed = seed_for_month(today)

    rng = random.Random(month_seed)
    month_baseline = 150_000.0 * rng.uniform(0.9, 1.1)

    series = synthesize_series(days, month_seed, month_baseline)
    window_total = round(sum(pt["cost"] for pt in series), 2)

    current_services = split_by_service(window_total, month_seed)
    prev_services = split_by_service(window_total * rng.uniform(0.92, 1.08), month_seed - 1)
    movers = calc_movers(current_services, prev_services)

    prev_total = round(sum(s["value"] for s in prev_services), 2)
    wow = ((window_total - prev_total) / prev_total) * 100.0 if prev_total > 0 else 0.0

    savings_ready = round(window_total * rng.uniform(0.08, 0.14), 2)
    underutilized = int(20 + rng.random() * 40)
    orphans = int(8 + rng.random() * 18)

    # Highest day date in "Aug 21, 2025"
    highest_pt = max(series, key=lambda p: p["cost"]) if series else {"date_iso": None, "cost": 0}
    highest_date_str = "-"
    if highest_pt.get("date_iso"):
        d = datetime.fromisoformat(highest_pt["date_iso"])
        highest_date_str = d.strftime("%b %d, %Y")

    monthly_budget = 180000.00
    last_7 = series[-7:] if len(series) >= 7 else series
    last_7_avg = (sum(pt["cost"] for pt in last_7) / max(1, len(last_7))) if last_7 else 0.0
    projected_month_end = round(last_7_avg * 30.0, 2)

    # Top products (for Products tab)
    total_curr = max(1.0, sum(s["value"] for s in current_services))
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
    top_products.sort(key=lambda x: x["amount_usd"], reverse=True)

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
        # (two more example findings omitted for brevity)
    ]

    return {
        "window": window_label,
        "series": series,
        "services_now": current_services,
        "services_prev": prev_services,
        "movers": movers,
        "findings": findings,
        "kpis": {
            "total_30d_cost": round(window_total, 2),
            "wow_percent": round(wow, 1),
            "mom_percent": round(wow * 0.6, 1),
            "savings_ready_usd": savings_ready,
            "underutilized_count": underutilized,
            "orphans_count": orphans,
            "data_freshness_hours": 0,  # ALWAYS LIVE
            "last_updated": now_iso(),
        },
        "top_products": top_products,
        "key_insights": {
            "highest_single_day": {
                "date": highest_date_str,                   # "Aug 21, 2025"
                "amount": round(highest_pt["cost"], 2),
            },
            "projected_month_end": projected_month_end,
            "mtd_actual": round(sum(pt["cost"] for pt in series[-min(len(series), datetime.now(TZ).day):]), 2),
            "monthly_budget": monthly_budget,              # $180,000
            "budget_variance": round(projected_month_end - monthly_budget, 2),
        },
        "generated_at": now_iso(),
    }

# ---------- API ROUTES ----------

@app.get("/api/summary")
def get_summary(window: str = Query("30d", pattern="^(7d|30d|90d)$")):
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
    return m["series"]

@app.get("/api/service-breakdown")
def get_service_breakdown(window: str = Query("30d", pattern="^(7d|30d|90d)$")):
    m = model_for_window(window)
    total = round(sum(s["value"] for s in m["services_now"]), 2)
    return {"data": m["services_now"], "total": total}

@app.get("/api/top-movers")
def get_top_movers(days: int = Query(7, ge=7, le=90)):
    window = "7d" if days == 7 else ("30d" if days == 30 else "90d")
    m = model_for_window(window)
    return m["movers"][:10]

# Frontend-compatible alias (so either endpoint works)
@app.get("/api/movers")
def get_movers(window: str = Query("7d", pattern="^(7d|30d|90d)$")):
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
def get_key_insights(window: str = Query("30d", pattern="^(7d|30d|90d)$")):
    m = model_for_window(window)
    return m["key_insights"]

@app.get("/")
def health():
    return {"status": "ok", "time": now_iso()}

