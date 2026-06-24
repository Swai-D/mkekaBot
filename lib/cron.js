/**
 * MkekaBOT — Cron Scheduler
 * lib/cron.js
 *
 * Schedule:
 * 06:00 EAT — Morning scan: fetch fixtures + run v3.3 analysis
 * 23:00 EAT — Evening reconcile: record results + self-learning
 *
 * Run with: RUN_CRON=true node lib/cron.js
 */

import cron from "node-cron";
import { analyzeAndSaveFixtures, runEveningReconciliation } from "./scorer.js";

const TZ = "Africa/Dar_es_Salaam";

// ── 6:00 AM EAT — Morning Analysis ──────────────────────────────
cron.schedule(
  "0 6 * * *",
  async () => {
    console.log("\n" + "=".repeat(60));
    console.log(`[Cron] ☀️  MORNING SCAN — ${new Date().toLocaleString("sw-TZ", { timeZone: TZ })}`);
    console.log("=".repeat(60));

    try {
      const predictions = await analyzeAndSaveFixtures("all");

      const bets    = predictions.filter((p) => p.verdict === "BET");
      const skipped = predictions.filter((p) => p.verdict === "SKIP");

      console.log(`\n[Cron] 📊 Analysis complete:`);
      console.log(`  Total fixtures: ${predictions.length}`);
      console.log(`  BET:  ${bets.length}`);
      console.log(`  SKIP: ${skipped.length}`);

      if (bets.length > 0) {
        console.log(`\n[Cron] 🎯 Today's bets:`);
        bets.forEach((p) => {
          console.log(
            `  • ${p.match} | Line: OVER ${p.davyLine} | Conf: ${p.confidence}% | Odds: ${p.marketOdds ?? "N/A"}`
          );
        });
      }
    } catch (err) {
      console.error("[Cron] ❌ Morning scan error:", err.message);
    }
  },
  { timezone: TZ }
);

// ── 11:00 PM EAT — Evening Reconciliation ────────────────────────
cron.schedule(
  "0 23 * * *",
  async () => {
    console.log("\n" + "=".repeat(60));
    console.log(`[Cron] 🌙 EVENING RECONCILE — ${new Date().toLocaleString("sw-TZ", { timeZone: TZ })}`);
    console.log("=".repeat(60));

    try {
      const summary = await runEveningReconciliation();

      console.log(`\n[Cron] 📈 Reconciliation summary:`);
      console.log(`  Reconciled: ${summary.reconciled}`);
      console.log(`  Wins:       ${summary.wins} ✅`);
      console.log(`  Losses:     ${summary.losses} ❌`);
      console.log(`  Win rate:   ${summary.winRate ?? 0}%`);

      if (summary.errors?.length > 0) {
        console.warn(`[Cron] ⚠️  ${summary.errors.length} error(s) during reconciliation`);
      }
    } catch (err) {
      console.error("[Cron] ❌ Evening reconcile error:", err.message);
    }
  },
  { timezone: TZ }
);

console.log("[Cron] ✅ MkekaBOT v3.3 scheduler active");
console.log(`[Cron] 📅 Morning scan:  06:00 ${TZ}`);
console.log(`[Cron] 📅 Evening recon: 23:00 ${TZ}`);
