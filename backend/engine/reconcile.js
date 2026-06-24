const db = require('../db/connection');

// ============================================
// END OF DAY RECONCILIATION
// Compare predictions vs actual results
// Update model weights based on what worked
// ============================================
async function runEODReconciliation() {
  console.log('[RECONCILE] Starting end-of-day reconciliation...');

  // 1. Get all today's predictions that have results
  const { rows: predictions } = await db.query(`
    SELECT 
      p.*,
      f.actual_total_cards,
      f.actual_yellow_cards,
      f.is_derby,
      f.status AS fixture_status,
      ht.name AS home_team,
      at.name AS away_team,
      r.name AS referee,
      r.avg_cards_per_game AS referee_avg
    FROM predictions p
    JOIN fixtures f ON p.fixture_id = f.id
    JOIN teams ht ON f.home_team_id = ht.id
    JOIN teams at ON f.away_team_id = at.id
    LEFT JOIN referees r ON f.referee_id = r.id
    WHERE DATE(p.created_at) = CURRENT_DATE
      AND f.status = 'finished'
      AND p.user_status = 'confirmed'
      AND p.bet_result = 'pending'
  `);

  if (predictions.length === 0) {
    console.log('[RECONCILE] No confirmed bets to reconcile today');
    return;
  }

  console.log(`[RECONCILE] Reconciling ${predictions.length} bets...`);

  let wins = 0, losses = 0;
  const weightFeedback = [];

  for (const pred of predictions) {
    const actualCards = pred.actual_total_cards || pred.actual_yellow_cards || 0;
    
    // Determine result
    const result = evaluateBet(pred.market, actualCards);
    const pl = calculatePL(result, pred.odds_placed, pred.stake_amount);

    // Update prediction with result
    await db.query(`
      UPDATE predictions SET
        actual_cards = $1,
        bet_result = $2,
        profit_loss = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [actualCards, result, pl, pred.id]);

    if (result === 'win') wins++;
    else if (result === 'loss') losses++;

    // Collect feedback for weight learning
    weightFeedback.push({
      prediction: pred,
      actualCards,
      result,
      // Was referee stat predictive?
      refereeAccurate: isRefereeStatAccurate(pred, actualCards),
      // Was H2H predictive?
      h2hAccurate: isH2HAccurate(pred, actualCards),
      // Was derby flag predictive?
      derbyAccurate: pred.is_derby && actualCards > parseLineValue(pred.market),
    });
  }

  // 2. Update model weights based on today's performance
  if (weightFeedback.length >= 3) {
    await updateModelWeights(weightFeedback);
  }

  // 3. Log daily performance
  await logDailyPerformance(predictions.length, wins, losses);

  // 4. Send BetTrack sync
  await syncToBetTrack(predictions);

  console.log(`[RECONCILE] Done. W:${wins} L:${losses} (${((wins/(wins+losses||1))*100).toFixed(1)}% today)`);

  return { wins, losses, total: predictions.length };
}

// ============================================
// EVALUATE BET RESULT
// ============================================
function evaluateBet(market, actualCards) {
  if (!market || actualCards === null || actualCards === undefined) return 'void';
  
  const [direction, lineStr] = market.split('_');
  const line = parseFloat(lineStr);
  
  if (direction === 'under') {
    return actualCards < line ? 'win' : 'loss';
  } else if (direction === 'over') {
    return actualCards > line ? 'win' : 'loss';
  }
  return 'void';
}

function parseLineValue(market) {
  if (!market) return 3.5;
  const parts = market.split('_');
  return parseFloat(parts[parts.length - 1]) || 3.5;
}

function calculatePL(result, odds, stake) {
  if (!stake || result === 'void') return 0;
  if (result === 'win') return parseFloat(stake) * (parseFloat(odds) - 1);
  if (result === 'loss') return -parseFloat(stake);
  return 0;
}

// ============================================
// WEIGHT ACCURACY CHECKS
// ============================================
function isRefereeStatAccurate(pred, actualCards) {
  if (!pred.referee_avg_cards) return null;
  const refAvg = parseFloat(pred.referee_avg_cards);
  const predicted = evaluateBet(pred.market, refAvg); // Did referee avg alone predict correctly?
  const actual = evaluateBet(pred.market, actualCards);
  return predicted === actual;
}

function isH2HAccurate(pred, actualCards) {
  if (!pred.h2h_avg_cards) return null;
  const h2hAvg = parseFloat(pred.h2h_avg_cards);
  const predicted = evaluateBet(pred.market, h2hAvg);
  const actual = evaluateBet(pred.market, actualCards);
  return predicted === actual;
}

// ============================================
// SELF-LEARNING: UPDATE MODEL WEIGHTS
// ============================================
async function updateModelWeights(feedback) {
  const { rows } = await db.query(
    'SELECT * FROM model_weights WHERE is_current = true LIMIT 1'
  );
  const current = rows[0];
  if (!current) return;

  // Calculate feature accuracy rates
  const refereeCorrect = feedback.filter(f => f.refereeAccurate === true).length;
  const refereeFeedback = feedback.filter(f => f.refereeAccurate !== null).length;
  const h2hCorrect = feedback.filter(f => f.h2hAccurate === true).length;
  const h2hFeedback = feedback.filter(f => f.h2hAccurate !== null).length;
  const wins = feedback.filter(f => f.result === 'win').length;
  const total = feedback.length;

  const refereeAccuracy = refereeFeedback > 0 ? refereeCorrect / refereeFeedback : 0.5;
  const h2hAccuracy = h2hFeedback > 0 ? h2hCorrect / h2hFeedback : 0.5;
  const overallAccuracy = total > 0 ? wins / total : 0.5;

  // Adjust weights slightly (max ±0.02 per day to prevent wild swings)
  const LEARNING_RATE = 0.01;
  
  let newRefereeWeight = current.referee_weight;
  let newH2hWeight = current.h2h_weight;
  
  if (refereeAccuracy > 0.7) {
    newRefereeWeight = Math.min(0.50, current.referee_weight + LEARNING_RATE);
  } else if (refereeAccuracy < 0.5) {
    newRefereeWeight = Math.max(0.20, current.referee_weight - LEARNING_RATE);
  }

  if (h2hAccuracy > 0.7) {
    newH2hWeight = Math.min(0.25, current.h2h_weight + LEARNING_RATE);
  } else if (h2hAccuracy < 0.5) {
    newH2hWeight = Math.max(0.05, current.h2h_weight - LEARNING_RATE);
  }

  // Normalize remaining weights
  const fixedTotal = newRefereeWeight + newH2hWeight;
  const remainingWeight = 1 - fixedTotal;
  const remainingRatio = remainingWeight / (1 - current.referee_weight - current.h2h_weight);

  const newWeights = {
    referee_weight: newRefereeWeight,
    h2h_weight: newH2hWeight,
    home_team_weight: Math.max(0.10, current.home_team_weight * remainingRatio),
    away_team_weight: Math.max(0.10, current.away_team_weight * remainingRatio),
    derby_weight: Math.max(0.03, current.derby_weight * remainingRatio),
    league_avg_weight: Math.max(0.03, current.league_avg_weight * remainingRatio),
  };

  // Only update if there was meaningful change
  const hasChanged = Math.abs(newWeights.referee_weight - current.referee_weight) > 0.005;

  if (hasChanged) {
    // Deactivate current, create new version
    await db.query('UPDATE model_weights SET is_current = false WHERE id = $1', [current.id]);
    
    await db.query(`
      INSERT INTO model_weights (
        version, referee_weight, home_team_weight, away_team_weight,
        h2h_weight, derby_weight, league_avg_weight,
        total_predictions, wins, accuracy
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      current.version + 1,
      newWeights.referee_weight,
      newWeights.home_team_weight,
      newWeights.away_team_weight,
      newWeights.h2h_weight,
      newWeights.derby_weight,
      newWeights.league_avg_weight,
      total,
      wins,
      (overallAccuracy * 100).toFixed(2),
    ]);

    console.log(`[RECONCILE] Model updated to v${current.version + 1}. Referee weight: ${current.referee_weight} → ${newWeights.referee_weight.toFixed(3)}`);
  }
}

