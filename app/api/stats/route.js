/**
 * MkekaBOT — GET /api/stats
 * Returns win/loss stats by league, date range, confidence
 */

import { getStats, getTodaysPredictions } from "../../../lib/scorer.js";
import { query } from "../../../lib/db.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const days   = parseInt(searchParams.get("days") ?? "30");
    const league = searchParams.get("league") ?? null;

    const [stats, today, recentLearning] = await Promise.all([
      getStats(days),
      getTodaysPredictions(),
      query(`SELECT insights, log_date FROM learning_log ORDER BY log_date DESC LIMIT 1`),
    ]);

    const overall = await query(`
      SELECT
        COUNT(*) FILTER (WHERE verdict = 'BET')  AS total_bets,
        COUNT(*) FILTER (WHERE result = 'WIN')   AS wins,
        COUNT(*) FILTER (WHERE result = 'LOSS')  AS losses,
        ROUND(
          COUNT(*) FILTER (WHERE result = 'WIN')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE result IS NOT NULL), 0) * 100, 1
        ) AS win_rate_pct,
        ROUND(AVG(confidence)::numeric, 1) AS avg_confidence
      FROM predictions
      WHERE match_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    `);

    return Response.json({
      success: true,
      period: `Last ${days} days`,
      overall: overall.rows[0],
      byLeague: stats,
      todaysPredictions: today,
      latestLearningInsights: recentLearning.rows[0]?.insights ?? null,
    });
  } catch (err) {
    console.error("[API/stats]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
