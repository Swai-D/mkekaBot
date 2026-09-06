/**
 * MkekaBOT — CSV Test Data Loader
 * lib/csvData.js
 *
 * Loads historical match data from data/test.csv for fast off-season testing.
 * Bypasses Firecrawl entirely — uses the engineered features already in the CSV.
 */

import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_PATH = path.join(__dirname, '..', 'data', 'test.csv');

let cachedRows = null;

function loadCsv() {
  if (cachedRows) return cachedRows;

  const content = readFileSync(CSV_PATH, 'utf-8');
  cachedRows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    cast: true,
  });
  return cachedRows;
}

function toLeagueKey(league) {
  const map = {
    premierLeague: 'premierLeague',
    championship: 'championship',
    laLiga: 'laLiga',
    ligue1: 'ligue1',
    serieA: 'serieA',
    bundesliga: 'bundesliga',
    leagueOne: 'leagueOne',
    leagueTwo: 'leagueTwo',
    segundaDivision: 'segundaDivision',
  };
  return map[league] ?? league;
}

function stripClubSuffix(name) {
  if (!name) return name;
  return name
    .replace(/\s+FC$/i, '')
    .replace(/\s+AFC$/i, '')
    .replace(/\s+CF$/i, '')
    .replace(/\s+SC$/i, '')
    .replace(/\s+United\s+FC$/i, 'United')
    .replace(/\s+City\s+FC$/i, 'City')
    .trim();
}

const CURATED_TEST_MATCH_IDS = [
  540729, // Middlesbrough vs Swansea — 9 cards (high)
  540722, // Sheffield United vs Bristol City — 0 cards (low)
  537793, // Manchester United vs Arsenal — 5 cards (derby)
  537785, // Liverpool vs Bournemouth — 3 cards
  544216, // RCD Mallorca vs Barcelona — 5 cards
  542414, // Stade Rennais vs Marseille — 5 cards
];

export function getCsvFixtures(league = 'all', limit = 8) {
  const rows = loadCsv();
  let filtered = rows;

  if (league !== 'all') {
    filtered = rows.filter((r) => toLeagueKey(r.league) === league);
  }

  // Prefer curated matches, then fill with random rows for variety.
  const curated = filtered.filter((r) => CURATED_TEST_MATCH_IDS.includes(Number(r.match_id)));
  const remaining = filtered.filter((r) => !CURATED_TEST_MATCH_IDS.includes(Number(r.match_id)));
  const shuffled = remaining.sort(() => 0.5 - Math.random());
  const picked = curated.concat(shuffled).slice(0, limit);

  return picked.map((row) => ({
    league: toLeagueKey(row.league),
    homeTeam: stripClubSuffix(row.home_team),
    awayTeam: stripClubSuffix(row.away_team),
    kickoff: row.match_date ? `${row.match_date}T15:00:00` : '15:00',
    matchId: String(row.match_id),
    matchday: row.matchday ? Math.round(row.matchday) : 1,
    isDerby: row.is_derby === '1' || row.is_derby === 1 || row.is_derby === true,
    isTitleRace: row.is_title_race === '1' || row.is_title_race === 1 || row.is_title_race === true,
    isRelegation:
      row.is_relegation === '1' || row.is_relegation === 1 || row.is_relegation === true,
    referee: row.referee_name || 'TBC',
  }));
}

export function buildMatchDataFromCsv(fixture) {
  const rows = loadCsv();
  const row = rows.find(
    (r) =>
      String(r.match_id) === fixture.matchId ||
      (stripClubSuffix(r.home_team) === fixture.homeTeam &&
        stripClubSuffix(r.away_team) === fixture.awayTeam)
  );

  if (!row) {
    throw new Error(`CSV row not found for ${fixture.homeTeam} vs ${fixture.awayTeam}`);
  }

  const toNum = (v) => (v === '' || v == null ? null : parseFloat(v));

  return {
    league: toLeagueKey(row.league),
    matchday: row.matchday ? Math.round(row.matchday) : 1,
    kickoff: fixture.kickoff ?? '15:00',
    isTitleRace: fixture.isTitleRace ?? false,
    isRelegation: fixture.isRelegation ?? false,
    isDerby: fixture.isDerby ?? false,
    isEuropeanWeek: false,

    homeTeam: {
      name: stripClubSuffix(row.home_team),
      avgCardsPerGame: toNum(row.home_avg_cards),
      last5CardsGiven: [],
      suspendedPlayers: [],
      playersNearSuspension: [],
    },

    awayTeam: {
      name: stripClubSuffix(row.away_team),
      avgCardsPerGame: toNum(row.away_avg_cards),
      last5CardsGiven: [],
      suspendedPlayers: [],
      playersNearSuspension: [],
    },

    referee: row.referee_name
      ? {
          name: row.referee_name,
          avgCardsPerGame: toNum(row.referee_season_avg),
          gamesThisSeason: 20,
          last10GamesCards: [],
        }
      : null,

    h2hLastSeason: {
      avgCards: toNum(row.combined_team_cards),
      lastMeetingCards: null,
    },

    leaguePosition: {
      home: toNum(row.home_league_position),
      away: toNum(row.away_league_position),
      totalTeams: 20,
    },

    openingOdds: null,
    currentOdds: null,

    // Ground truth for testing reconciliation
    actualCards: toNum(row.total_yellow_cards),
  };
}

export function listCsvMatches(league = 'all', limit = 20) {
  const rows = loadCsv();
  let filtered = rows;
  if (league !== 'all') {
    filtered = rows.filter((r) => toLeagueKey(r.league) === league);
  }
  return filtered.slice(0, limit).map((r) => ({
    id: r.match_id,
    league: toLeagueKey(r.league),
    home: stripClubSuffix(r.home_team),
    away: stripClubSuffix(r.away_team),
    referee: r.referee_name || 'TBC',
    totalCards: r.total_yellow_cards,
    over25: r.result_over25,
    over35: r.result_over35,
  }));
}
