export default function StatsBar({ performance, bets, predictions }) {
  const overall = performance?.overall || {};
  const winRate = parseFloat(overall.win_rate) || 0;
  const totalPL = parseFloat(overall.total_pl) || 0;
  const totalBets = parseInt(overall.total_bets) || 0;

  const todayConfirmed = bets?.filter(b => b.user_status === 'confirmed').length || 0;
  const todayWins = bets?.filter(b => b.bet_result === 'win').length || 0;

  const stats = [
    {
      label: 'Win Rate (All Time)',
      value: winRate > 0 ? `${winRate.toFixed(1)}%` : '—',
      sub: `${totalBets} total bets`,
      color: winRate >= 70 ? '#22C55E' : winRate >= 55 ? '#F59E0B' : '#EF4444',
      icon: '📈',
    },
    {
      label: "Today's Picks",
      value: bets?.length || 0,
      sub: `${predictions?.filter(p => !p.should_bet).length || 0} skipped`,
      color: '#F59E0B',
      icon: '⚽',
    },
    {
      label: 'Confirmed Today',
      value: todayConfirmed,
      sub: `${todayWins} wins so far`,
      color: '#60A5FA',
      icon: '✅',
    },
    {
      label: 'Total P&L',
      value: totalPL !== 0 ? `${totalPL >= 0 ? '+' : ''}${totalPL.toFixed(0)}` : '—',
      sub: 'All time',
      color: totalPL >= 0 ? '#22C55E' : '#EF4444',
      icon: '💰',
    },
    {
      label: 'Avg Confidence',
      value: overall.avg_confidence ? `${Math.round(overall.avg_confidence)}%` : '—',
      sub: 'Bot certainty',
      color: '#A78BFA',
      icon: '🧠',
    },
  ];

  return (
    <div style={s.bar}>
      {stats.map((stat, i) => (
        <div key={i} style={s.statCell}>
          <div style={s.statTop}>
            <span style={s.statIcon}>{stat.icon}</span>
            <p style={{ ...s.statValue, color: stat.color }}>{stat.value}</p>
          </div>
          <p style={s.statLabel}>{stat.label}</p>
          <p style={s.statSub}>{stat.sub}</p>
        </div>
      ))}
    </div>
  );
}

const s = {
  bar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 1,
    background: '#0D1117',
    borderBottom: '1px solid #1E2A3A',
    borderTop: '1px solid #1E2A3A',
    margin: '0 0 32px',
  },
  statCell: {
    padding: '16px 20px',
    borderRight: '1px solid #1E2A3A',
    ':last-child': { borderRight: 'none' },
  },
  statTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  statIcon: { fontSize: 14 },
  statValue: {
    fontFamily: 'JetBrains Mono',
    fontWeight: 700,
    fontSize: 22,
    margin: 0,
    lineHeight: 1,
  },
  statLabel: {
    color: '#475569',
    fontFamily: 'Space Grotesk',
    fontSize: 11,
    margin: '0 0 2px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statSub: {
    color: '#334155',
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    margin: 0,
  },
};
