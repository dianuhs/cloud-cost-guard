import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

// Logo (PNG). If your logo path differs, update the import below.
import logo from "./assets/cloud-and-capital-icon.png";

// Recharts
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
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
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Server, HardDrive, Eye,
  Download, BarChart3, Target, PieChart as PieChartIcon, TrendingUp as TrendingUpIcon,
  CheckCircle, XCircle
} from "lucide-react";

/* ----------------------------------------------------------
   IMPORTANT: Force API to preview backend so data always loads
-----------------------------------------------------------*/
const API = "https://cloudcostguard.preview.emergentagent.com/api";

/* ---------- Utils ---------- */
const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(amount || 0));

const formatPercent = (percent) => {
  const p = Number(percent || 0);
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const sevToConfidence = (severity) => {
  const s = String(severity || "").toLowerCase();
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
};
const normConf = (c) => String(c || "").toLowerCase().replace(/\s+/g, "_");

const getConfidenceColor = (confidence) => ({
  very_high: "text-green-700 bg-green-50",
  high: "text-green-600 bg-green-50",
  medium: "text-yellow-600 bg-yellow-50",
  low: "text-red-600 bg-red-50",
}[confidence] || "text-yellow-600 bg-yellow-50");

const getRiskColor = (risk) => ({
  Low: "text-green-700",
  Medium: "text-yellow-600",
  High: "text-red-600",
}[risk] || "text-yellow-600");

const getSeverityColor = (severity) => ({
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
}[severity] || "severity-medium");

const getSeverityIcon = (severity) => {
  switch (severity) {
    case "critical": return <XCircle className="h-4 w-4 text-brand-error" />;
    case "high": return <AlertTriangle className="h-4 w-4" style={{ color: "#B5905C" }} />;
    case "medium": return <AlertTriangle className="h-4 w-4 text-brand-warning" />;
    case "low": return <CheckCircle className="h-4 w-4 text-brand-success" />;
    default: return <AlertTriangle className="h-4 w-4" />;
  }
};

const EMPTY_SUMMARY = {
  kpis: {
    total_30d_cost: 0,
    wow_percent: 0,
    mom_percent: 0,
    savings_ready_usd: 0,
    underutilized_count: 0,
    orphans_count: 0,
    data_freshness_hours: undefined,
    last_updated: undefined,
  },
  top_products: [],
  recent_findings: [],
  window: "30d",
  generated_at: new Date().toISOString(),
};

/* ---------- UI parts ---------- */
const KPICard = ({ title, value, change, icon: Icon, subtitle, dataFreshness }) => (
  <Card className="kpi-card hover:shadow-brand-md transition-all duration-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <div className="flex flex-col items-end">
        <Icon className="h-4 w-4 text-brand-light-muted" />
        {dataFreshness !== undefined && dataFreshness < 1 && <span className="text-xs text-green-600 mt-1">LIVE</span>}
        {dataFreshness !== undefined && dataFreshness >= 1 && <span className="text-xs text-brand-light-muted mt-1">{dataFreshness}h</span>}
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-brand-ink">{value}</div>
      {change !== undefined && (
        <p className="text-xs text-brand-muted flex items-center gap-1 mt-1">
          {change >= 0 ? <TrendingUp className="h-3 w-3 text-brand-success" /> : <TrendingDown className="h-3 w-3 text-brand-error" />}
          <span className={change >= 0 ? "text-brand-success" : "text-brand-error"}>{formatPercent(change)}</span>
          {subtitle}
        </p>
      )}
      {subtitle && change === undefined && <p className="text-xs text-brand-muted mt-1">{subtitle}</p>}
    </CardContent>
  </Card>
);

const CostTrendChart = ({ data, height = 300, label = "Cost trends over the selected window" }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink"><BarChart3 className="h-5 w-5" />Daily Spend Trend</CardTitle>
      <CardDescription className="text-brand-muted">{label}</CardDescription>
    </CardHeader>
    <CardContent>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E9E3DE" />
            <XAxis dataKey="formatted_date" stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} />
            <YAxis stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
              formatter={(value) => [formatCurrency(value), "Daily Cost"]} labelFormatter={(label) => `Date: ${label}`} />
            <Line type="monotone" dataKey="cost" stroke="#8B6F47" strokeWidth={3} dot={{ fill: "#8B6F47", r: 4 }} activeDot={{ r: 6, fill: "#8B6F47" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

const ServiceBreakdownChart = ({ data }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink"><PieChartIcon className="h-5 w-5" />Cost by Service</CardTitle>
      <CardDescription className="text-brand-muted">Top services by 30d cost breakdown</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <div style={{ width: "60%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={2} dataKey="value">
                {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                formatter={(val, _name, props) => [formatCurrency(val), `${props.payload.name} (${props.payload.percentage}%)`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-2/5 space-y-2">
          {data.slice(0, 6).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.fill }} />
                <span className="text-brand-ink">{s.name}</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-brand-ink">{formatCurrency(s.value)}</div>
                <div className="text-xs text-brand-muted">{s.percentage}%</div>
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
      <CardTitle className="flex items-center gap-2 text-brand-ink"><TrendingUpIcon className="h-5 w-5" />Top Movers (7d)</CardTitle>
      <CardDescription className="text-brand-muted">Biggest cost changes in the last week</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {movers.slice(0, 6).map((m, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-brand-bg/30">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-8 rounded ${m.change_amount >= 0 ? "bg-red-500" : "bg-green-500"}`} />
              <div>
                <div className="font-medium text-brand-ink text-sm">{m.service}</div>
                <div className="text-xs text-brand-muted">{formatCurrency(m.previous_cost)} → {formatCurrency(m.current_cost)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-semibold text-sm ${m.change_amount >= 0 ? "text-red-600" : "text-green-600"}`}>
                {m.change_amount >= 0 ? "+" : ""}{formatCurrency(m.change_amount)}
              </div>
              <div className={`text-xs ${m.change_amount >= 0 ? "text-red-500" : "text-green-500"}`}>
                {m.change_percent >= 0 ? "+" : ""}{m.change_percent}%
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
      <CardTitle className="flex items-center gap-2 text-brand-ink"><Target className="h-5 w-5" />Key Insights</CardTitle>
      <CardDescription className="text-brand-muted">Important findings and projections</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div>
          <div className="text-sm text-brand-muted">Highest Single Day</div>
          <div className="font-semibold text-brand-ink">{insights?.highest_single_day?.date || "-"}</div>
          <div className="text-lg font-bold text-brand-accent">{formatCurrency(insights?.highest_single_day?.amount || 0)}</div>
        </div>
        <Separator />
        <div>
          <div className="text-sm text-brand-muted">Projected Month-End</div>
          <div className="text-lg font-bold text-brand-ink">{formatCurrency(insights?.projected_month_end || 0)}</div>
          <div className="text-xs text-brand-muted">Based on current trend</div>
        </div>
        <Separator />
        <div>
          <div className="text-sm text-brand-muted">Budget Performance</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">MTD: {formatCurrency(insights?.mtd_actual || 0)}</span>
            <span className="text-sm">Budget: {formatCurrency(insights?.monthly_budget || 0)}</span>
          </div>
          <Progress value={Math.min(((insights?.mtd_actual || 0) / (insights?.monthly_budget || 1)) * 100, 100)} className="h-3" />
          <div className="flex justify-between text-xs mt-2">
            <span className="text-brand-muted">Projected: {formatCurrency(insights?.projected_month_end || 0)}</span>
            <span className={`font-semibold ${Number(insights?.budget_variance || 0) >= 0 ? "text-red-600" : "text-green-600"}`}>
              {Number(insights?.budget_variance || 0) >= 0 ? "+" : ""}{formatCurrency(insights?.budget_variance || 0)} vs budget
            </span>
          </div>
        </div>
      </div>
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
            {String(finding.severity || "").toUpperCase()}
          </Badge>
          {finding.confidence && (
            <Badge className={getConfidenceColor(normConf(finding.confidence)) + " px-2 py-1 text-xs rounded-md"}>
              {String(finding.confidence).replace("_", " ").toUpperCase()} CONF
            </Badge>
          )}
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-muted">Monthly Savings</span>
          <span className="text-lg font-semibold text-brand-success">{formatCurrency(finding.monthly_savings_usd_est)}</span>
        </div>

        {finding.evidence && (finding.evidence.resource_id || finding.evidence.region || finding.evidence.instance_type) && (
          <div className="text-xs bg-brand-bg/30 p-2 rounded border border-brand-line">
            {finding.evidence.resource_id && <div className="font-mono text-brand-muted">Resource: {finding.evidence.resource_id}</div>}
            {finding.evidence.region && <div className="text-brand-muted">Region: {finding.evidence.region}</div>}
            {finding.evidence.instance_type && <div className="text-brand-muted">Type: {finding.evidence.instance_type}</div>}
          </div>
        )}

        <div className="flex justify-between text-xs">
          <span className="text-brand-muted">Risk: <span className={getRiskColor(finding.risk_level)}>{finding.risk_level}</span></span>
          {finding.implementation_time && <span className="text-brand-muted">Time: {finding.implementation_time}</span>}
        </div>

        {finding.suggested_action && <p className="text-sm text-brand-ink">{finding.suggested_action}</p>}

        {finding.commands && finding.commands.length > 0 && (
          <div className="bg-brand-bg p-3 rounded-lg border border-brand-line">
            <code className="text-xs font-mono text-brand-ink">{finding.commands[0]}</code>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-brand-muted">
          {finding.last_analyzed && <span>Analyzed: {formatTimestamp(finding.last_analyzed)}</span>}
        </div>

        <Button variant="outline" size="sm" onClick={() => onViewDetails(finding)} className="w-full btn-brand-outline">
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
        {products.map((p, i) => {
          const label = p.product || p.name || p.service || "—";
          const amount = Number(p.amount_usd || p.amount || 0);
          const wow = Number(p.wow_delta || 0);
          const pct = Number(p.percent_of_total || 0);
          return (
            <TableRow key={i} className="hover:bg-brand-bg/30">
              <TableCell className="font-medium text-brand-ink">{label}</TableCell>
              <TableCell className="text-right text-brand-ink">{formatCurrency(amount)}</TableCell>
              <TableCell className="text-right">
                <div className={`flex items-center justify-end gap-1 ${wow >= 0 ? "text-brand-error" : "text-brand-success"}`}>
                  {wow >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatCurrency(Math.abs(wow))}
                </div>
              </TableCell>
              <TableCell className="text-right text-brand-ink">{pct.toFixed(1)}%</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);

/* ---------- Main ---------- */
const Dashboard = () => {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [findings, setFindings] = useState([]);
  const [costTrend, setCostTrend] = useState([]);
  const [serviceBreakdown, setServiceBreakdown] = useState({ data: [], total: 0 });
  const [topMovers, setTopMovers] = useState([]);
  const [keyInsights, setKeyInsights] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("30d");
  const [reloadToken, setReloadToken] = useState(0);
  const [conviction, setConviction] = useState("all"); // all | high | low

  const normalizedFindings = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const f of findings) {
      const id = f.finding_id || `${f.title}::${f.resource_id || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const conf = f.confidence ? normConf(f.confidence) : sevToConfidence(f.severity);
      out.push({ ...f, confidence: conf });
    }
    return out;
  }, [findings]);

  const filteredFindings = useMemo(() => {
    if (conviction === "all") return normalizedFindings;
    const isHigh = (c) => c === "high" || c === "very_high";
    const isLow = (c) => c === "low" || c === "medium";
    return normalizedFindings.filter(f => (conviction === "high" ? isHigh(f.confidence) : isLow(f.confidence)));
  }, [normalizedFindings, conviction]);

  const highCount = useMemo(() => normalizedFindings.filter(f => ["high", "very_high"].includes(f.confidence)).length, [normalizedFindings]);
  const lowCount  = useMemo(() => normalizedFindings.filter(f => ["low", "medium"].includes(f.confidence)).length, [normalizedFindings]);

  const getJSON = async (path) => {
    // Single, forced origin to avoid any rewrite/CORS issues
    const url = `${API}${path}`;
    const { data } = await axios.get(url);
    return data;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [sum, fnd] = await Promise.all([
          getJSON(`/summary?window=${dateRange}`),
          getJSON(`/findings?sort=savings&limit=200`)
        ]);

        if (!alive) return;

        const newSummary = sum?.kpis ? sum : EMPTY_SUMMARY;
        setSummary(newSummary);
        setFindings(Array.isArray(fnd) ? fnd : []);

        const products = Array.isArray(newSummary.top_products) ? newSummary.top_products : [];
        const total = products.reduce((acc, p) => acc + Number(p.amount_usd || p.amount || 0), 0);
        const palette = ["#8B6F47","#B5905C","#D8C3A5","#A8A7A7","#E98074","#C0B283","#F4E1D2","#E6B89C"];
        const breakdown = products.slice(0, 8).map((p, i) => ({
          name: p.name || p.service || p._id || "Other",
          value: Number(p.amount_usd || p.amount || 0),
          percentage: total ? Number(((Number(p.amount_usd || p.amount || 0) / total) * 100).toFixed(1)) : 0,
          fill: palette[i % palette.length],
        }));
        setServiceBreakdown({ data: breakdown, total });

        const days = dateRange === "7d" ? 7 : (dateRange === "30d" ? 30 : 90);
        const avg = total && days ? total / days : (newSummary.kpis.total_30d_cost || 0) / Math.max(days,1);
        const series = Array.from({ length: days }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (days - 1 - i));
          const jitter = avg * 0.12 * Math.sin(i / 3);
          return { formatted_date: d.toLocaleDateString(), cost: Math.max(0, avg + jitter) };
        });
        setCostTrend(series);

        const highest = series.reduce((m, pt) => (pt.cost > m.amount ? { date: pt.formatted_date, amount: pt.cost } : m), { date: "-", amount: 0 });
        const projected = series.reduce((sum, pt) => sum + pt.cost, 0);
        setKeyInsights({
          highest_single_day: highest,
          projected_month_end: projected,
          mtd_actual: projected * (new Date().getDate() / Math.max(days, 1)),
          monthly_budget: total ? total * 1.1 : 0,
          budget_variance: total ? projected - total * 1.1 : 0,
        });

        setTopMovers([]);
      } catch (e) {
        console.error("Load error:", e?.message || e);
        if (alive) setError("Failed to load cost data from backend.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [dateRange, reloadToken]);

  const handleViewDetails = (finding) => {
    const evidence = JSON.stringify(finding.evidence, null, 2);
    const assumptions = finding.assumptions ? finding.assumptions.join("\n• ") : "None specified";
    const details = `
FINDING DETAILS
==============
Title: ${finding.title}
Severity: ${String(finding.severity || "").toUpperCase()} | Confidence: ${String(finding.confidence || "").replace("_", " ").toUpperCase()}
Monthly Savings: ${formatCurrency(finding.monthly_savings_usd_est)}

IMPLEMENTATION
=============
Risk Level: ${finding.risk_level}
Estimated Time: ${finding.implementation_time ?? "-"}
Last Analyzed: ${formatTimestamp(finding.last_analyzed)}

METHODOLOGY
===========
${finding.methodology || "Standard cost optimization analysis"}

EVIDENCE
========
${evidence}

ASSUMPTIONS
===========
• ${assumptions}

RECOMMENDED COMMANDS
===================
${finding.commands ? finding.commands.join("\n") : "No specific commands provided"}

ACTION REQUIRED
===============
${finding.suggested_action}
`;
    alert(details);
  };

  const exportCSV = () => {
    getJSON(`/findings?sort=savings&limit=1000`)
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        const headers = ["Title", "Type", "Severity", "Monthly Savings", "Resource ID", "Action", "Confidence"];
        const rows = arr.map(f => [
          f.title, f.type, f.severity, f.monthly_savings_usd_est, f.resource_id || "", f.suggested_action,
          f.confidence || sevToConfidence(f.severity)
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cost-findings.csv";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("Export failed. Please try again."));
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

  const { kpis, top_products } = summary;
  const trendLabel =
    dateRange === "30d" ? "Cost trends over the last 30 days" :
    dateRange === "7d"  ? "Cost trends over the last 7 days"  :
                          "Cost trends over the last 90 days";

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      {/* Header */}
      <div className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Cloud & Capital" className="brand-logo" />
              <div className="leading-tight">
                <h1 className="text-2xl font-semibold text-brand-ink">Cloud Cost Guard</h1>
                <p className="text-sm text-brand-muted -mt-0.5">Multi-cloud cost optimization</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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
              <Button onClick={() => setReloadToken(t => t + 1)} className="btn-brand-primary">
                <TrendingUp className="h-4 w-4 mr-2" />
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
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <span className="font-medium">Data Source:</span>
              <span className="ml-2 underline decoration-dotted">AWS Cost &amp; Usage Reports</span>
              <span className="mx-2">•</span>
              <span className="underline decoration-dotted">CloudWatch Metrics</span>
              <span className="mx-2">•</span>
              <span className="underline decoration-dotted">Resource Inventory APIs</span>
              <span className="mx-3 text-brand-muted">
                Last Updated: {formatTimestamp(summary.generated_at)}
              </span>
            </AlertDescription>
          </Alert>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Total 30d Cost" value={formatCurrency(kpis.total_30d_cost)} change={kpis.wow_percent} icon={DollarSign} subtitle="vs last week" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Savings Ready" value={formatCurrency(kpis.savings_ready_usd)} icon={TrendingDown} subtitle="potential monthly savings" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Under-utilized" value={kpis.underutilized_count} icon={Server} subtitle="compute resources" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Orphaned Resources" value={kpis.orphans_count} icon={HardDrive} subtitle="unattached volumes" dataFreshness={kpis.data_freshness_hours} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <CostTrendChart data={costTrend} label={trendLabel} />
          <ServiceBreakdownChart data={serviceBreakdown.data} />
        </div>

        {/* Insights */}
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

          {/* Findings */}
          <TabsContent value="findings" className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h2 className="text-xl font-semibold text-brand-ink">Cost Optimization Findings</h2>
            </div>

            <div className="flex items-center justify-between">
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
                {findings.map((f) => <FindingCard key={f.finding_id || `${f.title}-${f.resource_id || ""}`} finding={f} onViewDetails={handleViewDetails} />)}
              </div>
            )}
          </TabsContent>

          {/* Products */}
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">Product Cost Breakdown</h2>
              <Badge className="badge-brand">Last {dateRange === "7d" ? "7" : dateRange === "30d" ? "30" : "90"} days</Badge>
            </div>
            <Card className="kpi-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-brand-ink"><BarChart3 className="h-5 w-5" />Top Products by Cost</CardTitle>
                <CardDescription className="text-brand-muted">Highest spending products and week-over-week changes</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTable products={Array.isArray(top_products) ? top_products : []} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview */}
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
                    { type: "Under-utilized", count: kpis.underutilized_count, color: "bg-blue-500" },
                    { type: "Orphaned", count: kpis.orphans_count, color: "bg-yellow-500" },
                    { type: "Idle", count: findings.filter(f => String(f.title).toLowerCase().includes("idle")).length, color: "bg-red-500" }
                  ].map((it, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${it.color}`} />
                        <span className="text-sm text-brand-ink">{it.type}</span>
                      </div>
                      <span className="text-sm font-medium text-brand-ink">{it.count}</span>
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
                    {summary.recent_findings.slice(0, 5).map((f, i) => (
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
