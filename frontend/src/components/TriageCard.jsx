// frontend/src/components/TriageCard.jsx
import React, { useMemo, useState, useEffect } from "react";

/**
 * TriageCard.jsx
 * Portfolio-friendly UI for “Auto-Triage Cost Spike”.
 * - Shows a spike banner when an anomaly exists
 * - Summarizes delta $, % change, top contributors
 * - “Explain” opens a modal with a concise narrative
 * - Action buttons (Slack / Jira / Generate PR) are stubbed with in-UI toasts
 *
 * v0 (mock): Hard-coded triage data for look-and-feel.
 * Next steps: fetch from /api/anomaly and /api/triage, then wire real actions.
 */

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const chip = {
  base: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: "#eef7ef",
    border: "1px solid #d5ebd7",
  },
  danger: {
    background: "#fdecec",
    border: "1px solid #f6caca",
  },
  neutral: {
    background: "#eef2f7",
    border: "1px solid #d9e1ef",
  },
};

const styles = {
  container: {
    border: "1px solid #e8e8e8",
    borderRadius: 16,
    padding: 16,
    background: "#fff",
    boxShadow: "0 10px 18px rgba(0,0,0,0.04)",
  },
  banner: {
    background: "linear-gradient(90deg, rgba(255, 60, 60, 0.1), rgba(255, 107, 107, 0.08))",
    border: "1px solid #ffd5d5",
    color: "#b80000",
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  section: {
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 12,
    background: "#fafbfc",
  },
  h3: { margin: "6px 0 8px 0", fontSize: 14, color: "#333" },
  h2: { margin: "0 0 4px 0", fontSize: 18, fontWeight: 700 },
  list: { margin: 0, paddingLeft: 16, color: "#444", lineHeight: 1.5 },
  btnRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  button: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e3e3e3",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  buttonPrimary: {
    background: "#0f62fe",
    color: "#fff",
    border: "1px solid #0f62fe",
  },
  savingsPill: {
    ...chip.base,
    background: "#ecf9f0",
    border: "1px solid #d2f0da",
  },
  toast: {
    position: "fixed",
    right: 16,
    bottom: 16,
    background: "#111",
    color: "#fff",
    padding: "12px 14px",
    borderRadius: 10,
    boxShadow: "0 10px 18px rgba(0,0,0,0.25)",
    fontSize: 14,
    zIndex: 1000,
  },
  modalBack: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "grid",
    placeItems: "center",
    zIndex: 999,
  },
  modalCard: {
    width: "min(720px, 92vw)",
    background: "#fff",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 25px 40px rgba(0,0,0,0.2)",
  },
  modalTitle: { margin: "0 0 10px 0" },
  kbd: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    background: "#f7f7f7",
    border: "1px solid #eaeaea",
    padding: "2px 6px",
    borderRadius: 6,
    fontSize: 12,
  },
};

const MOCK_TRIAGE = {
  window: "24h",
  delta_usd: 412.12,
  pct_change: 0.28,
  top_contributors: [
    { dimension: "service", key: "EC2", delta: 338.9 },
    { dimension: "service", key: "EBS", delta: 53.7 },
  ],
  suspects: [
    {
      resource_id: "i-0abc123",
      service: "EC2",
      type: "c6i.2xlarge",
      region: "us-west-2",
      tags: { Env: "dev" },
      utilization: { cpu_avg: 2.1, net_tx_mb: 14 },
      est_monthly_cost: 240.0,
      fixes: [
        { action: "stop_instance", label: "Stop instance now", est_savings_monthly: 140 },
        { action: "rightsize", label: "Rightsize to c6i.large", est_savings_monthly: 92 },
      ],
    },
  ],
  confidence: 0.78,
};

function Pill({ children, tone = "neutral" }) {
  const style =
    tone === "danger" ? { ...chip.base, ...chip.danger } : tone === "success" ? { ...chip.base } : { ...chip.base, ...chip.neutral };
  return <span style={style}>{children}</span>;
}

function Toast({ message, onClose, duration = 2200 }) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);
  return <div style={styles.toast}>{message}</div>;
}

