import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

import logo from "./assets/cloud-and-capital-icon.png";

/* Recharts */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

/* UI */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Progress } from "./components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Separator } from "./components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";

/* Icons */
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Server, HardDrive, Eye,
  Download, BarChart3, Target, PieChart as PieChartIcon, TrendingUp as TrendingUpIcon,
  CheckCircle, XCircle, Activity, Upload as UploadIcon, RotateCw
} from "lucide-react";

/* Same-origin API via serverless proxy */
const API = "/api";

/* ---------- Utils ---------- */
const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(amount || 0));

const formatPercent = (percent) => {
  const p = Number(percent || 0);
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
};

/* US date format (MM/DD/YYYY hh:mm am/pm) */
const formatTimestampUS = (timestamp) => {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "-";
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

/* ---------- CSV parsing helpers (client-side, no deps) ---------- */
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const split = (line) => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === "," && !q) {
        out.push(cur); cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map(v => v.trim().replace(/^"(.*)"$/, "$1"));
  };
  const headers = split(lines[0]);
  return lines.slice(1).map(line => {
    const cells = split(line);
    const row = {};
    headers.forEach((h, i) => row[h] = cells[i]);
    return row;
  });
}

const pickKey = (keys, patterns) =>
  keys.find(k => patterns.some(p => k.toLowerCase().includes(p))) || null;

/* ---------- Components ---------- */
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
                formatter={(val, _n, props) => [formatCurrency(val), `${props.payload.name} (${props.payload.percentage}%)`]} />
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

