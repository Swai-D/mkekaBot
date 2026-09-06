/**
 * MkekaBOT — Mock AI Provider for Offline Development
 * lib/mockAi.js
 *
 * Drop-in replacement for lib/llm.js when USE_MOCK_AI=true.
 * Uses the engineered CSV features to produce deterministic predictions.
 * No API calls, no cost.
 */

export async function mkekaBOTv35(matchData, marketOdds = {}) {
  const {
    league,
    homeTeam,
    awayTeam,
    referee,
    isTitleRace = false,
    isRelegation = false,
    isDerby = false,
    currentOdds = null,
  } = matchData;

  const isHighStakes = isTitleRace || isRelegation || isDerby;
  const oddsValue = marketOdds?.over35 ?? currentOdds ?? null;

  // Base expected cards from team + referee averages
  const refAvg = referee?.avgCardsPerGame ?? 3.5;
  const homeAvg = homeTeam?.avgCardsPerGame ?? 1.8;
  const awayAvg = awayTeam?.avgCardsPerGame ?? 1.8;
  let expectedCards = (refAvg + homeAvg + awayAvg) / 2;

  // Modifiers
  let confidence = 60;
  const audit = { '0_ai_base': `expected:${expectedCards.toFixed(2)} cards` };

  if (isDerby) {
    expectedCards += 0.7;
    confidence += 8;
    audit['1_derby'] = 'Derby: +0.7 cards, +8 conf';
  }

  if (isHighStakes && !isDerby) {
    expectedCards += 0.4;
    confidence += 5;
    audit['2_stakes'] = 'High stakes: +0.4 cards, +5 conf';
  }

  if (referee?.avgCardsPerGame > 4.0) {
    confidence += 7;
    audit['3_strict_ref'] = 'Strict referee: +7 conf';
  } else if (referee?.avgCardsPerGame < 3.0) {
    confidence -= 5;
    audit['3_lenient_ref'] = 'Lenient referee: -5 conf';
  }

  if (homeAvg + awayAvg > 4.2) {
    confidence += 5;
    audit['4_aggressive_teams'] = 'Aggressive teams: +5 conf';
  } else if (homeAvg + awayAvg < 3.2) {
    confidence -= 5;
    audit['4_disciplined_teams'] = 'Disciplined teams: -5 conf';
  }

  // Convert expected cards to a predicted line
  let predictedLine = '3.5';
  if (expectedCards >= 5.0) predictedLine = '5.5';
  else if (expectedCards >= 4.0) predictedLine = '4.5';
  else if (expectedCards >= 3.0) predictedLine = '3.5';
  else predictedLine = '2.5';

  audit['5_predicted_line'] = predictedLine;

  // Simple Davy buffer: one step down
  const davyMap = { 5.5: '4.5', 4.5: '3.5', 3.5: '2.5', 2.5: '1.5' };
  let davyLine = davyMap[predictedLine];

  // Odds filter
  if (oddsValue && oddsValue > 1.8) {
    davyLine = 'SKIP';
    audit['6_odds'] = `Odds ${oddsValue} too high: SKIP`;
  } else if (oddsValue && oddsValue > 1.7) {
    confidence -= 10;
    audit['6_odds'] = `Long odds ${oddsValue}: -10 conf`;
  }

  confidence = Math.max(0, Math.min(95, confidence));
  audit['7_final'] = `${confidence.toFixed(1)}%`;

  const minConfidence = parseInt(process.env.MIN_CONFIDENCE_TO_BET || '65');
  const skip = confidence < minConfidence || davyLine === 'SKIP';

  if (skip) {
    return {
      verdict: 'SKIP',
      reason:
        davyLine === 'SKIP'
          ? 'Odds too high'
          : `Confidence ${confidence.toFixed(1)}% < ${minConfidence}%`,
      match: `${homeTeam.name} vs ${awayTeam.name}`,
      botLine: predictedLine,
      davyLine: 'N/A',
      confidence: confidence.toFixed(1),
      auditTrail: audit,
      warnings: ['MOCK AI — no real API call made'],
    };
  }

  return {
    verdict: 'BET',
    match: `${homeTeam.name} vs ${awayTeam.name}`,
    league,
    botLine: predictedLine,
    davyLine,
    davyReason: 'Mock AI buffer: one step below predicted line',
    confidence: confidence.toFixed(1),
    marketOdds: oddsValue,
    refReliability: 'MOCK',
    reasoning: `Mock prediction: ~${expectedCards.toFixed(1)} expected cards. Referee avg ${refAvg.toFixed(1)}, teams combine for ${(homeAvg + awayAvg).toFixed(1)} cards/game.`,
    auditTrail: audit,
    warnings: ['MOCK AI — no real API call made'],
  };
}

export async function runKimiAnalysis() {
  throw new Error('runKimiAnalysis should not be called directly in mock mode.');
}

export default mkekaBOTv35;
