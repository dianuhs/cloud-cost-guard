
// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { format, parseISO, subDays, isAfter } from "date-fns";

// Local brand icon
import logo from "./assets/cloud-and-capital-icon.png";

// Recharts
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie
} from "recharts";

// UI
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";

// -------------------------------
// API Client
// -------------------------------
const API_BASE = process.env.REACT_APP_BACKEND_URL || "/api";
const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

// -------------------------------
// Helpers
// -------------------------------
const fmtUSD = (n) =>
  typeof n === "number"
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "-";

const fmtUSD2 = (n) =>
  typeof n === "number"
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "-";

const safeNumber = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Prefer American date (MM/DD/YYYY), per your earlier request
const fmtDate = (d) => {
  try {
    const date = typeof d === "string" ? parseISO(d) : d;
    return format(date, "MM/dd/yyyy");
  } catch {
    return "-";
  }
};

// Extract total cost from a summary-ish payload with many possible shapes
const readTotalFromSummary = (summary) => {
  if (!summary) return 0;
  if (Number.isFinite(summary.total)) return summary.total;
  if (summary?.totals?.amount) return safeNumber(summary.totals.amount, 0);
  if (summary?.cost?.total) return safeNumber(summary.cost.total, 0);
  if (summary?.current_total) return safeNumber(summary.current_total, 0);
  return 0;
};

// Turn a timeseries into an array usable by Recharts
const normalizeSeries = (series) => {
  if (!Array.isArray(series)) return [];
  return series
    .map((p) => {
      // Accept either {date, cost} or {ts, amount} or [date, value]
      if (Array.isArray(p) && p.length >= 2) {
        return { date: p[0], cost: safeNumber(p[1], 0) };
      } else if (p && typeof p === "object") {
        const date = p.date || p.ts || p.timestamp;
        const cost = safeNumber(p.cost ?? p.amount ?? p.value, 0);
        return date ? { date, cost } : null;
      }
      return null;
    })
    .filter(Boolean);
};

// Sum costs for items whose date is within (end - days, end]
const sumWindow = (series, endDate, days) => {
  if (!Array.isArray(series) || !series.length) return 0;
  const end = endDate ? parseISO(endDate) : new Date();
  const start = subDays(end, days);
  return series
    .filter((p) => {
      const d = parseISO(p.date);
      return isAfter(d, start) && !isAfter(d, end);
    })
    .reduce((acc, p) => acc + safeNumber(p.cost, 0), 0);
};

// Compute deltas for “Top Movers” with multiple fallbacks:
// 1) Prefer per-product time series (sum last 7 days vs prior 7)
// 2) Else use current vs previous fields if present
// 3) Else skip
const computeTopMovers = (productsPayload) => {
  const items = Array.isArray(productsPayload?.items)
    ? productsPayload.items
    : Array.isArray(productsPayload)
    ? productsPayload
    : [];

  const endDate =
    productsPayload?.window?.end ||
    productsPayload?.end ||
    (items[0]?.timeseries?.[items[0]?.timeseries?.length - 1]?.date ??
      new Date().toISOString().slice(0, 10));

  const movers = [];

  for (const prod of items) {
    const name =
      prod.name || prod.product || prod.service || prod.key || prod.id || "Unknown";

    // Try to find a time series under common keys
    const ts =
      normalizeSeries(prod.timeseries) ||
      normalizeSeries(prod.series) ||
      normalizeSeries(prod.history) ||
      [];

    let curr = null;
    let prev = null;

    if (ts.length) {
      const last7 = sumWindow(ts, endDate, 7);
      const prev7 = sumWindow(ts, subDays(parseISO(endDate), 7).toISOString().slice(0, 10), 7);
      curr = safeNumber(last7, 0);
      prev = safeNumber(prev7, 0);
    } else {
      // Fallback fields
      const c =
        prod.current_cost ??
        prod.current ??
        prod.total ??
        prod.amount ??
        prod.spend ??
        prod.cost;
      const p =
        prod.previous_cost ??
        prod.previous ??
        prod.prev ??
        prod.prior ??
        prod.last_period ??
        0;
      if (Number.isFinite(Number(c)) && Number.isFinite(Number(p))) {
        curr = safeNumber(c, 0);
        prev = safeNumber(p, 0);
      }
    }

    if (curr === null || prev === null) continue;

    const delta = curr - prev;
    const absDelta = Math.abs(delta);
    const pct = prev === 0 ? (curr === 0 ? 0 : 1) : delta / prev; // treat new spend as +100%

    movers.push({
      name,
      current: curr,
      previous: prev,
      delta,
      absDelta,
      pct,
      direction: delta === 0 ? "flat" : delta > 0 ? "up" : "down",
    });
  }

  // Rank by largest absolute dollar change (you can switch to pct if you prefer)
  movers.sort((a, b) => b.absDelta - a.absDelta);

  // Keep top 5
  return movers.slice(0, 5);
};

