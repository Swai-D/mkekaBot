'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function Dashboard() {
  const [predictions, setPredictions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [auditOpen, setAuditOpen] = useState(null);

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
      alert(`Scan complete: ${data.bets} bets, ${data.skipped} skipped`);
      await loadData();
    } catch (err) {
      alert('Scan failed: ' + err.message);
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
      alert(`Reconciled: ${data.wins}W / ${data.losses}L — win rate ${data.winRate}%`);
      await loadData();
    } catch (err) {
      alert('Reconcile failed: ' + err.message);
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="shell">
      <div className="header">
        <div>
          <div className="brand-name">
            MkekaBOT
            <span className="brand-version">v3.5</span>
          </div>
          <p className="brand-tagline">Yellow-cards betting intelligence for the Dar es Salaam market</p>
        </div>
        <div className="actions">
          <button onClick={runScan} disabled={scanning} className="btn btn-primary">
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>
          <button onClick={runReconcile} disabled={reconciling} className="btn btn-secondary">
            {reconciling ? 'Reconciling…' : 'Reconcile'}
          </button>
        </div>
      </div>

      {stats?.overall && (
        <div className="stat-strip">
          {[
            { label: 'Total bets (30d)', value: stats.overall.total_bets ?? '—' },
            { label: 'Wins', value: stats.overall.wins ?? '—', tone: 'up' },
            { label: 'Losses', value: stats.overall.losses ?? '—', tone: 'down' },
            {
              label: 'Win rate',
              value: stats.overall.win_rate_pct ? stats.overall.win_rate_pct + '%' : '—',
              tone: 'accent',
            },
          ].map((s) => (
            <div key={s.label} className="stat">
              <div
                className="stat-value"
                style={
                  s.tone === 'up'
                    ? { color: 'var(--win-green)' }
                    : s.tone === 'down'
                      ? { color: 'var(--card-red)' }
                      : s.tone === 'accent'
                        ? { color: 'var(--card-yellow)' }
                        : undefined
                }
              >
                {s.value}
              </div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Today&apos;s predictions</h2>

      {loading ? (
        <div className="empty-state">
          <p>Loading board…</p>
        </div>
      ) : predictions.length === 0 ? (
        <div className="empty-state">
          <p>No fixtures scanned yet.</p>
          <p>Run a scan to populate today&apos;s board — current fixtures, no API cost in mock mode.</p>
        </div>
      ) : (
        <div className="predictions">
          {predictions.map((p) => {
            const resultKey = p.result === 'WIN' ? 'win' : p.result === 'LOSS' ? 'loss' : null;
            return (
              <div
                key={p.id}
                className="prediction-row"
                data-verdict={p.verdict === 'BET' ? 'bet' : undefined}
                data-result={resultKey ?? undefined}
              >
                <div className="prediction-head">
                  <div>
                    <div className="match-name">{p.home_team} vs {p.away_team}</div>
                    <div className="match-meta">
                      <span>{p.league}</span>
                      <span>MD {p.matchday ?? '?'}</span>
                      {p.kickoff && <span className="mono">{p.kickoff}</span>}
                      {p.referee_name && <span>Ref: {p.referee_name}</span>}
                    </div>
                  </div>
                  <div className="tags">
                    <span className={`tag ${p.verdict === 'BET' ? 'tag-bet' : 'tag-pass'}`}>{p.verdict}</span>
                    {p.result && (
                      <span className={`tag ${resultKey === 'win' ? 'tag-win' : 'tag-loss'}`}>
                        {p.result}{p.actual_cards !== null ? ` · ${p.actual_cards} cards` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {p.verdict === 'BET' && (
                  <div className="data-strip">
                    <div className="data-point"><span className="data-point-label">Bot line</span><span className="data-point-value">OVER {p.bot_line}</span></div>
                    <div className="data-point"><span className="data-point-label">Davy line</span><span className="data-point-value accent">OVER {p.davy_line}</span></div>
                    <div className="data-point"><span className="data-point-label">Confidence</span><span className="data-point-value">{p.confidence}%</span></div>
                    {p.market_odds && <div className="data-point"><span className="data-point-label">Odds</span><span className="data-point-value">{p.market_odds}</span></div>}
                    {p.opening_odds && p.current_odds && (
                      <div className="data-point"><span className="data-point-label">Movement</span><span className={`data-point-value ${p.current_odds < p.opening_odds ? 'up' : p.current_odds > p.opening_odds ? 'down' : ''}`}>{p.opening_odds} → {p.current_odds}</span></div>
                    )}
                  </div>
                )}

                {p.reasoning && <div className="reasoning">{p.reasoning}</div>}

                {p.audit_trail && (
                  <div>
                    <button onClick={() => setAuditOpen(auditOpen === p.id ? null : p.id)} className="audit-toggle">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {auditOpen === p.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Audit trail
                      </span>
                    </button>
                    {auditOpen === p.id && (
                      <div className="audit-trail">
                        {Object.entries(p.audit_trail).map(([step, note]) => (
                          <div key={step} className="audit-line"><span className="audit-line-step">{step}:</span> {note}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {stats?.byLeague?.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">Performance by league (30d)</h2>
          <table className="league-table">
            <thead><tr>{['League', 'Bets', 'W', 'L', 'Win %', 'Avg conf'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{stats.byLeague.map((row) => (
              <tr key={row.league}>
                <td>{row.league}</td><td>{row.total_bets}</td>
                <td style={{ color: 'var(--win-green)' }}>{row.wins ?? 0}</td>
                <td style={{ color: 'var(--card-red)' }}>{row.losses ?? 0}</td>
                <td style={{ color: 'var(--card-yellow)', fontWeight: 700 }}>{row.win_rate_pct ?? '—'}%</td>
                <td>{row.avg_confidence ?? '—'}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="footer">MkekaBOT v3.5 · Dar es Salaam · {new Date().getFullYear()}</div>
    </div>
  );
}
