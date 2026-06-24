/**
 * MkekaBOT — Firecrawl Data Layer
 * lib/firecrawl.js
 *
 * Updated for v3.3:
 * - Fetches homeTeam.last5CardsGiven & awayTeam.last5CardsGiven (momentum)
 * - Fetches referee.last10GamesCards (consistency scoring)
 * - Fetches openingOdds & currentOdds (movement tracking)
 */

import FirecrawlApp from "@mendable/firecrawl-js";

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

// ── Helpers ──────────────────────────────────────────────────────

async function scrapeUrl(url, prompt) {
  try {
    const result = await firecrawl.scrapeUrl(url, {
      formats: ["extract"],
      extract: { prompt },
    });
    return result?.data?.extract ?? null;
  } catch (err) {
    console.error(`[Firecrawl] Scrape failed for ${url}:`, err.message);
    return null;
  }
}

// ── League → FlashScore slug mapping ────────────────────────────
const LEAGUE_SLUGS = {
  premierLeague:   "england/premier-league",
  championship:    "england/championship",
  leagueOne:       "england/league-one",
  leagueTwo:       "england/league-two",
  bundesliga:      "germany/bundesliga",
  laLiga:          "spain/laliga",
  ligue1:          "france/ligue-1",
  serieA:          "italy/serie-a",
  segundaDivision: "spain/laliga2",
};

// ── 1. TODAY'S FIXTURES ──────────────────────────────────────────
export async function getTodaysFixtures(league = "all") {
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const leaguesToScan = league === "all" ? Object.keys(LEAGUE_SLUGS) : [league];
  const allFixtures = [];

  for (const leagueKey of leaguesToScan) {
    const slug = LEAGUE_SLUGS[leagueKey];
    if (!slug) continue;
    
    const url = `https://www.flashscore.com/football/${slug}/`;
    const data = await scrapeUrl(url, `
      Extract today's fixtures. For each match return JSON array:
      [{
        "homeTeam": "team name",
        "awayTeam": "team name",
        "kickoff": "HH:MM",
        "matchId": "flashscore match id if visible"
      }]
      Only return matches for today ${today}. Return [] if none found.
    `);
    if (Array.isArray(data)) {
      allFixtures.push(...data.map((f) => ({ ...f, league: leagueKey })));
    }
  }

  return allFixtures;
}

// ── 2. TEAM STATS (season avg + last 5 cards) ────────────────────
// v3.3: Now fetches last5CardsGiven array for momentum calculation
export async function getTeamStats(teamName, league) {
  const slug = LEAGUE_SLUGS[league] ?? "england/championship";
  const teamSlug = teamName.toLowerCase().replace(/\s+/g, "-");
  const url = `https://www.footystats.org/${slug.split("/")[0]}/clubs/${teamSlug}/stats`;

  const data = await scrapeUrl(url, `
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
  `);

  return data ?? {
    avgCardsPerGame: null,
    totalYellowCards: null,
    matchesPlayed: null,
    last5CardsGiven: [],
    suspendedPlayers: [],
    playersNearSuspension: [],
  };
}

// ── 3. REFEREE STATS (avg + last 10 games for consistency) ───────
// v3.3: Now fetches last10GamesCards for variance calculation
export async function getRefereeStats(refereeName, league) {
  const url = `https://www.adamchoi.co.uk/referee/search?name=${encodeURIComponent(refereeName)}`;

  const data = await scrapeUrl(url, `
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
  `);

  return data ?? {
    name: refereeName,
    avgCardsPerGame: null,
    gamesThisSeason: 0,
    totalYellowCards: 0,
    last10GamesCards: [],
    yellowCardsPer90: null,
  };
}