export default function TriageCard() {
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);

  const data = useMemo(() => MOCK_TRIAGE, []);
  const hasSpike = data && (data.delta_usd ?? 0) > 0 && (data.pct_change ?? 0) > 0.15;

  const explainText = useMemo(() => {
    // Stubbed “AI explanation” for v0
    return [
      `In the past ${data.window}, total spend increased by ${fmtUSD(data.delta_usd)} (↑${Math.round(
        data.pct_change * 100
      )}%) versus trend.`,
      `~${Math.round((data.top_contributors[0].delta / data.delta_usd) * 100)}% of the delta is from ${data.top_contributors[0].key}.`,
      `Primary suspect: ${data.suspects[0].resource_id} (${data.suspects[0].type}, ${data.suspects[0].region}) — idle CPU ~${data.suspects[0].utilization.cpu_avg}%.`,
      `Suggested fixes: stop now (${fmtUSD(data.suspects[0].fixes[0].est_savings_monthly)}/mo) or rightsize (${fmtUSD(
        data.suspects[0].fixes[1].est_savings_monthly
      )}/mo).`,
    ].join(" ");
  }, [data]);

  const postSlack = () => setToast("Posted triage summary to #cloud-costs ✅");
  const createJira = () => setToast("Created Jira ticket DEV-123 ✅");
  const generatePR = () => setToast("Opened PR #45 with tagging policy ✅");

  return (
    <div style={styles.container} aria-live="polite">
      {hasSpike && (
        <div style={styles.banner}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <span>
            Cost spike detected: <strong>{fmtUSD(data.delta_usd)}</strong> (↑{Math.round(data.pct_change * 100)}%) vs 7-day trend
          </span>
        </div>
      )}

      <div style={styles.grid}>
        {/* Summary */}
        <div style={styles.section}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h2 style={styles.h2}>Triage Summary</h2>
            <Pill tone="danger">Spike</Pill>
          </div>
          <div style={{ color: "#333", marginBottom: 8 }}>
            <div>
              Delta: <strong>{fmtUSD(data.delta_usd)}</strong> • Change: <strong>↑{Math.round(data.pct_change * 100)}%</strong>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <h3 style={styles.h3}>Top contributors</h3>
            <ul style={styles.list}>
              {data.top_contributors.map((c) => (
                <li key={c.key}>
                  {c.key}: <strong>{fmtUSD(c.delta)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div style={styles.btnRow}>
            <button style={{ ...styles.button, ...styles.buttonPrimary }} onClick={() => setShowModal(true)}>
              Explain
            </button>
            <button style={styles.button} onClick={postSlack}>
              Post to Slack
            </button>
            <button style={styles.button} onClick={createJira}>
              Create Jira
            </button>
            <button style={styles.button} onClick={generatePR}>
              Generate PR
            </button>
          </div>
        </div>

        {/* Suspect */}
        <div style={styles.section}>
          <h2 style={styles.h2}>Primary Suspect</h2>
          <div style={{ marginBottom: 10, color: "#333" }}>
            <div>
              <span style={styles.kbd}>{data.suspects[0].resource_id}</span> • {data.suspects[0].type} • {data.suspects[0].region}
            </div>
            <div style={{ marginTop: 6 }}>
              Utilization: CPU avg {data.suspects[0].utilization.cpu_avg}% • Net TX {data.suspects[0].utilization.net_tx_mb} MB
            </div>
            <div style={{ marginTop: 6 }}>
              Tags:{" "}
              {Object.entries(data.suspects[0].tags).map(([k, v]) => (
                <span key={k} style={{ marginRight: 6 }}>
                  <Pill>{k}:{v}</Pill>
                </span>
              ))}
            </div>
          </div>

          <h3 style={styles.h3}>Recommended fixes</h3>
          <ul style={styles.list}>
            {data.suspects[0].fixes.map((f, i) => (
              <li key={f.action} style={{ marginBottom: 6 }}>
                {f.label}{" "}
                <span style={{ marginLeft: 6 }}>
                  <span style={styles.savingsPill}>{fmtUSD(f.est_savings_monthly)}/mo</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Explain Modal */}
      {showModal && (
        <div style={styles.modalBack} role="dialog" aria-modal="true" onClick={() => setShowModal(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Why this spike?</h3>
            <p style={{ lineHeight: 1.6, color: "#333" }}>{explainText}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button style={styles.button} onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
