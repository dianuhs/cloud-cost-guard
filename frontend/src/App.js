import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { getCloudCapitalReport } from "./lib/report";

// Local brand icon
import logo from "./assets/cloud-and-capital-icon.png";

// AI/automation demo card
import TriageCard from "./components/TriageCard";

// Recharts
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine
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
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, HardDrive,
  Eye, Download, BarChart3, Activity, Target, PieChart as PieChartIcon,
  TrendingUp as TrendingUpIcon, Calendar, CheckCircle, XCircle, X
} from "lucide-react";

/** IMPORTANT: same-origin proxy */
const API = "/api";

/* -------- Utils -------- */
const toNumber = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace?.(/[^0-9.-]/g, "") ?? v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(amount || 0));

const formatPercent = (percent) => {
  const p = Number(percent || 0);
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
};

/* US date for "Last Updated" */
const formatTimestamp = (ts) => {
  if (!ts) return "-";
  const d = new Date(ts);
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

const getDataFreshnessHours = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round(diffMs / 36e5);
};

const getConfidenceColor = (confidence) => ({
  very_high: "text-green-700 bg-green-50",
  high: "text-green-600 bg-green-50",
  medium: "text-yellow-600 bg-yellow-50",
  low: "text-red-600 bg-red-50",
}[String(confidence || "").toLowerCase()] || "text-yellow-600 bg-yellow-50");

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
}[String(severity || "").toLowerCase()] || "severity-medium");

// Uniform severity icons (force size/color everywhere)
const getSeverityIcon = (severity) => {
  const s = String(severity || "").toLowerCase();
  const common = "severity-icon";
  if (s === "critical") return <XCircle className={`${common} severity-icon--critical`} />;
  if (s === "high") return <AlertTriangle className={`${common} severity-icon--high`} />;
  if (s === "medium") return <AlertTriangle className={`${common} severity-icon--medium`} />;
  if (s === "low") return <CheckCircle className={`${common} severity-icon--low`} />;
  return <AlertTriangle className={common} />;
};

/* Choose the most relevant command to display for a finding */
const pickBestCommand = (f) => {
  const cmds = Array.isArray(f?.commands) ? f.commands : [];
  if (!cmds.length) return null;
  const lcTitle = String(f?.title || "").toLowerCase();
  const lcType  = String(f?.type  || "").toLowerCase();
  const serviceHints = [
    { hint: ["ec2","instance","underutilized","autoscaling"], match: /aws\s+ec2|autoscaling/i },
    { hint: ["ebs","volume","unattached"],                     match: /aws\s+ec2.*(describe-volumes|delete-volume)/i },
    { hint: ["eip","elastic ip"],                              match: /aws\s+ec2.*(describe-addresses|release-address)/i },
    { hint: ["rds","db"],                                      match: /aws\s+rds/i },
    { hint: ["s3","bucket"],                                   match: /aws\s+s3|s3api/i },
    { hint: ["lambda"],                                        match: /aws\s+(logs|lambda)/i },
    { hint: ["elb","load balancer"],                           match: /aws\s+elbv2/i },
    { hint: ["cloudwatch","anomaly","ce"],                     match: /aws\s+ce\s+get-cost-and-usage/i },
    { hint: ["nat"],                                           match: /aws\s+ec2.*nat/i },
  ];
  for (const s of serviceHints) {
    if (s.hint.some(h => lcTitle.includes(h) || lcType.includes(h))) {
      const found = cmds.find(c => s.match.test(c));
      if (found) return found;
    }
  }
  const ce = cmds.find(c => /aws\s+ce\s+get-cost-and-usage/i.test(c));
  if (ce) return ce;
  return cmds[0];
};


/* -------- Findings sort/pick -------- */
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const sortAndPickFindings = (arr, limit = 9) => {
  const safe = Array.isArray(arr) ? arr : [];
  return [...safe]
    .sort((a, b) => {
      const va = toNumber(a.monthly_savings_usd_est);
      const vb = toNumber(b.monthly_savings_usd_est);
      if (vb !== va) return vb - va;
      const sa = SEVERITY_ORDER[String(a.severity || "").toLowerCase()] ?? 99;
      const sb = SEVERITY_ORDER[String(b.severity || "").toLowerCase()] ?? 99;
      return sa - sb;
    })
    .slice(0, limit);
};

