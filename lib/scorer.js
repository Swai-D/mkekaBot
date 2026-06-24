/**
 * MkekaBOT — Scorer & Database Operations
 * lib/scorer.js
 *
 * Updated for v3.3:
 * - Saves full auditTrail to DB for post-match learning
 * - Saves openingOdds, currentOdds for movement analysis
 * - Reconciliation now feeds back into team momentum cache
 * - New: updateTeamMomentumCache() — updates last5CardsGiven after each result
 */

import { query } from "./db.js";
import mkekaBOTv33, { runClaudeAnalysis } from "./claude.js";
import { buildMatchData } from "./firecrawl.js";

// ================================================================
// SAVE PREDICTION
// ================================================================
export async function savePrediction(prediction, matchMeta) {
  const {
    match, league, botLine, davyLine, confidence,
    marketOdds, reasoning, auditTrail, warnings, verdict,
  } = prediction;

  const {
    homeTeam, awayTeam, kickoff, matchday,
    openingOdds, currentOdds, referee,
  } = matchMeta;

  const sql = `
    INSERT INTO predictions (
      match_date, league, home_team, away_team, kickoff,
      matchday, referee_name,
      bot_line, davy_line, confidence, market_odds,
      opening_odds, current_odds,
      reasoning, audit_trail, warnings, verdict,
      created_at
    ) VALUES (
      CURRENT_DATE, $1, $2, $3, $4,
      $5, $6,
      $7, $8, $9, $10,
      $11, $12,
      $13, $14, $15, $16,
      NOW()
    )
    RETURNING id
  `;

  const values = [
    league,
    homeTeam?.name ?? match?.split(" vs ")[0],
    awayTeam?.name ?? match?.split(" vs ")[1],
    kickoff ?? null,
    matchday ?? null,
    referee?.name ?? null,
    botLine, davyLine,
    parseFloat(confidence),
    marketOdds ?? null,
    openingOdds ?? null,
    currentOdds ?? null,
    reasoning ?? null,
    JSON.stringify(auditTrail ?? {}),
    JSON.stringify(warnings ?? []),
    verdict,
  ];

  const result = await query(sql, values);
  return result.rows[0]?.id;
}

// ================================================================
// RECORD RESULT (after match ends)
// ================================================================
export async function recordResult(predictionId, actualCards, homeCards, awayCards) {
  const prediction = await getPrediction(predictionId);
  if (!prediction) throw new Error(`Prediction ${predictionId} not found`);

  const davyLineNum = parseFloat(prediction.davy_line);
  const won = !isNaN(davyLineNum) ? actualCards > davyLineNum : null;
  const correct = won !== null ? won : false;

  await query(`
    UPDATE predictions
    SET
      actual_cards = $1,
      home_cards_actual = $2,
      away_cards_actual = $3,
      result = $4,
      reconciled_at = NOW()
    WHERE id = $5
  `, [actualCards, homeCards, awayCards, correct ? "WIN" : "LOSS", predictionId]);

  // Update team momentum cache with actual result
  if (prediction.home_team) await updateTeamMomentumCache(prediction.home_team, prediction.league, homeCards);
  if (prediction.away_team) await updateTeamMomentumCache(prediction.away_team, prediction.league, awayCards);

  // Update referee cache
  if (prediction.referee_name) await updateRefereeCache(prediction.referee_name, actualCards);

  return { predictionId, actualCards, correct, davyLine: prediction.davy_line };
}

// ================================================================
// v3.3: UPDATE TEAM MOMENTUM CACHE
// Keeps last5CardsGiven fresh in DB — avoids re-scraping for momentum
// ================================================================
export async function updateTeamMomentumCache(teamName, league, cardsThisGame) {
  // Fetch existing cache
  const existing = await query(
    `SELECT last5_cards_given FROM team_stats_cache WHERE team_name = $1 AND league = $2`,
    [teamName, league]
  );

  let last5 = [];
  if (existing.rows.length > 0 && existing.rows[0].last5_cards_given) {
    last5 = existing.rows[0].last5_cards_given;
  }

  // Prepend new result, keep only last 5
  last5 = [cardsThisGame, ...last5].slice(0, 5);

  await query(`
    INSERT INTO team_stats_cache (team_name, league, last5_cards_given, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (team_name, league)
    DO UPDATE SET last5_cards_given = $3, updated_at = NOW()
  `, [teamName, league, JSON.stringify(last5)]);
}