// ── 4. H2H STATS ─────────────────────────────────────────────────
export async function getH2HStats(homeTeam, awayTeam) {
  const query = `${homeTeam.replace(/\s/g, "+")}+vs+${awayTeam.replace(/\s/g, "+")}+head+to+head+yellow+cards`;
  const url = `https://www.flashscore.com/football/search/?q=${encodeURIComponent(homeTeam + " " + awayTeam)}`;

  const data = await scrapeUrl(url, `
    Extract head-to-head yellow card data for ${homeTeam} vs ${awayTeam}:
    {
      "last3MeetingsCards": [<array of total cards in last 3 meetings>],
      "avgCards": <average total cards across last 3 meetings>,
      "lastMeetingCards": <number>
    }
    Return null if not available.
  `);

  return data ?? { last3MeetingsCards: [], avgCards: null, lastMeetingCards: null };
}

// ── 5. MARKET ODDS (opening + current for movement tracking) ─────
// v3.3: Fetches BOTH opening odds and current odds
export async function getMarketOdds(homeTeam, awayTeam, league) {
  const searchQuery = `${homeTeam} ${awayTeam} total cards odds`;
  const url = `https://www.oddsportal.com/search/results/#${encodeURIComponent(searchQuery)}`;

  const data = await scrapeUrl(url, `
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
  `);

  return data ?? {
    over25: null,
    over35: null,
    over45: null,
    openingOver35: null,
    currentOver35: null,
    bookmaker: null,
  };
}

// ── 6. LEAGUE POSITION ────────────────────────────────────────────
export async function getLeaguePositions(homeTeam, awayTeam, league) {
  const slug = LEAGUE_SLUGS[league] ?? "england/championship";
  const url = `https://www.flashscore.com/football/${slug}/standings/`;

  const data = await scrapeUrl(url, `
    Extract current league table positions:
    {
      "home": <position number of ${homeTeam}>,
      "away": <position number of ${awayTeam}>,
      "totalTeams": <number of teams in league>
    }
  `);

  return data ?? { home: null, away: null, totalTeams: null };
}

// ── 7. FULL MATCH DATA BUILDER ───────────────────────────────────
// Assembles complete matchData object for mkekaBOTv33()
export async function buildMatchData(fixture, options = {}) {
  const { league, homeTeam: homeName, awayTeam: awayName, kickoff } = fixture;
  const { matchday, isTitleRace = false, isRelegation = false, isDerby = false, isEuropeanWeek = false, referee: refName } = options;

  console.log(`[Firecrawl] Building match data: ${homeName} vs ${awayName}`);

  // Parallel fetching — all at once to save time
  const [homeStats, awayStats, refStats, h2h, odds, positions] = await Promise.all([
    getTeamStats(homeName, league),
    getTeamStats(awayName, league),
    refName ? getRefereeStats(refName, league) : Promise.resolve(null),
    getH2HStats(homeName, awayName),
    getMarketOdds(homeName, awayName, league),
    getLeaguePositions(homeName, awayName, league),
  ]);

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
      avgCardsPerGame:       homeStats.avgCardsPerGame,
      last5CardsGiven:       homeStats.last5CardsGiven,       // v3.3: momentum
      suspendedPlayers:      homeStats.suspendedPlayers,
      playersNearSuspension: homeStats.playersNearSuspension,
    },

    awayTeam: {
      name: awayName,
      avgCardsPerGame:       awayStats.avgCardsPerGame,
      last5CardsGiven:       awayStats.last5CardsGiven,       // v3.3: momentum
      suspendedPlayers:      awayStats.suspendedPlayers,
      playersNearSuspension: awayStats.playersNearSuspension,
    },

    referee: refStats ? {
      name:              refStats.name,
      avgCardsPerGame:   refStats.avgCardsPerGame,
      gamesThisSeason:   refStats.gamesThisSeason,
      last10GamesCards:  refStats.last10GamesCards,           // v3.3: consistency
    } : null,

    h2hLastSeason: {
      avgCards:         h2h.avgCards,
      lastMeetingCards: h2h.lastMeetingCards,
    },

    leaguePosition: positions,

    // v3.3: odds movement
    openingOdds: odds.openingOver35,
    currentOdds: odds.currentOver35,
  };
}

export default {
  getTodaysFixtures,
  getTeamStats,
  getRefereeStats,
  getH2HStats,
  getMarketOdds,
  getLeaguePositions,
  buildMatchData,
};
