const { ApifyClient } = require('apify-client');
const db = require('../db/connection');

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// ============================================
// SCRAPER 1: Today's Fixtures from FlashScore
// ============================================
async function scrapeFixtures(leagueIds = ['EPL', 'BL1', 'PD', 'SA', 'FL1']) {
  console.log('[APIFY] Scraping today fixtures...');
  const start = Date.now();

  try {
    const run = await client.actor('petr_cermak/flashscore-scraper').call({
      startUrls: leagueIds.map(id => ({
        url: `https://www.flashscore.com/football/`,
        userData: { leagueId: id }
      })),
      maxRequestsPerCrawl: 100,
      dataType: 'matches',
      dateFilter: 'today',
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    let saved = 0;
    for (const item of items) {
      await saveFixture(item);
      saved++;
    }

    await logScrape('fixtures', 'success', saved, null, run.id, Date.now() - start);
    console.log(`[APIFY] Fixtures: ${saved} matches saved`);
    return items;

  } catch (err) {
    await logScrape('fixtures', 'failed', 0, err.message, null, Date.now() - start);
    console.error('[APIFY] Fixtures scrape failed:', err.message);
    throw err;
  }
}

// ============================================
// SCRAPER 2: Referee Stats from WhoScored / FootyStats
// ============================================
async function scrapeRefereeStats(refereeName) {
  console.log(`[APIFY] Scraping referee: ${refereeName}`);

  try {
    // FootyStats has clean referee data
    const run = await client.actor('apify/web-scraper').call({
      startUrls: [{
        url: `https://footystats.org/referees/${refereeName.toLowerCase().replace(/\s+/g, '-')}`,
      }],
      pageFunction: async function({ page, request }) {
        await page.waitForSelector('.referee-stats', { timeout: 10000 }).catch(() => {});
        
        const stats = await page.evaluate(() => {
          const avgCards = document.querySelector('[data-stat="avg_cards"]')?.textContent?.trim();
          const avgYellow = document.querySelector('[data-stat="avg_yellow"]')?.textContent?.trim();
          const totalGames = document.querySelector('[data-stat="total_games"]')?.textContent?.trim();
          
          // Grab last 5 games card counts
          const rows = [...document.querySelectorAll('.recent-games-row')].slice(0, 5);
          const last5 = rows.map(r => parseInt(r.querySelector('[data-cards]')?.textContent) || 0);
          
          return { avgCards, avgYellow, totalGames, last5 };
        });
        
        return { refereeName: request.url.split('/').pop(), ...stats };
      },
      maxRequestRetries: 3,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    if (items.length > 0) {
      await updateRefereeStats(refereeName, items[0]);
    }
    return items[0] || null;

  } catch (err) {
    console.error(`[APIFY] Referee scrape failed for ${refereeName}:`, err.message);
    return null;
  }
}

// ============================================
// SCRAPER 3: Team Card Stats from FootyStats
// ============================================
async function scrapeTeamStats(teamName, leagueName) {
  console.log(`[APIFY] Scraping team stats: ${teamName}`);

  try {
    const run = await client.actor('apify/web-scraper').call({
      startUrls: [{
        url: `https://footystats.org/clubs/${teamName.toLowerCase().replace(/\s+/g, '-')}`,
      }],
      pageFunction: async function({ page }) {
        await page.waitForSelector('.team-stats', { timeout: 10000 }).catch(() => {});
        
        return await page.evaluate(() => {
          const homeCards = document.querySelector('[data-stat="home_yellow_avg"]')?.textContent?.trim();
          const awayCards = document.querySelector('[data-stat="away_yellow_avg"]')?.textContent?.trim();
          const overallCards = document.querySelector('[data-stat="overall_yellow_avg"]')?.textContent?.trim();
          
          const rows = [...document.querySelectorAll('.recent-match-row')].slice(0, 5);
          const last5 = rows.map(r => parseInt(r.querySelector('[data-yellow]')?.textContent) || 0);
          
          return { homeCards, awayCards, overallCards, last5 };
        });
      },
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    if (items.length > 0) {
      await updateTeamStats(teamName, items[0]);
    }
    return items[0] || null;

  } catch (err) {
    console.error(`[APIFY] Team scrape failed for ${teamName}:`, err.message);
    return null;
  }
}

// ============================================
// SCRAPER 4: H2H History
// ============================================
async function scrapeH2H(homeTeam, awayTeam) {
  console.log(`[APIFY] Scraping H2H: ${homeTeam} vs ${awayTeam}`);

  try {
    const run = await client.actor('apify/web-scraper').call({
      startUrls: [{
        url: `https://footystats.org/h2h/${homeTeam.toLowerCase().replace(/\s+/g, '-')}-vs-${awayTeam.toLowerCase().replace(/\s+/g, '-')}`,
      }],
      pageFunction: async function({ page }) {
        await page.waitForSelector('.h2h-row', { timeout: 10000 }).catch(() => {});
        
        return await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.h2h-row')].slice(0, 8);
          const matches = rows.map(r => ({
            date: r.querySelector('.date')?.textContent?.trim(),
            homeCards: parseInt(r.querySelector('[data-home-cards]')?.textContent) || 0,
            awayCards: parseInt(r.querySelector('[data-away-cards]')?.textContent) || 0,
            totalCards: parseInt(r.querySelector('[data-total-cards]')?.textContent) || 0,
          }));
          
          const avgCards = matches.length > 0 
            ? matches.reduce((s, m) => s + m.totalCards, 0) / matches.length 
            : 0;
          
          return { matches, avgCards: avgCards.toFixed(2), sampleSize: matches.length };
        });
      },
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items[0] || { avgCards: 3.5, sampleSize: 0, matches: [] };

  } catch (err) {
    console.error(`[APIFY] H2H scrape failed:`, err.message);
    return { avgCards: 3.5, sampleSize: 0, matches: [] };
  }
}

// ============================================
// SCRAPER 5: End of Day Results
// ============================================
async function scrapeResults(fixtureIds = []) {
  console.log('[APIFY] Scraping end-of-day results...');
  const start = Date.now();

  try {
    // Get today's fixtures that need results
    const { rows: fixtures } = await db.query(`
      SELECT f.id, f.external_id, ht.name as home, at.name as away
      FROM fixtures f
      JOIN teams ht ON f.home_team_id = ht.id
      JOIN teams at ON f.away_team_id = at.id
      WHERE DATE(f.match_date) = CURRENT_DATE
        AND f.status != 'finished'
    `);

    if (fixtures.length === 0) {
      console.log('[APIFY] No fixtures to update');
      return [];
    }

    const run = await client.actor('petr_cermak/flashscore-scraper').call({
      startUrls: fixtures.map(f => ({
        url: `https://www.flashscore.com/match/${f.external_id}/`,
        userData: { fixtureId: f.id }
      })),
      dataType: 'match_details',
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    let updated = 0;
    for (const result of items) {
      await updateFixtureResult(result);
      updated++;
    }

    await logScrape('results', 'success', updated, null, run.id, Date.now() - start);
    console.log(`[APIFY] Results: ${updated} matches updated`);
    return items;

  } catch (err) {
    await logScrape('results', 'failed', 0, err.message, null, Date.now() - start);
    console.error('[APIFY] Results scrape failed:', err.message);
    throw err;
  }
}

// ============================================
// DB HELPERS
// ============================================
async function saveFixture(item) {
  const leagueResult = await db.query(
    'SELECT id FROM leagues WHERE name ILIKE $1 LIMIT 1',
    [item.league || '']
  );
  const leagueId = leagueResult.rows[0]?.id;

  if (!leagueId) return;

  // Upsert home team
  const homeTeam = await upsertTeam(item.homeTeam, leagueId);
  const awayTeam = await upsertTeam(item.awayTeam, leagueId);
  const referee = item.referee ? await upsertReferee(item.referee) : null;

  // Check derby
  const isDerby = checkIfDerby(item.homeTeam, item.awayTeam);

  await db.query(`
    INSERT INTO fixtures (external_id, league_id, home_team_id, away_team_id, referee_id, match_date, venue, is_derby)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (external_id) DO UPDATE SET
      referee_id = EXCLUDED.referee_id,
      updated_at = NOW()
  `, [
    item.id, leagueId, homeTeam.id, awayTeam.id,
    referee?.id, item.matchDate, item.venue, isDerby
  ]);
}

async function upsertTeam(name, leagueId) {
  const { rows } = await db.query(`
    INSERT INTO teams (name, league_id) VALUES ($1, $2)
    ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [name, leagueId]);
  return rows[0];
}

async function upsertReferee(name) {
  const { rows } = await db.query(`
    INSERT INTO referees (name) VALUES ($1)
    ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [name]);
  return rows[0];
}

async function updateRefereeStats(name, stats) {
  await db.query(`
    UPDATE referees SET
      avg_cards_per_game = $1,
      avg_yellow_per_game = $2,
      total_games = $3,
      last_5_games_cards = $4,
      scraped_at = NOW(),
      updated_at = NOW()
    WHERE name ILIKE $5
  `, [
    parseFloat(stats.avgCards) || 0,
    parseFloat(stats.avgYellow) || 0,
    parseInt(stats.totalGames) || 0,
    stats.last5 || [],
    name
  ]);
}

async function updateTeamStats(name, stats) {
  await db.query(`
    UPDATE teams SET
      avg_yellow_cards_home = $1,
      avg_yellow_cards_away = $2,
      avg_yellow_cards_overall = $3,
      last_5_cards = $4,
      scraped_at = NOW(),
      updated_at = NOW()
    WHERE name ILIKE $5
  `, [
    parseFloat(stats.homeCards) || 0,
    parseFloat(stats.awayCards) || 0,
    parseFloat(stats.overallCards) || 0,
    stats.last5 || [],
    name
  ]);
}

async function updateFixtureResult(result) {
  await db.query(`
    UPDATE fixtures SET
      status = 'finished',
      home_score = $1,
      away_score = $2,
      actual_yellow_cards = $3,
      actual_total_cards = $4,
      updated_at = NOW()
    WHERE external_id = $5
  `, [
    result.homeScore, result.awayScore,
    result.yellowCards, result.totalCards,
    result.matchId
  ]);
}

function checkIfDerby(homeTeam, awayTeam) {
  const derbies = [
    ['Arsenal', 'Tottenham'], ['Liverpool', 'Everton'], ['Manchester United', 'Manchester City'],
    ['Real Madrid', 'Atletico Madrid'], ['Barcelona', 'Espanyol'], ['AC Milan', 'Inter Milan'],
    ['Bayern Munich', 'Borussia Dortmund'], ['PSG', 'Marseille'], ['Roma', 'Lazio'],
  ];
  return derbies.some(([a, b]) =>
    (homeTeam?.includes(a) && awayTeam?.includes(b)) ||
    (homeTeam?.includes(b) && awayTeam?.includes(a))
  );
}

async function logScrape(type, status, records, error, runId, duration) {
  await db.query(`
    INSERT INTO scrape_logs (scrape_type, status, records_fetched, error_message, apify_run_id, duration_ms)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [type, status, records, error, runId, duration]);
}

module.exports = {
  scrapeFixtures,
  scrapeRefereeStats,
  scrapeTeamStats,
  scrapeH2H,
  scrapeResults,
};
