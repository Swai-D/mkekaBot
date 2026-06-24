import { useState, useEffect } from 'react';
import Head from 'next/head';
import TodayPicks from '../components/TodayPicks';
import PerformancePanel from '../components/PerformancePanel';
import StatsBar from '../components/StatsBar';
import styles from '../styles/Dashboard.module.css';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('today');
  const [predictions, setPredictions] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetchToday();
    fetchPerformance();
  }, []);

  async function fetchToday() {
    try {
      const res = await fetch(`${API}/api/predictions/today`);
      const data = await res.json();
      if (data.success) {
        setPredictions(data.data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPerformance() {
    try {
      const res = await fetch(`${API}/api/predictions/performance`);
      const data = await res.json();
      if (data.success) setPerformance(data);
    } catch (err) {
      console.error('Failed to fetch performance:', err);
    }
  }

  async function triggerAnalysis() {
    setRunningAnalysis(true);
    try {
      await fetch(`${API}/api/predictions/run-analysis`, { method: 'POST' });
      setTimeout(() => {
        fetchToday();
        setRunningAnalysis(false);
      }, 15000);
    } catch (err) {
      setRunningAnalysis(false);
    }
  }

  async function confirmBet(id, odds, stake) {
    const res = await fetch(`${API}/api/predictions/${id}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odds, stake }),
    });
    const data = await res.json();
    if (data.success) fetchToday();
    return data.success;
  }

  async function skipBet(id) {
    await fetch(`${API}/api/predictions/${id}/skip`, { method: 'PATCH' });
    fetchToday();
  }

  const bets = predictions.filter(p => p.should_bet && p.confidence_score >= 65);
  const skipped = predictions.filter(p => !p.should_bet);

  const today = new Date().toLocaleDateString('en-TZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <>
      <Head>
        <title>MkekaBOT — Yellow Cards Analyst</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.app}>
        {/* HEADER */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>🟡</span>
              <div>
                <h1 className={styles.logoTitle}>MKEKA<span>BOT</span></h1>
                <p className={styles.logoSub}>Yellow Cards Intelligence</p>
              </div>
            </div>
          </div>

          <div className={styles.headerCenter}>
            <p className={styles.headerDate}>{today}</p>
          </div>

          <div className={styles.headerRight}>
            <button
              className={`${styles.analyzeBtn} ${runningAnalysis ? styles.analyzing : ''}`}
              onClick={triggerAnalysis}
              disabled={runningAnalysis}
            >
              {runningAnalysis ? (
                <><span className={styles.spinner} /> Analyzing...</>
              ) : (
                <><span>⚡</span> Run Analysis</>
              )}
            </button>
            {lastUpdated && (
              <p className={styles.lastUpdated}>
                Updated {lastUpdated.toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </header>

        {/* STATS BAR */}
        <StatsBar performance={performance} bets={bets} predictions={predictions} />

        {/* TABS */}
        <div className={styles.tabs}>
          {[
            { id: 'today', label: `Today's Picks`, count: bets.length },
            { id: 'performance', label: 'Performance', count: null },
            { id: 'history', label: 'History', count: null },
          ].map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={styles.tabBadge}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <main className={styles.main}>
          {activeTab === 'today' && (
            <TodayPicks
              bets={bets}
              skipped={skipped}
              loading={loading}
              onConfirm={confirmBet}
              onSkip={skipBet}
              onRefresh={fetchToday}
            />
          )}
          {activeTab === 'performance' && (
            <PerformancePanel performance={performance} />
          )}
          {activeTab === 'history' && (
            <HistoryPanel API={API} />
          )}
        </main>
      </div>
    </>
  );
}

function HistoryPanel({ API }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const styles2 = {
    container: { padding: '0 24px' },
    filters: { display: 'flex', gap: 8, marginBottom: 24 },
    filterBtn: {
      padding: '6px 16px', borderRadius: 20, border: '1px solid #1E2A3A',
      background: 'transparent', color: '#64748B', cursor: 'pointer',
      fontFamily: 'Space Grotesk', fontSize: 13,
      transition: 'all 0.2s',
    },
  };

  useEffect(() => {
    fetch(`${API}/api/predictions/history`)
      .then(r => r.json())
      .then(d => { if (d.success) setHistory(d.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#64748B', padding: 40, textAlign: 'center' }}>Loading history...</div>;

  return (
    <div style={styles2.container}>
      <div style={styles2.filters}>
        {['all', 'win', 'loss', 'pending'].map(f => (
          <button
            key={f}
            style={{
              ...styles2.filterBtn,
              background: filter === f ? '#F59E0B22' : 'transparent',
              borderColor: filter === f ? '#F59E0B' : '#1E2A3A',
              color: filter === f ? '#F59E0B' : '#64748B',
            }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {history
          .filter(h => filter === 'all' || h.bet_result === filter)
          .map(h => (
          <HistoryRow key={h.id} item={h} />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({ item }) {
  const resultColor = item.bet_result === 'win' ? '#22C55E' : item.bet_result === 'loss' ? '#EF4444' : '#64748B';
  const resultLabel = item.bet_result === 'win' ? 'WIN' : item.bet_result === 'loss' ? 'LOSS' : 'PENDING';

  return (
    <div style={{
      background: '#0D1117', border: '1px solid #1E2A3A', borderRadius: 12,
      padding: '16px 20px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ color: '#F1F5F9', fontFamily: 'Space Grotesk', fontWeight: 600, margin: 0, fontSize: 14 }}>
          {item.home_team} vs {item.away_team}
        </p>
        <p style={{ color: '#64748B', fontFamily: 'JetBrains Mono', fontSize: 11, margin: '4px 0 0' }}>
          {item.league} · {new Date(item.match_date).toLocaleDateString()}
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#F59E0B', fontFamily: 'JetBrains Mono', fontWeight: 700, margin: 0, fontSize: 13 }}>
          {item.market?.replace('_', ' ').toUpperCase()}
        </p>
        <p style={{ color: '#64748B', fontSize: 11, margin: '2px 0 0', fontFamily: 'JetBrains Mono' }}>
          {item.actual_cards !== null ? `${item.actual_cards} actual` : 'Awaiting'}
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{
          background: `${resultColor}22`, color: resultColor, padding: '4px 12px',
          borderRadius: 20, fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12,
        }}>{resultLabel}</span>
        {item.profit_loss !== null && (
          <p style={{
            color: item.profit_loss >= 0 ? '#22C55E' : '#EF4444',
            fontFamily: 'JetBrains Mono', fontWeight: 700, margin: '6px 0 0',
            fontSize: 13,
          }}>
            {item.profit_loss >= 0 ? '+' : ''}{item.profit_loss?.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
