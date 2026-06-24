/**
 * MkekaBOT — Dashboard
 * app/page.js
 */

"use client";

import { useState, useEffect } from "react";

export default function Dashboard() {
  const [predictions, setPredictions] = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [scanning, setScanning]       = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [auditOpen, setAuditOpen]     = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [predRes, statsRes] = await Promise.all([
        fetch("/api/reconcile").then((r) => r.json()),
        fetch("/api/stats?days=30").then((r) => r.json()),
      ]);
      setPredictions(predRes.predictions ?? []);
      setStats(statsRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "scan", league: "all" }),
      });
      const data = await res.json();
      alert(`✅ Scan complete: ${data.bets} bets, ${data.skipped} skipped`);
      await loadData();
    } catch (err) {
      alert("❌ Scan failed: " + err.message);
    } finally {
      setScanning(false);
    }
  }

  async function runReconcile() {
    setReconciling(true);
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" }),
      });
      const data = await res.json();
      alert(`✅ Reconciled: ${data.wins}W / ${data.losses}L — Win rate: ${data.winRate}%`);
      await loadData();
    } catch (err) {
      alert("❌ Reconcile failed: " + err.message);
    } finally {
      setReconciling(false);
    }
  }

  const bets = predictions.filter((p) => p.verdict === "BET");
  const won  = predictions.filter((p) => p.result === "WIN");
  const lost = predictions.filter((p) => p.result === "LOSS");
  const winRate = (won.length + lost.length > 0)
    ? ((won.length / (won.length + lost.length)) * 100).toFixed(1)
    : "—";

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", color: "#fff", fontFamily: "'Outfit', sans-serif", padding: "24px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#FFD700" }}>
            🎯 MkekaBOT <span style={{ fontSize: 14, color: "#888", fontFamily: "monospace" }}>v3.3</span>
          </h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>Yellow Cards Intelligence — Dar es Salaam 🇹🇿</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{ background: "#FFD700", color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: scanning ? "not-allowed" : "pointer", opacity: scanning ? 0.6 : 1 }}
          >
            {scanning ? "Scanning..." : "⚡ Scan Today"}
          </button>
          <button
            onClick={runReconcile}
            disabled={reconciling}
            style={{ background: "#1a1a1a", color: "#FFD700", border: "1px solid #FFD700", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: reconciling ? "not-allowed" : "pointer", opacity: reconciling ? 0.6 : 1 }}
          >
            {reconciling ? "Reconciling..." : "🌙 Reconcile"}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats?.overall && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Total Bets (30d)", value: stats.overall.total_bets ?? "—" },
            { label: "Wins", value: stats.overall.wins ?? "—", color: "#22c55e" },
            { label: "Losses", value: stats.overall.losses ?? "—", color: "#ef4444" },
            { label: "Win Rate", value: stats.overall.win_rate_pct ? stats.overall.win_rate_pct + "%" : "—", color: "#FFD700" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#1a1a1a", borderRadius: 12, padding: 18, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color ?? "#fff" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Today's Predictions */}
      <h2 style={{ color: "#FFD700", marginBottom: 16, fontSize: 16 }}>📅 Today's Predictions</h2>

      {loading ? (
        <div style={{ color: "#888", textAlign: "center", padding: 40 }}>Loading...</div>
      ) : predictions.length === 0 ? (
        <div style={{ color: "#888", textAlign: "center", padding: 40 }}>
          No predictions yet. Click "Scan Today" to run analysis.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {predictions.map((p) => (
            <div
              key={p.id}
              style={{
                background: "#1a1a1a",
                borderRadius: 12,
                padding: 16,
                borderLeft: `4px solid ${
                  p.result === "WIN"  ? "#22c55e" :
                  p.result === "LOSS" ? "#ef4444" :
                  p.verdict === "BET" ? "#FFD700" : "#444"
                }`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.home_team} vs {p.away_team}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {p.league} · MD{p.matchday ?? "?"} · {p.kickoff ?? ""}
                    {p.referee_name && ` · Ref: ${p.referee_name}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{
                    background: p.verdict === "BET" ? "#FFD700" : "#333",
                    color: p.verdict === "BET" ? "#000" : "#888",
                    borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700,
                  }}>
                    {p.verdict}
                  </span>
                  {p.result && (
                    <span style={{
                      marginLeft: 6,
                      background: p.result === "WIN" ? "#22c55e20" : "#ef444420",
                      color: p.result === "WIN" ? "#22c55e" : "#ef4444",
                      borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700,
                    }}>
                      {p.result} {p.actual_cards !== null ? `(${p.actual_cards} cards)` : ""}
                    </span>
                  )}
                </div>
              </div>

              {p.verdict === "BET" && (
                <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: "#888" }}>Bot line: </span>
                    <span style={{ color: "#fff" }}>OVER {p.bot_line}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: "#888" }}>Davy line: </span>
                    <span style={{ color: "#FFD700", fontWeight: 700 }}>OVER {p.davy_line}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: "#888" }}>Confidence: </span>
                    <span style={{ color: "#fff" }}>{p.confidence}%</span>
                  </div>
                  {p.market_odds && (
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#888" }}>Odds: </span>
                      <span style={{ color: "#fff" }}>{p.market_odds}</span>
                    </div>
                  )}
                  {p.opening_odds && p.current_odds && (
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#888" }}>Movement: </span>
                      <span style={{ color: p.current_odds < p.opening_odds ? "#22c55e" : p.current_odds > p.opening_odds ? "#ef4444" : "#888" }}>
                        {p.opening_odds} → {p.current_odds}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {p.reasoning && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
                  {p.reasoning}
                </div>
              )}

              {/* Audit Trail Toggle */}
              {p.audit_trail && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => setAuditOpen(auditOpen === p.id ? null : p.id)}
                    style={{ background: "none", border: "1px solid #333", color: "#666", borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}
                  >
                    {auditOpen === p.id ? "▲ Hide" : "▼ Audit trail"}
                  </button>
                  {auditOpen === p.id && (
                    <div style={{ marginTop: 8, background: "#111", borderRadius: 8, padding: 12 }}>
                      {Object.entries(p.audit_trail).map(([step, note]) => (
                        <div key={step} style={{ fontSize: 11, fontFamily: "monospace", color: "#888", marginBottom: 3 }}>
                          <span style={{ color: "#FFD700" }}>{step}:</span> {note}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* By League Stats */}
      {stats?.byLeague?.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ color: "#FFD700", marginBottom: 16, fontSize: 16 }}>📊 Performance by League (30d)</h2>
          <div style={{ background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  {["League", "Bets", "W", "L", "Win %", "Avg Conf"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#888", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.byLeague.map((row) => (
                  <tr key={row.league} style={{ borderBottom: "1px solid #1f1f1f" }}>
                    <td style={{ padding: "10px 14px" }}>{row.league}</td>
                    <td style={{ padding: "10px 14px" }}>{row.total_bets}</td>
                    <td style={{ padding: "10px 14px", color: "#22c55e" }}>{row.wins ?? 0}</td>
                    <td style={{ padding: "10px 14px", color: "#ef4444" }}>{row.losses ?? 0}</td>
                    <td style={{ padding: "10px 14px", color: "#FFD700", fontWeight: 700 }}>{row.win_rate_pct ?? "—"}%</td>
                    <td style={{ padding: "10px 14px" }}>{row.avg_confidence ?? "—"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, textAlign: "center", color: "#444", fontSize: 11 }}>
        MkekaBOT v3.3 · Dar es Salaam · {new Date().getFullYear()}
      </div>
    </div>
  );
}
