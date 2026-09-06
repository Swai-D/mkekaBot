/**
 * MkekaBOT — Firecrawl Data Layer
 * lib/firecrawl.js
 *
 * Updated for v3.3:
 * - Fetches homeTeam.last5CardsGiven & awayTeam.last5CardsGiven (momentum)
 * - Fetches referee.last10GamesCards (consistency scoring)
 * - Fetches openingOdds & currentOdds (movement tracking)
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import { getSampleFixtures } from './devFixtures.js';
import { query } from './db.js';

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

const CACHE_TTL_HOURS = 12;

let creditsExhausted = false;

// ── Helpers ──────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function scrapeUrl(url, prompt) {
  if (creditsExhausted) {
    return { ok: false, extract: null, error: 'Skipped - Firecrawl credits exhausted this run' };
  }

  try {
    const result = await withTimeout(
      firecrawl.scrapeUrl(url, {
        formats: ['extract'],
        extract: { prompt },
      }),
      45000,
      `Firecrawl ${url}`
    );

    const topLevelKeys = result && typeof result === 'object' ? Object.keys(result) : [];
    const dataKeys = result?.data && typeof result.data === 'object' ? Object.keys(result.data) : [];
    const responsePreview = JSON.stringify(result ?? null).slice(0, 500);
    console.log(
      `[Firecrawl] Response shape for ${url}: success=${result?.success}, ` +
        `topLevelKeys=${JSON.stringify(topLevelKeys)}, dataKeys=${JSON.stringify(dataKeys)}, ` +
        `preview=${responsePreview}`
    );

    if (result?.success === false) {
      const error = result?.error ?? 'API returned success:false';
      console.error(`[Firecrawl] API reported failure for ${url}: ${error}`);
      return { ok: false, extract: null, error };
    }

    const statusCode = result?.metadata?.statusCode ?? result?.data?.metadata?.statusCode ?? null;
    if (statusCode && (statusCode < 200 || statusCode >= 300)) {
      const error = `Source page returned HTTP ${statusCode}`;
      console.warn(
        `[Firecrawl] Source page for ${url} returned HTTP ${statusCode} - discarding extract`
      );
      return { ok: false, extract: null, error };
    }

    const extract = result?.extract ?? result?.json ?? result?.data?.extract ?? result?.data?.json ?? null;
    if (extract === null) {
      const preview = (
        result?.markdown ||
        result?.html ||
        result?.data?.markdown ||
        result?.data?.html ||
        ''
      ).slice(0, 200);
      console.warn(`[Firecrawl] No extract field for ${url}. Preview: ${preview}`);
      if (/captcha|access denied|are you human|cloudflare/i.test(preview)) {
        return { ok: false, extract: null, error: 'Likely blocked (bot-check page detected)' };
      }
    }

    return { ok: true, extract, error: null };
  } catch (err) {
    if (/insufficient credits|status code: 402/i.test(err.message)) {
      creditsExhausted = true;
      console.error('[Firecrawl] Out of credits - halting further scrape calls for this run.');
    }
    console.error(`[Firecrawl] Scrape failed for ${url}:`, err.message);
    return { ok: false, extract: null, error: err.message };
  }
}

function coerceToFixtureArray(extract) {
  if (extract == null) return [];

  let value = extract;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.fixtures)) return value.fixtures;
  if (Array.isArray(value?.matches)) return value.matches;
  return [];
}

// ── League → FlashScore slug mapping ────────────────────────────
const LEAGUE_SLUGS = {
  premierLeague: 'england/premier-league',
  championship: 'england/championship',
  leagueOne: 'england/league-one',
  leagueTwo: 'england/league-two',
  bundesliga: 'germany/bundesliga',
  laLiga: 'spain/laliga',
  ligue1: 'france/ligue-1',
  serieA: 'italy/serie-a',
  segundaDivision: 'spain/laliga2',
};

const LEAGUE_ALIASES = {
  epl: 'premierLeague',
  premier_league: 'premierLeague',
  laliga: 'laLiga',
  la_liga: 'laLiga',
  seriea: 'serieA',
  serie_a: 'serieA',
  ligue_1: 'ligue1',
  segunda: 'segundaDivision',
  segunda_division: 'segundaDivision',
};

function normalizeLeagueKey(key) {
  if (LEAGUE_SLUGS[key]) return key;
  const lower = key.toLowerCase().replace(/[\s-]+/g, '_');
  return LEAGUE_ALIASES[lower] ?? key;
}

// ── 1. TODAY'S FIXTURES ──────────────────────────────────────────
export async function getTodaysFixtures(league = 'all') {
  creditsExhausted = false;

  if (process.env.USE_SAMPLE_FIXTURES === 'true') {
    return getSampleFixtures(league);
  }

  if (!process.env.FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is missing. Add it to .env.local');
  }

  const appTimeZone = process.env.APP_TIMEZONE || 'Africa/Dar_es_Salaam';
  const now = new Date();
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const todayValues = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
  const todayIso = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
  const todayHuman = new Intl.DateTimeFormat('en-GB', {
    timeZone: appTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now); // DD/MM/YYYY
  const rawLeagues = league === 'all' ? Object.keys(LEAGUE_SLUGS) : [league];
  const leaguesToScan = rawLeagues.map(normalizeLeagueKey);
  console.log(
    `[Firecrawl] Requesting fixtures for date=${todayIso} (${todayHuman}) tz=${appTimeZone}`
  );

  const scrapeLeague = async (leagueKey) => {
    const slug = LEAGUE_SLUGS[leagueKey];
    if (!slug) return [];

    // Use the fixtures page — much more stable than the league homepage.
    const url = `https://www.flashscore.com/football/${slug}/fixtures/`;
    console.log(`[Firecrawl] Fetching fixtures: ${url}`);

    const { ok, extract, error } = await scrapeUrl(
      url,
      `
      You are on the FlashScore fixtures page for this league.
      Extract ALL football matches scheduled for TODAY (${todayIso}, ${todayHuman}).

      Return a JSON array. Each item must have:
      {
        "homeTeam": "exact team name shown on FlashScore",
        "awayTeam": "exact team name shown on FlashScore",
        "kickoff": "HH:MM in 24-hour format if visible, otherwise null",
        "matchId": "FlashScore match ID from the match URL if visible, otherwise null"
      }

      Rules:
      - Only include matches happening TODAY.
      - Ignore matches marked "Finished", "Postponed", or "Cancelled".
      - If no matches are found for today, return an empty array [].
      - Do NOT wrap the response in markdown. Return raw JSON only.
    `
    );

    if (!ok) {
      console.error(
        `[Firecrawl] ${leagueKey}: scrape did not succeed (${error}) — treating as unknown, not zero`
      );
      return [];
    }

    const candidates = coerceToFixtureArray(extract);
    const valid = candidates.filter(
      (f) => f && typeof f.homeTeam === 'string' && typeof f.awayTeam === 'string'
    );

    if (candidates.length && valid.length !== candidates.length) {
      console.warn(
        `[Firecrawl] ${leagueKey}: dropped ${candidates.length - valid.length} malformed entries`
      );
    }

    console.log(`[Firecrawl] ${leagueKey}: ${valid.length} fixtures`);
    return valid.map((f) => ({ ...f, league: leagueKey }));
  };

  const results = [];
  for (const leagueKey of leaguesToScan) {
    results.push(await scrapeLeague(leagueKey));
  }
  const allFixtures = results.flat();

  console.log(`[Firecrawl] Total fixtures today: ${allFixtures.length}`);
  return allFixtures;
}

// ── 2. TEAM STATS (season avg + last 5 cards) ────────────────────
// v3.3: Now fetches last5CardsGiven array for momentum calculation
async function getCachedTeamStats(teamName, league) {
  try {
    const result = await query(
      `SELECT avg_cards_per_game, season_total_cards, matches_played,
              last5_cards_given, suspended_players, players_near_suspension
       FROM team_stats_cache
       WHERE team_name = $1 AND league = $2
         AND updated_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`,
      [teamName, league]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      avgCardsPerGame: row.avg_cards_per_game !== null ? Number(row.avg_cards_per_game) : null,
      totalYellowCards: row.season_total_cards,
      matchesPlayed: row.matches_played,
      last5CardsGiven: row.last5_cards_given ?? [],
      suspendedPlayers: row.suspended_players ?? [],
      playersNearSuspension: row.players_near_suspension ?? [],
    };
  } catch (err) {
    console.warn(`[Cache] team_stats_cache read failed for ${teamName}: ${err.message}`);
    return null;
  }
}

async function saveTeamStatsCache(teamName, league, stats) {
  try {
    await query(
      `INSERT INTO team_stats_cache
         (team_name, league, avg_cards_per_game, last5_cards_given,
          season_total_cards, matches_played, suspended_players,
          players_near_suspension, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (team_name, league) DO UPDATE SET
         avg_cards_per_game = $3, last5_cards_given = $4,
         season_total_cards = $5, matches_played = $6,
         suspended_players = $7, players_near_suspension = $8,
         updated_at = NOW()`,
      [
        teamName,
        league,
        stats.avgCardsPerGame,
        JSON.stringify(stats.last5CardsGiven ?? []),
        stats.totalYellowCards,
        stats.matchesPlayed,
        JSON.stringify(stats.suspendedPlayers ?? []),
        JSON.stringify(stats.playersNearSuspension ?? []),
      ]
    );
  } catch (err) {
    console.warn(`[Cache] team_stats_cache write failed for ${teamName}: ${err.message}`);
  }
}

export async function getTeamStats(teamName, league) {
  const cached = await getCachedTeamStats(teamName, league);
  if (cached) {
    console.log(`[Cache] Using cached team stats for ${teamName} (${league}) - saved a Firecrawl credit`);
    return cached;
  }

  const slug = LEAGUE_SLUGS[league] ?? 'england/championship';
  const teamSlug = teamName.toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.footystats.org/${slug.split('/')[0]}/clubs/${teamSlug}/stats`;

  const { ok, extract, error } = await scrapeUrl(
    url,
    `
    Extract disciplinary stats for ${teamName}:
    {
      "avgCardsPerGame": <number — average yellow cards per match this season>,
      "totalYellowCards": <number>,
      "matchesPlayed": <number>,
      "last5CardsGiven": [<array of 5 numbers — yellow cards in last 5 matches, most recent first>],
      "suspendedPlayers": [<array of player names currently suspended>],
      "playersNearSuspension": [<array of player names on 4 yellow cards>]
    }
    Return null if data not available.
  `
  );

  if (!ok) console.warn(`[Firecrawl] getTeamStats(${teamName}) failed: ${error}`);
  const data = ok ? extract : null;

  const stats = data ?? {
      avgCardsPerGame: null,
      totalYellowCards: null,
      matchesPlayed: null,
      last5CardsGiven: [],
      suspendedPlayers: [],
      playersNearSuspension: [],
  };

  if (data) await saveTeamStatsCache(teamName, league, stats);
  return stats;
}

// ── 3. REFEREE STATS (avg + last 10 games for consistency) ───────
// v3.3: Now fetches last10GamesCards for variance calculation
async function getCachedRefereeStats(refereeName) {
  try {
    const result = await query(
      `SELECT avg_cards_per_game, games_this_season, last10_games_cards
       FROM referee_cache
       WHERE referee_name = $1
         AND updated_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`,
      [refereeName]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      name: refereeName,
      avgCardsPerGame: row.avg_cards_per_game !== null ? Number(row.avg_cards_per_game) : null,
      gamesThisSeason: row.games_this_season ?? 0,
      totalYellowCards: null,
      last10GamesCards: row.last10_games_cards ?? [],
      yellowCardsPer90: null,
    };
  } catch (err) {
    console.warn(`[Cache] referee_cache read failed for ${refereeName}: ${err.message}`);
    return null;
  }
}

async function saveRefereeStatsCache(refereeName, stats) {
  try {
    await query(
      `INSERT INTO referee_cache
         (referee_name, avg_cards_per_game, games_this_season, last10_games_cards, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (referee_name) DO UPDATE SET
         avg_cards_per_game = $2, games_this_season = $3,
         last10_games_cards = $4, updated_at = NOW()`,
      [refereeName, stats.avgCardsPerGame, stats.gamesThisSeason, JSON.stringify(stats.last10GamesCards ?? [])]
    );
  } catch (err) {
    console.warn(`[Cache] referee_cache write failed for ${refereeName}: ${err.message}`);
  }
}

export async function getRefereeStats(refereeName) {
  const cached = await getCachedRefereeStats(refereeName);
  if (cached) {
    console.log(`[Cache] Using cached referee stats for ${refereeName} - saved a Firecrawl credit`);
    return cached;
  }

  const url = `https://www.adamchoi.co.uk/referee/search?name=${encodeURIComponent(refereeName)}`;

  const { ok, extract, error } = await scrapeUrl(
    url,
    `
    Extract stats for referee ${refereeName}:
    {
      "name": "${refereeName}",
      "avgCardsPerGame": <number — average yellow cards per game this season>,
      "gamesThisSeason": <number>,
      "totalYellowCards": <number>,
      "last10GamesCards": [<array of 10 numbers — yellow cards in last 10 games, most recent first>],
      "yellowCardsPer90": <number>
    }
    Return null if not found.
  `
  );

  if (!ok) console.warn(`[Firecrawl] getRefereeStats(${refereeName}) failed: ${error}`);
  const data = ok ? extract : null;

  const stats = data ?? {
      name: refereeName,
      avgCardsPerGame: null,
      gamesThisSeason: 0,
      totalYellowCards: 0,
      last10GamesCards: [],
      yellowCardsPer90: null,
  };

  if (data) await saveRefereeStatsCache(refereeName, stats);
  return stats;
}

// ── 4. H2H STATS ─────────────────────────────────────────────────
export async function getH2HStats(homeTeam, awayTeam) {
  const url = `https://www.flashscore.com/football/search/?q=${encodeURIComponent(homeTeam + ' ' + awayTeam)}`;

  const { ok, extract, error } = await scrapeUrl(
    url,
    `
    Extract head-to-head yellow card data for ${homeTeam} vs ${awayTeam}:
    {
      "last3MeetingsCards": [<array of total cards in last 3 meetings>],
      "avgCards": <average total cards across last 3 meetings>,
      "lastMeetingCards": <number>
    }
    Return null if not available.
  `
  );

  if (!ok) console.warn(`[Firecrawl] getH2HStats(${homeTeam} vs ${awayTeam}) failed: ${error}`);
  const data = ok ? extract : null;

  return data ?? { last3MeetingsCards: [], avgCards: null, lastMeetingCards: null };
}

// ── 5. MARKET ODDS (opening + current for movement tracking) ─────
// v3.3: Fetches BOTH opening odds and current odds
export async function getMarketOdds(homeTeam, awayTeam) {
  const searchQuery = `${homeTeam} ${awayTeam} total cards odds`;
  const url = `https://www.oddsportal.com/search/results/#${encodeURIComponent(searchQuery)}`;

  const { ok, extract, error } = await scrapeUrl(
    url,
    `
    Find the over/under yellow cards market for ${homeTeam} vs ${awayTeam}.
    Extract:
    {
      "over25": <current decimal odds for over 2.5 yellow cards>,
      "over35": <current decimal odds for over 3.5 yellow cards>,
      "over45": <current decimal odds for over 4.5 yellow cards>,
      "openingOver35": <opening/initial odds for over 3.5 when market first opened>,
      "currentOver35": <current live odds for over 3.5>,
      "bookmaker": "<bookmaker name>"
    }
    Return null if not found.
  `
  );

  if (!ok) console.warn(`[Firecrawl] getMarketOdds(${homeTeam} vs ${awayTeam}) failed: ${error}`);
  const data = ok ? extract : null;

  return (
    data ?? {
      over25: null,
      over35: null,
      over45: null,
      openingOver35: null,
      currentOver35: null,
      bookmaker: null,
    }
  );
}

// ── 6. LEAGUE POSITION ────────────────────────────────────────────
export async function getLeaguePositions(homeTeam, awayTeam, league) {
  const slug = LEAGUE_SLUGS[league] ?? 'england/championship';
  const url = `https://www.flashscore.com/football/${slug}/standings/`;

  const { ok, extract, error } = await scrapeUrl(
    url,
    `
    Extract current league table positions:
    {
      "home": <position number of ${homeTeam}>,
      "away": <position number of ${awayTeam}>,
      "totalTeams": <number of teams in league>
    }
  `
  );

  if (!ok) console.warn(`[Firecrawl] getLeaguePositions(${homeTeam} vs ${awayTeam}) failed: ${error}`);
  const data = ok ? extract : null;

  return data ?? { home: null, away: null, totalTeams: null };
}

// ── 7. FULL MATCH DATA BUILDER ───────────────────────────────────
// Assembles complete matchData object for mkekaBOTv33()
export async function buildMatchData(fixture, options = {}) {
  const { league, homeTeam: homeName, awayTeam: awayName, kickoff } = fixture;
  const {
    matchday,
    isTitleRace = false,
    isRelegation = false,
    isDerby = false,
    isEuropeanWeek = false,
    referee: refName,
  } = options;

  console.log(`[Firecrawl] Building match data: ${homeName} vs ${awayName}`);

  // Keep enrichment sequential to stay within Firecrawl concurrency limits.
  const homeStats = await getTeamStats(homeName, league);
  const awayStats = await getTeamStats(awayName, league);
  const refStats = refName ? await getRefereeStats(refName) : null;
  const h2h = await getH2HStats(homeName, awayName);
  const odds = await getMarketOdds(homeName, awayName);
  const positions = await getLeaguePositions(homeName, awayName, league);

  return {
    league,
    matchday: matchday ?? null,
    kickoff,
    isTitleRace,
    isRelegation,
    isDerby,
    isEuropeanWeek,

    homeTeam: {
      name: homeName,
      avgCardsPerGame: homeStats.avgCardsPerGame,
      last5CardsGiven: homeStats.last5CardsGiven, // v3.3: momentum
      suspendedPlayers: homeStats.suspendedPlayers,
      playersNearSuspension: homeStats.playersNearSuspension,
    },

    awayTeam: {
      name: awayName,
      avgCardsPerGame: awayStats.avgCardsPerGame,
      last5CardsGiven: awayStats.last5CardsGiven, // v3.3: momentum
      suspendedPlayers: awayStats.suspendedPlayers,
      playersNearSuspension: awayStats.playersNearSuspension,
    },

    referee: refStats
      ? {
          name: refStats.name,
          avgCardsPerGame: refStats.avgCardsPerGame,
          gamesThisSeason: refStats.gamesThisSeason,
          last10GamesCards: refStats.last10GamesCards, // v3.3: consistency
        }
      : null,

    h2hLastSeason: {
      avgCards: h2h.avgCards,
      lastMeetingCards: h2h.lastMeetingCards,
    },

    leaguePosition: positions,

    // v3.3: odds movement
    openingOdds: odds.openingOver35,
    currentOdds: odds.currentOver35,
  };
}

const firecrawlApi = {
  getTodaysFixtures,
  getTeamStats,
  getRefereeStats,
  getH2HStats,
  getMarketOdds,
  getLeaguePositions,
  buildMatchData,
};

export default firecrawlApi;