// ============================================
// LOG DAILY PERFORMANCE
// ============================================
async function logDailyPerformance(total, wins, losses) {
  const winRate = total > 0 ? ((wins / (wins + losses || 1)) * 100).toFixed(2) : 0;

  // Get total P&L for today
  const { rows } = await db.query(`
    SELECT SUM(profit_loss) AS total_pl, AVG(confidence_score) AS avg_conf
    FROM predictions
    WHERE DATE(created_at) = CURRENT_DATE
      AND bet_result IN ('win', 'loss')
  `);

  await db.query(`
    INSERT INTO daily_performance (date, total_predictions, bets_placed, bets_won, bets_lost, win_rate, profit_loss, avg_confidence)
    VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (date) DO UPDATE SET
      bets_won = EXCLUDED.bets_won,
      bets_lost = EXCLUDED.bets_lost,
      win_rate = EXCLUDED.win_rate,
      profit_loss = EXCLUDED.profit_loss
  `, [total, wins + losses, wins, losses, winRate, rows[0]?.total_pl || 0, Math.round(rows[0]?.avg_conf || 0)]);
}

// ============================================
// SYNC TO BETTRACK
// ============================================
async function syncToBetTrack(predictions) {
  if (!process.env.BETTRACK_API_URL) return;

  for (const pred of predictions) {
    if (pred.bet_result === 'pending' || pred.synced_to_bettrack) continue;
    
    try {
      const res = await fetch(`${process.env.BETTRACK_API_URL}/api/bets/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BETTRACK_API_KEY },
        body: JSON.stringify({
          match: `${pred.home_team} vs ${pred.away_team}`,
          market: pred.market,
          odds: pred.odds_placed,
          stake: pred.stake_amount,
          result: pred.bet_result,
          profit_loss: pred.profit_loss,
          source: 'mkeka-bot',
          confidence: pred.confidence_score,
        }),
      });

      if (res.ok) {
        await db.query(
          'UPDATE predictions SET synced_to_bettrack = true WHERE id = $1',
          [pred.id]
        );
      }
    } catch (err) {
      console.error('[RECONCILE] BetTrack sync failed:', err.message);
    }
  }
}

module.exports = { runEODReconciliation, evaluateBet };