const TopMoversCard = ({ movers, windowLabel = "7d" }) => (
  <Card className="kpi-card">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <TrendingUpIcon className="h-5 w-5" />
        Top Movers ({windowLabel})
      </CardTitle>
      <CardDescription className="text-brand-muted">Biggest cost changes in the selected window</CardDescription>
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
          {finding.last_analyzed && <span>Analyzed: {formatTimestampUS(finding.last_analyzed)}</span>}
        </div>

        <Button variant="outline" size="sm" onClick={() => onViewDetails(finding)} className="w-full btn-brand-outline">
          <Eye className="h-3 w-3 mr-1" />
          View Details & Methodology
        </Button>
      </div>
    </CardContent>
  </Card>
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

  /* CSV mode controls */
  const [csvMode, setCsvMode] = useState(false);
  const fileRef = useRef(null);

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

  const getJSON = async (path) => {
    const url = `${API}${path}`;
    console.log("[Cloud Cost Guard] Fetch:", url);
    const { data } = await axios.get(url);
    return data;
  };

  /* Load backend (demo) data */
  useEffect(() => {
    if (csvMode) return; // don't clobber CSV view
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [sum, fnd, mvRaw] = await Promise.all([
          getJSON(`/summary?window=${dateRange}`),
          getJSON(`/findings?sort=savings&limit=200`),
          getJSON(`/movers?window=${dateRange}`),
        ]);

        if (!alive) return;

        const newSummary = sum?.kpis ? sum : EMPTY_SUMMARY;
        setSummary(newSummary);
        setFindings(Array.isArray(fnd) ? fnd : []);

        /* Service breakdown from summary.top_products */
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

        /* Synthetic daily series to keep chart lively */
        const days = dateRange === "7d" ? 7 : (dateRange === "30d" ? 30 : 90);
        const avg = total && days ? total / days : (newSummary.kpis.total_30d_cost || 0) / Math.max(days,1);
        const series = Array.from({ length: days }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (days - 1 - i));
          const jitter = avg * 0.12 * Math.sin(i / 3);
          return { formatted_date: d.toLocaleDateString(), cost: Math.max(0, avg + jitter) };
        });
        setCostTrend(series);

        /* Key insights */
        const highest = series.reduce((m, pt) => (pt.cost > m.amount ? { date: pt.formatted_date, amount: pt.cost } : m), { date: "-", amount: 0 });
        const projected = series.reduce((sum, pt) => sum + pt.cost, 0);
        setKeyInsights({
          highest_single_day: highest,
          projected_month_end: projected,
          mtd_actual: projected * (new Date().getDate() / Math.max(days, 1)),
          monthly_budget: total ? total * 1.1 : 0,
          budget_variance: total ? projected - total * 1.1 : 0,
        });

        /* Map movers */
        const mv = Array.isArray(mvRaw) ? mvRaw : [];
        const mappedMovers = mv.map((m) => {
          const prev = Number(m.prev_usd ?? m.previous_cost ?? 0);
          const curr = Number(m.current_usd ?? m.current_cost ?? m.amount_usd ?? 0);
          const changeAmt = Number(
            (m.change_usd ?? m.delta_usd ?? (curr - prev)).toFixed
              ? (m.change_usd ?? m.delta_usd ?? (curr - prev)).toFixed(2)
              : (curr - prev).toFixed(2)
          );
          const rawPct =
            m.change_pct ?? m.delta_pct ??
            (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0));
          const changePct = Math.round(Number(rawPct || 0) * 10) / 10;

          return {
            service: m.service || m.name || "—",
            previous_cost: prev,
            current_cost: curr,
            change_amount: changeAmt,
            change_percent: changePct
          };
        });
        setTopMovers(mappedMovers);

      } catch (e) {
        console.error("Load error:", e?.message || e, e?.response?.status, e?.config?.url);
        if (alive) setError("Failed to load cost data from backend.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [dateRange, reloadToken, csvMode]);

  /* ----- CSV uploader (AWS Cost Explorer) ----- */
  const handleChooseCSV = () => fileRef.current?.click();

  const handleCSV = async (file) => {
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) return alert("CSV seems empty.");

      const keys = Object.keys(rows[0] || {});
      const dateKey = pickKey(keys, ["date", "start", "usage", "time"]);
      const serviceKey = pickKey(keys, ["service", "productname", "product"]);
      const costKey = pickKey(keys, ["unblended", "amortized", "blended", "netamortized", "cost", "amount"]);

      if (!dateKey || !serviceKey || !costKey) {
        return alert("Couldn't detect Date / Service / Cost columns. Export a Cost Explorer CSV grouped by Service (Daily) and try again.");
      }

      // Normalize rows
      const norm = rows.map(r => {
        const rawCost = String(r[costKey] ?? "").replace(/[^0-9\.\-]/g, "");
        const cost = Number.parseFloat(rawCost || "0") || 0;
        const d = new Date(r[dateKey]);
        if (isNaN(d.getTime())) return null;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2,"0");
        const dd = String(d.getDate()).padStart(2,"0");
        return {
          dateISO: `${yyyy}-${mm}-${dd}`,
          service: String(r[serviceKey] || "").trim() || "Unknown",
          cost
        };
      }).filter(Boolean);

      if (!norm.length) return alert("No parsable rows found in CSV.");

      // Determine window: last up to 30 distinct days, and the previous same-size window (if present)
      const datesAsc = Array.from(new Set(norm.map(n => n.dateISO))).sort();
      const N = Math.min(30, datesAsc.length);
      const currentDates = datesAsc.slice(-N);
      const prevDates = datesAsc.slice(-(2*N), -N);

      // Group helpers
      const sumBy = (arr, keyFn) => {
        const m = new Map();
        for (const x of arr) {
          const k = keyFn(x);
          m.set(k, (m.get(k) || 0) + x.cost);
        }
        return m;
      };

      const currentRows = norm.filter(n => currentDates.includes(n.dateISO));
      const prevRows = norm.filter(n => prevDates.includes(n.dateISO));

      const byServiceCurrent = sumBy(currentRows, r => r.service);
      const byServicePrev = sumBy(prevRows, r => r.service);
      const totalCurrent = Array.from(byServiceCurrent.values()).reduce((a,b)=>a+b,0);
      const totalPrev = Array.from(byServicePrev.values()).reduce((a,b)=>a+b,0);

      // Summary
      const csvSummary = {
        kpis: {
          total_30d_cost: totalCurrent,
          wow_percent: totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : 0,
          mom_percent: 0,
          savings_ready_usd: 0,
          underutilized_count: 0,
          orphans_count: 0,
          data_freshness_hours: 0
        },
        top_products: Array.from(byServiceCurrent.entries())
          .map(([service, amount]) => ({ _id: service, name: service, service, window: `${N}d`, amount_usd: amount }))
          .sort((a,b)=>b.amount_usd - a.amount_usd)
          .slice(0, 20),
        recent_findings: [],
        window: `${N}d`,
        generated_at: new Date().toISOString()
      };

      // Movers
      const movers = Array.from(new Set([...byServiceCurrent.keys(), ...byServicePrev.keys()])).map(svc => {
        const curr = byServiceCurrent.get(svc) || 0;
        const prev = byServicePrev.get(svc) || 0;
        const delta = curr - prev;
        const pct = prev > 0 ? (delta / prev) * 100 : (curr > 0 ? 100 : 0);
        return {
          service: svc,
          previous_cost: prev,
          current_cost: curr,
          change_amount: Math.round(delta * 100) / 100,
          change_percent: Math.round(pct * 10) / 10
        };
      }).sort((a,b)=>Math.abs(b.change_amount) - Math.abs(a.change_amount));

      // Daily trend (current window)
      const byDateCurrent = sumBy(currentRows, r => r.dateISO);
      const costTrendSeries = currentDates.map(iso => {
        const [y,m,d] = iso.split("-");
        const display = new Date(`${iso}T00:00:00Z`).toLocaleDateString();
        return { formatted_date: display, cost: byDateCurrent.get(iso) || 0 };
      });

      // Service breakdown
      const total = totalCurrent;
      const palette = ["#8B6F47","#B5905C","#D8C3A5","#A8A7A7","#E98074","#C0B283","#F4E1D2","#E6B89C"];
      const breakdown = csvSummary.top_products.slice(0, 8).map((p, i) => ({
        name: p.name, value: p.amount_usd,
        percentage: total ? Number(((p.amount_usd / total) * 100).toFixed(1)) : 0,
        fill: palette[i % palette.length]
      }));

      // Apply to UI
      setSummary(csvSummary);
      setTopMovers(movers);
      setCostTrend(costTrendSeries);
      setServiceBreakdown({ data: breakdown, total });
      setFindings([]); // CSV mode has no findings
      setKeyInsights({
        highest_single_day: costTrendSeries.reduce((m, pt) => (pt.cost > m.amount ? { date: pt.formatted_date, amount: pt.cost } : m), { date: "-", amount: 0 }),
        projected_month_end: costTrendSeries.reduce((s, pt)=>s+pt.cost, 0),
        mtd_actual: costTrendSeries.reduce((s, pt)=>s+pt.cost, 0),
        monthly_budget: total ? total * 1.1 : 0,
        budget_variance: total ? (costTrendSeries.reduce((s,p)=>s+p.cost,0) - total*1.1) : 0
      });
      setCsvMode(true);
    } catch (err) {
      console.error(err);
      alert("Failed to read CSV. Please export from AWS Cost Explorer (Group by Service, Time: Daily) and try again.");
    }
  };

  const resetCSV = () => {
    setCsvMode(false);
    setReloadToken(t => t + 1); // refetch backend data
  };

  const handleViewDetails = (finding) => {
    const evidence = JSON.stringify(finding.evidence, null, 2);
    const details = `FINDING: ${finding.title}\nSavings: ${formatCurrency(finding.monthly_savings_usd_est)}\n\n${evidence}`;
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
    (csvMode ? `Cost trends over the last ${summary.window}` :
    dateRange === "30d" ? "Cost trends over the last 30 days" :
    dateRange === "7d"  ? "Cost trends over the last 7 days"  :
                          "Cost trends over the last 90 days");

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      <div className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Cloud & Capital" className="brand-logo" />
              <div className="leading-tight">
                <h1 className="brand-title">Cloud Cost Guard</h1>
                <p className="brand-subtitle">Multi-cloud cost optimization</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Try your AWS CSV */}
              <input
                type="file"
                accept=".csv,text/csv"
                ref={fileRef}
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleCSV(e.target.files[0])}
              />
              {!csvMode ? (
                <Button variant="outline" onClick={handleChooseCSV} className="btn-brand-outline">
                  <UploadIcon className="h-4 w-4 mr-2" />
                  Try your AWS CSV
                </Button>
              ) : (
                <Button variant="outline" onClick={resetCSV} className="btn-brand-outline">
                  <RotateCw className="h-4 w-4 mr-2" />
                  Reset (demo data)
                </Button>
              )}

              <Select value={dateRange} onValueChange={setDateRange} disabled={csvMode}>
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

              {/* Refresh with the wave icon, matching the PDF */}
              <Button onClick={() => (csvMode ? resetCSV() : setReloadToken(t => t + 1))} className="btn-brand-primary">
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Alert className="bg-blue-50 border-blue-200">
            {/* Wave/heartbeat icon like your screenshot */}
            <Activity className="h-4 w-4 text-brand-ink" />
            <AlertDescription className="text-blue-800">
              <span className="font-medium">Data Source:</span>
              <span className="ml-2 underline decoration-dotted">AWS Cost &amp; Usage Reports</span>
              <span className="mx-2">•</span>
              <span className="underline decoration-dotted">CloudWatch Metrics</span>
              <span className="mx-2">•</span>
              <span className="underline decoration-dotted">Resource Inventory APIs</span>
              {/* Blue, US-format timestamp */}
              <span className="mx-3 text-blue-700">
                Last Updated: {formatTimestampUS(summary.generated_at)}
              </span>
              {csvMode && <span className="ml-2 badge-brand">CSV Data</span>}
            </AlertDescription>
          </Alert>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title={summary.window?.includes("d") ? `Total ${summary.window} Cost` : "Total 30d Cost"} value={formatCurrency(kpis.total_30d_cost)} change={kpis.wow_percent} icon={DollarSign} subtitle="vs last period" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Savings Ready" value={formatCurrency(kpis.savings_ready_usd)} icon={TrendingDown} subtitle="potential monthly savings" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Under-utilized" value={kpis.underutilized_count} icon={Server} subtitle="compute resources" dataFreshness={kpis.data_freshness_hours} />
          <KPICard title="Orphaned Resources" value={kpis.orphans_count} icon={HardDrive} subtitle="unattached volumes" dataFreshness={kpis.data_freshness_hours} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <CostTrendChart data={costTrend} label={trendLabel} />
          <ServiceBreakdownChart data={Array.isArray(serviceBreakdown.data) ? serviceBreakdown.data : []} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <TopMoversCard movers={topMovers} windowLabel={csvMode ? summary.window : dateRange} />
          <KeyInsightsCard insights={keyInsights} />
        </div>

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
            {csvMode || findings.length === 0 ? (
              <Card className="kpi-card">
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-brand-success mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-brand-ink mb-2">{csvMode ? "CSV mode: findings unavailable" : "All Optimized!"}</h3>
                  <p className="text-brand-muted">
                    {csvMode ? "Upload includes costs only. Connect read-only APIs to analyze findings." : "No cost optimization opportunities found at this time."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normalizedFindings.map((f) => <FindingCard key={f.finding_id || `${f.title}-${f.resource_id || ""}`} finding={f} onViewDetails={handleViewDetails} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-brand-ink">Product Cost Breakdown</h2>
              <Badge className="badge-brand">Last {csvMode ? summary.window.replace("d","") : (dateRange === "7d" ? "7" : dateRange === "30d" ? "30" : "90")} days</Badge>
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
                    { type: "Idle", count: Array.isArray(findings) ? findings.filter(f => String(f.title).toLowerCase().includes("idle")).length : 0, color: "bg-red-500" }
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
                    {(csvMode ? [] : (Array.isArray(summary.recent_findings) ? summary.recent_findings.slice(0, 5) : [])).map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-brand-bg/50 rounded-lg border border-brand-line">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(f.severity)}
                          <span className="text-sm text-brand-ink truncate max-w-48">{f.title}</span>
                        </div>
                        <span className="text-sm font-medium text-brand-success">{formatCurrency(f.monthly_savings_usd_est)}</span>
                      </div>
                    ))}
                    {csvMode && (
                      <div className="text-sm text-brand-muted">Upload your CSV only affects costs; findings require connected cloud metrics.</div>
                    )}
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
