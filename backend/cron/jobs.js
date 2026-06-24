const cron = require('node-cron');
const { scrapeFixtures, scrapeRefereeStats, scrapeTeamStats, scrapeH2H, scrapeResults } = require('../scrapers/apify');
const { analyzeAllTodayFixtures } = require('../engine/analyzeMatch');
const { runEODReconciliation } = require('../engine/reconcile');
const db = require('../db/connection');

// ============================================
// MORNING JOB — 7:00 AM EAT (4:00 AM UTC)
// Fetch fixtures + stats + run analysis
// ============================================
cron.schedule('0 4 * * *', async () => {
  console.log('\n========================================');
  console.log('[CRON] ⚽ MORNING JOB STARTED', new Date().toISOString());
  console.log('========================================');

  try {
    // Step 1: Scrape today's fixtures
    console.log('[CRON] Step 1: Fetching fixtures...');
    const fixtures = await scrapeFixtures();
    console.log(`[CRON] Fetched ${fixtures.length} fixtures`);

    // Step 2: Scrape referee stats for each fixture
    console.log('[CRON] Step 2: Fetching referee stats...');
    const { rows: fixturesWithRefs } = await db.query(`
      SELECT DISTINCT r.name AS referee_name, r.id AS referee_id
      FROM fixtures f
      JOIN referees r ON f.referee_id = r.id
      WHERE DATE(f.match_date) = CURRENT_DATE
        AND (r.scraped_at IS NULL OR r.scraped_at < NOW() - INTERVAL '24 hours')
    `);

    for (const ref of fixturesWithRefs) {
      await scrapeRefereeStats(ref.referee_name);
      await sleep(1000); // Polite delay
    }
    console.log(`[CRON] Updated ${fixturesWithRefs.length} referee records`);

    // Step 3: Scrape team stats
    console.log('[CRON] Step 3: Fetching team stats...');
    const { rows: teams } = await db.query(`
      SELECT DISTINCT t.name, t.id, l.name AS league
      FROM fixtures f
      JOIN teams t ON f.home_team_id = t.id OR f.away_team_id = t.id
      JOIN leagues l ON f.league_id = l.id
      WHERE DATE(f.match_date) = CURRENT_DATE
        AND (t.scraped_at IS NULL OR t.scraped_at < NOW() - INTERVAL '48 hours')
      LIMIT 30
    `);

    for (const team of teams) {
      await scrapeTeamStats(team.name, team.league);
      await sleep(800);
    }
    console.log(`[CRON] Updated ${teams.length} team records`);

    // Step 4: Run Claude analysis on all fixtures
    console.log('[CRON] Step 4: Running AI analysis...');
    const predictions = await analyzeAllTodayFixtures();

    const bettable = predictions.filter(p => p.should_bet && p.confidence_score >= 65);
    console.log(`[CRON] Analysis done: ${predictions.length} total, ${bettable.length} bet opportunities`);

    console.log('\n[CRON] ✅ MORNING JOB COMPLETE');
    console.log(`[CRON] Today's picks ready on dashboard!`);

  } catch (err) {
    console.error('[CRON] ❌ Morning job failed:', err.message);
  }
}, { timezone: 'Africa/Nairobi' });

// ============================================
// EVENING JOB — 11:30 PM EAT (8:30 PM UTC)
// Fetch results + reconcile + update weights
// ============================================
cron.schedule('30 20 * * *', async () => {
  console.log('\n========================================');
  console.log('[CRON] 🌙 EVENING RECONCILIATION STARTED', new Date().toISOString());
  console.log('========================================');

  try {
    // Step 1: Scrape today's results
    console.log('[CRON] Fetching match results...');
    await scrapeResults();

    // Small wait for DB to settle
    await sleep(5000);

    // Step 2: Run reconciliation + weight update
    console.log('[CRON] Running reconciliation...');
    const summary = await runEODReconciliation();

    if (summary) {
      console.log(`\n[CRON] 📊 TODAY'S SUMMARY:`);
      console.log(`  Wins: ${summary.wins}`);
      console.log(`  Losses: ${summary.losses}`);
      console.log(`  Win Rate: ${((summary.wins / (summary.total || 1)) * 100).toFixed(1)}%`);
    }

    console.log('\n[CRON] ✅ EVENING JOB COMPLETE');

  } catch (err) {
    console.error('[CRON] ❌ Evening job failed:', err.message);
  }
}, { timezone: 'Africa/Nairobi' });

// ============================================
// LIVE RESULTS CHECK — Every 30 min from 3PM-11PM EAT
// ============================================
cron.schedule('*/30 12-20 * * *', async () => {
  try {
    const { rows } = await db.query(`
      SELECT COUNT(*) as count FROM fixtures
      WHERE DATE(match_date) = CURRENT_DATE
        AND status != 'finished'
        AND match_date < NOW() - INTERVAL '2 hours'
    `);

    if (parseInt(rows[0].count) > 0) {
      console.log(`[CRON] 🔄 Checking results for ${rows[0].count} pending matches...`);
      await scrapeResults();
    }
  } catch (err) {
    // Silent fail for frequent job
  }
}, { timezone: 'Africa/Nairobi' });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[CRON] ⏰ All cron jobs registered (EAT timezone)');
console.log('[CRON] Morning analysis: 07:00 AM EAT daily');
console.log('[CRON] Evening reconcile: 11:30 PM EAT daily');
console.log('[CRON] Live results check: Every 30min, 3PM-11PM EAT');

module.exports = {};
