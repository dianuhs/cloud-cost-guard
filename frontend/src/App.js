
import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

// Add your logo import (uses the PNG in your repo)
import logo from "./assets/cloud-and-capital-icon.png";

// Recharts
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from "recharts";

// UI
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Progress } from "./components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Separator } from "./components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";

// Icons
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Server, 
  HardDrive, 
  Eye,
  Download,
  BarChart3,
  Activity,
  CheckCircle,
  XCircle,
  Calendar,
  Target,
  PieChart as PieChartIcon,
  TrendingUpIcon
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Utils
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(amount || 0));

const formatPercent = (percent) => {
  const p = Number(percent || 0);
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
};

const formatTimestampUS = (timestamp) => {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12; if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min} ${ampm}`;
};

const getConfidenceColor = (confidence) => {
  const colors = {
    very_high: 'text-green-700 bg-green-50',
    high: 'text-green-600 bg-green-50',
    medium: 'text-yellow-600 bg-yellow-50',
    low: 'text-red-600 bg-red-50',
  };
  return colors[String(confidence || '').toLowerCase()] || colors.medium;
};

const getRiskColor = (risk) => {
  const colors = { Low: 'text-green-700', Medium: 'text-yellow-600', High: 'text-red-600' };
  return colors[risk] || colors.Medium;
};

const getSeverityColor = (severity) => {
  const colors = { critical: 'severity-critical', high: 'severity-high', medium: 'severity-medium', low: 'severity-low' };
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

// Components
const KPICard = ({ title, value, change, icon: Icon, subtitle, dataFreshness }) => (
  <Card className="kpi-card hover:shadow-brand-md transition-all duration-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <div className="flex flex-col items-end">
        <Icon className="h-4 w-4 text-brand-light-muted" />
        {dataFreshness !== undefined && dataFreshness < 1 && <span className="text-xs text-green-600 mt-1">LIVE</span>}
        {dataFreshness >= 1 && <span className="text-xs text-brand-light-muted mt-1">{dataFreshness}h</span>}
      </div>
    </CardHeader>
    <CardContent>
      {/* Bump KPI number to match your PDF feel */}
      <div className="text-3xl font-extrabold text-brand-ink">{value}</div>
      {change !== undefined && (
        <p className="text-xs text-brand-muted flex items-center gap-1 mt-1">
          {change >= 0 ? <TrendingUp className="h-3 w-3 text-brand-success" /> : <TrendingDown className="h-3 w-3 text-brand-error" />}
          <span className={change >= 0 ? 'text-brand-success' : 'text-brand-error'}>{formatPercent(change)}</span>
          {subtitle}
        </p>
      )}
      {subtitle && change === undefined && <p className="text-xs text-brand-muted mt-1">{subtitle}</p>}
    </CardContent>
  </Card>
);

const CostTrendChart = ({ data, height = 300 }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <BarChart3 className="h-5 w-5" />
        Daily Spend Trend
      </CardTitle>
      <CardDescription className="text-brand-muted">Cost trends over the last 30 days</CardDescription>
    </CardHeader>
    <CardContent>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E9E3DE" />
            <XAxis dataKey="formatted_date" stroke="#7A6B5D" fontSize={12} tick={{ fill: '#7A6B5D' }} />
            <YAxis stroke="#7A6B5D" fontSize={12} tick={{ fill: '#7A6B5D' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E9E3DE', borderRadius: 8, color: '#0A0A0A' }}
              formatter={(value) => [formatCurrency(value), 'Daily Cost']}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Line type="monotone" dataKey="cost" stroke="#8B6F47" strokeWidth={3} dot={{ fill: '#8B6F47', r: 4 }} activeDot={{ r: 6, fill: '#8B6F47' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

const ServiceBreakdownChart = ({ data, total }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <PieChartIcon className="h-5 w-5" />
        Cost by Service
      </CardTitle>
      <CardDescription className="text-brand-muted">Top services by cost breakdown</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <div style={{ width: '60%', height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={2} dataKey="value">
                {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E9E3DE', borderRadius: 8, color: '#0A0A0A' }}
                formatter={(value, name, props) => [formatCurrency(value), `${props.payload.name} (${props.payload.percentage}%)`]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-2/5 space-y-2">
          {data.slice(0, 6).map((service, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: service.fill }}></div>
                <span className="text-brand-ink">{service.name}</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-brand-ink">{formatCurrency(service.value)}</div>
                <div className="text-xs text-brand-muted">{service.percentage}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

const TopMoversCard = ({ movers }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <TrendingUpIcon className="h-5 w-5" />
        Top Movers (7d)
      </CardTitle>
      <CardDescription className="text-brand-muted">Biggest cost changes in the last week</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {movers.slice(0, 6).map((mover, index) => (
          <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-brand-bg/30">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-8 rounded ${mover.change_amount >= 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
              <div>
                <div className="font-medium text-brand-ink text-sm">{mover.service}</div>
                <div className="text-xs text-brand-muted">
                  {formatCurrency(mover.previous_cost)} → {formatCurrency(mover.current_cost)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-semibold text-sm ${mover.change_amount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {mover.change_amount >= 0 ? '+' : ''}{formatCurrency(mover.change_amount)}
              </div>
              <div className={`text-xs ${mover.change_amount >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {mover.change_percent >= 0 ? '+' : ''}{mover.change_percent}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

const KeyInsightsCard = ({ insights }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <Target className="h-5 w-5" />
        Key Insights
      </CardTitle>
      <CardDescription className="text-brand-muted">Important findings and projections</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div>
          <div className="text-sm text-brand-muted">Highest Single Day</div>
          <div className="font-semibold text-brand-ink">{insights.highest_single_day?.date}</div>
          <div className="text-lg font-bold text-brand-accent">{formatCurrency(insights.highest_single_day?.amount || 0)}</div>
        </div>
        
        <Separator />
        
        <div>
          <div className="text-sm text-brand-muted">Projected Month-End</div>
          <div className="text-lg font-bold text-brand-ink">{formatCurrency(insights.projected_month_end || 0)}</div>
          <div className="text-xs text-brand-muted">Based on current trend</div>
        </div>
        
        <Separator />
        
        <div>
          <div className="text-sm text-brand-muted">Budget Performance</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">MTD: {formatCurrency(insights.mtd_actual || 0)}</span>
            <span className="text-sm">Budget: {formatCurrency(insights.monthly_budget || 0)}</span>
          </div>
          <Progress 
            value={Math.min(((insights.mtd_actual || 0) / (insights.monthly_budget || 1)) * 100, 100)} 
            className="h-3"
          />
          <div className="flex justify-between text-xs mt-2">
            <span className="text-brand-muted">Projected: {formatCurrency(insights.projected_month_end || 0)}</span>
            <span className={`font-semibold ${Number(insights.budget_variance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {Number(insights.budget_variance || 0) >= 0 ? '+' : ''}{formatCurrency(insights.budget_variance || 0)} vs budget
            </span>
          </div>
        </div>
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

// Main Dashboard
const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [findings, setFindings] = useState([]);
  const [costTrend, setCostTrend] = useState([]);
  const [serviceBreakdown, setServiceBreakdown] = useState({ data: [], total: 0 });
  const [topMovers, setTopMovers] = useState([]);
  const [keyInsights, setKeyInsights] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30d');

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;

      const [
        summaryResponse,
        findingsResponse,
        costTrendResponse,
        serviceBreakdownResponse,
        topMoversResponse,
        keyInsightsResponse
      ] = await Promise.all([
        axios.get(`${API}/summary?window=${dateRange}`),
        axios.get(`${API}/findings?sort=savings&limit=50`),
        axios.get(`${API}/cost-trend?days=${days}`),
        axios.get(`${API}/service-breakdown?window=${dateRange}`),
        axios.get(`${API}/top-movers?days=7`),
        axios.get(`${API}/key-insights?window=${dateRange}`)
      ]);

      setSummary(summaryResponse.data);
      setFindings(findingsResponse.data);

      // Normalize trend labels to MM/DD and dampen "flowy" artifacts if backend is noisy
      {
        const raw = Array.isArray(costTrendResponse.data) ? costTrendResponse.data : [];
        const trend = raw.map((pt, i) => {
          const ts = pt.date || pt.formatted_date || pt.day || pt.ts;
          const d = ts ? new Date(ts) : new Date(Date.now() - (raw.length - 1 - i) * 86400000);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          // Optional: light smoothing (average with neighbors) to avoid fake-looking wiggles
          const val = Number(pt.cost || pt.value || 0);
          return { formatted_date: `${mm}/${dd}`, cost: isFinite(val) ? val : 0 };
        });

        // simple 3-pt moving average (no edges) to reduce “flowy” sine look
        const smoothed = trend.map((p, i, arr) => {
          if (i === 0 || i === arr.length - 1) return p;
          const avg = (arr[i-1].cost + p.cost + arr[i+1].cost) / 3;
          return { ...p, cost: Number(avg.toFixed(2)) };
        });

        setCostTrend(smoothed);
      }

      // Service breakdown (keep yours)
      setServiceBreakdown(serviceBreakdownResponse.data);
      setTopMovers(topMoversResponse.data);
      setKeyInsights(keyInsightsResponse.data);

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load cost data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (finding) => {
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
Last Analyzed: ${formatTimestampUS(finding.last_analyzed)}

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
      const rows = Array.isArray(response.data) ? response.data : [];
      const headers = ['Title', 'Type', 'Severity', 'Monthly Savings', 'Resource ID', 'Action'];
      const body = rows.map(f => [
        f.title, f.type, f.severity, f.monthly_savings_usd_est, f.resource_id || '', f.suggested_action
      ]);
      const csv = [headers, ...body]
        .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      {/* Header */}
      <div className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Use your local PNG + brand sizing */}
              <img src={logo} alt="Cloud & Capital" className="brand-logo" />
              <div className="leading-tight">
                <h1 className="brand-title">Cloud Cost Guard</h1>
                <p className="brand-subtitle">Multi-cloud cost optimization</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-32">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCSV} className="btn-brand-outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={loadAllData} className="btn-brand-primary">
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Data Source Notice */}
        <div className="mb-6">
          <Alert className="bg-blue-50 border-blue-200">
            <Activity className="h-4 w-4 text-brand-ink" />
            <AlertDescription className="text-blue-800">
              <span className="font-medium">Data Source:</span> AWS Cost & Usage Reports • CloudWatch Metrics • Resource Inventory APIs
              <span className="ml-4 text-blue-700">Last Updated: {formatTimestampUS(kpis.last_updated || summary.generated_at)}</span>
            </AlertDescription>
          </Alert>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Total 30d Cost" value={formatCurrency(kpis.total_30d_cost)} change={kpis.wow_percent} icon={DollarSign} subtitle="vs last week" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Savings Ready" value={formatCurrency(kpis.savings_ready_usd)} icon={TrendingDown} subtitle="potential monthly savings" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Under-utilized" value={kpis.underutilized_count} icon={Server} subtitle="compute resources" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Orphaned Resources" value={kpis.orphans_count} icon={HardDrive} subtitle="unattached volumes" dataFreshness={kpis.data_freshness_hours} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <CostTrendChart data={costTrend} />
          <ServiceBreakdownChart data={serviceBreakdown.data} total={serviceBreakdown.total} />
        </div>

        {/* Insights row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <TopMoversCard movers={topMovers} />
          <KeyInsightsCard insights={keyInsights} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="findings" className="space-y-6">
          <TabsList className="tabs-list grid w-full grid-cols-3">
            <TabsTrigger value="findings" className="tab-trigger">Findings</TabsTrigger>
            <TabsTrigger value="products" className="tab-trigger">Products</TabsTrigger>
            <TabsTrigger value="overview" className="tab-trigger">Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">Cost Optimization Findings</h2>
              <Badge className="badge-brand text-brand-success border-brand-success/20">
                {formatCurrency(kpis.savings_ready_usd)}/month potential
              </Badge>
            </div>

            {findings.length === 0 ? (
              <Card className="kpi-card">
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-brand-success mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-brand-ink mb-2">All Optimized!</h3>
                  <p className="text-brand-muted">No cost optimization opportunities found at this time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {findings.map((finding) => (
                  <FindingCard key={finding.finding_id} finding={finding} onViewDetails={handleViewDetails} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">Product Cost Breakdown</h2>
              <Badge className="badge-brand">Last {dateRange === '7d' ? '7' : dateRange === '30d' ? '30' : '90'} days</Badge>
            </div>

            <Card className="kpi-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-brand-ink"><BarChart3 className="h-5 w-5" />Top Products by Cost</CardTitle>
                <CardDescription className="text-brand-muted">Your highest spending cloud products and their week-over-week changes</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTable products={top_products} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview" className="space-y-6">
            <h2 className="text-xl font-semibold text-brand-ink">Cost Overview</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="kpi-card">
                <CardHeader>
                  <CardTitle className="text-brand-ink">Savings Potential</CardTitle>
                  <CardDescription className="text-brand-muted">Breakdown of optimization opportunities by type</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { type: 'Under-utilized', count: kpis.underutilized_count, color: 'bg-blue-500' },
                    { type: 'Orphaned', count: kpis.orphans_count, color: 'bg-yellow-500' },
                    { type: 'Idle', count: findings.filter(f => f.title && f.title.toLowerCase().includes('idle')).length, color: 'bg-red-500' }
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

              <Card className="kpi-card">
                <CardHeader>
                  <CardTitle className="text-brand-ink">Recent Findings</CardTitle>
                  <CardDescription className="text-brand-muted">Latest cost optimization opportunities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(recent_findings || []).slice(0, 5).map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-brand-bg/50 rounded-lg border border-brand-line">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(f.severity)}
                          <span className="text-sm text-brand-ink truncate max-w-48">{f.title}</span>
                        </div>
                        <span className="text-sm font-medium text-brand-success">{formatCurrency(f.monthly_savings_usd_est)}</span>
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

const Home = () => <Dashboard />;

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes><Route path="/" element={<Home />} /></Routes>
      </BrowserRouter>
    </div>
  );
}
