import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { AlertTriangle, Loader2, ChevronDown, ChevronUp, Clipboard, Play, CheckCircle, X } from "lucide-react";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(amount || 0));

const formatWhen = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function TriageCard({ defaultExpanded = false, onDismiss }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [runningIdx, setRunningIdx] = useState(null);
  const [doneIdx, setDoneIdx] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/mock/triage.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        console.error("triage fetch failed:", e);
        if (!cancelled) setError("Could not load triage data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const spikePct = useMemo(() => {
    if (!data) return 0;
    const base = Number(data.baseline_usd || 0);
    const cur = Number(data.current_usd || 0);
    if (base <= 0) return 0;
    return ((cur - base) / base) * 100;
  }, [data]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Commands copied to clipboard");
    } catch {
      alert("Copy failed. You can select the text manually.");
    }
  };

  const simulateRun = (idx) => {
    setRunningIdx(idx);
    setDoneIdx(null);
    setTimeout(() => {
      setRunningIdx(null);
      setDoneIdx(idx);
    }, 1200);
  };

  if (loading) {
    return (
      <Card className="kpi-card border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <Loader2 className="h-5 w-5 animate-spin" /> Auto-Triage: Cost Spike
          </CardTitle>
          <CardDescription className="text-amber-700">Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="kpi-card border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5" /> Auto-Triage: Cost Spike
          </CardTitle>
          <CardDescription className="text-amber-700">{error || "No triage data"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="kpi-card border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <div>
              <CardTitle className="text-sm font-semibold text-amber-900">Auto-Triage: Cost Spike</CardTitle>
              <CardDescription className="text-amber-800/90">
                Spike detected in the last {data.window || "24h"} • Detected {formatWhen(data.detected_at)}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!!onDismiss && (
              <Button size="sm" variant="outline" className="rounded-lg btn-brand-outline" onClick={onDismiss} title="Dismiss">
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              className="rounded-lg btn-brand-primary"
              onClick={() => setExpanded((s) => !s)}
            >
              {expanded ? <><ChevronUp className="h-4 w-4 mr-1" /> Hide details</> : <><ChevronDown className="h-4 w-4 mr-1" /> View details</>}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge className="bg-amber-600 text-white rounded-md px-2 py-1">
            Spike {formatCurrency(data.spike_amount_usd)}
          </Badge>
          <span className="text-sm text-amber-900">
            Baseline {formatCurrency(data.baseline_usd)} → Current {formatCurrency(data.current_usd)} ({spikePct >= 0 ? "+" : ""}{spikePct.toFixed(1)}%)
          </span>
        </div>
      </CardHeader>

      {!expanded ? null : (
        <CardContent className="space-y-4">
          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium text-amber-900">Top Drivers</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(data.top_drivers || []).slice(0, 6).map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/80 border border-amber-100">
                  <div className="text-sm text-amber-900">
                    <div className="font-medium">{d.service || "—"}</div>
                    <div className="text-xs text-amber-800/80">
                      {(d.account || "—")} · {(d.region || "—")}{d.tag ? ` · ${d.tag}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amber-800">+{formatCurrency(d.delta_usd || 0)}</div>
                    {Number.isFinite(d.pct) && <div className="text-xs text-amber-700">{d.pct.toFixed?.(1) || d.pct}%</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(Array.isArray(data.suspected_causes) && data.suspected_causes.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-sm font-medium text-amber-900">Suspected Causes</div>
                <ul className="list-disc pl-5 text-sm text-amber-900">
                  {data.suspected_causes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            </>
          )}

          {(Array.isArray(data.proposed_actions) && data.proposed_actions.length > 0) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="text-sm font-medium text-amber-900">Proposed Remediations</div>
                {data.proposed_actions.map((a, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/80 border border-amber-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-amber-900">{a.title}</div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-100 text-amber-900 rounded-md">{a.risk || "Medium"} risk</Badge>
                        {a.est_savings_usd ? (
                          <Badge className="bg-green-100 text-green-700 rounded-md">
                            Save {formatCurrency(a.est_savings_usd)}/mo
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {Array.isArray(a.commands) && a.commands.length > 0 && (
                      <div className="rounded-md border border-amber-100 bg-amber-50/70 p-2">
                        <pre className="text-xs m-0 overflow-auto"><code>{a.commands.join("\n")}</code></pre>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="btn-brand-primary rounded-lg"
                        onClick={() => simulateRun(i)}
                        disabled={runningIdx === i}
                      >
                        {runningIdx === i ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Running…</>
                        ) : doneIdx === i ? (
                          <><CheckCircle className="h-4 w-4 mr-1" /> Done</>
                        ) : (
                          <><Play className="h-4 w-4 mr-1" /> Simulate Fix</>
                        )}
                      </Button>
                      {Array.isArray(a.commands) && a.commands.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="btn-brand-outline rounded-lg"
                          onClick={() => copy(a.commands.join("\n"))}
                        >
                          <Clipboard className="h-4 w-4 mr-1" /> Copy Commands
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
