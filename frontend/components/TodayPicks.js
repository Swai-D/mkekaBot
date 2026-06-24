import { useState } from 'react';

export default function TodayPicks({ bets, skipped, loading, onConfirm, onSkip, onRefresh }) {
  if (loading) {
    return (
      <div style={s.loadingContainer}>
        <div style={s.loadingSpinner} />
        <p style={s.loadingText}>Loading today's picks...</p>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* BET OPPORTUNITIES */}
      <section>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>
            <span style={s.sectionDot} />
            Bet Opportunities
          </h2>
          <span style={s.sectionCount}>{bets.length} picks</span>
        </div>

        {bets.length === 0 ? (
          <EmptyState type="bets" onRefresh={onRefresh} />
        ) : (
          <div style={s.grid}>
            {bets.map(bet => (
              <BetCard key={bet.id} bet={bet} onConfirm={onConfirm} onSkip={onSkip} />
            ))}
          </div>
        )}
      </section>

      {/* SKIPPED MATCHES */}
      {skipped.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <div style={s.sectionHeader}>
            <h2 style={{ ...s.sectionTitle, opacity: 0.6 }}>
              <span style={{ ...s.sectionDot, background: '#475569' }} />
              Bot Says Skip
            </h2>
            <span style={{ ...s.sectionCount, color: '#475569' }}>{skipped.length} matches</span>
          </div>
          <div style={s.skipGrid}>
            {skipped.map(match => (
              <SkipCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================
// BET CARD
// ============================================
function BetCard({ bet, onConfirm, onSkip }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [odds, setOdds] = useState('');
  const [stake, setStake] = useState('');
  const [confirming, setConfirming] = useState(false);

  const isConfirmed = bet.user_status === 'confirmed';
  const isSkipped = bet.user_status === 'skipped';

  const confidenceColor = bet.confidence_score >= 80 ? '#22C55E'
    : bet.confidence_score >= 70 ? '#F59E0B'
    : '#FB923C';

  const marketLabel = bet.market?.replace('_', ' ').toUpperCase() || 'N/A';
  const resultColor = bet.bet_result === 'win' ? '#22C55E'
    : bet.bet_result === 'loss' ? '#EF4444'
    : null;

  async function handleConfirm() {
    if (!odds || !stake) return;
    setConfirming(true);
    const ok = await onConfirm(bet.id, parseFloat(odds), parseFloat(stake));
    setConfirming(false);
    if (ok) setShowConfirm(false);
  }

  // Parse raw analysis
  const analysis = bet.raw_analysis || {};

  return (
    <div style={{
      ...s.card,
      borderColor: isConfirmed ? '#22C55E44' : isSkipped ? '#47556944' : '#1E2A3A',
      opacity: isSkipped ? 0.5 : 1,
    }}>
      {/* RESULT BADGE (end of day) */}
      {bet.bet_result && bet.bet_result !== 'pending' && (
        <div style={{ ...s.resultBadge, background: `${resultColor}22`, color: resultColor, borderColor: `${resultColor}44` }}>
          {bet.bet_result === 'win' ? '✓ WIN' : '✗ LOSS'}
          {bet.profit_loss !== null && (
            <span style={{ marginLeft: 8 }}>
              {bet.profit_loss >= 0 ? '+' : ''}{parseFloat(bet.profit_loss).toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* HEADER */}
      <div style={s.cardHeader}>
        <div style={s.leagueBadge}>
          <span style={s.leagueDot} />
          {bet.league}
        </div>
        {bet.fixture_derby && (
          <span style={s.derbyBadge}>⚡ DERBY</span>
        )}
        <div style={{ ...s.confidencePill, background: `${confidenceColor}22`, color: confidenceColor, borderColor: `${confidenceColor}44` }}>
          {bet.confidence_score}% confidence
        </div>
      </div>

      {/* MATCH */}
      <div style={s.matchRow}>
        <div style={s.teamBlock}>
          <p style={s.teamName}>{bet.home_team}</p>
          <p style={s.teamLabel}>Home</p>
        </div>
        <div style={s.vsBlock}>
          <span style={s.vs}>VS</span>
          <p style={s.matchTime}>
            {new Date(bet.match_date).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div style={{ ...s.teamBlock, textAlign: 'right' }}>
          <p style={s.teamName}>{bet.away_team}</p>
          <p style={s.teamLabel}>Away</p>
        </div>
      </div>

      {/* PICK */}
      <div style={s.pickRow}>
        <div style={s.marketBox}>
          <p style={s.marketLabel}>BOT PICK</p>
          <p style={s.marketValue}>{marketLabel}</p>
        </div>
        <div style={s.arrowSeparator}>→</div>
        <div style={s.refBox}>
          <p style={s.refLabel}>REFEREE AVG</p>
          <p style={s.refValue}>
            {bet.referee ? `${bet.referee}` : 'Unknown'}
            <span style={s.refAvg}>{bet.referee_avg ? ` · ${parseFloat(bet.referee_avg).toFixed(1)} cards/g` : ''}</span>
          </p>
        </div>
      </div>

      {/* STATS ROW */}
      <div style={s.statsRow}>
        <StatCell label="Home avg" value={parseFloat(bet.home_team_avg_cards || 0).toFixed(1)} />
        <StatCell label="Away avg" value={parseFloat(bet.away_team_avg_cards || 0).toFixed(1)} />
        <StatCell label="H2H avg" value={parseFloat(bet.h2h_avg_cards || 0).toFixed(1)} />
        <StatCell label="Expected" value={analysis.expectedCards?.toFixed(1) || '—'} highlight />
      </div>

      {/* CLAUDE REASONING */}
      <div style={s.reasoningBox}>
        <p style={s.reasoningLabel}>🧠 Analysis</p>
        <p style={s.reasoningText}>{bet.claude_reasoning || 'Generating analysis...'}</p>
      </div>

      {/* CONFIRMED DISPLAY */}
      {isConfirmed && (
        <div style={s.confirmedBox}>
          <span style={s.confirmedIcon}>✓</span>
          <span style={s.confirmedText}>
            Confirmed · @{bet.odds_placed} · Stake: {bet.stake_amount}
          </span>
        </div>
      )}

      {/* ACTIONS */}
      {!isConfirmed && !isSkipped && (
        <>
          {!showConfirm ? (
            <div style={s.actions}>
              <button style={s.betBtn} onClick={() => setShowConfirm(true)}>
                ✅ Confirm Bet
              </button>
              <button style={s.skipBtn} onClick={() => onSkip(bet.id)}>
                Skip
              </button>
            </div>
          ) : (
            <div style={s.confirmForm}>
              <p style={s.confirmTitle}>Enter bet details</p>
              <div style={s.confirmInputs}>
                <div style={s.inputGroup}>
                  <label style={s.inputLabel}>Odds</label>
                  <input
                    style={s.input}
                    type="number"
                    step="0.01"
                    placeholder="e.g. 1.85"
                    value={odds}
                    onChange={e => setOdds(e.target.value)}
                  />
                </div>
                <div style={s.inputGroup}>
                  <label style={s.inputLabel}>Stake (KSH)</label>
                  <input
                    style={s.input}
                    type="number"
                    placeholder="e.g. 500"
                    value={stake}
                    onChange={e => setStake(e.target.value)}
                  />
                </div>
              </div>
              <div style={s.confirmActions}>
                <button
                  style={{ ...s.betBtn, opacity: (!odds || !stake || confirming) ? 0.5 : 1 }}
                  onClick={handleConfirm}
                  disabled={!odds || !stake || confirming}
                >
                  {confirming ? 'Saving...' : 'Confirm ✓'}
                </button>
                <button style={s.cancelBtn} onClick={() => setShowConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCell({ label, value, highlight }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ color: highlight ? '#F59E0B' : '#94A3B8', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 16, margin: '4px 0 0' }}>{value}</p>
    </div>
  );
}

// ============================================
// SKIP CARD (compact)
// ============================================
function SkipCard({ match }) {
  return (
    <div style={s.skipCard}>
      <div style={{ flex: 1 }}>
        <p style={s.skipMatch}>{match.home_team} vs {match.away_team}</p>
        <p style={s.skipLeague}>{match.league}</p>
      </div>
      <div style={s.skipReason}>
        <p style={s.skipReasonText}>{match.skip_reason || match.claude_reasoning || 'Data insufficient'}</p>
      </div>
    </div>
  );
}

// ============================================
// EMPTY STATE
// ============================================
function EmptyState({ type, onRefresh }) {
  return (
    <div style={s.empty}>
      <div style={s.emptyIcon}>⚽</div>
      <p style={s.emptyTitle}>
        {type === 'bets' ? 'No picks yet today' : 'No matches to skip'}
      </p>
      <p style={s.emptyText}>
        {type === 'bets' ? 'Run analysis to generate today\'s picks.' : ''}
      </p>
      {type === 'bets' && (
        <button style={s.refreshBtn} onClick={onRefresh}>Refresh</button>
      )}
    </div>
  );
}

// ============================================
// STYLES
// ============================================
const s = {
  container: { padding: '0 24px 48px' },
  loadingContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  loadingSpinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '2px solid #1E2A3A', borderTopColor: '#F59E0B',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#475569', fontFamily: 'Space Grotesk', fontSize: 14 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: 10, color: '#F1F5F9', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 16, margin: 0 },
  sectionDot: { width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 8px #F59E0B' },
  sectionCount: { color: '#F59E0B', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 20 },
  skipGrid: { display: 'flex', flexDirection: 'column', gap: 8 },

  card: {
    background: '#0D1117', border: '1px solid #1E2A3A', borderRadius: 16,
    padding: 24, position: 'relative', transition: 'border-color 0.2s',
  },
  resultBadge: {
    position: 'absolute', top: -12, right: 20,
    padding: '4px 14px', borderRadius: 20, border: '1px solid',
    fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12,
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  leagueBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    color: '#64748B', fontFamily: 'JetBrains Mono', fontSize: 11,
    letterSpacing: '0.05em', textTransform: 'uppercase',
  },
  leagueDot: { width: 5, height: 5, borderRadius: '50%', background: '#475569' },
  derbyBadge: {
    background: '#FEF3C722', color: '#F59E0B', padding: '3px 10px',
    borderRadius: 20, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700,
    border: '1px solid #F59E0B44',
  },
  confidencePill: {
    marginLeft: 'auto', padding: '4px 12px', borderRadius: 20,
    fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12, border: '1px solid',
  },
  matchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  teamBlock: { flex: 1 },
  teamName: { color: '#F1F5F9', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 16, margin: 0 },
  teamLabel: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10, margin: '4px 0 0', textTransform: 'uppercase' },
  vsBlock: { textAlign: 'center', padding: '0 16px' },
  vs: { color: '#2D3A4A', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 18 },
  matchTime: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 11, margin: '4px 0 0' },

  pickRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#080B14', borderRadius: 10, padding: '12px 16px', marginBottom: 16,
  },
  marketBox: { flex: 1 },
  marketLabel: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 },
  marketValue: { color: '#F59E0B', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 20, margin: '4px 0 0' },
  arrowSeparator: { color: '#1E2A3A', fontSize: 18, fontFamily: 'JetBrains Mono' },
  refBox: { flex: 2 },
  refLabel: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 },
  refValue: { color: '#94A3B8', fontFamily: 'Space Grotesk', fontWeight: 500, fontSize: 13, margin: '4px 0 0' },
  refAvg: { color: '#475569', fontSize: 11 },

  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    background: '#080B14', borderRadius: 10, padding: '12px 16px', marginBottom: 16, gap: 8,
  },
  reasoningBox: {
    background: '#0A1628', border: '1px solid #1E2A3A', borderRadius: 10,
    padding: '12px 14px', marginBottom: 16,
  },
  reasoningLabel: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' },
  reasoningText: { color: '#94A3B8', fontFamily: 'Space Grotesk', fontSize: 13, lineHeight: 1.6, margin: 0 },

  confirmedBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#22C55E11', border: '1px solid #22C55E33', borderRadius: 10,
    padding: '10px 14px',
  },
  confirmedIcon: { color: '#22C55E', fontWeight: 700, fontSize: 16 },
  confirmedText: { color: '#22C55E', fontFamily: 'JetBrains Mono', fontSize: 12 },

  actions: { display: 'flex', gap: 10 },
  betBtn: {
    flex: 1, padding: '12px 20px', background: 'linear-gradient(135deg, #F59E0B, #D97706)',
    border: 'none', borderRadius: 10, color: '#080B14', fontFamily: 'Space Grotesk',
    fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'opacity 0.2s',
  },
  skipBtn: {
    padding: '12px 20px', background: 'transparent', border: '1px solid #1E2A3A',
    borderRadius: 10, color: '#64748B', fontFamily: 'Space Grotesk', fontSize: 13,
    cursor: 'pointer',
  },
  confirmForm: { background: '#080B14', borderRadius: 10, padding: 16 },
  confirmTitle: { color: '#94A3B8', fontFamily: 'Space Grotesk', fontSize: 13, margin: '0 0 12px' },
  confirmInputs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  inputLabel: { color: '#475569', fontFamily: 'JetBrains Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' },
  input: {
    background: '#0D1117', border: '1px solid #1E2A3A', borderRadius: 8,
    padding: '10px 12px', color: '#F1F5F9', fontFamily: 'JetBrains Mono', fontSize: 14,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  confirmActions: { display: 'flex', gap: 10 },
  cancelBtn: {
    padding: '10px 16px', background: 'transparent', border: '1px solid #1E2A3A',
    borderRadius: 8, color: '#64748B', fontFamily: 'Space Grotesk', fontSize: 13, cursor: 'pointer',
  },

  skipCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: '#0D111788', border: '1px solid #1A2230', borderRadius: 10,
    padding: '12px 16px',
  },
  skipMatch: { color: '#475569', fontFamily: 'Space Grotesk', fontWeight: 500, fontSize: 13, margin: 0 },
  skipLeague: { color: '#2D3A4A', fontFamily: 'JetBrains Mono', fontSize: 10, margin: '3px 0 0' },
  skipReason: { maxWidth: 300 },
  skipReasonText: { color: '#334155', fontFamily: 'Space Grotesk', fontSize: 12, margin: 0, lineHeight: 1.4 },

  empty: { textAlign: 'center', padding: '60px 24px' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#475569', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 18, margin: '0 0 8px' },
  emptyText: { color: '#334155', fontFamily: 'Space Grotesk', fontSize: 14, margin: '0 0 24px' },
  refreshBtn: {
    padding: '10px 24px', background: 'transparent', border: '1px solid #F59E0B44',
    borderRadius: 10, color: '#F59E0B', fontFamily: 'Space Grotesk', fontSize: 14,
    cursor: 'pointer',
  },
};
