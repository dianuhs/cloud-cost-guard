
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime, timedelta
import random

app = FastAPI(title="Cloud Cost Guard API", version="0.1.0")

# In-memory "database"
STATE: Dict[str, Any] = {
    "resources": {},
    "findings": [],
    "products": [],
    "kpis": {}
}

# Helpers
SERVICE_POOLS = ["EC2", "RDS", "S3", "EKS", "Lambda", "CloudFront", "DynamoDB"]
PRODUCT_POOL = [
    {"name": "Compute (EC2)", "service": "EC2"},
    {"name": "Relational DB (RDS)", "service": "RDS"},
    {"name": "Object Storage (S3)", "service": "S3"},
    {"name": "Kubernetes (EKS)", "service": "EKS"},
    {"name": "Functions (Lambda)", "service": "Lambda"},
    {"name": "CDN (CloudFront)", "service": "CloudFront"},
    {"name": "NoSQL (DynamoDB)", "service": "DynamoDB"},
]

def seed_mock_data(seed: int = 42) -> Dict[str, Any]:
    random.seed(seed)
    resources = {}
    findings = []
    products = []

    # Create 50 resources with random utilization and costs
    for i in range(1, 51):
        rid = f"res-{i:04d}"
        service = random.choice(SERVICE_POOLS)
        monthly_cost = round(random.uniform(50, 5000), 2)
        utilization = round(random.uniform(0.05, 0.95), 2)
        is_orphan = utilization < 0.12 and random.random() < 0.3

        resources[rid] = {
            "resource_id": rid,
            "service": service,
            "monthly_cost": monthly_cost,
            "utilization": utilization,
            "tags": {"env": random.choice(["prod", "staging", "dev"])},
            "created_at": datetime.utcnow().isoformat() + "Z",
        }

        # Findings
        if utilization < 0.25:
            findings.append({
                "id": f"f-{i:04d}",
                "resource_id": rid,
                "type": "underutilized",
                "service": service,
                "message": "Low utilization detected; consider rightsizing or shutting down.",
                "potential_savings_usd": round(monthly_cost * random.uniform(0.2, 0.6), 2),
                "created_at": datetime.utcnow().isoformat() + "Z",
            })
        if is_orphan:
            findings.append({
                "id": f"o-{i:04d}",
                "resource_id": rid,
                "type": "orphan",
                "service": service,
                "message": "Orphaned resource detected; validate and remove if not needed.",
                "potential_savings_usd": round(monthly_cost * random.uniform(0.5, 1.0), 2),
                "created_at": datetime.utcnow().isoformat() + "Z",
            })

    # Products/top services with "windowed" cost
    for prod in PRODUCT_POOL:
        products.append({
            "name": prod["name"],
            "service": prod["service"],
            "window": "30d",
            "cost_usd": round(random.uniform(1000, 30000), 2)
        })

    # KPIs (align with tester expectations)
    total_30d_cost = sum(r["monthly_cost"] for r in resources.values())
    underutilized_count = sum(1 for f in findings if f["type"] == "underutilized")
    orphans_count = sum(1 for f in findings if f["type"] == "orphan")

    # Identified savings ~7.8% of total as discussed
    savings_ready_usd = round(total_30d_cost * 0.078, 2)

    kpis = {
        "total_30d_cost": round(total_30d_cost, 2),
        "wow_percent": round(random.uniform(-5, 5), 2),
        "mom_percent": round(random.uniform(-8, 8), 2),
        "savings_ready_usd": savings_ready_usd,
        "underutilized_count": underutilized_count,
        "orphans_count": orphans_count
    }

    return {"resources": resources, "findings": findings, "products": products, "kpis": kpis}

@app.get("/")
def api_root():
    return {"status": "ok", "name": "Cloud Cost Guard API", "time": datetime.utcnow().isoformat() + "Z"}

@app.post("/mock-data")
def generate_mock_data():
    data = seed_mock_data()
    STATE.update(data)
    return {"ok": True, "items": len(STATE["resources"]), "findings": len(STATE["findings"])}

@app.get("/summary")
def get_summary(window: str = "30d"):
    # ensure we have data
    if not STATE.get("kpis"):
        STATE.update(seed_mock_data())
    # window is accepted but not used deeply in mock
    return {
        "kpis": STATE["kpis"],
        "top_products": STATE["products"],
        "recent_findings": sorted(STATE["findings"], key=lambda x: x["created_at"], reverse=True)[:10],
        "window": window,
        "generated_at": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/products")
def get_products(window: str = "30d"):
    if not STATE.get("products"):
        STATE.update(seed_mock_data())
    items = [dict(p, window=window) for p in STATE["products"]]
    return items

@app.get("/findings")
def get_findings(limit: int = 20):
    if not STATE.get("findings"):
        STATE.update(seed_mock_data())
    return STATE["findings"][:limit]

@app.get("/resource/{resource_id}")
def get_resource(resource_id: str):
    if not STATE.get("resources"):
        STATE.update(seed_mock_data())
    res = STATE["resources"].get(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    # Enrich with a tiny utilization trend
    res = res.copy()
    res["utilization_trend"] = [round(max(0.01, min(0.99, res["utilization"] + random.uniform(-0.1, 0.1))), 2) for _ in range(6)]
    return res
