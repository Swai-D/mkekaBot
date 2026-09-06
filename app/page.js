/**
 * MkekaBOT — Dashboard
 * app/page.js
 */

'use client';

import { useState, useEffect } from 'react';

const PAGE_SIZE = 8;

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Dashboard() {
  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [auditOpen, setAuditOpen] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [predRes, statsRes] = await Promise.all([
        fetch('/api/reconcile').then((r) => r.json()),
        fetch('/api/stats?days=30').then((r) => r.json()),
      ]);
      setPredictions(predRes.predictions ?? []);
      setStats(statsRes);
      setPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'scan', league: 'all' }),
      });
      const data = await res.json();
      alert(`✅ Scan complete: ${data.bets} bets, ${data.skipped} skipped`);
      await loadData();
    } catch (err) {
      alert('❌ Scan failed: ' + err.message);
    } finally {
      setScanning(false);
    }
  }

  async function runReconcile() {
    setReconciling(true);
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'auto' }),
      });
      const data = await res.json();
      alert(`✅ Reconciled: ${data.wins}W / ${data.losses}L — Win rate: ${data.winRate}%`);
      await loadData();
    } catch (err) {
      alert('❌ Reconcile failed: ' + err.message);
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div
      style={{
        background: '#0d0d0d',
        minHeight: '100vh',
        color: '#fff',
        fontFamily: "'Outfit', sans-serif",
        padding: '24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#FFD700' }}>
            🎯 MkekaBOT{' '}
            <span style={{ fontSize: 14, color: '#888', fontFamily: 'monospace' }}>v3.5</span>
          </h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
            Yellow Cards Intelligence — Dar es Salaam 🇹🇿
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              background: '#FFD700',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontWeight: 700,
              cursor: scanning ? 'not-allowed' : 'pointer',
              opacity: scanning ? 0.6 : 1,
            }}
          >
            {scanning ? 'Scanning...' : '⚡ Scan Today'}
          </button>
          <button
            onClick={runReconcile}
            disabled={reconciling}
            style={{
              background: '#1a1a1a',
              color: '#FFD700',
              border: '1px solid #FFD700',
              borderRadius: 8,
              padding: '10px 20px',
              fontWeight: 700,
              cursor: reconciling ? 'not-allowed' : 'pointer',
              opacity: reconciling ? 0.6 : 1,
            }}
          >
            {reconciling ? 'Reconciling...' : '🌙 Reconcile'}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats?.overall && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginBottom: 28,
          }}
        >
          {[
            { label: 'Total Bets (30d)', value: stats.overall.total_bets ?? '—' },
            { label: 'Wins', value: stats.overall.wins ?? '—', color: '#22c55e' },
            { label: 'Losses', value: stats.overall.losses ?? '—', color: '#ef4444' },
            {
              label: 'Win Rate',
              value: stats.overall.win_rate_pct ? stats.overall.win_rate_pct + '%' : '—',
              color: '#FFD700',
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{ background: '#1a1a1a', borderRadius: 12, padding: 18, textAlign: 'center' }}
            >
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color ?? '#fff' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Today&apos;s Predictions */}
      <h2 style={{ color: '#FFD700', marginBottom: 16, fontSize: 16 }}>
        📅 Today&apos;s Predictions
      </h2>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : predictions.length === 0 ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
          <p style={{ margin: '0 0 8px' }}>No predictions yet.</p>
          <p style={{ margin: 0, fontSize: 13 }}>
            CSV + Mock AI mode: click &quot;Scan Today&quot; to analyze curated matches — no API
            cost.
          </p>
        </div>
      ) : (
        <>
        <div className="match-list">
          {predictions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => (
            <div
              key={p.id}
              className={`match-card ${p.result === 'WIN' ? 'match-card-win' : p.result === 'LOSS' ? 'match-card-loss' : p.verdict === 'BET' ? 'match-card-bet' : ''}`}
            >
              <div className="match-card-kicker">
                <span>{p.league}</span>
                <span>MD{p.matchday ?? '?'}</span>
                <span className="mono">{p.kickoff ?? 'Kickoff TBC'}</span>
              </div>
              <div className="match-card-head">
                <div className="match-card-fixture">
                  <div className="match-card-side">
                    <span className="team-avatar">{initials(p.home_team)}</span>
                    <span className="team-name">{p.home_team}</span>
                  </div>
                  <span className="match-card-vs">vs</span>
                  <div className="match-card-side match-card-side-away">
                    <span className="team-name">{p.away_team}</span>
                    <span className="team-avatar">{initials(p.away_team)}</span>
                  </div>
                </div>
                <div className="match-card-status">
                  <span className={`match-badge ${p.verdict === 'BET' ? 'match-badge-bet' : 'match-badge-skip'}`}>{p.verdict}</span>
                  {p.result && (
                    <span className={`match-result ${p.result === 'WIN' ? 'match-result-win' : 'match-result-loss'}`}>
                      {p.result} {p.actual_cards !== null ? `(${p.actual_cards} cards)` : ''}
                    </span>
                  )}
                </div>
              </div>

              {p.referee_name && <div className="match-card-ref">Referee: {p.referee_name}</div>}

              {p.verdict === 'BET' && (
                <div className="match-card-data">
                  <div><span>Bot line</span><strong>OVER {p.bot_line}</strong></div>
                  <div><span>Davy line</span><strong className="match-card-accent">OVER {p.davy_line}</strong></div>
                  <div><span>Confidence</span><strong>{p.confidence}%</strong></div>
                  {p.market_odds && <div><span>Odds</span><strong>{p.market_odds}</strong></div>}
                  {p.opening_odds && p.current_odds && (
                    <div>
                      <span>Movement</span>
                      <strong className={p.current_odds < p.opening_odds ? 'match-card-positive' : p.current_odds > p.opening_odds ? 'match-card-negative' : ''}>
                        {p.opening_odds} → {p.current_odds}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {p.reasoning && <div className="match-card-reasoning">{p.reasoning}</div>}

              {p.audit_trail && (
                <div className="match-card-audit">
                  <button onClick={() => setAuditOpen(auditOpen === p.id ? null : p.id)}>
                    {auditOpen === p.id ? '▲ Hide' : '▼ Audit trail'}
                  </button>
                  {auditOpen === p.id && (
                    <div className="match-card-audit-body">
                      {Object.entries(p.audit_trail).map(([step, note]) => (
                        <div key={step}><span>{step}:</span> {note}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {predictions.length > PAGE_SIZE && (
          <div className="pagination">
            <button className="pagination-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              ‹ Prev
            </button>
            <span className="pagination-info">
              Page {page} / {Math.ceil(predictions.length / PAGE_SIZE)}
              <span className="pagination-count"> · {predictions.length} matches</span>
            </span>
            <button className="pagination-btn" onClick={() => setPage((p) => Math.min(Math.ceil(predictions.length / PAGE_SIZE), p + 1))} disabled={page >= Math.ceil(predictions.length / PAGE_SIZE)}>
              Next ›
            </button>
          </div>
        )}
        </>
      )}

      {/* By League Stats */}
      {stats?.byLeague?.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ color: '#FFD700', marginBottom: 16, fontSize: 16 }}>
            📊 Performance by League (30d)
          </h2>
          <div style={{ background: '#1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  {['League', 'Bets', 'W', 'L', 'Win %', 'Avg Conf'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        color: '#888',
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.byLeague.map((row) => (
                  <tr key={row.league} style={{ borderBottom: '1px solid #1f1f1f' }}>
                    <td style={{ padding: '10px 14px' }}>{row.league}</td>
                    <td style={{ padding: '10px 14px' }}>{row.total_bets}</td>
                    <td style={{ padding: '10px 14px', color: '#22c55e' }}>{row.wins ?? 0}</td>
                    <td style={{ padding: '10px 14px', color: '#ef4444' }}>{row.losses ?? 0}</td>
                    <td style={{ padding: '10px 14px', color: '#FFD700', fontWeight: 700 }}>
                      {row.win_rate_pct ?? '—'}%
                    </td>
                    <td style={{ padding: '10px 14px' }}>{row.avg_confidence ?? '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, textAlign: 'center', color: '#444', fontSize: 11 }}>
        MkekaBOT v3.5 · Dar es Salaam · {new Date().getFullYear()}
      </div>
    </div>
  );
}