// ================================================================
// v3.3: UPDATE REFEREE CACHE
// Keeps last10GamesCards fresh — avoids re-scraping every day
// ================================================================
export async function updateRefereeCache(refName, totalCardsThisGame) {
  const existing = await query(
    `SELECT last10_games_cards FROM referee_cache WHERE referee_name = $1`,
    [refName]
  );

  let last10 = [];
  if (existing.rows.length > 0 && existing.rows[0].last10_games_cards) {
    last10 = existing.rows[0].last10_games_cards;
  }

  last10 = [totalCardsThisGame, ...last10].slice(0, 10);

  await query(`
    INSERT INTO referee_cache (referee_name, last10_games_cards, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (referee_name)
    DO UPDATE SET last10_games_cards = $2, updated_at = NOW()
  `, [refName, JSON.stringify(last10)]);
}

// ================================================================
// EVENING RECONCILIATION (11PM Cron)
// Fetches results, records them, feeds Claude for self-learning
// ================================================================
export async function runEveningReconciliation() {
  console.log("[Reconcile] Starting evening reconciliation...");

  // Get today's unreconciled BET predictions
  const pending = await query(`
    SELECT * FROM predictions
    WHERE match_date = CURRENT_DATE
      AND verdict = 'BET'
      AND result IS NULL
    ORDER BY kickoff ASC
  `);

  if (pending.rows.length === 0) {
    console.log("[Reconcile] No pending predictions today.");
    return { reconciled: 0, wins: 0, losses: 0 };
  }

  let wins = 0, losses = 0;
  const errors = [];

  for (const pred of pending.rows) {
    try {
      // Try to fetch actual result (from Firecrawl or manual)
      const result = await fetchMatchResult(pred.home_team, pred.away_team, pred.match_date);

      if (!result) {
        console.warn(`[Reconcile] No result found for ${pred.home_team} vs ${pred.away_team}`);
        continue;
      }

      const outcome = await recordResult(pred.id, result.totalCards, result.homeCards, result.awayCards);
      if (outcome.correct) wins++; else losses++;

      console.log(`[Reconcile] ${pred.home_team} vs ${pred.away_team}: ${result.totalCards} cards — ${outcome.correct ? "WIN ✅" : "LOSS ❌"} (line: ${pred.davy_line})`);
    } catch (err) {
      errors.push({ match: `${pred.home_team} vs ${pred.away_team}`, error: err.message });
    }
  }

  const reconciled = wins + losses;
  const winRate = reconciled > 0 ? ((wins / reconciled) * 100).toFixed(1) : 0;

  // Save reconciliation report
  await query(`
    INSERT INTO reconciliation_log (
      log_date, total_predictions, wins, losses, win_rate_pct, errors, created_at
    ) VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, NOW())
  `, [reconciled, wins, losses, parseFloat(winRate), JSON.stringify(errors)]);

  // Trigger Claude self-learning if enough data
  if (reconciled >= 3) await runSelfLearning();

  console.log(`[Reconcile] Done: ${wins}W/${losses}L — Win rate: ${winRate}%`);
  return { reconciled, wins, losses, winRate, errors };
}

// ================================================================
// CLAUDE SELF-LEARNING (post-reconciliation analysis)
// Asks Claude to identify patterns in wins/losses
// ================================================================
async function runSelfLearning() {
  try {
    const recent = await query(`
      SELECT
        league, home_team, away_team, bot_line, davy_line,
        confidence, market_odds, actual_cards, result,
        audit_trail
      FROM predictions
      WHERE match_date >= CURRENT_DATE - INTERVAL '14 days'
        AND result IS NOT NULL
      ORDER BY match_date DESC
      LIMIT 30
    `);

    if (recent.rows.length < 5) return;

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: "You are MkekaBOT's self-learning module. Analyze prediction results to find patterns.",
      messages: [{
        role: "user",
        content: `Analyze these recent predictions and identify:
1. Which leagues/situations we over-predict cards
2. Which leagues/situations we under-predict
3. Any systematic errors (e.g., always wrong on derbies, or late season)
4. Suggested weight adjustments for next run

Data: ${JSON.stringify(recent.rows.slice(0, 20), null, 2)}

Respond in JSON:
{
  "overPredictPatterns": ["..."],
  "underPredictPatterns": ["..."],
  "systematicErrors": ["..."],
  "recommendations": ["..."],
  "winRate": <number>
}`,
      }],
    });

    const insights = JSON.parse(response.content[0]?.text ?? "{}");

    await query(`
      INSERT INTO learning_log (log_date, insights, sample_size, created_at)
      VALUES (CURRENT_DATE, $1, $2, NOW())
    `, [JSON.stringify(insights), recent.rows.length]);

    console.log("[SelfLearn] Insights saved:", insights.recommendations?.slice(0, 2));
  } catch (err) {
    console.error("[SelfLearn] Error:", err.message);
  }
}

