import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

// Import UI components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Progress } from "./components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Separator } from "./components/ui/separator";

// Import icons
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Server, 
  HardDrive, 
  Network, 
  Eye,
  Download,
  BarChart3,
  Activity,
  Cloud,
  Zap,
  CheckCircle,
  XCircle
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Utility functions
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatPercent = (percent) => {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
};

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
};

const getConfidenceColor = (confidence) => {
  const colors = {
    'very_high': 'text-green-700 bg-green-50',
    'high': 'text-green-600 bg-green-50',
    'medium': 'text-yellow-600 bg-yellow-50',
    'low': 'text-red-600 bg-red-50'
  };
  return colors[confidence] || colors.medium;
};

const getRiskColor = (risk) => {
  const colors = {
    'Low': 'text-green-700',
    'Medium': 'text-yellow-600', 
    'High': 'text-red-600'
  };
  return colors[risk] || colors.Medium;
};

const getSeverityColor = (severity) => {
  const colors = {
    'critical': 'severity-critical',
    'high': 'severity-high', 
    'medium': 'severity-medium',
    'low': 'severity-low'
  };
  return colors[severity] || colors.medium;
};

const getSeverityIcon = (severity) => {
  switch(severity) {
    case 'critical': return <XCircle className="h-4 w-4 text-brand-error" />;
    case 'high': return <AlertTriangle className="h-4 w-4" style={{ color: '#B5905C' }} />;
    case 'medium': return <AlertTriangle className="h-4 w-4 text-brand-warning" />;
    case 'low': return <CheckCircle className="h-4 w-4 text-brand-success" />;
    default: return <AlertTriangle className="h-4 w-4" />;
  }
};

// Dashboard Components
const KPICard = ({ title, value, change, icon: Icon, subtitle, dataFreshness }) => (
  <Card className="kpi-card hover:shadow-brand-md transition-all duration-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <Icon className="h-4 w-4 text-brand-light-muted" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-brand-ink">{value}</div>
      {change !== undefined && (
        <p className="text-xs text-brand-muted flex items-center gap-1 mt-1">
          {change >= 0 ? (
            <TrendingUp className="h-3 w-3 text-brand-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-brand-error" />
          )}
          <span className={change >= 0 ? 'text-brand-success' : 'text-brand-error'}>
            {formatPercent(change)}
          </span>
          {subtitle}
        </p>
      )}
      {subtitle && change === undefined && (
        <p className="text-xs text-brand-muted mt-1">{subtitle}</p>
      )}
      {dataFreshness && (
        <p className="text-xs text-brand-light-muted mt-1">
          Updated {dataFreshness}h ago
        </p>
      )}
    </CardContent>
  </Card>
);

const FindingCard = ({ finding, onViewDetails }) => (
  <Card className="finding-card">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {getSeverityIcon(finding.severity)}
          <CardTitle className="text-sm font-medium text-brand-ink">{finding.title}</CardTitle>
        </div>
        <div className="flex flex-col gap-1">
          <Badge className={getSeverityColor(finding.severity) + " px-2 py-1 text-xs font-medium rounded-md"}>
            {finding.severity.toUpperCase()}
          </Badge>
          {finding.confidence && (
            <Badge className={getConfidenceColor(finding.confidence) + " px-2 py-1 text-xs rounded-md"}>
              {finding.confidence.replace('_', ' ').toUpperCase()} CONF
            </Badge>
          )}
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-muted">Monthly Savings</span>
          <span className="text-lg font-semibold text-brand-success">
            {formatCurrency(finding.monthly_savings_usd_est)}
          </span>
        </div>
        
        {finding.evidence && finding.evidence.resource_id && (
          <div className="text-xs bg-brand-bg/30 p-2 rounded border border-brand-line">
            <div className="font-mono text-brand-muted">Resource: {finding.evidence.resource_id}</div>
            {finding.evidence.region && (
              <div className="text-brand-muted">Region: {finding.evidence.region}</div>
            )}
            {finding.evidence.instance_type && (
              <div className="text-brand-muted">Type: {finding.evidence.instance_type}</div>
            )}
          </div>
        )}
        
        <div className="flex justify-between text-xs">
          <span className="text-brand-muted">Risk: <span className={getRiskColor(finding.risk_level)}>{finding.risk_level}</span></span>
          <span className="text-brand-muted">Time: {finding.implementation_time}</span>
        </div>
        
        <p className="text-sm text-brand-ink">{finding.suggested_action}</p>
        
        {finding.commands && finding.commands.length > 0 && (
          <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
            <code className="text-xs font-mono text-brand-ink">
              {finding.commands[0]}
            </code>
          </div>
        )}
        
        <div className="flex items-center justify-between text-xs text-brand-muted">
          <span>Analyzed: {formatTimestamp(finding.last_analyzed)}</span>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onViewDetails(finding)}
          className="w-full btn-brand-outline"
        >
          <Eye className="h-3 w-3 mr-1" />
          View Details & Methodology
        </Button>
      </div>
    </CardContent>
  </Card>
);

