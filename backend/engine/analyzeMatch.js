const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/connection');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================
// MAIN ANALYSIS FUNCTION
// Called for each fixture - returns prediction
// ============================================
async function analyzeMatch(fixtureId) {
  console.log(`[ENGINE] Analyzing fixture: ${fixtureId}`);

  // 1. Fetch all data for this fixture
  const matchData = await gatherMatchData(fixtureId);
  if (!matchData) {
    console.error(`[ENGINE] No data found for fixture: ${fixtureId}`);
    return null;
  }

  // 2. Get current model weights
  const weights = await getCurrentWeights();

  // 3. Build prompt for Claude
  const prompt = buildAnalysisPrompt(matchData, weights);

  // 4. Ask Claude to analyze
  let claudeResponse;
  try {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are MkekaBOT — a professional football yellow cards betting analyst with 15 years experience.

Your ONLY job: analyze yellow card data and decide whether to bet on this match, and EXACTLY which line to play.

Rules:
- Return ONLY valid JSON, no markdown, no explanation outside JSON
- Be conservative — only bet when data is CLEAR (confidence >= 65)
- If data is missing or conflicting, say skip
- Think like a professional who protects their bankroll first`,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content[0].text.trim();
    claudeResponse = JSON.parse(rawText);

  } catch (err) {
    console.error('[ENGINE] Claude API error:', err.message);
    return null;
  }

  // 5. Save prediction to DB
  const prediction = await savePrediction(fixtureId, matchData, claudeResponse);

  console.log(`[ENGINE] ${matchData.homeTeam} vs ${matchData.awayTeam} → ${
    claudeResponse.shouldBet ? `BET ${claudeResponse.market} (${claudeResponse.confidence}%)` : 'SKIP'
  }`);

  return prediction;
}

// ============================================
// GATHER ALL DATA FOR A MATCH
// ============================================
async function gatherMatchData(fixtureId) {
  const { rows } = await db.query(`
    SELECT 
      f.id,
      f.is_derby,
      f.match_date,
      f.venue,
      ht.name AS home_team,
      ht.avg_yellow_cards_home,
      ht.avg_yellow_cards_overall AS home_overall,
      ht.last_5_cards AS home_last5,
      at.name AS away_team,
      at.avg_yellow_cards_away,
      at.avg_yellow_cards_overall AS away_overall,
      at.last_5_cards AS away_last5,
      r.name AS referee_name,
      r.avg_cards_per_game AS referee_avg,
      r.avg_yellow_per_game AS referee_yellow_avg,
      r.last_5_games_cards AS referee_last5,
      r.total_games AS referee_games,
      l.name AS league,
      l.avg_cards_per_game AS league_avg
    FROM fixtures f
    JOIN teams ht ON f.home_team_id = ht.id
    JOIN teams at ON f.away_team_id = at.id
    LEFT JOIN referees r ON f.referee_id = r.id
    JOIN leagues l ON f.league_id = l.id
    WHERE f.id = $1
  `, [fixtureId]);

  if (rows.length === 0) return null;
  const row = rows[0];

  // Get H2H data
  const h2h = await getH2HData(row.home_team, row.away_team);

  // Calculate match importance (league position battles, relegation, etc.)
  const matchImportance = await calculateMatchImportance(fixtureId);

  return {
    ...row,
    h2hAvgCards: parseFloat(h2h.avgCards) || 3.5,
    h2hSampleSize: h2h.sampleSize || 0,
    h2hMatches: h2h.matches || [],
    matchImportance,
  };
}

async function getH2HData(homeTeam, awayTeam) {
  const { rows } = await db.query(`
    SELECT 
      ROUND(AVG(total_cards), 2) AS avg_cards,
      COUNT(*) AS sample_size,
      json_agg(json_build_object('date', match_date, 'cards', total_cards) ORDER BY match_date DESC) AS matches
    FROM h2h_history h
    JOIN teams ht ON h.home_team_id = ht.id
    JOIN teams at ON h.away_team_id = at.id
    WHERE (ht.name ILIKE $1 AND at.name ILIKE $2)
       OR (ht.name ILIKE $2 AND at.name ILIKE $1)
    LIMIT 8
  `, [homeTeam, awayTeam]);

  return rows[0] || { avg_cards: 3.5, sample_size: 0, matches: [] };
}

async function calculateMatchImportance(fixtureId) {
  // Basic scoring: derbies = high, normal = medium
  const { rows } = await db.query(
    'SELECT is_derby FROM fixtures WHERE id = $1',
    [fixtureId]
  );
  return rows[0]?.is_derby ? 85 : 50;
}

// ============================================
// BUILD THE ANALYSIS PROMPT
// ============================================
function buildAnalysisPrompt(data, weights) {
  const refereeInfo = data.referee_name
    ? `Name: ${data.referee_name}
       Average cards/game: ${data.referee_avg || 'unknown'}
       Average yellows/game: ${data.referee_yellow_avg || 'unknown'}
       Last 5 games card counts: ${JSON.stringify(data.referee_last5 || [])}
       Total games officiated: ${data.referee_games || 'unknown'}`
    : 'REFEREE UNKNOWN — major risk factor, increase caution';

  return `Analyze this football match for yellow cards betting:

=== MATCH ===
${data.home_team} vs ${data.away_team}
League: ${data.league}
Date: ${new Date(data.match_date).toLocaleDateString()}
Is Derby/Rivalry: ${data.is_derby ? 'YES ⚠️' : 'No'}
Match Importance (0-100): ${data.match_importance}

=== REFEREE ===
${refereeInfo}

=== HOME TEAM (${data.home_team}) ===
Avg yellow cards at home: ${data.avg_yellow_cards_home || 'unknown'}
Avg yellow cards overall: ${data.home_overall || 'unknown'}
Last 5 games cards received: ${JSON.stringify(data.home_last5 || [])}

=== AWAY TEAM (${data.away_team}) ===
Avg yellow cards away: ${data.avg_yellow_cards_away || 'unknown'}
Avg yellow cards overall: ${data.away_overall || 'unknown'}
Last 5 games cards received: ${JSON.stringify(data.away_last5 || [])}

=== HEAD TO HEAD (Last ${data.h2hSampleSize} meetings) ===
Average total cards in H2H: ${data.h2hAvgCards}
Recent H2H matches: ${JSON.stringify(data.h2hMatches.slice(0, 5))}

=== LEAGUE CONTEXT ===
${data.league} average cards/game: ${data.league_avg || 'unknown'}

=== CURRENT MODEL WEIGHTS (for context) ===
Referee: ${(weights.referee_weight * 100).toFixed(0)}%
Home team: ${(weights.home_team_weight * 100).toFixed(0)}%
Away team: ${(weights.away_team_weight * 100).toFixed(0)}%
H2H: ${(weights.h2h_weight * 100).toFixed(0)}%
Derby factor: ${(weights.derby_weight * 100).toFixed(0)}%
League avg: ${(weights.league_avg_weight * 100).toFixed(0)}%

=== YOUR TASK ===
Based on ALL the above data, decide:

1. Should we bet on yellow cards for this match? (YES/NO)
2. If YES, which is the safest line? Choose from: under_2.5, under_3.5, under_4.5, under_5.5
   - IMPORTANT: Do NOT stick to only 4.5. Choose the line that has the best value.
   - If referee avg is 2.8 and teams are clean, bet under_3.5 or even under_2.5
   - If all data points to a feisty match, maybe under_5.5 has value
3. Confidence score: 0-100 (only bet if >= 65)
4. Brief reasoning (2-3 lines max)
5. If skipping, what is the main reason?

Return ONLY this JSON (no markdown, no extra text):
{
  "shouldBet": true/false,
  "market": "under_3.5",
  "confidence": 78,
  "expectedCards": 2.8,
  "reasoning": "Referee Oliver averages 2.9 cards/game. Both teams are disciplined. Not a derby. Strong UNDER case.",
  "keyFactor": "referee",
  "skipReason": null,
  "riskFlags": ["derby", "missing_referee_data"]
}`;
}

// ============================================
// SAVE PREDICTION TO DATABASE
// ============================================
async function savePrediction(fixtureId, matchData, claude) {
  const { rows } = await db.query(`
    INSERT INTO predictions (
      fixture_id,
      should_bet,
      market,
      confidence_score,
      skip_reason,
      referee_avg_cards,
      home_team_avg_cards,
      away_team_avg_cards,
      h2h_avg_cards,
      is_derby,
      league_avg_cards,
      claude_reasoning,
      raw_analysis
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [
    fixtureId,
    claude.shouldBet || false,
    claude.market || null,
    claude.confidence || 0,
    claude.skipReason || null,
    matchData.referee_avg,
    matchData.avg_yellow_cards_home,
    matchData.avg_yellow_cards_away,
    matchData.h2hAvgCards,
    matchData.is_derby,
    matchData.league_avg,
    claude.reasoning,
    JSON.stringify(claude),
  ]);

  return rows[0];
}

// ============================================
// GET CURRENT MODEL WEIGHTS
// ============================================
async function getCurrentWeights() {
  const { rows } = await db.query(
    'SELECT * FROM model_weights WHERE is_current = true LIMIT 1'
  );
  return rows[0] || {
    referee_weight: 0.35,
    home_team_weight: 0.18,
    away_team_weight: 0.18,
    h2h_weight: 0.15,
    derby_weight: 0.08,
    league_avg_weight: 0.06,
  };
}

// ============================================
// ANALYZE ALL TODAY'S FIXTURES
// ============================================
async function analyzeAllTodayFixtures() {
  console.log('[ENGINE] Starting analysis for all today fixtures...');

  const { rows: fixtures } = await db.query(`
    SELECT f.id FROM fixtures f
    LEFT JOIN predictions p ON p.fixture_id = f.id
    WHERE DATE(f.match_date) = CURRENT_DATE
      AND p.id IS NULL
    ORDER BY f.match_date ASC
  `);

  console.log(`[ENGINE] Found ${fixtures.length} unanalyzed fixtures`);

  const results = [];
  for (const fixture of fixtures) {
    const prediction = await analyzeMatch(fixture.id);
    if (prediction) results.push(prediction);
    // Small delay to be nice to Claude API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[ENGINE] Analysis complete: ${results.length} predictions generated`);
  return results;
}

module.exports = {
  analyzeMatch,
  analyzeAllTodayFixtures,
  gatherMatchData,
};
