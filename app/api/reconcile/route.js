/**
 * MkekaBOT — POST /api/reconcile
 * Manually record a match result or trigger evening reconciliation
 */

import { runEveningReconciliation, recordResult, getTodaysPredictions } from "../../../lib/scorer.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode = "auto", predictionId, actualCards, homeCards, awayCards } = body;

    // Auto: reconcile all of today's pending predictions
    if (mode === "auto") {
      const summary = await runEveningReconciliation();
      return Response.json({ success: true, ...summary });
    }

    // Manual: record result for a specific prediction
    if (mode === "manual" && predictionId && actualCards !== undefined) {
      const result = await recordResult(
        parseInt(predictionId),
        parseInt(actualCards),
        parseInt(homeCards ?? 0),
        parseInt(awayCards ?? 0)
      );
      return Response.json({ success: true, result });
    }

    return Response.json({ error: "Invalid params" }, { status: 400 });
  } catch (err) {
    console.error("[API/reconcile]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const predictions = await getTodaysPredictions();
    const pending = predictions.filter((p) => p.verdict === "BET" && !p.result);
    return Response.json({ predictions, pendingReconciliation: pending.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
