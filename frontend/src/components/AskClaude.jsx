import React, { useState, useRef, useEffect } from "react";
import { getCloudCapitalReport } from "../lib/report";

const SAMPLE_QUESTIONS = [
  "Why is my cloud spend up?",
  "What should I optimize first?",
  "How does my AI spend compare to cloud?",
  "What's my biggest cost risk?"
];

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const GearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const buildSystemPrompt = (report) => {
  const safeReport = { ...report };
  if (safeReport.cost_baseline) {
    const cb = { ...safeReport.cost_baseline };
    delete cb.raw;
    safeReport.cost_baseline = cb;
  }
  return (
    "You are a FinOps analyst assistant for Cloud & Capital. " +
    "Here is the current cost dashboard data:\n\n" +
    JSON.stringify(safeReport, null, 2) +
    "\n\nAnswer questions about this data concisely and helpfully. " +
    "Focus on actionable insights. Keep responses under 150 words unless the question requires more detail."
  );
};

const AskClaude = () => {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("ccg_anthropic_key") || "");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const report = getCloudCapitalReport();
  const systemPrompt = buildSystemPrompt(report);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !showSettings) inputRef.current?.focus();
  }, [open, showSettings]);

  const openSettings = () => {
    setApiKeyDraft(apiKey);
    setShowSettings(true);
  };

  const saveApiKey = () => {
    const trimmed = apiKeyDraft.trim();
    localStorage.setItem("ccg_anthropic_key", trimmed);
    setApiKey(trimmed);
    setShowSettings(false);
  };

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!apiKey) {
      setError("Please add your Anthropic API key via the gear icon above.");
      return;
    }

    const userMsg = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: systemPrompt,
          messages: nextMessages
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.error?.message || `API error (${res.status})`;
        if (res.status === 401) throw new Error("Invalid API key. Check your key in settings.");
        throw new Error(msg);
      }

      const data = await res.json();
      const reply = data.content?.[0]?.text || "(No response)";
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button className="ask-claude-btn" onClick={() => setOpen(true)} aria-label="Open Ask Claude">
          <span className="ask-claude-sparkle" aria-hidden="true">✦</span>
          Ask Claude
        </button>
      )}

      {/* Transparent backdrop — click to close */}
      {open && (
        <div
          className="ask-claude-backdrop"
          onClick={() => { setOpen(false); setShowSettings(false); }}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`ask-claude-panel${open ? " ask-claude-panel--open" : ""}`}
        role="dialog"
        aria-label="Ask Claude assistant"
      >
        {/* Header */}
        <div className="ask-claude-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ask-claude-sparkle" style={{ color: "#8B6F47", fontSize: 16 }}>✦</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#0A0A0A" }}>Ask Claude</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="ask-claude-icon-btn"
              onClick={showSettings ? () => setShowSettings(false) : openSettings}
              title="API key settings"
            >
              <GearIcon />
            </button>
            <button
              className="ask-claude-icon-btn"
              onClick={() => { setOpen(false); setShowSettings(false); }}
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Settings drawer */}
        {showSettings && (
          <div className="ask-claude-settings">
            <div className="ask-claude-settings-label">Anthropic API Key</div>
            <input
              type="password"
              className="ask-claude-key-input"
              placeholder="sk-ant-api03-..."
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
              autoFocus
            />
            <button className="ask-claude-save-btn" onClick={saveApiKey}>Save Key</button>
            <p className="ask-claude-settings-note">
              Stored in browser localStorage only. Sent directly to Anthropic — never to any other server.
            </p>
          </div>
        )}

        {/* Messages area */}
        <div className="ask-claude-messages">

          {/* No key state */}
          {!apiKey && !showSettings && (
            <div className="ask-claude-empty">
              <span style={{ fontSize: 28, color: "#C4A882" }}>✦</span>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#0A0A0A", marginTop: 10 }}>
                Enter your Anthropic API key to enable Ask Claude
              </p>
              <p style={{ fontSize: 12, color: "#7A6B5D", marginTop: 4 }}>
                Click the gear icon above to add your key
              </p>
            </div>
          )}

          {/* Sample chips (shown when key is set and no messages yet) */}
          {apiKey && messages.length === 0 && !loading && (
            <div className="ask-claude-chips">
              <p style={{ fontSize: 12, color: "#7A6B5D", textAlign: "center", marginBottom: 10 }}>
                Ask about your cost data
              </p>
              {SAMPLE_QUESTIONS.map((q, i) => (
                <button key={i} className="ask-claude-chip" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Chat bubbles */}
          {messages.map((msg, i) => (
            <div key={i} className={`ask-claude-row${msg.role === "user" ? " ask-claude-row--user" : ""}`}>
              <div className={`ask-claude-bubble ask-claude-bubble--${msg.role}`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="ask-claude-row">
              <div className="ask-claude-bubble ask-claude-bubble--assistant ask-claude-typing">
                <span className="ask-claude-dot" />
                <span className="ask-claude-dot" />
                <span className="ask-claude-dot" />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <div className="ask-claude-error">{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div className="ask-claude-input-row">
          <input
            ref={inputRef}
            type="text"
            className="ask-claude-input"
            placeholder={apiKey ? "Ask about your costs…" : "Add API key to chat"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!apiKey || loading}
          />
          <button
            className="ask-claude-send"
            onClick={() => sendMessage(input)}
            disabled={!apiKey || loading || !input.trim()}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>

        {/* Footer */}
        <div className="ask-claude-footer">
          Powered by Claude · Cloud &amp; Capital
        </div>
      </div>
    </>
  );
};

export default AskClaude;
