#!/usr/bin/env bash
set -euo pipefail

TS=$(date +"%Y%m%d_%H%M%S")
backup() {
  local f="$1"
  [ -f "$f" ] && cp "$f" "${f}.${TS}.bak" || true
}

mkdir -p src/components
mkdir -p public/mock

# --- 1) Backup the files we may touch
backup src/App.js
backup src/components/TriageCard.jsx

# --- 2) Write a compact, softer TriageCard (with "Investigate" + short spike pill)
cat > src/components/TriageCard.jsx <<'EOF'
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { AlertTriangle, Loader2, ChevronDown, ChevronUp, Clipboard, Play, CheckCircle, X } from "lucide-react";

const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
const when = (iso) => { if (!iso) return "-"; const d = new Date(iso); if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}); };

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
        const r = await fetch("/mock/triage.json", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (e) { if (!cancelled) setError("Could not load triage data"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const spikePct = useMemo(() => {
    if (!data) return 0;
    const b = Number(data.baseline_usd || 0), c = Number(data.current_usd || 0);
    return b > 0 ? ((c - b) / b) * 100 : 0;
  }, [data]);

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); alert("Commands copied to clipboard"); }
    catch { alert("Copy failed. You can select the text manually."); }
  };
  const simulateRun = (i) => { setRunningIdx(i); setDoneIdx(null); setTimeout(()=>{ setRunningIdx(null); setDoneIdx(i); }, 1200); };

  if (loading) return (
    <Card className="kpi-card border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-800"><Loader2 className="h-5 w-5 animate-spin" /> Auto-Triage: Cost Spike</CardTitle>
        <CardDescription className="text-amber-700">Loading…</CardDescription>
      </CardHeader>
    </Card>
  );
  if (error || !data) return (
    <Card className="kpi-card border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-800"><AlertTriangle className="h-5 w-5" /> Auto-Triage: Cost Spike</CardTitle>
        <CardDescription className="text-amber-700">{error || "No triage data"}</CardDescription>
      </CardHeader>
    </Card>
  );

  return (
    <Card className="kpi-card border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <div>
              <CardTitle className="text-sm font-semibold text-amber-900">Auto-Triage: Cost Spike</CardTitle>
              <CardDescription className="text-amber-800/90">
                Detected {when(data.detected_at)} • last {data.window || "24h"}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!!onDismiss && (
              <Button size="sm" variant="outline" className="rounded-lg btn-brand-outline" onClick={onDismiss} title="Dismiss">
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" className="rounded-lg btn-brand-primary" onClick={() => setExpanded(s => !s)}>
              {expanded ? <>Hide details</> : <>Investigate</>}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge className="bg-amber-600 text-white rounded-md px-2 py-1">
            {`Spike +${fmt(Math.max(0, Number(data.current_usd||0) - Number(data.baseline_usd||0)))} (last 24h)`}
          </Badge>
          <span className="text-sm text-amber-900">
            Baseline {fmt(data.baseline_usd)} → Current {fmt(data.current_usd)} ({spikePct>=0?"+":""}{spikePct.toFixed(1)}%)
          </span>
        </div>
      </CardHeader>

      {!expanded ? null : (
        <CardContent className="space-y-4">
          <Separator />
          {/* Top Drivers */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-amber-900">Top Drivers</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(data.top_drivers || []).slice(0,6).map((d,i)=>(
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/80 border border-amber-100">
                  <div className="text-sm text-amber-900">
                    <div className="font-medium">{d.service || "—"}</div>
                    <div className="text-xs text-amber-800/80">{(d.account||"—")} · {(d.region||"—")}{d.tag?` · ${d.tag}`:""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amber-800">+{fmt(d.delta_usd || 0)}</div>
                    {Number.isFinite(d.pct) && <div className="text-xs text-amber-700">{Number(d.pct).toFixed(1)}%</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suspected causes */}
          {Array.isArray(data.suspected_causes) && data.suspected_causes.length>0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-sm font-medium text-amber-900">Suspected Causes</div>
                <ul className="list-disc pl-5 text-sm text-amber-900">
                  {data.suspected_causes.map((c,i)=><li key={i}>{c}</li>)}
                </ul>
              </div>
            </>
          )}

          {/* Proposed actions */}
          {Array.isArray(data.proposed_actions) && data.proposed_actions.length>0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="text-sm font-medium text-amber-900">Proposed Remediations</div>
                {data.proposed_actions.map((a,i)=>(
                  <div key={i} className="p-3 rounded-lg bg-white/80 border border-amber-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-amber-900">{a.title}</div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-100 text-amber-900 rounded-md">{a.risk || "Medium"} risk</Badge>
                        {a.est_savings_usd ? <Badge className="bg-green-100 text-green-700 rounded-md">Save {fmt(a.est_savings_usd)}/mo</Badge> : null}
                      </div>
                    </div>
                    {Array.isArray(a.commands) && a.commands.length>0 && (
                      <div className="rounded-md border border-amber-100 bg-amber-50/70 p-2">
                        <pre className="text-xs m-0 overflow-auto"><code>{a.commands.join("\n")}</code></pre>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="btn-brand-primary rounded-lg" onClick={()=>simulateRun(i)} disabled={runningIdx===i}>
                        {runningIdx===i ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Running…</> : doneIdx===i ? <><CheckCircle className="h-4 w-4 mr-1" /> Done</> : <>Simulate Fix</>}
                      </Button>
                      {Array.isArray(a.commands) && a.commands.length>0 && (
                        <Button size="sm" variant="outline" className="btn-brand-outline rounded-lg" onClick={()=>copy(a.commands.join("\n"))}>Copy Commands</Button>
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
EOF

# --- 3) Move triage BELOW KPIs by editing src/App.js in-place (safe text replacement)
if [ -f src/App.js ]; then
  node - <<'EOF'
const fs = require("fs");
const path = "src/App.js";
let s = fs.readFileSync(path, "utf8");

// Ensure import exists (idempotent)
if (!s.includes('import TriageCard from "./components/TriageCard"')) {
  s = s.replace(/(import logo from .*?;\s*)/s, `$1\n// AI/automation demo card\nimport TriageCard from "./components/TriageCard";\n`);
}

// Remove any triage block near the top (from the comment through next Data Source banner)
s = s.replace(/\{\s*\/\*[^]*?AI\/Automation[^]*?\*\/\}\s*<div[^]*?<\/div>\s*\n\s*\/\*\s*Data Source banner\s*\*\//m, '{/* Data Source banner */}');

// Insert triage block right AFTER the KPI grid
s = s.replace(/<\/div>\s*\n\s*{\/\*\s*Charts\s*\*\/}/, `</div>

        {/* ⬆️ KPIs end — compact triage below for calmer first impression */}
        <div className="mb-6">
          <TriageCard defaultExpanded={false} />
        </div>

        {/* Charts */}`);

fs.writeFileSync(path, s, "utf8");
console.log("Updated src/App.js: triage moved below KPIs.");
EOF
else
  echo "NOTE: src/App.js not found; skipped App.js edit."
fi

echo "✅ Step 1 complete. If something looks off, your backups end with .${TS}.bak"
