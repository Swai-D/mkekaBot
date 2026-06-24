/**
 * MkekaBOT — POST /api/analyze
 * Trigger manual analysis for a specific match or full day scan
 */

import { analyzeAndSaveFixtures } from "../../../lib/scorer.js";
import mkekaBOTv33 from "../../../lib/claude.js";
import { buildMatchData } from "../../../lib/firecrawl.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode = "scan", league = "all", match } = body;

    // Mode: "scan" — run full daily scan
    if (mode === "scan") {
      const results = await analyzeAndSaveFixtures(league);
      const bets    = results.filter((r) => r.verdict === "BET");
      const skipped = results.filter((r) => r.verdict === "SKIP");
      return Response.json({
        success: true,
        total: results.length,
        bets: bets.length,
        skipped: skipped.length,
        predictions: results,
      });
    }

    // Mode: "single" — analyze one specific match
    if (mode === "single" && match) {
      const matchData = await buildMatchData(
        { homeTeam: match.homeTeam, awayTeam: match.awayTeam, league: match.league, kickoff: match.kickoff },
        { matchday: match.matchday, isTitleRace: match.isTitleRace, isRelegation: match.isRelegation, isDerby: match.isDerby, referee: match.referee }
      );
      const prediction = await mkekaBOTv33(matchData, { over35: match.odds });
      return Response.json({ success: true, prediction });
    }

    return Response.json({ error: "Invalid mode. Use 'scan' or 'single'" }, { status: 400 });
  } catch (err) {
    console.error("[API/analyze]", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