// -------------------------------
// Main App
// -------------------------------
function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState(null);
  const [series, setSeries] = useState([]);
  const [movers, setMovers] = useState([]);
  const [error, setError] = useState(null);
  const [windowDays, setWindowDays] = useState(30);
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());

  const load = async (days = 30) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch summary & products; try to be resilient with param names
      const qs = { window: `${days}d` };

      const [summaryResp, productsResp, seriesResp] = await Promise.all([
        api.get("/summary", { params: qs }),
        api.get("/products", { params: qs }),
        // If your backend exposes a total timeseries endpoint (optional)
        api
          .get("/summary/series", { params: qs })
          .catch(() => ({ data: { series: [] } })), // tolerate absence
      ]);

      setSummary(summaryResp.data || {});
      setProducts(productsResp.data || {});
      setSeries(
        normalizeSeries(
          seriesResp?.data?.series ||
            seriesResp?.data?.timeseries ||
            seriesResp?.data ||
            []
        )
      );
      setLastUpdated(new Date().toISOString());

      // Compute “Top Movers” from products payload
      const computed = computeTopMovers(productsResp.data);
      setMovers(computed);
    } catch (e) {
      console.error(e);
      setError(
        e?.response?.data?.message ||
          e?.message ||
          "Failed to load cost data from backend."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(windowDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const totalCost = useMemo(() => readTotalFromSummary(summary), [summary]);

  const costByService = useMemo(() => {
    const items = Array.isArray(products?.items)
      ? products.items
      : Array.isArray(products)
      ? products
      : [];
    const rows = items.map((p) => ({
      name: p.name || p.product || p.service || "Unknown",
      value: safeNumber(
        p.current_cost ??
          p.total ??
          p.amount ??
          p.spend ??
          p.cost ??
          0,
        0
      ),
    }));
    return rows.filter((r) => r.value > 0).slice(0, 8);
  }, [products]);

  return (
    <div className="min-h-screen bg-[#f5eee9] text-zinc-900">
      <header className="w-full border-b border-zinc-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Cloud & Capital" className="h-8 w-8 rounded" />
            <div className="font-semibold tracking-[-0.02em]">Cloud Cost Guard</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: "#2563eb" }}>
              Last Updated: {fmtDate(lastUpdated)} {format(new Date(lastUpdated), "hh:mm a")}
            </span>
            <Button
              variant="outline"
              onClick={() => load(windowDays)}
              className="rounded-2xl"
              title="Refresh"
            >
              ⟳ Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Controls */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm text-zinc-500">Window:</span>
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={windowDays === d ? "default" : "outline"}
              className="rounded-2xl"
              onClick={() => setWindowDays(d)}
            >
              {d}d
            </Button>
          ))}
          <div className="ml-auto text-sm text-zinc-500">
            Try your own AWS data → export CSV & compare
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="mb-6 border-rose-300">
            <CardHeader>
              <CardTitle>Heads up</CardTitle>
              <CardDescription>{String(error)}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Key Insights */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
              <CardDescription>Total spend & quick trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{fmtUSD(totalCost)}</div>
              <div className="h-36 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={series}
                    margin={{ top: 10, right: 16, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(parseISO(d), "MM/dd")}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                      }
                      width={48}
                    />
                    <Tooltip
                      formatter={(v) => fmtUSD2(v)}
                      labelFormatter={(d) => format(parseISO(d), "EEE, MMM d")}
                    />
                    <Line type="monotone" dataKey="cost" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost by Service</CardTitle>
              <CardDescription>Top contributors this window</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {costByService.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costByService}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={1}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-zinc-500">No data found.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Movers</CardTitle>
              <CardDescription>Biggest cost changes in the last week</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-zinc-500">Loading…</div>
              ) : movers.length === 0 ? (
                <div className="text-sm text-zinc-500">
                  No movers detected in the last 7 days.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-200">
                  {movers.map((m) => (
                    <li key={m.name} className="py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            m.direction === "up"
                              ? "text-emerald-600"
                              : m.direction === "down"
                              ? "text-rose-600"
                              : "text-zinc-500"
                          }
                          title={m.direction}
                        >
                          {m.direction === "up" ? "▲" : m.direction === "down" ? "▼" : "■"}
                        </span>
                        <span className="font-medium">{m.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">{fmtUSD2(m.current)}</div>
                        <div className="text-xs text-zinc-500">
                          {m.delta >= 0 ? "+" : "−"}
                          {fmtUSD2(Math.abs(m.delta))} (
                          {Math.round(Math.abs(m.pct || 0) * 100)}%)
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* (Optional) More cards/sections can follow */}
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
