/**
 * MkekaBOT — Sample Fixtures for Off-Season Development
 * lib/devFixtures.js
 *
 * Use these when real leagues are on break. They exercise the full pipeline:
 * fixtures → team stats → referee stats → H2H → odds → Kimi prediction → DB.
 */

export const SAMPLE_FIXTURES = [
  {
    league: 'premierLeague',
    homeTeam: 'Arsenal',
    awayTeam: 'Manchester United',
    kickoff: '16:30',
    matchId: 'demo-ars-mun',
    matchday: 12,
    isDerby: false,
    isTitleRace: true,
    isRelegation: false,
    referee: 'Michael Oliver',
  },
  {
    league: 'premierLeague',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    kickoff: '13:00',
    matchId: 'demo-liv-eve',
    matchday: 12,
    isDerby: true,
    isTitleRace: false,
    isRelegation: false,
    referee: 'Anthony Taylor',
  },
  {
    league: 'laLiga',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    kickoff: '21:00',
    matchId: 'demo-rm-bar',
    matchday: 11,
    isDerby: true,
    isTitleRace: true,
    isRelegation: false,
    referee: 'Jose Maria Sanchez Martinez',
  },
  {
    league: 'bundesliga',
    homeTeam: 'Bayern Munich',
    awayTeam: 'Borussia Dortmund',
    kickoff: '18:30',
    matchId: 'demo-bay-bvb',
    matchday: 10,
    isDerby: true,
    isTitleRace: true,
    isRelegation: false,
    referee: 'Felix Zwayer',
  },
  {
    league: 'serieA',
    homeTeam: 'AC Milan',
    awayTeam: 'Inter',
    kickoff: '20:45',
    matchId: 'demo-mil-int',
    matchday: 11,
    isDerby: true,
    isTitleRace: false,
    isRelegation: false,
    referee: 'Daniele Orsato',
  },
  {
    league: 'ligue1',
    homeTeam: 'PSG',
    awayTeam: 'Marseille',
    kickoff: '20:45',
    matchId: 'demo-psg-om',
    matchday: 11,
    isDerby: true,
    isTitleRace: false,
    isRelegation: false,
    referee: 'Benoit Bastien',
  },
];

export function getSampleFixtures(league = 'all') {
  const list =
    league === 'all' ? SAMPLE_FIXTURES : SAMPLE_FIXTURES.filter((f) => f.league === league);
  console.log(`[DevFixtures] Returning ${list.length} sample fixtures`);
  return list;
}