// ================================================================
// FETCH MATCH RESULT (from FlashScore via Firecrawl)
// ================================================================
async function fetchMatchResult(homeTeam, awayTeam, matchDate) {
  try {
    const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
    const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

    const searchUrl = `https://www.flashscore.com/football/search/?q=${encodeURIComponent(homeTeam + " " + awayTeam)}`;

    const result = await firecrawl.scrapeUrl(searchUrl, {
      formats: ["extract"],
      extract: {
        prompt: `Find the completed match between ${homeTeam} and ${awayTeam} on ${matchDate}.
        Extract:
        {
          "homeScore": <number>,
          "awayScore": <number>,
          "homeCards": <number of yellow cards for home team>,
          "awayCards": <number of yellow cards for away team>,
          "totalCards": <total yellow cards in match>,
          "matchFinished": <true/false>
        }
        Return null if match not found or not finished.`,
      },
    });

    return result?.data?.extract ?? null;
  } catch (err) {
    console.error(`[fetchResult] Error for ${homeTeam} vs ${awayTeam}:`, err.message);
    return null;
  }
}

// ================================================================
// QUERY HELPERS
// ================================================================
export async function getPrediction(id) {
  const result = await query("SELECT * FROM predictions WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function getTodaysPredictions() {
  const result = await query(`
    SELECT * FROM predictions
    WHERE match_date = CURRENT_DATE
    ORDER BY kickoff ASC
  `);
  return result.rows;
}

export async function getStats(days = 30) {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE verdict = 'BET') AS total_bets,
      COUNT(*) FILTER (WHERE result = 'WIN') AS wins,
      COUNT(*) FILTER (WHERE result = 'LOSS') AS losses,
      COUNT(*) FILTER (WHERE verdict = 'SKIP') AS skipped,
      ROUND(
        COUNT(*) FILTER (WHERE result = 'WIN')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE result IS NOT NULL), 0) * 100, 1
      ) AS win_rate_pct,
      ROUND(AVG(confidence)::numeric, 1) AS avg_confidence,
      league,
      COUNT(*) FILTER (WHERE result = 'WIN') * 1.0 /
        NULLIF(COUNT(*) FILTER (WHERE result IS NOT NULL), 0) AS league_win_rate
    FROM predictions
    WHERE match_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY league
    ORDER BY league_win_rate DESC NULLS LAST
  `);
  return result.rows;
}

// ================================================================
// MAIN ANALYSIS ENTRY POINT
// Called by cron at 6AM and by /api/analyze endpoint
// ================================================================
export async function analyzeAndSaveFixtures(league = "all") {
  const { getTodaysFixtures, buildMatchData } = await import("./firecrawl.js");

  const fixtures = await getTodaysFixtures(league);
  console.log(`[Scorer] Found ${fixtures.length} fixtures`);

  const results = [];

  for (const fixture of fixtures) {
    try {
      // Build full match data with v3.3 fields
      const matchData = await buildMatchData(fixture, {
        matchday: fixture.matchday,
        isTitleRace: fixture.isTitleRace ?? false,
        isRelegation: fixture.isRelegation ?? false,
        isDerby: fixture.isDerby ?? false,
        isEuropeanWeek: fixture.isEuropeanWeek ?? false,
        referee: fixture.referee,
      });

      // Get market odds for movement tracking
      const marketOdds = {
        over35: matchData.currentOdds ?? fixture.oddsOver35 ?? null,
      };

      // Run v3.3 algorithm
      const prediction = await mkekaBOTv33(matchData, marketOdds);

      // Save to DB
      const savedId = await savePrediction(prediction, {
        ...matchData,
        kickoff: fixture.kickoff,
      });

      results.push({ ...prediction, id: savedId });

      console.log(
        `[Scorer] ${prediction.match}: ${prediction.verdict} ` +
        `(line: ${prediction.davyLine}, conf: ${prediction.confidence}%)`
      );

      // Small delay between requests — be nice to Firecrawl
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[Scorer] Error processing ${fixture.homeTeam} vs ${fixture.awayTeam}:`, err.message);
    }
  }

  return results;
}

export default {
  analyzeAndSaveFixtures,
  savePrediction,
  recordResult,
  runEveningReconciliation,
  updateTeamMomentumCache,
  updateRefereeCache,
  getTodaysPredictions,
  getStats,
};
