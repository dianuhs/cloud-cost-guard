#!/usr/bin/env bash
set -euo pipefail

APP="src/App.js"
TS=$(date +"%Y%m%d_%H%M%S")

if [ ! -f "$APP" ]; then
  echo "❌ $APP not found. Run this from the root of your React project."
  exit 1
fi

cp "$APP" "$APP.$TS.bak"
echo "🗂  Backup created: $APP.$TS.bak"

# Use Node to patch App.js safely.
node - <<'EOF'
const fs = require("fs");
const path = "src/App.js";
let s = fs.readFileSync(path, "utf8");

// ---------- 1) Tone down KPI LIVE badges ----------
s = s
  .replace(
    /<span className="text-xs text-green-600 mt-1">LIVE<\/span>/g,
    '<span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-green-50 text-green-700">LIVE</span>'
  )
  .replace(
    /<span className="text-xs text-brand-light-muted mt-1">\{dataFreshness\}h<\/span>/g,
    '<span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-[#F2EFEA] text-brand-light-muted">{dataFreshness}h</span>'
  );

// ---------- 2) Remove old triage block near the top (the one marked as AI/Automation) ----------
s = s.replace(
  /\{\s*\/\*[^]*?AI\/Automation[^]*?\*\/\}\s*<div[^>]*>\s*<TriageCard[^>]*\/>\s*<\/div>/m,
  ""
);

// ---------- 3) Replace the big blue Data Source <Alert> with a compact caption ----------
s = s.replace(
  /\{\s*\/\*\s*Data Source banner\s*\*\/\}[\s\S]*?<div className="mb-6">[\s\S]*?<Alert[\s\S]*?<\/Alert>\s*<\/div>/m,
  `{/* Data Source banner (compact caption) */}
        <div className="mb-4 text-xs text-brand-muted flex items-center gap-3">
          <span><span className="font-medium">Data Source:</span> AWS Cost &amp; Usage Reports • CloudWatch Metrics • Resource Inventory APIs</span>
          <span className="hidden sm:inline">•</span>
          <span>Last Updated: {formatTimestamp(kpis.last_updated || summary?.generated_at)}</span>
        </div>`
);

// ---------- 4) Insert triage block right AFTER the KPI grid ----------
s = s.replace(
  /<\/div>\s*\n\s*\{\s*\/\*\s*Charts\s*\*\/\}/,
  `</div>

        {/* ⬆️ KPIs end — compact triage below for calmer first impression */}
        <div className="mb-6">
          <TriageCard defaultExpanded={false} />
        </div>

        {/* Charts */}`
);

fs.writeFileSync(path, s, "utf8");
console.log("✅ App.js patched: triage moved, data source caption updated, KPI badges softened.");
EOF

echo "✅ Patch applied. Restart dev server or rebuild to see changes."
