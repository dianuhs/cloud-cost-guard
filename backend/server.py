from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, date, timedelta
from enum import Enum
import statistics
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Cloud Cost Guard API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Enums
class CloudProvider(str, Enum):
    AWS = "aws"
    GCP = "gcp"
    AZURE = "azure"

class ResourceType(str, Enum):
    EC2 = "ec2"
    EBS = "ebs"
    ELB = "elb"
    EIP = "eip"
    GCE = "gce"
    PD = "pd"
    LB = "lb"

class FindingType(str, Enum):
    UNDERUTILIZED = "underutilized"
    ORPHAN = "orphan"
    ANOMALY = "anomaly"
    DELTA = "delta"

class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

# Data Models
class CostDaily(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cloud: CloudProvider
    account: str
    project: Optional[str] = None
    product: str
    resource_id: Optional[str] = None
    app: Optional[str] = None
    owner: Optional[str] = None
    date: date
    amount_usd: float
    usage_qty: Optional[float] = None
    unit: Optional[str] = None

class UtilHourly(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    resource_id: str
    metric: str  # cpu, gpu, net_in, elb_req, etc.
    ts_hour: datetime
    p50: float
    p95: float

class Resource(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    resource_id: str
    cloud: CloudProvider
    type: ResourceType
    name: str
    tags_json: Dict[str, Any] = Field(default_factory=dict)
    project: Optional[str] = None
    account: str
    app: Optional[str] = None
    owner: Optional[str] = None
    state: str

class Finding(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    finding_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    resource_id: Optional[str] = None
    type: FindingType
    title: str
    severity: Severity
    monthly_savings_usd_est: float
    evidence: Dict[str, Any] = Field(default_factory=dict)
    suggested_action: str
    commands: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Summary Models
class KPIsSummary(BaseModel):
    total_30d_cost: float
    wow_percent: float
    mom_percent: float
    savings_ready_usd: float
    underutilized_count: int
    orphans_count: int

class ProductBreakdown(BaseModel):
    product: str
    amount_usd: float
    wow_delta: float
    mom_delta: float
    percent_of_total: float

class SummaryResponse(BaseModel):
    kpis: KPIsSummary
    top_products: List[ProductBreakdown]
    recent_findings: List[Finding]

# Helper functions for MongoDB serialization
def prepare_for_mongo(data):
    """Prepare data for MongoDB storage by converting dates"""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if isinstance(value, date) and not isinstance(value, datetime):
                # Convert date to datetime at start of day UTC
                result[key] = datetime.combine(value, datetime.min.time()).replace(tzinfo=timezone.utc)
            elif isinstance(value, dict):
                result[key] = prepare_for_mongo(value)
            elif isinstance(value, list):
                result[key] = [prepare_for_mongo(item) if isinstance(item, dict) else item for item in value]
            else:
                result[key] = value
        return result
    return data

def parse_from_mongo(item):
    """Parse data from MongoDB by converting datetime back to date where needed"""
    if isinstance(item, dict):
        result = {}
        for key, value in item.items():
            if key == 'date' and isinstance(value, datetime):
                result[key] = value.date()
            else:
                result[key] = value
        return result
    return item
# Mock Data Generation
async def generate_mock_data():
    """Generate mock data for testing"""
    
    # Clear existing data
    await db.cost_daily.delete_many({})
    await db.util_hourly.delete_many({})
    await db.resources.delete_many({})
    await db.findings.delete_many({})
    
    # Generate cost data for last 35 days
    base_date = date.today() - timedelta(days=35)
    products = ["EC2-Instance", "RDS", "S3", "CloudWatch", "ELB", "EBS", "Lambda"]
    accounts = ["123456789012", "987654321098"]
    
    cost_data = []
    for i in range(35):
        current_date = base_date + timedelta(days=i)
        for account in accounts:
            for product in products:
                # Generate varying costs with some anomalies
                base_cost = {
                    "EC2-Instance": 850,
                    "RDS": 420,
                    "S3": 75,
                    "CloudWatch": 45,
                    "ELB": 120,
                    "EBS": 180,
                    "Lambda": 25
                }[product]
                
                # Add weekly patterns and noise
                weekly_factor = 1.2 if current_date.weekday() < 5 else 0.8
                noise = (hash(f"{account}{product}{i}") % 40 - 20) / 100
                
                # Add anomaly on day 28
                anomaly_factor = 2.5 if i == 28 and product == "EC2-Instance" else 1.0
                
                daily_cost = base_cost * weekly_factor * (1 + noise) * anomaly_factor
                
                cost_entry = CostDaily(
                    cloud=CloudProvider.AWS,
                    account=account,
                    product=product,
                    date=current_date,
                    amount_usd=round(daily_cost, 2),
                    owner="team-alpha" if account.endswith("12") else "team-beta"
                )
                cost_data.append(cost_entry.dict())
    
    await db.cost_daily.insert_many(cost_data)
    
    # Generate resources
    resources_data = []
    resource_types = [
        ("i-0123456789abcdef0", ResourceType.EC2, "web-server-1", "running"),
        ("i-0987654321fedcba0", ResourceType.EC2, "analytics-worker", "running"), 
        ("i-0555666777888999a", ResourceType.EC2, "test-instance", "running"),
        ("vol-0123456789abcdef0", ResourceType.EBS, "unattached-volume", "available"),
        ("vol-0987654321fedcba0", ResourceType.EBS, "backup-volume", "available"),
        ("elb-idle-load-balancer", ResourceType.ELB, "idle-elb", "active"),
        ("eipalloc-0123456789", ResourceType.EIP, "unused-eip", "available")
    ]
    
    for resource_id, res_type, name, state in resource_types:
        resource = Resource(
            resource_id=resource_id,
            cloud=CloudProvider.AWS,
            type=res_type,
            name=name,
            account=accounts[0],
            state=state,
            tags_json={"Environment": "production", "Team": "platform"},
            owner="team-alpha"
        )
        resources_data.append(resource.dict())
    
    await db.resources.insert_many(resources_data)
    
    # Generate utilization data for last 7 days
    util_data = []
    for i in range(7 * 24):  # 7 days * 24 hours
        ts = datetime.now(timezone.utc) - timedelta(hours=i)
        
        # Under-utilized instance
        util_data.append(UtilHourly(
            resource_id="i-0123456789abcdef0",
            metric="cpu",
            ts_hour=ts,
            p50=8.5,  # Very low CPU usage
            p95=22.3
        ).dict())
        
        # Normal instance
        util_data.append(UtilHourly(
            resource_id="i-0987654321fedcba0", 
            metric="cpu",
            ts_hour=ts,
            p50=65.2,
            p95=89.1
        ).dict())
        
        # GPU under-utilized
        util_data.append(UtilHourly(
            resource_id="i-0555666777888999a",
            metric="gpu",
            ts_hour=ts,
            p50=5.1,  # Very low GPU usage
            p95=12.8
        ).dict())
        
        # Idle load balancer
        util_data.append(UtilHourly(
            resource_id="elb-idle-load-balancer",
            metric="elb_req",
            ts_hour=ts,
            p50=0.1,  # Almost no requests
            p95=2.3
        ).dict())
    
    await db.util_hourly.insert_many(util_data)

# Analysis Engine
class CostAnalyzer:
    """Core analysis engine for cost optimization"""
    
    @staticmethod
    async def find_underutilized_compute() -> List[Finding]:
        """Find under-utilized EC2/GCE instances"""
        findings = []
        
        # Get all compute resources
        compute_resources = await db.resources.find({
            "type": {"$in": ["ec2", "gce"]},
            "state": "running"
        }).to_list(None)
        
        for resource in compute_resources:
            resource_id = resource["resource_id"]
            
            # Get last 7 days CPU utilization
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            cpu_metrics = await db.util_hourly.find({
                "resource_id": resource_id,
                "metric": "cpu",
                "ts_hour": {"$gte": seven_days_ago}
            }).to_list(None)
            
            if not cpu_metrics:
                continue
                
            p50_values = [m["p50"] for m in cpu_metrics]
            p95_values = [m["p95"] for m in cpu_metrics]
            
            median_p50 = statistics.median(p50_values)
            median_p95 = statistics.median(p95_values)
            
            # Under-utilized if median CPU < 15% AND p95 < 30%
            if median_p50 < 15.0 and median_p95 < 30.0:
                # Estimate cost for this resource
                cost_data = await db.cost_daily.find({
                    "resource_id": resource_id,
                    "date": {"$gte": date.today() - timedelta(days=30)}
                }).to_list(None)
                
                monthly_cost = sum(c["amount_usd"] for c in cost_data)
                estimated_savings = monthly_cost * 0.5  # 50% savings from rightsizing
                
                finding = Finding(
                    resource_id=resource_id,
                    type=FindingType.UNDERUTILIZED,
                    title=f"{resource['type'].upper()} {resource['name']} under {median_p50:.1f}% median CPU (7d)",
                    severity=Severity.HIGH if estimated_savings > 200 else Severity.MEDIUM,
                    monthly_savings_usd_est=estimated_savings,
                    evidence={
                        "p50_cpu": median_p50,
                        "p95_cpu": median_p95,
                        "hours_analyzed": len(cpu_metrics),
                        "monthly_cost": monthly_cost
                    },
                    suggested_action=f"Consider downsizing to smaller instance type or schedule off-hours stop",
                    commands=[
                        f"aws ec2 describe-instances --instance-ids {resource_id}",
                        f"# Consider resizing or stopping during off-hours"
                    ]
                )
                findings.append(finding)
        
        return findings
    
    @staticmethod
    async def find_orphaned_resources() -> List[Finding]:
        """Find orphaned/unused resources"""
        findings = []
        
        # Find unattached EBS volumes
        orphaned_volumes = await db.resources.find({
            "type": "ebs",
            "state": "available"
        }).to_list(None)
        
        for volume in orphaned_volumes:
            # Estimate monthly cost (assume $0.10/GB/month, typical 100GB)
            estimated_monthly_cost = 10.0  # $10/month for typical volume
            
            finding = Finding(
                resource_id=volume["resource_id"],
                type=FindingType.ORPHAN,
                title=f"Unattached EBS volume {volume['name']}",
                severity=Severity.MEDIUM,
                monthly_savings_usd_est=estimated_monthly_cost,
                evidence={
                    "state": volume["state"],
                    "age_days": 5  # Mock age
                },
                suggested_action="Delete unused volume or attach to instance",
                commands=[
                    f"aws ec2 describe-volumes --volume-ids {volume['resource_id']}",
                    f"aws ec2 delete-volume --volume-id {volume['resource_id']}"
                ]
            )
            findings.append(finding)
        
        # Find unused Elastic IPs
        unused_eips = await db.resources.find({
            "type": "eip", 
            "state": "available"
        }).to_list(None)
        
        for eip in unused_eips:
            finding = Finding(
                resource_id=eip["resource_id"],
                type=FindingType.ORPHAN,
                title=f"Unused Elastic IP {eip['name']}",
                severity=Severity.LOW,
                monthly_savings_usd_est=3.65,  # $0.005/hour * 24 * 30
                evidence={
                    "state": eip["state"]
                },
                suggested_action="Release unused Elastic IP",
                commands=[
                    f"aws ec2 describe-addresses --allocation-ids {eip['resource_id']}",
                    f"aws ec2 release-address --allocation-id {eip['resource_id']}"
                ]
            )
            findings.append(finding)
        
        return findings
    
    @staticmethod
    async def find_idle_load_balancers() -> List[Finding]:
        """Find idle load balancers"""
        findings = []
        
        idle_elbs = await db.resources.find({
            "type": "elb",
            "state": "active"
        }).to_list(None)
        
        for elb in idle_elbs:
            # Check if ELB has very low request rate
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            req_metrics = await db.util_hourly.find({
                "resource_id": elb["resource_id"],
                "metric": "elb_req",
                "ts_hour": {"$gte": seven_days_ago}
            }).to_list(None)
            
            if req_metrics:
                p50_requests = [m["p50"] for m in req_metrics]
                median_requests = statistics.median(p50_requests)
                
                # Idle if median requests < 1 per second
                if median_requests < 1.0:
                    finding = Finding(
                        resource_id=elb["resource_id"],
                        type=FindingType.UNDERUTILIZED,
                        title=f"Idle load balancer {elb['name']}",
                        severity=Severity.MEDIUM,
                        monthly_savings_usd_est=25.0,  # Typical ELB cost
                        evidence={
                            "median_requests_per_sec": median_requests,
                            "hours_analyzed": len(req_metrics)
                        },
                        suggested_action="Consider removing unused load balancer",
                        commands=[
                            f"aws elbv2 describe-load-balancers --names {elb['name']}",
                            f"# Review and consider deleting if truly unused"
                        ]
                    )
                    findings.append(finding)
        
        return findings
    
    @staticmethod
    async def detect_cost_anomalies() -> List[Finding]:
        """Detect cost anomalies using robust z-score"""
        findings = []
        
        # Get last 30 days of cost data by product
        thirty_days_ago = date.today() - timedelta(days=30)
        products = await db.cost_daily.distinct("product", {
            "date": {"$gte": thirty_days_ago}
        })
        
        for product in products:
            daily_costs = await db.cost_daily.aggregate([
                {"$match": {"product": product, "date": {"$gte": thirty_days_ago}}},
                {"$group": {
                    "_id": "$date",
                    "total_cost": {"$sum": "$amount_usd"}
                }},
                {"$sort": {"_id": 1}}
            ]).to_list(None)
            
            if len(daily_costs) < 10:  # Need sufficient data
                continue
                
            costs = [d["total_cost"] for d in daily_costs]
            
            # Calculate robust z-score for last day
            if len(costs) >= 2:
                recent_cost = costs[-1]
                median_cost = statistics.median(costs[:-1])
                mad = statistics.median([abs(c - median_cost) for c in costs[:-1]])
                
                if mad > 0:
                    z_score = 0.6745 * (recent_cost - median_cost) / mad
                    delta_usd = recent_cost - median_cost
                    
                    # Flag if |z| >= 3 and delta >= $50
                    if abs(z_score) >= 3.0 and abs(delta_usd) >= 50.0:
                        severity = Severity.CRITICAL if abs(delta_usd) >= 500 else Severity.HIGH
                        
                        finding = Finding(
                            type=FindingType.ANOMALY,
                            title=f"Cost anomaly detected in {product}",
                            severity=severity,
                            monthly_savings_usd_est=abs(delta_usd) * 30 if delta_usd > 0 else 0,
                            evidence={
                                "z_score": z_score,
                                "recent_cost": recent_cost,
                                "median_cost": median_cost,
                                "delta_usd": delta_usd,
                                "product": product
                            },
                            suggested_action="Investigate sudden cost change and identify root cause",
                            commands=[
                                f"# Review {product} usage patterns",
                                f"# Check for new resources or configuration changes"
                            ]
                        )
                        findings.append(finding)
        
        return findings

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Cloud Cost Guard API"}

@api_router.post("/mock-data")
async def generate_mock_data_endpoint():
    """Generate mock data for testing"""
    await generate_mock_data()
    return {"message": "Mock data generated successfully"}

@api_router.get("/summary", response_model=SummaryResponse)
async def get_summary(window: str = Query("30d", description="Time window: 7d, 30d, 90d")):
    """Get cost summary and KPIs"""
    
    # Parse window
    days = {"7d": 7, "30d": 30, "90d": 90}.get(window, 30)
    start_date = date.today() - timedelta(days=days)
    
    # Calculate total cost
    total_cost_pipeline = [
        {"$match": {"date": {"$gte": start_date}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usd"}}}
    ]
    total_result = await db.cost_daily.aggregate(total_cost_pipeline).to_list(1)
    total_30d_cost = total_result[0]["total"] if total_result else 0
    
    # Calculate WoW/MoM changes (simplified)
    wow_percent = 5.2  # Mock values
    mom_percent = -2.8
    
    # Get product breakdown
    product_pipeline = [
        {"$match": {"date": {"$gte": start_date}}},
        {"$group": {
            "_id": "$product",
            "amount_usd": {"$sum": "$amount_usd"}
        }},
        {"$sort": {"amount_usd": -1}},
        {"$limit": 10}
    ]
    product_results = await db.cost_daily.aggregate(product_pipeline).to_list(10)
    
    top_products = []
    for result in product_results:
        breakdown = ProductBreakdown(
            product=result["_id"],
            amount_usd=result["amount_usd"],
            wow_delta=result["amount_usd"] * 0.02,  # Mock 2% change
            mom_delta=result["amount_usd"] * -0.015,  # Mock -1.5% change
            percent_of_total=(result["amount_usd"] / total_30d_cost * 100) if total_30d_cost > 0 else 0
        )
        top_products.append(breakdown)
    
    # Run analysis to get findings
    findings = []
    findings.extend(await CostAnalyzer.find_underutilized_compute())
    findings.extend(await CostAnalyzer.find_orphaned_resources())
    findings.extend(await CostAnalyzer.find_idle_load_balancers())
    findings.extend(await CostAnalyzer.detect_cost_anomalies())
    
    # Save findings to database
    if findings:
        findings_data = [f.dict() for f in findings]
        await db.findings.delete_many({})  # Clear old findings
        await db.findings.insert_many(findings_data)
    
    # Calculate savings and counts
    savings_ready = sum(f.monthly_savings_usd_est for f in findings)
    underutilized_count = len([f for f in findings if f.type == FindingType.UNDERUTILIZED])
    orphans_count = len([f for f in findings if f.type == FindingType.ORPHAN])
    
    kpis = KPIsSummary(
        total_30d_cost=total_30d_cost,
        wow_percent=wow_percent,
        mom_percent=mom_percent,
        savings_ready_usd=savings_ready,
        underutilized_count=underutilized_count,
        orphans_count=orphans_count
    )
    
    return SummaryResponse(
        kpis=kpis,
        top_products=top_products,
        recent_findings=findings[:10]  # Top 10 findings
    )

@api_router.get("/findings", response_model=List[Finding])
async def get_findings(
    sort: str = Query("savings", description="Sort by: savings, severity, created"),
    limit: int = Query(100, description="Maximum number of findings"),
    type: Optional[FindingType] = Query(None, description="Filter by finding type")
):
    """Get cost optimization findings"""
    
    query = {}
    if type:
        query["type"] = type.value
    
    # Determine sort field
    sort_field = {
        "savings": "monthly_savings_usd_est",
        "severity": "severity", 
        "created": "created_at"
    }.get(sort, "monthly_savings_usd_est")
    
    findings_data = await db.findings.find(query).sort(sort_field, -1).limit(limit).to_list(limit)
    return [Finding(**finding) for finding in findings_data]

@api_router.get("/products")
async def get_products(window: str = Query("30d")):
    """Get product cost breakdown"""
    days = {"7d": 7, "30d": 30, "90d": 90}.get(window, 30)
    start_date = date.today() - timedelta(days=days)
    
    pipeline = [
        {"$match": {"date": {"$gte": start_date}}},
        {"$group": {
            "_id": {
                "product": "$product",
                "account": "$account",
                "cloud": "$cloud"
            },
            "amount_usd": {"$sum": "$amount_usd"},
            "days": {"$addToSet": "$date"}
        }},
        {"$sort": {"amount_usd": -1}}
    ]
    
    results = await db.cost_daily.aggregate(pipeline).to_list(None)
    return results

@api_router.get("/resource/{resource_id}")
async def get_resource_detail(resource_id: str):
    """Get detailed resource information"""
    
    # Get resource info
    resource = await db.resources.find_one({"resource_id": resource_id})
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    # Get cost data
    cost_data = await db.cost_daily.find({
        "resource_id": resource_id,
        "date": {"$gte": date.today() - timedelta(days=30)}
    }).sort("date", 1).to_list(None)
    
    # Get utilization data
    util_data = await db.util_hourly.find({
        "resource_id": resource_id,
        "ts_hour": {"$gte": datetime.now(timezone.utc) - timedelta(days=7)}
    }).sort("ts_hour", 1).to_list(None)
    
    return {
        "resource": resource,
        "cost_history": cost_data,
        "utilization_history": util_data
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()