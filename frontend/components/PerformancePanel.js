export default function PerformancePanel({ performance }) {
  if (!performance) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: '#475569', fontFamily: 'Space Grotesk' }}>
        No performance data yet. Start placing bets!
      </div>
    );
  }

  const { overall, last7Days, weights, byMarket } = performance;
  const currentWeight = weights?.[0];

  return (
    <div style={s.container}>
      {/* TOP ROW */}
      <div style={s.topRow}>
        {/* Accuracy Card */}
        <div style={s.bigCard}>
          <p style={s.cardLabel}>Overall Win Rate</p>
          <div style={s.gaugeContainer}>
            <svg width="160" height="100" viewBox="0 0 160 100">
              <path d="M 20 90 A 70 70 0 0 1 140 90" fill="none" stroke="#1E2A3A" strokeWidth="14" strokeLinecap="round" />
              <path
                d="M 20 90 A 70 70 0 0 1 140 90"
                fill="none"
                stroke={parseFloat(overall?.win_rate) >= 70 ? '#22C55E' : parseFloat(overall?.win_rate) >= 55 ? '#F59E0B' : '#EF4444'}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${(parseFloat(overall?.win_rate) / 100) * 220} 220`}
              />
            </svg>
            <div style={s.gaugeCenter}>
              <p style={{
                ...s.gaugeBig,
                color: parseFloat(overall?.win_rate) >= 70 ? '#22C55E' : parseFloat(overall?.win_rate) >= 55 ? '#F59E0B' : '#EF4444',
              }}>
                {overall?.win_rate ? `${parseFloat(overall.win_rate).toFixed(1)}%` : '—'}
              </p>
              <p style={s.gaugeSmall}>{overall?.wins}W / {overall?.losses}L</p>
            </div>
          </div>
        </div>

        {/* P&L Card */}
        <div style={s.bigCard}>
          <p style={s.cardLabel}>Total Profit / Loss</p>
          <p style={{
            fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 48, margin: '16px 0 4px',
            color: parseFloat(overall?.total_pl) >= 0 ? '#22C55E' : '#EF4444',
          }}>
            {overall?.total_pl >= 0 ? '+' : ''}{parseFloat(overall?.total_pl || 0).toFixed(0)}
          </p>
          <p style={s.subText}>KSH · {overall?.total_bets || 0} total bets</p>
        </div>

        {/* Model Brain */}
        <div style={s.bigCard}>
          <p style={s.cardLabel}>Model Intelligence</p>
          <div style={s.weightsList}>
            {currentWeight && [
              { label: 'Referee', value: currentWeight.referee_weight, color: '#F59E0B' },
              { label: 'H2H History', value: currentWeight.h2h_weight, color: '#60A5FA' },
              { label: 'Home Team', value: 0.18, color: '#22C55E' },
              { label: 'Away Team', value: 0.18, color: '#A78BFA' },
              { label: 'League Avg', value: currentWeight.league_avg_weight, color: '#FB923C' },
            ].map(w => (
              <div key={w.label} style={s.weightRow}>
                <p style={s.weightLabel}>{w.label}</p>
                <div style={s.weightBarBg}>
                  <div style={{ ...s.weightBar, width: `${w.value * 100}%`, background: w.color }} />
                </div>
                <p style={{ ...s.weightPct, color: w.color }}>{(w.value * 100).toFixed(0)}%</p>
              </div>
            ))}
          </div>
          <p style={s.modelVersion}>Model v{currentWeight?.version || 1}</p>
        </div>
      </div>

      {/* LAST 7 DAYS */}
      <div style={s.card}>
        <p style={s.cardLabel}>Last 7 Days Performance</p>
        <div style={s.dayGrid}>
          {last7Days?.length > 0 ? last7Days.slice(0, 7).map((day, i) => (
            <DayBar key={i} day={day} />
          )) : (
            <p style={{ color: '#334155', fontFamily: 'Space Grotesk', fontSize: 13 }}>No data yet</p>
          )}
        </div>
      </div>

      {/* BY MARKET */}
      <div style={s.card}>
        <p style={s.cardLabel}>Performance by Market</p>
        <div style={s.marketGrid}>
          {byMarket?.length > 0 ? byMarket.map((m, i) => (
            <MarketCard key={i} market={m} />
          )) : (
            <p style={{ color: '#334155', fontFamily: 'Space Grotesk', fontSize: 13 }}>No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DayBar({ day }) {
  const winRate = day.bets > 0 ? (day.wins / day.bets * 100) : 0;
  const color = winRate >= 70 ? '#22C55E' : winRate >= 50 ? '#F59E0B' : '#EF4444';
  const date = new Date(day.date).toLocaleDateString('en-TZ', { weekday: 'short', day: 'numeric' });

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 6 }}>
        <div style={{
          width: 28, background: `${color}33`, borderRadius: '4px 4px 0 0',
          height: `${Math.max(10, winRate)}%`, position: 'relative',
          border: `1px solid ${color}66`, borderBottom: 'none',
          transition: 'height 0.3s ease',
        }}>
          <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
            <p style={{ color, fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, margin: 0 }}>
              {winRate.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>
      <p style={{ color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10, margin: 0 }}>{date}</p>
      <p style={{ color: parseFloat(day.pl) >= 0 ? '#22C55E' : '#EF4444', fontFamily: 'JetBrains Mono', fontSize: 10, margin: '2px 0 0' }}>
        {parseFloat(day.pl || 0) >= 0 ? '+' : ''}{parseFloat(day.pl || 0).toFixed(0)}
      </p>
    </div>
  );
}

function MarketCard({ market }) {
  const winRate = parseFloat(market.win_rate) || 0;
  const color = winRate >= 70 ? '#22C55E' : winRate >= 55 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{
      background: '#080B14', border: '1px solid #1E2A3A', borderRadius: 10,
      padding: '16px', textAlign: 'center',
    }}>
      <p style={{ color: '#F59E0B', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>
        {market.market?.replace('_', ' ').toUpperCase()}
      </p>
      <p style={{ color, fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 24, margin: '0 0 4px' }}>
        {winRate.toFixed(1)}%
      </p>
      <p style={{ color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10, margin: 0 }}>
        {market.wins}W / {market.total - market.wins}L · {market.total} bets
      </p>
    </div>
  );
}

const s = {
  container: { padding: '0 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 },
  topRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  bigCard: {
    background: '#0D1117', border: '1px solid #1E2A3A', borderRadius: 16, padding: 24,
  },
  card: {
    background: '#0D1117', border: '1px solid #1E2A3A', borderRadius: 16, padding: 24,
  },
  cardLabel: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' },
  gaugeContainer: { position: 'relative', display: 'flex', justifyContent: 'center' },
  gaugeCenter: { position: 'absolute', bottom: 0, textAlign: 'center' },
  gaugeBig: { fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 28, margin: 0 },
  gaugeSmall: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 11, margin: '4px 0 0' },
  subText: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 11, margin: 0 },
  weightsList: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  weightRow: { display: 'flex', alignItems: 'center', gap: 10 },
  weightLabel: { color: '#64748B', fontFamily: 'Space Grotesk', fontSize: 12, margin: 0, width: 80, flexShrink: 0 },
  weightBarBg: { flex: 1, height: 4, background: '#1E2A3A', borderRadius: 2 },
  weightBar: { height: '100%', borderRadius: 2, transition: 'width 0.5s ease' },
  weightPct: { fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 11, width: 32, textAlign: 'right' },
  modelVersion: { color: '#334155', fontFamily: 'JetBrains Mono', fontSize: 10, margin: '12px 0 0', textAlign: 'right' },
  dayGrid: { display: 'flex', gap: 16, alignItems: 'flex-end', paddingTop: 24 },
  marketGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginTop: 8 },
};
