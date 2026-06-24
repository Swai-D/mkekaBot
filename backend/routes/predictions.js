const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { analyzeMatch, analyzeAllTodayFixtures } = require('../engine/analyzeMatch');
const { runEODReconciliation } = require('../engine/reconcile');
const { scrapeFixtures, scrapeResults } = require('../scrapers/apify');

// ============================================
// GET /api/predictions/today
// Today's picks with full analysis
// ============================================
router.get('/today', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        p.id,
        p.should_bet,
        p.market,
        p.confidence_score,
        p.skip_reason,
        p.referee_avg_cards,
        p.home_team_avg_cards,
        p.away_team_avg_cards,
        p.h2h_avg_cards,
        p.is_derby,
        p.claude_reasoning,
        p.raw_analysis,
        p.user_status,
        p.odds_placed,
        p.stake_amount,
        p.actual_cards,
        p.bet_result,
        p.profit_loss,
        p.created_at,
        f.match_date,
        f.is_derby AS fixture_derby,
        f.status AS fixture_status,
        ht.name AS home_team,
        at.name AS away_team,
        r.name AS referee,
        r.avg_cards_per_game AS referee_avg,
        l.name AS league,
        l.country AS league_country
      FROM predictions p
      JOIN fixtures f ON p.fixture_id = f.id
      JOIN teams ht ON f.home_team_id = ht.id
      JOIN teams at ON f.away_team_id = at.id
      LEFT JOIN referees r ON f.referee_id = r.id
      JOIN leagues l ON f.league_id = l.id
      WHERE DATE(p.created_at) = CURRENT_DATE
      ORDER BY p.confidence_score DESC NULLS LAST
    `);

    // Separate bet picks from skipped
    const bets = rows.filter(r => r.should_bet);
    const skipped = rows.filter(r => !r.should_bet);

    res.json({ 
      success: true,
      date: new Date().toISOString().split('T')[0],
      total: rows.length,
      bets: bets.length,
      skipped: skipped.length,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PATCH /api/predictions/:id/confirm
// User confirms a bet with odds + stake
// ============================================
router.patch('/:id/confirm', async (req, res) => {
  const { id } = req.params;
  const { odds, stake } = req.body;

  if (!odds || !stake) {
    return res.status(400).json({ success: false, error: 'odds and stake required' });
  }

  try {
    const { rows } = await db.query(`
      UPDATE predictions SET
        user_status = 'confirmed',
        odds_placed = $1,
        stake_amount = $2,
        user_confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [odds, stake, id]);

    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Prediction not found' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PATCH /api/predictions/:id/skip
// User skips a bot recommendation
// ============================================
router.patch('/:id/skip', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const { rows } = await db.query(`
      UPDATE predictions SET
        user_status = 'skipped',
        skip_reason = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [reason || 'User skipped', id]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET /api/predictions/history
// Past predictions with results
// ============================================
router.get('/history', async (req, res) => {
  const { days = 30, result } = req.query;

  try {
    let query = `
      SELECT 
        p.*,
        f.match_date,
        ht.name AS home_team,
        at.name AS away_team,
        r.name AS referee,
        l.name AS league
      FROM predictions p
      JOIN fixtures f ON p.fixture_id = f.id
      JOIN teams ht ON f.home_team_id = ht.id
      JOIN teams at ON f.away_team_id = at.id
      LEFT JOIN referees r ON f.referee_id = r.id
      JOIN leagues l ON f.league_id = l.id
      WHERE p.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
        AND p.user_status = 'confirmed'
    `;

    if (result) query += ` AND p.bet_result = '${result}'`;
    query += ' ORDER BY f.match_date DESC LIMIT 100';

    const { rows } = await db.query(query);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET /api/predictions/performance
// Model accuracy + P&L stats
// ============================================
router.get('/performance', async (req, res) => {
  try {
    // Overall stats
    const { rows: overall } = await db.query(`
      SELECT
        COUNT(*) AS total_bets,
        SUM(CASE WHEN bet_result = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN bet_result = 'loss' THEN 1 ELSE 0 END) AS losses,
        ROUND(
          SUM(CASE WHEN bet_result = 'win' THEN 1.0 ELSE 0 END) / 
          NULLIF(COUNT(CASE WHEN bet_result IN ('win','loss') THEN 1 END), 0) * 100, 1
        ) AS win_rate,
        ROUND(SUM(COALESCE(profit_loss, 0)), 2) AS total_pl,
        ROUND(AVG(confidence_score), 1) AS avg_confidence
      FROM predictions
      WHERE user_status = 'confirmed' AND bet_result IN ('win','loss','void')
    `);

    // Last 7 days
    const { rows: last7 } = await db.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(CASE WHEN bet_result IN ('win','loss') THEN 1 END) AS bets,
        SUM(CASE WHEN bet_result = 'win' THEN 1 ELSE 0 END) AS wins,
        ROUND(SUM(COALESCE(profit_loss, 0)), 2) AS pl
      FROM predictions
      WHERE user_status = 'confirmed'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Model weights history
    const { rows: weights } = await db.query(`
      SELECT version, referee_weight, h2h_weight, accuracy, created_at
      FROM model_weights
      ORDER BY version DESC
      LIMIT 10
    `);

    // By market performance
    const { rows: byMarket } = await db.query(`
      SELECT
        market,
        COUNT(*) AS total,
        SUM(CASE WHEN bet_result = 'win' THEN 1 ELSE 0 END) AS wins,
        ROUND(
          SUM(CASE WHEN bet_result = 'win' THEN 1.0 ELSE 0 END) / 
          NULLIF(COUNT(CASE WHEN bet_result IN ('win','loss') THEN 1 END), 0) * 100, 1
        ) AS win_rate
      FROM predictions
      WHERE user_status = 'confirmed' AND bet_result IN ('win','loss')
      GROUP BY market
      ORDER BY win_rate DESC
    `);

    res.json({
      success: true,
      overall: overall[0],
      last7Days: last7,
      weights: weights,
      byMarket: byMarket,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// POST /api/predictions/run-analysis
// Manually trigger analysis (for testing)
// ============================================
router.post('/run-analysis', async (req, res) => {
  try {
    console.log('[API] Manual analysis triggered');
    res.json({ success: true, message: 'Analysis started', status: 'running' });
    
    // Run async
    analyzeAllTodayFixtures().then(results => {
      console.log(`[API] Manual analysis complete: ${results.length} predictions`);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/predictions/reconcile (manual EOD trigger)
router.post('/reconcile', async (req, res) => {
  try {
    await scrapeResults();
    const summary = await runEODReconciliation();
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
