/**
 * MkekaBOT — POST /api/reconcile
 * FIX: Removed parseInt(predictionId) — predictions.id is UUID string
 */

import {
  runEveningReconciliation,
  recordResult,
  getTodaysPredictions,
} from '../../../lib/scorer.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode = 'auto', predictionId, actualCards, homeCards, awayCards } = body;

    if (mode === 'auto') {
      const summary = await runEveningReconciliation();
      return Response.json({ success: true, ...summary });
    }

    if (mode === 'manual' && predictionId && actualCards !== undefined) {
      const result = await recordResult(
        predictionId, // ✅ FIX: UUID string — do NOT parseInt
        parseInt(actualCards),
        parseInt(homeCards ?? 0),
        parseInt(awayCards ?? 0)
      );
      return Response.json({ success: true, result });
    }

    return Response.json(
      { error: "Invalid params. Use mode: 'auto' or 'manual'" },
      { status: 400 }
    );
  } catch (err) {
    console.error('[API/reconcile]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const predictions = await getTodaysPredictions();
    const pending = predictions.filter((p) => p.verdict === 'BET' && !p.result);
    return Response.json({
      predictions,
      pendingReconciliation: pending.length,
      total: predictions.length,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
