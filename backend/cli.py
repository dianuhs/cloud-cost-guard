#!/usr/bin/env python3
"""
Cloud Cost Guard CLI Tool

Analyzes cloud costs and provides actionable recommendations for optimization.
Outputs findings ranked by $ savings with copy-paste commands.
"""

import asyncio
import sys
import os
import json
import csv
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import List, Dict, Any
import click
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Add the backend path to allow imports
sys.path.append(str(Path(__file__).parent))
from server import (
    CostAnalyzer, Finding, FindingType, Severity,
    db, mongo_url, generate_mock_data
)

class CostGuardCLI:
    """Main CLI class for Cloud Cost Guard"""
    
    def __init__(self):
        self.db = None
    
    async def connect_db(self):
        """Connect to MongoDB"""
        ROOT_DIR = Path(__file__).parent
        load_dotenv(ROOT_DIR / '.env')
        
        mongo_url = os.environ['MONGO_URL']
        client = AsyncIOMotorClient(mongo_url)
        self.db = client[os.environ['DB_NAME']]
    
    async def run_analysis(self) -> List[Finding]:
        """Run full cost analysis and return findings"""
        print("🔍 Running cost optimization analysis...")
        
        findings = []
        
        # Run all analysis modules
        print("  • Analyzing under-utilized compute resources...")
        findings.extend(await CostAnalyzer.find_underutilized_compute())
        
        print("  • Finding orphaned resources...")
        findings.extend(await CostAnalyzer.find_orphaned_resources())
        
        print("  • Detecting idle load balancers...")
        findings.extend(await CostAnalyzer.find_idle_load_balancers())
        
        print("  • Analyzing cost anomalies...")
        findings.extend(await CostAnalyzer.detect_cost_anomalies())
        
        # Sort by savings potential
        findings.sort(key=lambda x: x.monthly_savings_usd_est, reverse=True)
        
        return findings
    
    def generate_markdown_report(self, findings: List[Finding]) -> str:
        """Generate markdown report"""
        total_savings = sum(f.monthly_savings_usd_est for f in findings)
        
        report = f"""# Cloud Cost Guard Analysis Report

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 📊 Executive Summary

- **Total Potential Savings:** ${total_savings:,.2f}/month
- **Findings:** {len(findings)} optimization opportunities
- **High Priority:** {len([f for f in findings if f.severity in [Severity.HIGH, Severity.CRITICAL]])} findings

## 🎯 Top Findings (Ranked by $ Savings)

"""
        
        for i, finding in enumerate(findings[:10], 1):
            severity_emoji = {
                Severity.CRITICAL: "🚨",
                Severity.HIGH: "🔴", 
                Severity.MEDIUM: "🟡",
                Severity.LOW: "🟢"
            }[finding.severity]
            
            report += f"""### {i}. {severity_emoji} {finding.title}

**Monthly Savings:** ${finding.monthly_savings_usd_est:,.2f}  
**Severity:** {finding.severity.value.upper()}  
**Type:** {finding.type.value.title()}

**Action Required:** {finding.suggested_action}

**Commands:**
```bash
{chr(10).join(finding.commands)}
```

**Evidence:**
```json
{json.dumps(finding.evidence, indent=2)}
```

---

"""
        
        # Add breakdown by type
        type_breakdown = {}
        for finding in findings:
            finding_type = finding.type.value
            if finding_type not in type_breakdown:
                type_breakdown[finding_type] = {'count': 0, 'savings': 0}
            type_breakdown[finding_type]['count'] += 1
            type_breakdown[finding_type]['savings'] += finding.monthly_savings_usd_est
        
        report += "\n## 📈 Breakdown by Type\n\n"
        for finding_type, data in type_breakdown.items():
            report += f"- **{finding_type.title()}:** {data['count']} findings, ${data['savings']:,.2f}/month potential savings\n"
        
        return report
    
    def generate_csv_report(self, findings: List[Finding], filename: str):
        """Generate CSV report for finance teams"""
        with open(filename, 'w', newline='') as csvfile:
            fieldnames = [
                'finding_id', 'type', 'title', 'severity', 'monthly_savings_usd',
                'resource_id', 'suggested_action', 'commands', 'evidence'
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for finding in findings:
                writer.writerow({
                    'finding_id': finding.finding_id,
                    'type': finding.type.value,
                    'title': finding.title,
                    'severity': finding.severity.value,
                    'monthly_savings_usd': finding.monthly_savings_usd_est,
                    'resource_id': finding.resource_id or '',
                    'suggested_action': finding.suggested_action,
                    'commands': '; '.join(finding.commands),
                    'evidence': json.dumps(finding.evidence)
                })
    
    async def get_summary_stats(self) -> Dict[str, Any]:
        """Get summary statistics"""
        await self.connect_db()
        
        # Get total 30d cost
        thirty_days_ago = date.today() - timedelta(days=30)
        total_cost_pipeline = [
            {"$match": {"date": {"$gte": thirty_days_ago}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount_usd"}}}
        ]
        total_result = await self.db.cost_daily.aggregate(total_cost_pipeline).to_list(1)
        total_cost = total_result[0]["total"] if total_result else 0
        
        # Get resource counts
        resource_counts = await self.db.resources.count_documents({})
        
        return {
            'total_30d_cost': total_cost,
            'total_resources': resource_counts,
            'analysis_date': datetime.now().isoformat()
        }

# CLI Commands
@click.group()
def cli():
    """Cloud Cost Guard - Multi-cloud cost optimization tool"""
    pass

@cli.command()
@click.option('--output', '-o', default='cost-analysis-report.md', help='Output markdown file')
@click.option('--csv', default='cost-findings.csv', help='Output CSV file for finance')
@click.option('--top', default=10, help='Number of top findings to display')
def analyze(output: str, csv: str, top: int):
    """Run cost analysis and generate reports"""
    
    async def run_analysis():
        guard = CostGuardCLI()
        await guard.connect_db()
        
        # Run analysis
        findings = await guard.run_analysis()
        
        if not findings:
            print("✅ No cost optimization opportunities found!")
            return
        
        total_savings = sum(f.monthly_savings_usd_est for f in findings)
        
        print(f"\n🎉 Analysis Complete!")
        print(f"📊 Found {len(findings)} optimization opportunities")
        print(f"💰 Total potential savings: ${total_savings:,.2f}/month")
        
        # Generate markdown report
        markdown_report = guard.generate_markdown_report(findings)
        with open(output, 'w') as f:
            f.write(markdown_report)
        print(f"📝 Markdown report saved to: {output}")
        
        # Generate CSV report
        guard.generate_csv_report(findings, csv)
        print(f"📊 CSV report saved to: {csv}")
        
        # Print top findings summary
        print(f"\n🔝 Top {min(top, len(findings))} Findings:")
        print("=" * 80)
        
        for i, finding in enumerate(findings[:top], 1):
            severity_icon = {
                Severity.CRITICAL: "🚨",
                Severity.HIGH: "🔴",
                Severity.MEDIUM: "🟡", 
                Severity.LOW: "🟢"
            }[finding.severity]
            
            print(f"{i}. {severity_icon} {finding.title}")
            print(f"   💰 Savings: ${finding.monthly_savings_usd_est:,.2f}/month")
            print(f"   🎯 Action: {finding.suggested_action}")
            if finding.commands:
                print(f"   💻 Command: {finding.commands[0]}")
            print()
    
    asyncio.run(run_analysis())

@cli.command()
def summary():
    """Show quick cost summary"""
    
    async def show_summary():
        guard = CostGuardCLI()
        stats = await guard.get_summary_stats()
        
        print("☁️  Cloud Cost Guard Summary")
        print("=" * 40)
        print(f"💰 Total 30d Cost: ${stats['total_30d_cost']:,.2f}")
        print(f"🖥️  Total Resources: {stats['total_resources']}")
        print(f"📅 Analysis Date: {stats['analysis_date']}")
    
    asyncio.run(show_summary())

@cli.command()
def generate_mock_data():
    """Generate mock data for testing"""
    
    async def generate_data():
        print("🎭 Generating mock data...")
        await generate_mock_data()
        print("✅ Mock data generated successfully!")
    
    asyncio.run(generate_data())

@cli.command()
@click.argument('resource_id')
def resource(resource_id: str):
    """Get detailed information about a specific resource"""
    
    async def show_resource():
        guard = CostGuardCLI()
        await guard.connect_db()
        
        # Get resource details
        resource_doc = await guard.db.resources.find_one({"resource_id": resource_id})
        if not resource_doc:
            print(f"❌ Resource {resource_id} not found")
            return
        
        print(f"🖥️  Resource Details: {resource_id}")
        print("=" * 50)
        print(f"Name: {resource_doc['name']}")
        print(f"Type: {resource_doc['type']}")
        print(f"Cloud: {resource_doc['cloud']}")
        print(f"State: {resource_doc['state']}")
        print(f"Owner: {resource_doc.get('owner', 'Unknown')}")
        
        # Get recent costs
        thirty_days_ago = date.today() - timedelta(days=30)
        costs = await guard.db.cost_daily.find({
            "resource_id": resource_id,
            "date": {"$gte": thirty_days_ago}
        }).to_list(None)
        
        if costs:
            total_cost = sum(c["amount_usd"] for c in costs)
            print(f"💰 30d Cost: ${total_cost:.2f}")
        
        # Get utilization
        seven_days_ago = datetime.now() - timedelta(days=7)
        util_data = await guard.db.util_hourly.find({
            "resource_id": resource_id,
            "ts_hour": {"$gte": seven_days_ago}
        }).to_list(None)
        
        if util_data:
            cpu_metrics = [u for u in util_data if u["metric"] == "cpu"]
            if cpu_metrics:
                avg_cpu = sum(m["p50"] for m in cpu_metrics) / len(cpu_metrics)
                print(f"📊 Avg CPU (7d): {avg_cpu:.1f}%")
    
    asyncio.run(show_resource())

if __name__ == '__main__':
    cli()