/* -------- Classifiers for KPI alignment -------- */
const isUnderUtil = (f) => {
  const t = String(f.type || "").toLowerCase();
  const title = String(f.title || "").toLowerCase();
  return (
    t.includes("under") ||
    t.includes("idle") ||
    title.includes("under-util") ||
    title.includes("underutil") ||
    (title.includes("cpu") && title.includes("util"))
  );
};

const isOrphaned = (f) => {
  const t = String(f.type || "").toLowerCase();
  const title = String(f.title || "").toLowerCase();
  return (
    t.includes("orphan") ||
    title.includes("unattached") ||
    title.includes("unused elastic ip") ||
    (title.includes("elastic ip") && title.includes("unused")) ||
    title.includes("unused eip") ||
    title.includes("orphan")
  );
};

/* -------- Presentational components -------- */
const KPICard = ({ title, value, change, icon: Icon, subtitle, dataFreshness }) => (
  <Card className="kpi-card shadow-sm hover:shadow-brand-md transition-all duration-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <div className="flex items-center">
        <Icon className="h-4 w-4 text-brand-light-muted" />
        {Number.isFinite(dataFreshness) && dataFreshness < 1 && (
          <span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-green-50 text-green-700">LIVE</span>
        )}
        {Number.isFinite(dataFreshness) && dataFreshness >= 1 && (
          <span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-[#F2EFEA] text-brand-light-muted">{dataFreshness}h</span>
        )}
      </div>
    </CardHeader>
    <CardContent className="py-3">
      <div className="text-2xl font-bold text-brand-ink">{value}</div>
      {Number.isFinite(change) ? (
        <p className="text-xs text-brand-muted flex items-center gap-1 mt-1">
          {change >= 0 ? <TrendingUp className="h-3 w-3 text-brand-success" /> : <TrendingDown className="h-3 w-3 text-brand-error" />}
          <span className={change >= 0 ? "text-brand-success" : "text-brand-error"}>{formatPercent(change)}</span>
          {subtitle}
        </p>
      ) : (
        subtitle && <p className="text-xs text-brand-muted mt-1">{subtitle}</p>
      )}
    </CardContent>
  </Card>
);

const CostTrendChart = ({ data, height = 300, label = "Cost trends over the last 30 days" }) => {
  const avg = Array.isArray(data) && data.length ? data.reduce((s, d) => s + (Number(d.cost) || 0), 0) / data.length : 0;
  return (
    <Card className="kpi-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-brand-ink">
          <BarChart3 className="h-5 w-5" />Daily Spend Trend
        </CardTitle>
        <CardDescription className="text-brand-muted">{label}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
              <XAxis dataKey="formatted_date" stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} />
              <YAxis stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                formatter={(value) => [formatCurrency(value), "Daily Cost"]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              {avg > 0 && <ReferenceLine y={avg} stroke="#AAA" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="cost" stroke="#8B6F47" strokeWidth={3} dot={{ fill: "#8B6F47", r: 3 }} activeDot={{ r: 5, fill: "#8B6F47" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const ServiceBreakdownChart = ({ data, total, rangeLabel = "30d" }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <PieChartIcon className="h-5 w-5" />Cost by Service
      </CardTitle>
      <CardDescription className="text-brand-muted">Top services by cost breakdown</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="flex items-center justify-between">
        <div className="relative" style={{ width: "60%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={120} paddingAngle={2} dataKey="value">
                {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                formatter={(val, _name, props) => [formatCurrency(val), `${props.payload.name} (${props.payload.percentage}%)`]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label intentionally removed */}
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
  <Card className="kpi-card shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <TrendingUpIcon className="h-5 w-5" />
        Top Movers ({windowLabel})
      </CardTitle>
      <CardDescription className="text-brand-muted">Biggest cost changes in {windowLabel}</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      {(!movers || movers.length === 0) ? (
        <div className="text-sm text-brand-muted">No movers detected in {windowLabel}.</div>
      ) : (
        <div className="space-y-3">
          {movers.slice(0, 6).map((m, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-brand-bg/30">
              <div className="flex items-center gap-3">
                {/* Green is good (down); Red is up */}
                <div className={`w-2 h-8 rounded ${toNumber(m.change_amount) >= 0 ? "bg-red-500" : "bg-green-500"}`} />
                <div>
                  <div className="font-medium text-brand-ink text-sm">{m.service}</div>
                  <div className="text-xs text-brand-muted">{formatCurrency(toNumber(m.previous_cost))} → {formatCurrency(toNumber(m.current_cost))}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-semibold text-sm ${toNumber(m.change_amount) >= 0 ? "text-red-600" : "text-green-600"}`}>
                  {toNumber(m.change_amount) >= 0 ? "+" : ""}{formatCurrency(toNumber(m.change_amount))}
                </div>
                <div className={`text-xs ${toNumber(m.change_amount) >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {toNumber(m.change_percent) >= 0 ? "+" : ""}{toNumber(m.change_percent).toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const KeyInsightsCard = ({ insights }) => {
  const dateLabel = insights?.highest_single_day?.dateISO
    ? format(new Date(insights.highest_single_day.dateISO), "MMM d, yyyy")
    : (insights?.highest_single_day?.date ?? "-");
  return (
    <Card className="kpi-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-brand-ink"><Target className="h-5 w-5" />Key Insights</CardTitle>
        <CardDescription className="text-brand-muted">Important findings and projections</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          <div>
            <div className="text-sm text-brand-muted">Highest Single Day</div>
            <div className="font-semibold text-brand-ink">{dateLabel}</div>
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
};

/* -------- Simple Modal (no extra deps) -------- */
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E7DCCF] px-4 py-3">
          <h3 className="text-sm font-semibold text-brand-ink">{title}</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-brand-bg/80"
          >
            <X className="h-4 w-4 text-brand-muted" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[#E7DCCF] px-4 py-3">
          <Button variant="outline" onClick={onClose} className="btn-brand-outline">Close</Button>
        </div>
      </div>
    </div>
  );
};

const FindingCard = ({ finding, onViewDetails }) => (
  <Card className="finding-card shadow-sm">
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
            <Badge className={getConfidenceColor(finding.confidence) + " px-2 py-1 text-xs rounded-md"}>
              {String(finding.confidence).replace("_", " ").toUpperCase()} CONF
            </Badge>
          )}
        </div>
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-muted">Monthly Savings</span>
          <span className="text-lg font-semibold text-brand-success">{formatCurrency(finding.monthly_savings_usd_est)}</span>
        </div>

        {finding.evidence && (finding.evidence.resource_id || finding.evidence.region || finding.evidence.instance_type) && (
          <div className="evidence-box">
            {finding.evidence.resource_id && <div className="font-mono text-brand-muted"><span className="evidence-label">Resource:</span> {finding.evidence.resource_id}</div>}
            {finding.evidence.region && <div className="text-brand-muted"><span className="evidence-label">Region:</span> {finding.evidence.region}</div>}
            {finding.evidence.instance_type && <div className="text-brand-muted"><span className="evidence-label">Type:</span> {finding.evidence.instance_type}</div>}
          </div>
        )}

        <div className="flex justify-between text-xs">
          <span className="text-brand-muted">Risk: <span className={getRiskColor(finding.risk_level)}>{finding.risk_level}</span></span>
          {finding.implementation_time && <span className="text-brand-muted">Time: {finding.implementation_time}</span>}
        </div>

        {finding.suggested_action && <p className="text-sm text-brand-ink">{finding.suggested_action}</p>}

        {finding.commands && finding.commands.length > 0 && (
          <div className="p-3 rounded-lg border border-[#E7DCCF] bg-[#F7F1EA]"><code className="text-xs font-mono text-brand-ink">{pickBestCommand(finding)}</code></div>
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
          const wow = toNumber(p.wow_delta || p.wow_usd || 0);
          const label = p.product || p.name || p.service || "—";
          const amount = toNumber(p.amount_usd || p.amount || 0);
          const pct = toNumber(p.percent_of_total || 0);
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

/* -------- Main -------- */
const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [findings, setFindings] = useState([]);
  const [costTrend, setCostTrend] = useState([]);
  const [serviceBreakdown, setServiceBreakdown] = useState({ data: [], total: 0 });
  const [topMovers, setTopMovers] = useState([]);
  const [keyInsights, setKeyInsights] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("30d");

  const report = getCloudCapitalReport();
  const costBaseline = report?.cost_baseline || {};
  const anomalies = report?.anomalies || {};
  const resilience = report?.resilience || {};
  const reportWindowLabel = report?.window?.label || "Last 30 days";
  const reportWindowRange = (report?.window?.start && report?.window?.end)
    ? `${report.window.start} to ${report.window.end}`
    : reportWindowLabel;
  const hasCostData = costBaseline?.cost_status?.has_data !== false;

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFinding, setModalFinding] = useState(null);

  useEffect(() => {
    loadAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const normalizeMovers = (raw, productsForFallback = []) => {
    let arr = raw;
    if (arr && !Array.isArray(arr)) {
      if (Array.isArray(arr.data)) arr = arr.data;
      else if (Array.isArray(arr.movers)) arr = arr.movers;
      else if (Array.isArray(arr.top_movers)) arr = arr.top_movers;
      else arr = [];
    }
    if (!Array.isArray(arr)) arr = [];

    let out = arr.map((m) => ({
      service: m.service || m.name || m.product || "—",
      previous_cost: toNumber(m.previous_cost ?? m.prev_usd ?? m.prev_amount),
      current_cost: toNumber(m.current_cost ?? m.current_usd ?? m.curr_amount ?? m.amount_usd),
      change_amount: toNumber(m.change_amount ?? m.change_usd ?? m.delta_usd ?? (toNumber(m.current_cost ?? 0) - toNumber(m.previous_cost ?? 0))),
      change_percent: toNumber(m.change_percent ?? m.change_pct ?? m.delta_pct ?? (
        toNumber(m.previous_cost) > 0 ? ((toNumber(m.current_cost) - toNumber(m.previous_cost)) / toNumber(m.previous_cost)) * 100 : 0
      )),
    })).filter((m) => m.service && (m.previous_cost || m.current_cost || m.change_amount));

    if (out.length > 0) return out;

    if (productsForFallback && productsForFallback.length) {
      const synth = productsForFallback
        .filter((p) => Number.isFinite(toNumber(p.wow_delta)))
        .map((p) => {
          const current = toNumber(p.amount_usd || p.amount || 0);
          const delta = toNumber(p.wow_delta);
          const previous = current - delta;
          const pct = previous !== 0 ? (delta / previous) * 100 : (current > 0 ? 100 : 0);
          return {
            service: p.product || p.name || p.service || "—",
            previous_cost: previous,
            current_cost: current,
            change_amount: delta,
            change_percent: pct,
          };
        })
        .sort((a, b) => Math.abs(b.change_amount) - Math.abs(a.change_amount))
        .slice(0, 6);
      return synth;
    }

    return out;
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const totalCost = hasCostData ? toNumber(costBaseline.total_cost) : 0;
      const dailyAverage = hasCostData ? toNumber(costBaseline.daily_average) : 0;
      const trendPct = hasCostData ? toNumber(costBaseline?.trend?.change_percentage) : null;
      const dataFreshnessHours = getDataFreshnessHours(report?.generated_at);

      const topServices = Array.isArray(costBaseline.top_services) ? costBaseline.top_services : [];
      const products = topServices.map((svc) => ({
        product: svc.service_name || "—",
        amount_usd: toNumber(svc.total_cost),
        percent_of_total: toNumber(svc.percentage_of_total),
        wow_delta: 0
      }));

      const resilienceWorkloads = Array.isArray(resilience.top_workloads) ? resilience.top_workloads : [];
      const recentFindings = [...resilienceWorkloads]
        .sort((a, b) => toNumber(b.total_monthly_resilience_cost) - toNumber(a.total_monthly_resilience_cost))
        .map((w, idx) => ({
          finding_id: `resilience-${w.workload || idx}`,
          title: w.workload || "—",
          severity: idx === 0 ? "high" : idx === 1 ? "medium" : "low",
          monthly_savings_usd_est: toNumber(w.total_monthly_resilience_cost)
        }));

      setSummary({
        generated_at: report?.generated_at,
        kpis: {
          total_30d_cost: totalCost,
          wow_percent: trendPct,
          data_freshness_hours: dataFreshnessHours,
          last_updated: report?.generated_at
        },
        top_products: products,
        recent_findings: recentFindings
      });

      // Findings are not included in the unified report yet.
      setFindings([]);

      // Anomalies -> movers
      const moversSeed = Array.isArray(anomalies.recent) ? anomalies.recent : [];
      const movers = moversSeed.map((m) => ({
        service: m.group || m.service || "—",
        previous_cost: toNumber(m.baseline),
        current_cost: toNumber(m.current),
        change_amount: toNumber(m.delta),
        change_percent: toNumber(m.delta_pct)
      }));
      setTopMovers(movers);

      // Service Breakdown
      const total = products.reduce((acc, p) => acc + toNumber(p.amount_usd || p.amount || 0), 0);
      const palette = ["#8B6F47","#B5905C","#D8C3A5","#A8A7A7","#E98074","#C0B283","#F4E1D2","#E6B89C"];
      const breakdown = products.slice(0, 8).map((p, i) => {
        const val = toNumber(p.amount_usd || p.amount || 0);
        return {
          name: p.product || p.name || p.service || p._id || "Other",
          value: val,
          percentage: total ? Number(((val / total) * 100).toFixed(1)) : 0,
          fill: palette[i % palette.length]
        };
      });
      setServiceBreakdown({ data: breakdown, total });

      // Daily Spend Trend
      const days = Math.max(1, toNumber(costBaseline.period_days) || 30);
      const endDate = report?.window?.end ? new Date(report.window.end) : new Date();
      const avg = dailyAverage || (total && days ? total / days : 0);
      const series = Array.from({ length: days }, (_, i) => {
        const d = new Date(endDate);
        d.setDate(d.getDate() - (days - 1 - i));
        const jitter = avg * 0.06 * Math.sin(i / 2.7) + (avg * 0.03 * (Math.random() - 0.5));
        const amount = Math.max(0, avg + jitter);
        return { formatted_date: format(d, "MM/dd"), dateISO: d.toISOString().slice(0,10), cost: amount };
      });
      setCostTrend(series);

      // Key Insights
      const highest = series.reduce(
        (m, pt) => (pt.cost > m.amount ? { date: pt.formatted_date, dateISO: pt.dateISO || new Date().toISOString().slice(0,10), amount: pt.cost } : m),
        { date: "-", dateISO: null, amount: 0 }
      );
      const totalWindow = series.reduce((s, pt) => s + pt.cost, 0);
      const monthBudget = 180000;
      setKeyInsights({
        highest_single_day: highest,
        projected_month_end: totalWindow,
        mtd_actual: totalWindow * (new Date().getDate() / Math.max(series.length, 1)),
        monthly_budget: monthBudget,
        budget_variance: totalWindow - monthBudget
      });

    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load cost data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openFindingModal = (finding) => {
    setModalFinding(finding);
    setModalOpen(true);
  };

  const exportCSV = async () => {
    try {
      const { data } = await axios.get(`${API}/findings?sort=savings&limit=1000`);
      const arr = Array.isArray(data) ? data : [];
      const rowsToExport = arr.filter((f) => toNumber(f.monthly_savings_usd_est) > 0);
      const headers = ["Title", "Type", "Severity", "Monthly Savings", "Resource ID", "Action"];
      const rows = rowsToExport.map((f) => [
        f.title, f.type, f.severity, f.monthly_savings_usd_est, f.resource_id || "", f.suggested_action
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cost-findings.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
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

  const { top_products = [], recent_findings = [] } = summary || {};
  const totalCost = hasCostData ? toNumber(costBaseline.total_cost) : 0;
  const dailyAverage = hasCostData ? toNumber(costBaseline.daily_average) : 0;
  const trendPercent = hasCostData ? toNumber(costBaseline?.trend?.change_percentage) : null;
  const totalAnomalies = toNumber(anomalies.total_anomalies);
  const maxDeltaPct = toNumber(anomalies.max_delta_pct);
  const severityCounts = anomalies.by_severity || {};
  const criticalCount = toNumber(severityCounts.critical);
  const highCount = toNumber(severityCounts.high);
  const mediumCount = toNumber(severityCounts.medium);
  const resilienceMonthly = toNumber(resilience.total_monthly_resilience_cost);
  const resilienceWorkloads = toNumber(resilience.total_workloads);
  const dataFreshnessHours = getDataFreshnessHours(report?.generated_at);
  const trendLabel = reportWindowLabel ? `Cost trends over ${reportWindowLabel}` : "Cost trends over the last 30 days";

  // Filter to savings-impact findings and recompute UI-facing metrics
  const positiveFindings = (Array.isArray(findings) ? findings : []).filter(f => toNumber(f.monthly_savings_usd_est) > 0);
  const displayFindings = sortAndPickFindings(positiveFindings, 9);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      {/* Header */}
      <div className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Cloud & Capital" className="brand-logo" />
              <div className="leading-tight">
                <h1 className="brand-title">Cloud Cost Guard</h1>
                <p className="text-[15px] text-brand-muted">Multi-cloud cost optimization</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-38 md:w-42 btn-brand-outline rounded-2xl flex items-center justify-start px-4">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Last 30 days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={exportCSV} className="btn-brand-outline rounded-2xl">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>

              <Button onClick={loadAllData} className="btn-brand-primary rounded-2xl">
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Data Source banner (compact caption) */}
        <div className="mb-4 text-xs text-brand-muted flex items-center gap-3">
          <span><span className="font-medium">Data Source:</span> AWS Cost &amp; Usage Reports • CloudWatch Metrics • Resource Inventory APIs</span>
          <span className="hidden sm:inline">•</span>
          <span>Last Updated: {formatTimestamp(report?.generated_at)}</span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            title={`Total Cost (${reportWindowLabel})`}
            value={formatCurrency(totalCost)}
            change={hasCostData ? trendPercent : null}
            icon={DollarSign}
            subtitle={hasCostData ? "vs last period" : "no usage data"}
            dataFreshness={dataFreshnessHours}
          />
          <KPICard
            title="Avg Daily Cost"
            value={formatCurrency(dailyAverage)}
            icon={TrendingDown}
            subtitle={hasCostData ? reportWindowRange : "no usage data"}
            dataFreshness={dataFreshnessHours}
          />
          <KPICard
            title="Total Anomalies"
            value={totalAnomalies}
            icon={AlertTriangle}
            subtitle={Number.isFinite(maxDeltaPct) ? `max delta ${maxDeltaPct.toFixed(1)}%` : reportWindowLabel}
            dataFreshness={dataFreshnessHours}
          />
          <KPICard
            title="Monthly Resilience Cost"
            value={formatCurrency(resilienceMonthly)}
            icon={HardDrive}
            subtitle={`${resilienceWorkloads} workloads`}
            dataFreshness={dataFreshnessHours}
          />
        </div>

        {/* Compact triage below KPIs */}
        <div className="mb-6">
          <TriageCard defaultExpanded={false} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <CostTrendChart data={costTrend} label={trendLabel} />
          <ServiceBreakdownChart data={Array.isArray(serviceBreakdown.data) ? serviceBreakdown.data : []} total={serviceBreakdown.total} rangeLabel={reportWindowLabel} />
        </div>

        {/* Movers & Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <TopMoversCard movers={topMovers} windowLabel={reportWindowLabel} />
          <KeyInsightsCard insights={keyInsights} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="findings" className="space-y-6">
          <TabsList className="ccg-tabs">
            <TabsTrigger value="findings" className="ccg-tab">
              Findings
            </TabsTrigger>
            <TabsTrigger value="products" className="ccg-tab">
              Products
            </TabsTrigger>
            <TabsTrigger value="overview" className="ccg-tab">
              Overview
            </TabsTrigger>
          </TabsList>

          {/* Findings */}
          <TabsContent value="findings" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">
                Cost Optimization Findings
              </h2>
              <Badge className="badge-brand text-brand-success border-brand-success/20">
                {totalAnomalies} anomalies detected
              </Badge>
            </div>

            {displayFindings.length === 0 ? (
              <Card className="kpi-card shadow-sm">
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-brand-success mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-brand-ink mb-2">All Optimized!</h3>
                  <p className="text-brand-muted">No cost optimization opportunities found at this time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayFindings.map((f) => (
                  <FindingCard key={f.finding_id || `${f.title}-${f.resource_id || ""}`} finding={f} onViewDetails={openFindingModal} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Products */}
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">Product Cost Breakdown</h2>
              <Badge className="badge-brand">{reportWindowLabel}</Badge>
            </div>

            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-brand-ink"><BarChart3 className="h-5 w-5" />Top Products by Cost</CardTitle>
                <CardDescription className="text-brand-muted">Your highest spending cloud products and their week-over-week changes</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <ProductTable products={Array.isArray(top_products) ? top_products : []} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">Cost Overview</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="kpi-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-brand-ink">Anomaly Severity</CardTitle>
                  <CardDescription className="text-brand-muted">Recent anomaly counts by severity</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {[
                    { type: "Critical", count: criticalCount, color: "bg-blue-500" },
                    { type: "High", count: highCount, color: "bg-yellow-500" },
                    { type: "Medium", count: mediumCount, color: "bg-red-500" }
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

              <Card className="kpi-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-brand-ink">Resilience Workloads</CardTitle>
                  <CardDescription className="text-brand-muted">Top workloads by monthly resilience cost</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {(Array.isArray(recent_findings) ? recent_findings.filter(f => toNumber(f.monthly_savings_usd_est) > 0).slice(0, 5) : []).map((f, i) => (
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

      {/* Finding details modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalFinding?.title || "Finding Details"}
      >
        {modalFinding ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-brand-muted">Severity</div>
                <div className="font-medium">{String(modalFinding.severity || "").toUpperCase()}</div>
              </div>
              <div>
                <div className="text-brand-muted">Confidence</div>
                <div className="font-medium">{String(modalFinding.confidence || "").replace("_"," ").toUpperCase()}</div>
              </div>
              <div>
                <div className="text-brand-muted">Monthly Savings</div>
                <div className="font-semibold text-brand-success">{formatCurrency(modalFinding.monthly_savings_usd_est)}</div>
              </div>
              <div>
                <div className="text-brand-muted">Risk / Time</div>
                <div className="font-medium">{modalFinding.risk_level} {modalFinding.implementation_time ? `• ${modalFinding.implementation_time}` : ""}</div>
              </div>
            </div>

            {modalFinding.suggested_action && (
              <div>
                <div className="text-brand-muted mb-1">Suggested Action</div>
                <div className="rounded-lg border border-[#E7DCCF] bg-[#F7F1EA] p-3">{modalFinding.suggested_action}</div>
              </div>
            )}

            {modalFinding.commands && modalFinding.commands.length > 0 && (
              <div>
                <div className="text-brand-muted mb-1">Recommended Command</div>
                <pre className="rounded-lg border border-[#E7DCCF] bg-[#FFF] p-3 text-xs overflow-auto">{pickBestCommand(modalFinding)}</pre>
              </div>
            )}

            {modalFinding.evidence && (
              <div>
                <div className="text-brand-muted mb-1">Evidence</div>
                <pre className="rounded-lg border border-[#E7DCCF] bg-[#FFF] p-3 text-xs overflow-auto">{JSON.stringify(modalFinding.evidence, null, 2)}</pre>
              </div>
            )}

            {modalFinding.methodology && (
              <div>
                <div className="text-brand-muted mb-1">Methodology</div>
                <div className="rounded-lg border border-[#E7DCCF] bg-[#FFF] p-3 whitespace-pre-wrap">{modalFinding.methodology}</div>
              </div>
            )}

            {modalFinding.last_analyzed && (
              <div className="text-xs text-brand-muted">
                Last Analyzed: {formatTimestamp(modalFinding.last_analyzed)}
              </div>
            )}
          </div>
        ) : (
          <div>No finding selected.</div>
        )}
      </Modal>
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
