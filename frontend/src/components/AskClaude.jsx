import React, { useState, useRef, useEffect } from "react";
import { getCloudCapitalReport } from "../lib/report";

const API_KEY = process.env.REACT_APP_ANTHROPIC_KEY || "";

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
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

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
          "x-api-key": API_KEY,
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
        throw new Error(msg);
      }

      const data = await res.json();
      const textBlock = Array.isArray(data?.content)
        ? data.content.find((b) => b.type === "text")
        : null;
      const reply = textBlock?.text || "(No response)";
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

  // No key configured — show small muted notice instead of the chat interface
  if (!API_KEY) {
    return (
      <p className="ask-claude-unavailable">AI assistant unavailable</p>
    );
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button className="ask-claude-btn" onClick={() => setOpen(true)} aria-label="Open Ask Claude">
          <span className="ask-claude-sparkle" aria-hidden="true">✦</span>
          Ask Claude
        </button>
      )}

      {/* Backdrop — click to close */}
      {open && (
        <div
          className="ask-claude-backdrop"
          onClick={() => setOpen(false)}
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
          <button
            className="ask-claude-icon-btn"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Messages area */}
        <div className="ask-claude-messages">

          {/* Sample chips (shown before first message) */}
          {messages.length === 0 && !loading && (
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
            placeholder="Ask about your costs…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="ask-claude-send"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
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