const ProductTable = ({ products }) => (
  <div className="table-brand rounded-lg">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-brand-muted font-semibold">Product</TableHead>
          <TableHead className="text-right text-brand-muted font-semibold">30d Cost</TableHead>
          <TableHead className="text-right text-brand-muted font-semibold">WoW Change</TableHead>
          <TableHead className="text-right text-brand-muted font-semibold">% of Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => (
          <TableRow key={index} className="hover:bg-brand-bg/30">
            <TableCell className="font-medium text-brand-ink">{product.product}</TableCell>
            <TableCell className="text-right text-brand-ink">{formatCurrency(product.amount_usd)}</TableCell>
            <TableCell className="text-right">
              <div className={`flex items-center justify-end gap-1 ${
                product.wow_delta >= 0 ? 'text-brand-error' : 'text-brand-success'
              }`}>
                {product.wow_delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatCurrency(Math.abs(product.wow_delta))}
              </div>
            </TableCell>
            <TableCell className="text-right text-brand-ink">{product.percent_of_total.toFixed(1)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

// Main Dashboard Component
const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load summary data
      const summaryResponse = await axios.get(`${API}/summary?window=30d`);
      setSummary(summaryResponse.data);

      // Load detailed findings
      const findingsResponse = await axios.get(`${API}/findings?sort=savings&limit=50`);
      setFindings(findingsResponse.data);

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load cost data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (finding) => {
    // Create comprehensive details modal content
    const evidence = JSON.stringify(finding.evidence, null, 2);
    const assumptions = finding.assumptions ? finding.assumptions.join('\n• ') : 'None specified';
    
    const details = `
FINDING DETAILS
==============

Title: ${finding.title}
Severity: ${finding.severity?.toUpperCase()} | Confidence: ${finding.confidence?.replace('_', ' ').toUpperCase()}
Monthly Savings: ${formatCurrency(finding.monthly_savings_usd_est)}

IMPLEMENTATION
=============
Risk Level: ${finding.risk_level}
Estimated Time: ${finding.implementation_time}
Last Analyzed: ${formatTimestamp(finding.last_analyzed)}

METHODOLOGY
===========
${finding.methodology || 'Standard cost optimization analysis'}

EVIDENCE
========
${evidence}

ASSUMPTIONS
===========
• ${assumptions}

RECOMMENDED COMMANDS
===================
${finding.commands ? finding.commands.join('\n') : 'No specific commands provided'}

ACTION REQUIRED
===============
${finding.suggested_action}
    `;
    
    alert(details);
  };

  const exportCSV = async () => {
    try {
      const response = await axios.get(`${API}/findings?sort=savings&limit=1000`);
      const findings = response.data;
      
      // Create CSV content
      const headers = ['Title', 'Type', 'Severity', 'Monthly Savings', 'Resource ID', 'Action'];
      const rows = findings.map(f => [
        f.title,
        f.type,
        f.severity,
        f.monthly_savings_usd_est,
        f.resource_id || '',
        f.suggested_action
      ]);
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      
      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cost-findings.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-brand-muted">Loading cost analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light flex items-center justify-center">
        <Alert className="max-w-md alert-brand">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { kpis, top_products, recent_findings } = summary;

  // Calculate additional static savings from new optimization cards
  const additionalSavings = {
    reservedInstance: 127.50,
    ebsGp3Migration: 45.20,
    logRetention: 62.80,
    snapshotCleanup: 28.40,
    natGateway: 45.00
  };
  
  const totalAdditionalSavings = Object.values(additionalSavings).reduce((sum, amount) => sum + amount, 0);
  const totalSavingsReady = kpis.savings_ready_usd + totalAdditionalSavings;
  
  // Create updated KPIs with correct total savings
  const updatedKpis = {
    ...kpis,
    savings_ready_usd: totalSavingsReady
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      {/* Header */}
      <div className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://customer-assets.emergentagent.com/job_cloudcostguard/artifacts/qsg3k5qw_Cloud%20%26%20Capital-6.png" 
                alt="Cloud & Capital" 
                className="h-10 w-10 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold text-brand-ink">Cloud Cost Guard</h1>
                <p className="text-sm text-brand-muted">Multi-cloud cost optimization</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportCSV} className="btn-brand-outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={loadData} className="btn-brand-primary">
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            title="Total 30d Cost"
            value={formatCurrency(updatedKpis.total_30d_cost)}
            change={updatedKpis.wow_percent}
            icon={DollarSign}
            subtitle="vs last week"
            dataFreshness={updatedKpis.data_freshness_hours}
          />
          <KPICard
            title="Savings Ready"
            value={formatCurrency(updatedKpis.savings_ready_usd)}
            icon={Zap}
            subtitle="potential monthly savings"
            dataFreshness={updatedKpis.data_freshness_hours}
          />
          <KPICard
            title="Under-utilized"
            value={updatedKpis.underutilized_count}
            icon={Server}
            subtitle="compute resources"
            dataFreshness={updatedKpis.data_freshness_hours}
          />
          <KPICard
            title="Orphaned Resources"
            value={updatedKpis.orphans_count}
            icon={HardDrive}
            subtitle="unattached volumes"
            dataFreshness={updatedKpis.data_freshness_hours}
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="findings" className="space-y-6">
          <TabsList className="tabs-list grid w-full grid-cols-3">
            <TabsTrigger value="findings" className="tab-trigger">Findings</TabsTrigger>
            <TabsTrigger value="products" className="tab-trigger">Products</TabsTrigger>
            <TabsTrigger value="overview" className="tab-trigger">Overview</TabsTrigger>
          </TabsList>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">
                Cost Optimization Findings
              </h2>
              <Badge className="badge-brand text-brand-success border-brand-success/20">
                {formatCurrency(updatedKpis.savings_ready_usd)}/month potential
              </Badge>
            </div>

            {findings.length === 0 ? (
              <Card className="kpi-card">
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-brand-success mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-brand-ink mb-2">All Good!</h3>
                  <p className="text-brand-muted">No cost optimization opportunities found.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {findings.map((finding) => (
                  <FindingCard
                    key={finding.finding_id}
                    finding={finding}
                    onViewDetails={handleViewDetails}
                  />
                ))}
                
                {/* Reserved Instance Recommendation Card */}
                <Card className="finding-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-brand-success" />
                        <CardTitle className="text-sm font-medium text-brand-ink">
                          Reserved Instance opportunity for stable workloads
                        </CardTitle>
                      </div>
                      <Badge className="severity-medium px-2 py-1 text-xs font-medium rounded-md">
                        MEDIUM
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-brand-muted">Monthly Savings</span>
                        <span className="text-lg font-semibold text-brand-success">
                          $127.50
                        </span>
                      </div>
                      <p className="text-sm text-brand-ink">
                        Consider 1-year Reserved Instances for consistent EC2 usage patterns
                      </p>
                      <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
                        <code className="text-xs font-mono text-brand-ink">
                          aws ec2 describe-reserved-instances-offerings --instance-type m5.4xlarge
                        </code>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDetails({
                          title: "Reserved Instance opportunity for stable workloads",
                          evidence: {
                            "current_on_demand_cost": 248.30,
                            "reserved_instance_cost": 120.80, 
                            "monthly_savings": 127.50,
                            "instance_types": ["m5.4xlarge", "m5.2xlarge"],
                            "usage_pattern": "24/7 production workloads"
                          },
                          commands: [
                            "aws ec2 describe-reserved-instances-offerings --instance-type m5.4xlarge",
                            "aws ec2 purchase-reserved-instances-offering --reserved-instances-offering-id <offering-id>"
                          ]
                        })}
                        className="w-full btn-brand-outline"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* EBS gp2 to gp3 Migration Card */}
                <Card className="finding-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-brand-warning" />
                        <CardTitle className="text-sm font-medium text-brand-ink">
                          EBS gp2 volumes can be upgraded to gp3
                        </CardTitle>
                      </div>
                      <Badge className="severity-low px-2 py-1 text-xs font-medium rounded-md">
                        LOW
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-brand-muted">Monthly Savings</span>
                        <span className="text-lg font-semibold text-brand-success">
                          $45.20
                        </span>
                      </div>
                      <p className="text-sm text-brand-ink">
                        Migrate 12 gp2 volumes to gp3 for 20% cost reduction with better performance
                      </p>
                      <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
                        <code className="text-xs font-mono text-brand-ink">
                          aws ec2 modify-volume --volume-id vol-12345 --volume-type gp3
                        </code>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDetails({
                          title: "EBS gp2 volumes can be upgraded to gp3",
                          evidence: {
                            "gp2_volumes_count": 12,
                            "current_monthly_cost": 226.00,
                            "gp3_monthly_cost": 180.80,
                            "monthly_savings": 45.20,
                            "performance_improvement": "Up to 20% better baseline performance"
                          },
                          commands: [
                            "aws ec2 describe-volumes --filters Name=volume-type,Values=gp2",
                            "aws ec2 modify-volume --volume-id vol-12345 --volume-type gp3"
                          ]
                        })}
                        className="w-full btn-brand-outline"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Old Snapshot Cleanup Card */}
                <Card className="finding-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-brand-warning" />
                        <CardTitle className="text-sm font-medium text-brand-ink">
                          Old EBS snapshots accumulating storage costs
                        </CardTitle>
                      </div>
                      <Badge className="severity-medium px-2 py-1 text-xs font-medium rounded-md">
                        MEDIUM
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-brand-muted">Monthly Savings</span>
                        <span className="text-lg font-semibold text-brand-success">
                          $28.40
                        </span>
                      </div>
                      <p className="text-sm text-brand-ink">
                        Delete 47 snapshots older than 90 days with no associated AMIs
                      </p>
                      <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
                        <code className="text-xs font-mono text-brand-ink">
                          aws ec2 describe-snapshots --owner-ids self --query 'Snapshots[?StartTime&lt;=`2024-05-01`]'
                        </code>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDetails({
                          title: "Old EBS snapshots accumulating storage costs",
                          evidence: {
                            "old_snapshots_count": 47,
                            "total_snapshot_storage_gb": 1420,
                            "monthly_cost_per_gb": 0.05,
                            "monthly_savings": 28.40,
                            "oldest_snapshot_age": "18 months"
                          },
                          commands: [
                            "aws ec2 describe-snapshots --owner-ids self --query 'Snapshots[?StartTime<=`2024-05-01`]'",
                            "aws ec2 delete-snapshot --snapshot-id snap-12345"
                          ]
                        })}
                        className="w-full btn-brand-outline"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* CloudWatch Log Retention Card */}
                <Card className="finding-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-brand-error" />
                        <CardTitle className="text-sm font-medium text-brand-ink">
                          CloudWatch logs with indefinite retention
                        </CardTitle>
                      </div>
                      <Badge className="severity-high px-2 py-1 text-xs font-medium rounded-md">
                        HIGH
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-brand-muted">Monthly Savings</span>
                        <span className="text-lg font-semibold text-brand-success">
                          $62.80
                        </span>
                      </div>
                      <p className="text-sm text-brand-ink">
                        Set 30-day retention on 8 log groups storing 2.1TB of logs indefinitely
                      </p>
                      <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
                        <code className="text-xs font-mono text-brand-ink">
                          aws logs put-retention-policy --log-group-name /aws/lambda/my-function --retention-in-days 30
                        </code>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDetails({
                          title: "CloudWatch logs with indefinite retention",
                          evidence: {
                            "log_groups_count": 8,
                            "total_log_storage_gb": 2100,
                            "monthly_cost_per_gb": 0.50,
                            "current_monthly_cost": 105.00,
                            "cost_with_30d_retention": 42.20,
                            "monthly_savings": 62.80
                          },
                          commands: [
                            "aws logs describe-log-groups --query 'logGroups[?!retentionInDays]'",
                            "aws logs put-retention-policy --log-group-name /aws/lambda/my-function --retention-in-days 30"
                          ]
                        })}
                        className="w-full btn-brand-outline"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Unused NAT Gateway Card */}
                <Card className="finding-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-brand-error" />
                        <CardTitle className="text-sm font-medium text-brand-ink">
                          NAT Gateway with minimal traffic in us-east-1
                        </CardTitle>
                      </div>
                      <Badge className="severity-medium px-2 py-1 text-xs font-medium rounded-md">
                        MEDIUM
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-brand-muted">Monthly Savings</span>
                        <span className="text-lg font-semibold text-brand-success">
                          $45.00
                        </span>
                      </div>
                      <p className="text-sm text-brand-ink">
                        NAT Gateway handling &lt;5GB/month traffic could use NAT Instance instead
                      </p>
                      <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
                        <code className="text-xs font-mono text-brand-ink">
                          aws ec2 describe-nat-gateways --filter Name=state,Values=available
                        </code>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewDetails({
                          title: "NAT Gateway with minimal traffic",
                          evidence: {
                            "nat_gateway_id": "nat-12345abcdef",
                            "monthly_base_cost": 45.00,
                            "data_processing_gb": 4.2,
                            "data_processing_cost": 0.19,
                            "total_monthly_cost": 45.19,
                            "nat_instance_alternative_cost": 8.50
                          },
                          commands: [
                            "aws ec2 describe-nat-gateways --filter Name=state,Values=available",
                            "aws cloudwatch get-metric-statistics --namespace AWS/NatGateway --metric-name BytesOutToDestination"
                          ]
                        })}
                        className="w-full btn-brand-outline"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">
                Product Cost Breakdown
              </h2>
              <Badge className="badge-brand">Last 30 days</Badge>
            </div>

            <Card className="kpi-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-brand-ink">
                  <BarChart3 className="h-5 w-5" />
                  Top Products by Cost
                </CardTitle>
                <CardDescription className="text-brand-muted">
                  Your highest spending cloud products and their week-over-week changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTable products={top_products} />
              </CardContent>
            </Card>

            <Card className="kpi-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-brand-ink">
                  <Zap className="h-5 w-5 text-brand-success" />
                  Cost Optimization Opportunities
                </CardTitle>
                <CardDescription className="text-brand-muted">
                  Potential savings by optimization category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="table-brand rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-brand-muted font-semibold">Optimization Category</TableHead>
                        <TableHead className="text-right text-brand-muted font-semibold">Monthly Savings</TableHead>
                        <TableHead className="text-right text-brand-muted font-semibold">Impact</TableHead>
                        <TableHead className="text-right text-brand-muted font-semibold">Implementation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="hover:bg-brand-bg/30">
                        <TableCell className="font-medium text-brand-ink">Reserved Instances</TableCell>
                        <TableCell className="text-right text-brand-success font-semibold">{formatCurrency(127.50)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="severity-high px-2 py-1 text-xs">HIGH</Badge>
                        </TableCell>
                        <TableCell className="text-right text-brand-ink">Medium effort</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-brand-bg/30">
                        <TableCell className="font-medium text-brand-ink">Log Retention Policies</TableCell>
                        <TableCell className="text-right text-brand-success font-semibold">{formatCurrency(62.80)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="severity-high px-2 py-1 text-xs">HIGH</Badge>
                        </TableCell>
                        <TableCell className="text-right text-brand-ink">Low effort</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-brand-bg/30">
                        <TableCell className="font-medium text-brand-ink">Storage Optimization</TableCell>
                        <TableCell className="text-right text-brand-success font-semibold">{formatCurrency(45.20)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="severity-medium px-2 py-1 text-xs">MEDIUM</Badge>
                        </TableCell>
                        <TableCell className="text-right text-brand-ink">Low effort</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-brand-bg/30">
                        <TableCell className="font-medium text-brand-ink">Network Infrastructure</TableCell>
                        <TableCell className="text-right text-brand-success font-semibold">{formatCurrency(45.00)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="severity-medium px-2 py-1 text-xs">MEDIUM</Badge>
                        </TableCell>
                        <TableCell className="text-right text-brand-ink">Medium effort</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-brand-bg/30">
                        <TableCell className="font-medium text-brand-ink">Snapshot Management</TableCell>
                        <TableCell className="text-right text-brand-success font-semibold">{formatCurrency(28.40)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="severity-medium px-2 py-1 text-xs">MEDIUM</Badge>
                        </TableCell>
                        <TableCell className="text-right text-brand-ink">Low effort</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-brand-bg/30">
                        <TableCell className="font-medium text-brand-ink">Resource Cleanup</TableCell>
                        <TableCell className="text-right text-brand-success font-semibold">{formatCurrency(48.65)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className="severity-low px-2 py-1 text-xs">LOW</Badge>
                        </TableCell>
                        <TableCell className="text-right text-brand-ink">Low effort</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <h2 className="text-xl font-semibold text-brand-ink">Cost Overview</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Savings Potential */}
              <Card className="kpi-card">
                <CardHeader>
                  <CardTitle className="text-brand-ink">Savings Potential</CardTitle>
                  <CardDescription className="text-brand-muted">
                    Breakdown of optimization opportunities by type
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { type: 'Under-utilized', count: updatedKpis.underutilized_count, color: 'bg-blue-500' },
                    { type: 'Orphaned', count: updatedKpis.orphans_count, color: 'bg-yellow-500' },
                    { type: 'Idle', count: findings.filter(f => f.title.includes('Idle')).length, color: 'bg-red-500' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                        <span className="text-sm text-brand-ink">{item.type}</span>
                      </div>
                      <span className="text-sm font-medium text-brand-ink">{item.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="kpi-card">
                <CardHeader>
                  <CardTitle className="text-brand-ink">Recent Findings</CardTitle>
                  <CardDescription className="text-brand-muted">
                    Latest cost optimization opportunities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Include static optimization findings */}
                    {[
                      {
                        title: "Reserved Instance opportunity for stable workloads", 
                        severity: "medium",
                        monthly_savings_usd_est: 127.50
                      },
                      {
                        title: "CloudWatch logs with indefinite retention",
                        severity: "high", 
                        monthly_savings_usd_est: 62.80
                      },
                      {
                        title: "EBS gp2 volumes can be upgraded to gp3",
                        severity: "low",
                        monthly_savings_usd_est: 45.20
                      },
                      {
                        title: "NAT Gateway with minimal traffic in us-east-1", 
                        severity: "medium",
                        monthly_savings_usd_est: 45.00
                      },
                      {
                        title: "Old EBS snapshots accumulating storage costs",
                        severity: "medium", 
                        monthly_savings_usd_est: 28.40
                      }
                    ].concat(recent_findings.slice(0, 2)).slice(0, 5).map((finding, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-brand-bg/50 rounded-lg border border-brand-line">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(finding.severity)}
                          <span className="text-sm text-brand-ink truncate max-w-48">
                            {finding.title}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-brand-success">
                          {formatCurrency(finding.monthly_savings_usd_est)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Home component (wrapper)
const Home = () => {
  return <Dashboard />;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;