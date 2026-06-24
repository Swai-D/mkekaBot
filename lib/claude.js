/**
 * ================================================================
 * MKEKABOT v3.3 — "The Davy Final"
 * lib/claude.js — AI Brain (Claude API Integration)
 * ================================================================
 *
 * Version History:
 * v1.0  Base algorithm: referee + discipline + H2H + derby + suspension
 * v2.0  Domestic leagues only (removed UCL/European knockouts)
 * v3.0  Davy Buffer: safety lines (-1 step from bot prediction)
 * v3.1  Big Club Bias + Late Season Factor
 * v3.2  Odds Factor (static market confidence signal)
 * v3.3  League Weights + Odds Movement + Team Momentum + Referee Consistency
 *
 * BUGS FIXED in v3.3 vs previous draft:
 * [FIX-1] League factor now ADDITIVE not multiplicative (prevents confidence inflation)
 * [FIX-2] Big Club Bias checks BOTH home AND away team
 * [FIX-3] getDavyLine handles ALL botLine values — no gap at botLine < 3.5
 * [FIX-4] All v3.3 fine-tunes now implemented in actual algorithm flow
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ================================================================
// 1. BASE WEIGHTS (v1.0 core + v3.3 rebalance)
// Must always sum to 1.00
// ================================================================
export const BASE_WEIGHTS = {
  refereeStrictness: 0.28, // 28% — strongest predictor
  homeDiscipline:    0.18, // 18%
  awayDiscipline:    0.18, // 18%
  matchDynamics:     0.10, // 10% NEW v3.3 — stakes, pressure, desperation
  h2hHistory:        0.10, // 10%
  derbyFactor:       0.08, // 8%  — reduced from 11% (derbies ≠ always high cards)
  suspensionRisk:    0.08, // 8%  — reduced from 15% (self-regulation less predictive)
  // TOTAL:          1.00 ✓
};

// ================================================================
// 2. LEAGUE PROFILES (v3.3 NEW)
// predictability applied ADDITIVE: confidence += (predictability - 1.0) * 20
// ================================================================
export const LEAGUE_PROFILES = {
  premierLeague:   { predictability: 1.15, avgCards: 3.4 },
  championship:    { predictability: 1.10, avgCards: 3.8 },
  leagueOne:       { predictability: 1.10, avgCards: 3.9 },
  leagueTwo:       { predictability: 1.10, avgCards: 4.0 },
  bundesliga:      { predictability: 1.10, avgCards: 3.2 },
  laLiga:          { predictability: 1.05, avgCards: 4.1 },
  ligue1:          { predictability: 1.00, avgCards: 3.6 },
  serieA:          { predictability: 0.95, avgCards: 3.6 },
  segundaDivision: { predictability: 1.00, avgCards: 4.2 },
};

// ================================================================
// 3. BIG CLUBS (v3.1 — checked for BOTH home and away)
// ================================================================
export const BIG_CLUBS = new Set([
  "Real Madrid", "Barcelona", "Bayern Munich", "Man City",
  "Liverpool", "Chelsea", "Arsenal", "Manchester United",
  "Juventus", "Inter", "AC Milan", "PSG", "Napoli",
  "Atletico Madrid", "Dortmund", "Bayer Leverkusen",
]);

// ================================================================
// MODIFIER FUNCTIONS
// ================================================================

// [FIX-1] ADDITIVE league factor
function applyLeagueFactor(confidence, league) {
  const profile = LEAGUE_PROFILES[league];
  if (!profile) return { confidence, leagueNote: `Unknown league: ${league}`, avgCards: 3.5 };
  const adj = (profile.predictability - 1.0) * 20;
  return {
    confidence: confidence + adj,
    leagueNote: `${league}: predictability ${profile.predictability} → ${adj >= 0 ? "+" : ""}${adj.toFixed(1)} pts`,
    avgCards: profile.avgCards,
  };
}

// [FIX-2] Big Club Bias — both teams
function applyBigClubBias(confidence, homeTeamName, awayTeamName, ctx = {}) {
  const { isTitleRace = false, isEuropeanWeek = false } = ctx;
  let adj = 0;
  const notes = [];
  if (BIG_CLUBS.has(homeTeamName) && isTitleRace) { adj -= 15; notes.push(`${homeTeamName} home+title: -15`); }
  if (BIG_CLUBS.has(awayTeamName) && isTitleRace) { adj -= 8;  notes.push(`${awayTeamName} away+title: -8`); }
  if ((BIG_CLUBS.has(homeTeamName) || BIG_CLUBS.has(awayTeamName)) && isEuropeanWeek) {
    adj -= 10; notes.push("European week rotation: -10");
  }
  return { confidence: confidence + adj, bigClubNote: notes.join(" | ") || "No big club bias" };
}

function applyLateSeasonFactor(confidence, matchday, isHighStakes) {
  if (matchday > 30 && !isHighStakes) {
    return { confidence: confidence - 12, lateSeasonNote: `Late season MD${matchday}, low stakes: -12` };
  }
  return { confidence, lateSeasonNote: "No late season penalty" };
}

function applyStaticOddsFactor(confidence, odds) {
  if (!odds) return { confidence, oddsNote: "No odds data" };
  if (odds <= 1.30) return { confidence: confidence + 5,  oddsNote: `Odds ${odds} (strong market): +5` };
  if (odds <= 1.50) return { confidence,                  oddsNote: `Odds ${odds} (normal): 0` };
  if (odds <= 1.70) return { confidence: confidence - 10, oddsNote: `Odds ${odds} (skeptical): -10` };
  return              { confidence: confidence - 20, oddsNote: `Odds ${odds} (strong doubt): -20 ⚠️` };
}

// [v3.3 NEW] Odds Movement — tighter thresholds (cards market more sensitive)
function applyOddsMovement(confidence, openingOdds, currentOdds) {
  if (!openingOdds || !currentOdds) {
    return { confidence, movementSignal: "UNKNOWN", movementNote: "No opening odds — skip" };
  }
  const mv = currentOdds - openingOdds;
  if (mv < -0.15) return { confidence: confidence + 12, movementSignal: "STRONG",   movementNote: `${openingOdds}→${currentOdds}: Sharp money +12 💚` };
  if (mv < -0.08) return { confidence: confidence + 6,  movementSignal: "POSITIVE", movementNote: `${openingOdds}→${currentOdds}: Moving our way +6` };
  if (mv >  0.15) return { confidence: confidence - 18, movementSignal: "AVOID",    movementNote: `${openingOdds}→${currentOdds}: Sharp money AGAINST -18 🔴 Check lineup!` };
  if (mv >  0.08) return { confidence: confidence - 8,  movementSignal: "CAUTION",  movementNote: `${openingOdds}→${currentOdds}: Mild drift -8 🟡` };
  return { confidence, movementSignal: "NEUTRAL", movementNote: `${openingOdds}→${currentOdds}: Stable` };
}

// [v3.3 NEW] Team Momentum — uses cached DB data, NOT live scrape
function _singleTeamMomentum(team) {
  if (!team?.last5CardsGiven || team.last5CardsGiven.length < 3) {
    return { trend: "UNKNOWN", adj: 0, note: `${team?.name ?? "?"}: insufficient data` };
  }
  const avg5 = team.last5CardsGiven.reduce((s, c) => s + c, 0) / team.last5CardsGiven.length;
  const seasonAvg = team.avgCardsPerGame ?? 1.8;
  const diff = avg5 - seasonAvg;
  if (diff >  0.6) return { trend: "AGGRESSIVE",  adj: +0.4, note: `${team.name} trending aggressive (L5: ${avg5.toFixed(1)} vs ${seasonAvg.toFixed(1)})` };
  if (diff >  0.3) return { trend: "UP",           adj: +0.2, note: `${team.name} slightly more cards` };
  if (diff < -0.6) return { trend: "DISCIPLINED",  adj: -0.4, note: `${team.name} trending disciplined (L5: ${avg5.toFixed(1)} vs ${seasonAvg.toFixed(1)})` };
  if (diff < -0.3) return { trend: "DOWN",         adj: -0.2, note: `${team.name} slightly fewer cards` };
  return { trend: "STABLE", adj: 0, note: `${team.name} stable` };
}

function applyTeamMomentum(confidence, homeTeam, awayTeam) {
  const h = _singleTeamMomentum(homeTeam);
  const a = _singleTeamMomentum(awayTeam);
  const totalAdj = (h.adj + a.adj) * 8; // cards/game → confidence pts
  return {
    confidence: confidence + totalAdj,
    momentumNote: `Home: ${h.note} | Away: ${a.note}`,
  };
}

// [v3.3 NEW] Referee Consistency — variance of last 10 games
function _variance(vals) {
  if (!vals || vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
}

function applyRefereeConsistency(confidence, referee) {
  const name = referee?.name ?? "Unknown";
  if (!referee?.last10GamesCards || referee.last10GamesCards.length < 5) {
    return { confidence: confidence - 5, refNote: `${name}: <5 games data: -5`, reliability: "UNKNOWN" };
  }
  const variance = _variance(referee.last10GamesCards);
  const avg = (referee.last10GamesCards.reduce((a, b) => a + b, 0) / referee.last10GamesCards.length).toFixed(1);
  if (variance < 1.0) return { confidence: confidence + 10, refNote: `${name} very consistent (σ²=${variance.toFixed(2)}, avg=${avg}): +10 ✅`, reliability: "HIGH" };
  if (variance < 2.0) return { confidence,                  refNote: `${name} moderate (σ²=${variance.toFixed(2)}, avg=${avg}): 0`,            reliability: "MEDIUM" };
  if (variance < 3.0) return { confidence: confidence - 10, refNote: `${name} volatile (σ²=${variance.toFixed(2)}, avg=${avg}): -10 ⚠️`,       reliability: "LOW" };
  return                     { confidence: confidence - 20, refNote: `${name} unpredictable (σ²=${variance.toFixed(2)}, avg=${avg}): -20 🔴`,   reliability: "VERY_LOW" };
}

// ================================================================
// DAVY LINE CALCULATOR
// [FIX-3] Full ladder — handles all botLine values, no gaps
// ================================================================
export function getDavyLine(botLine, confidence, marketOdds) {
  // Hard skip
  if (marketOdds && marketOdds > 1.80) {
    return { line: "SKIP", reason: `Odds ${marketOdds} > 1.80 — hard skip` };
  }
  // Extra buffer zone 1.70-1.80
  if (marketOdds && marketOdds > 1.70) {
    if (parseFloat(botLine) >= 3.5 && confidence >= 70) {
      return { line: "2.5", reason: `Long odds (${marketOdds}): extra buffer` };
    }
    return { line: "SKIP", reason: `Long odds (${marketOdds}) + low confidence` };
  }
  // Standard Davy Buffer — one step down
  const n = parseFloat(botLine);
  if (n >= 5.5 && confidence >= 80) return { line: "4.5", reason: "Bot 5.5 → Buffer 4.5" };
  if (n >= 4.5 && confidence >= 75) return { line: "3.5", reason: "Bot 4.5 → Buffer 3.5" };
  if (n >= 3.5 && confidence >= 65) return { line: "2.5", reason: "Bot 3.5 → Buffer 2.5" };
  if (n >= 2.5 && confidence >= 65) return { line: "1.5", reason: "Bot 2.5 → Buffer 1.5" };
  return { line: "SKIP", reason: `Confidence ${confidence.toFixed(1)}% too low` };
}

// ================================================================
// MAIN ALGORITHM — mkekaBOTv33()
// ================================================================
export async function mkekaBOTv33(matchData, marketOdds = {}) {
  const {
    league, homeTeam, awayTeam, referee, matchday,
    isTitleRace = false, isRelegation = false, isDerby = false,
    isEuropeanWeek = false, openingOdds = null, currentOdds = null,
  } = matchData;

  const isHighStakes = isTitleRace || isRelegation || isDerby;
  const oddsValue = marketOdds?.over35 ?? currentOdds ?? null;

  // Step 1: Claude AI base
  const ai = await runClaudeAnalysis(matchData);
  let confidence = ai.confidence;
  let botLine = ai.predictedLine;

  const audit = { "0_ai_base": `conf:${confidence}% line:${botLine} cards:~${ai.predictedCards}` };

  // Step 2–8: Apply all modifiers
  const lg = applyLeagueFactor(confidence, league);             confidence = lg.confidence;  audit["1_league"]          = lg.leagueNote;
  const bc = applyBigClubBias(confidence, homeTeam.name, awayTeam.name, { isTitleRace, isEuropeanWeek });
                                                                confidence = bc.confidence;  audit["2_bigclub"]         = bc.bigClubNote;
  const ls = applyLateSeasonFactor(confidence, matchday, isHighStakes);
                                                                confidence = ls.confidence;  audit["3_late_season"]     = ls.lateSeasonNote;
  const so = applyStaticOddsFactor(confidence, oddsValue);     confidence = so.confidence;  audit["4_static_odds"]     = so.oddsNote;
  const om = applyOddsMovement(confidence, openingOdds, oddsValue);
                                                                confidence = om.confidence;  audit["5_odds_movement"]   = om.movementNote;
  const tm = applyTeamMomentum(confidence, homeTeam, awayTeam); confidence = tm.confidence; audit["6_momentum"]        = tm.momentumNote;
  const rc = applyRefereeConsistency(confidence, referee);     confidence = rc.confidence;  audit["7_ref_consistency"] = rc.refNote;

  // Cap 0–95
  confidence = Math.max(0, Math.min(95, confidence));
  audit["8_final"] = `${confidence.toFixed(1)}%`;

  // Davy Line
  const dl = getDavyLine(botLine, confidence, oddsValue);
  audit["9_davy_line"] = `${dl.line} — ${dl.reason}`;

  const skip = confidence < 65 || dl.line === "SKIP";

  if (skip) {
    return {
      verdict: "SKIP",
      reason: dl.line === "SKIP" ? dl.reason : `Confidence ${confidence.toFixed(1)}% < 65%`,
      match: `${homeTeam.name} vs ${awayTeam.name}`,
      botLine, davyLine: "N/A", confidence: confidence.toFixed(1),
      auditTrail: audit, warnings: ai.warnings,
    };
  }

  return {
    verdict: "BET",
    match: `${homeTeam.name} vs ${awayTeam.name}`,
    league, botLine, davyLine: dl.line, davyReason: dl.reason,
    confidence: confidence.toFixed(1), marketOdds: oddsValue,
    refReliability: rc.reliability, reasoning: ai.reasoning,
    auditTrail: audit, warnings: ai.warnings,
  };
}

// ================================================================
// CLAUDE API ANALYSIS
// ================================================================
export async function runClaudeAnalysis(matchData) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `You are MkekaBOT, a professional yellow cards betting analyst.
Analyze domestic leagues ONLY: Premier League, Championship, League One, League Two, Bundesliga, La Liga, Serie A, Ligue 1, Segunda División.
NEVER analyze European knockout matches (UCL, Europa, Conference) — players self-regulate.

Respond ONLY with valid JSON, no markdown:
{
  "predictedCards": <number>,
  "predictedLine": "<1.5|2.5|3.5|4.5|5.5>",
  "confidence": <integer 0-100>,
  "keyFactors": ["<factor1>", "<factor2>", "<factor3>"],
  "reasoning": "<2-3 sentences>",
  "warnings": ["<any concerns>"]
}`,
    messages: [{
      role: "user",
      content: `Analyze yellow cards:

MATCH: ${matchData.homeTeam.name} vs ${matchData.awayTeam.name}
LEAGUE: ${matchData.league} | Matchday: ${matchData.matchday ?? "?"}
REFEREE: ${matchData.referee?.name ?? "TBC"}
  - Season avg: ${matchData.referee?.avgCardsPerGame?.toFixed(2) ?? "N/A"} cards/game
  - Games this season: ${matchData.referee?.gamesThisSeason ?? "?"}
  - Last 10 games: [${matchData.referee?.last10GamesCards?.join(", ") ?? "N/A"}]

HOME — ${matchData.homeTeam.name} (Pos: ${matchData.leaguePosition?.home ?? "?"})
  - Avg cards/game: ${matchData.homeTeam.avgCardsPerGame?.toFixed(2) ?? "N/A"}
  - Last 5 games cards: [${matchData.homeTeam.last5CardsGiven?.join(", ") ?? "N/A"}]
  - Suspended: ${matchData.homeTeam.suspendedPlayers?.join(", ") || "None"}

AWAY — ${matchData.awayTeam.name} (Pos: ${matchData.leaguePosition?.away ?? "?"})
  - Avg cards/game: ${matchData.awayTeam.avgCardsPerGame?.toFixed(2) ?? "N/A"}
  - Last 5 games cards: [${matchData.awayTeam.last5CardsGiven?.join(", ") ?? "N/A"}]
  - Suspended: ${matchData.awayTeam.suspendedPlayers?.join(", ") || "None"}

CONTEXT:
  - Derby: ${matchData.isDerby ? "YES" : "No"}
  - Title race: ${matchData.isTitleRace ? "YES" : "No"}
  - Relegation battle: ${matchData.isRelegation ? "YES" : "No"}
  - European week: ${matchData.isEuropeanWeek ? "YES" : "No"}
  - H2H avg cards (last 3): ${matchData.h2hLastSeason?.avgCards?.toFixed(1) ?? "N/A"}`,
    }],
  });

  try {
    const p = JSON.parse(response.content[0]?.text ?? "{}");
    return {
      confidence:     p.confidence     ?? 60,
      predictedLine:  p.predictedLine  ?? "3.5",
      predictedCards: p.predictedCards ?? 3.5,
      keyFactors:     p.keyFactors     ?? [],
      reasoning:      p.reasoning      ?? "",
      warnings:       p.warnings       ?? [],
    };
  } catch {
    console.error("[MkekaBOT] Claude parse error");
    return { confidence: 55, predictedLine: "3.5", predictedCards: 3.5, keyFactors: [], reasoning: "Parse error", warnings: ["AI parse failed"] };
  }
}

export default mkekaBOTv33;
