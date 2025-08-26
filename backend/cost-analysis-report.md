# Cloud Cost Guard Analysis Report

**Generated:** 2025-08-26 16:43:43

## 📊 Executive Summary

- **Total Potential Savings:** $48.65/month
- **Findings:** 5 optimization opportunities
- **High Priority:** 0 findings

## 🎯 Top Findings (Ranked by $ Savings)

### 1. 🟡 Idle load balancer idle-elb

**Monthly Savings:** $25.00  
**Severity:** MEDIUM  
**Type:** Underutilized

**Action Required:** Consider removing unused load balancer

**Commands:**
```bash
aws elbv2 describe-load-balancers --names idle-elb
# Review and consider deleting if truly unused
```

**Evidence:**
```json
{
  "median_requests_per_sec": 0.1,
  "hours_analyzed": 168
}
```

---

### 2. 🟡 Unattached EBS volume unattached-volume

**Monthly Savings:** $10.00  
**Severity:** MEDIUM  
**Type:** Orphan

**Action Required:** Delete unused volume or attach to instance

**Commands:**
```bash
aws ec2 describe-volumes --volume-ids vol-0123456789abcdef0
aws ec2 delete-volume --volume-id vol-0123456789abcdef0
```

**Evidence:**
```json
{
  "state": "available",
  "age_days": 5
}
```

---

### 3. 🟡 Unattached EBS volume backup-volume

**Monthly Savings:** $10.00  
**Severity:** MEDIUM  
**Type:** Orphan

**Action Required:** Delete unused volume or attach to instance

**Commands:**
```bash
aws ec2 describe-volumes --volume-ids vol-0987654321fedcba0
aws ec2 delete-volume --volume-id vol-0987654321fedcba0
```

**Evidence:**
```json
{
  "state": "available",
  "age_days": 5
}
```

---

### 4. 🟢 Unused Elastic IP unused-eip

**Monthly Savings:** $3.65  
**Severity:** LOW  
**Type:** Orphan

**Action Required:** Release unused Elastic IP

**Commands:**
```bash
aws ec2 describe-addresses --allocation-ids eipalloc-0123456789
aws ec2 release-address --allocation-id eipalloc-0123456789
```

**Evidence:**
```json
{
  "state": "available"
}
```

---

### 5. 🟡 EC2 web-server-1 under 8.5% median CPU (7d)

**Monthly Savings:** $0.00  
**Severity:** MEDIUM  
**Type:** Underutilized

**Action Required:** Consider downsizing to smaller instance type or schedule off-hours stop

**Commands:**
```bash
aws ec2 describe-instances --instance-ids i-0123456789abcdef0
# Consider resizing or stopping during off-hours
```

**Evidence:**
```json
{
  "p50_cpu": 8.5,
  "p95_cpu": 22.3,
  "hours_analyzed": 168,
  "monthly_cost": 0
}
```

---


## 📈 Breakdown by Type

- **Underutilized:** 2 findings, $25.00/month potential savings
- **Orphan:** 3 findings, $23.65/month potential savings
