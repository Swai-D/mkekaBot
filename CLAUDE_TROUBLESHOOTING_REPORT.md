# MkekaBOT Fixture Troubleshooting Report

Date checked: 2026-09-06
Timezone: `Africa/Dar_es_Salaam`

## Executive Finding

The app is no longer reading the historical CSV for the normal scan. `.env.local` has `USE_CSV_DATA=false`, and the direct live scan reaches Firecrawl/FlashScore successfully but returns zero fixtures:

```text
[Firecrawl] Total fixtures today: 0
[Scorer] Found 0 fixtures
```

The dashboard is therefore empty because there are no current fixtures to save. The Next.js app itself builds and its APIs respond with HTTP 200.

## Evidence Collected

### 1. Direct live fixture scan

Command:

```powershell
@'
import { getTodaysFixtures } from "./lib/firecrawl.js";
const fixtures = await getTodaysFixtures('all');
console.log(JSON.stringify({ count: fixtures.length, fixtures }, null, 2));
'@ | node --env-file=.env.local --input-type=module
```

Result:

```text
Firecrawl requested all 9 configured league fixture pages.
[Firecrawl] Total fixtures today: 0
{ "count": 0, "fixtures": [] }
```

This isolates the primary failure to fixture discovery/extraction/date matching, before AI prediction or database insertion.

### 2. Dashboard APIs

```text
GET /api/reconcile -> 200 { predictions: [], pendingReconciliation: 0, total: 0 }
GET /api/stats?days=30 -> 200
```

The API layer is not crashing. It correctly reports no current-day predictions.

### 3. Database state

The database contains six old test predictions created during the earlier CSV scan. Their stored kickoff timestamps are in August 2025, even though their `match_date` was written as the scan date. The current query excludes them because kickoff is not inside the current day.

Relevant live column types:

```text
match_date: date
kickoff: timestamp without time zone
should_bet: boolean NOT NULL
```

The old rows are stale test data and should not be treated as today's fixtures.

### 4. Application validation

- `npm run lint`: passed
- `npm run build`: passed
- editor diagnostics for fixture/scorer/API files: no errors
- `npm run scan`: reaches live Firecrawl and returns zero fixtures
- Next app running at `http://localhost:3002`

## End-to-End Flow

1. Dashboard loads `/api/reconcile` and `/api/stats`.
2. Clicking Scan calls `POST /api/analyze`.
3. `analyzeAndSaveFixtures('all')` checks `USE_CSV_DATA`.
4. With `false`, it calls `getTodaysFixtures('all')` in `lib/firecrawl.js`.
5. Firecrawl scrapes nine FlashScore league fixture pages.
6. The extraction prompt asks for matches scheduled for the app date.
7. Only array-shaped extraction results are accepted; anything else becomes an empty list.
8. Zero fixtures means no `buildMatchData`, AI prediction, or database insert is attempted.

## Most Likely Root Causes

### A. Firecrawl extraction is too fragile or FlashScore blocks the page

`scrapeUrl()` returns only `result?.data?.extract`. If Firecrawl returns a different shape, blocked-page content, or an extraction error, the caller logs little detail and eventually treats the result as no fixtures.

The current code also silently converts non-array extraction results into `[]`.

### B. FlashScore does not expose today's fixtures in the scraped page

The prompt asks FlashScore's fixtures page for one exact date. FlashScore may render fixtures client-side, redirect, show a different date format, or expose upcoming matches under a different page state. The code needs to log the raw extraction shape and the source page status before concluding that there are no fixtures.

### C. Date mismatch between the requested day and upstream source

The app correctly uses `Africa/Dar_es_Salaam` locally, but the upstream page may interpret “today” in another timezone or may not contain matches for the requested date. The exact requested ISO date must be logged and passed explicitly to the extraction prompt.

### D. The dashboard does not run a scan on startup

`npm run dev` starts only Next.js. It does not run `analyzeAndSaveFixtures()`. A scan must be triggered from the dashboard button/API or from the separate cron process:

```powershell
RUN_CRON=true node lib/cron.js
```

The dashboard only displays rows already saved in PostgreSQL.

### E. League alias mismatch

`.env.local` contains names such as `epl`, `laliga`, and `seriea`, while `LEAGUE_SLUGS` uses `premierLeague`, `laLiga`, and `serieA`. `all` currently avoids this problem, but any future scan using those env values will return no mapped URL unless aliases are normalized.

## Recommended Fix Order

1. Add structured Firecrawl diagnostics:
   - log the requested date and timezone;
   - log HTTP/source response metadata if available;
   - log whether `result.data.extract` is an array, object, null, or blocked-page text;
   - preserve a short safe preview of extraction content, never API keys.
2. Make fixture parsing tolerant of common response shapes:
   - raw array;
   - `{ fixtures: [...] }`;
   - `{ matches: [...] }`;
   - JSON string containing an array.
3. Add a strict post-extraction validator:
   - require home and away team strings;
   - reject finished/postponed/cancelled matches;
   - require an explicit fixture date when upstream provides one;
   - reject fixtures outside the requested app date.
4. Add a second provider/source fallback if FlashScore extraction is empty. Do not fall back to `data/test.csv` in production/live mode.
5. Normalize league aliases before looking up `LEAGUE_SLUGS`.
6. Add a visible dashboard state distinguishing:
   - “scan has not run”;
   - “source returned zero fixtures”;
   - “scan failed”; and
   - “fixtures found but prediction failed”.
7. Run cron separately in production or add an explicit startup/worker strategy. Do not silently assume `npm run dev` runs scheduled scans.
8. Keep old test rows archived/deleted separately; do not relabel them as today's fixtures.

## Claude Task Prompt

> You are debugging MkekaBOT in `c:\Users\user\Downloads\Personal Projects\Hobbie\mkeka-bot`. The app must fetch current football fixtures for 2026-09-06 in `Africa/Dar_es_Salaam`, never historical rows from `data/test.csv`.
>
> Current facts:
> > - `.env.local`: `USE_CSV_DATA=false`, `USE_SAMPLE_FIXTURES=false`.
> > - Direct `getTodaysFixtures('all')` calls Firecrawl for nine FlashScore fixture pages and returns `[]` with `[Firecrawl] Total fixtures today: 0`.
> > - `GET /api/reconcile` returns HTTP 200 with zero predictions.
> > - `npm run lint` and `npm run build` pass.
> > - PostgreSQL contains six stale CSV test rows with kickoff timestamps in August 2025; current-day query correctly hides them.
> > - `npm run dev` does not run the cron scanner; cron is a separate process.
>
> Tasks:
> 1. Inspect `lib/firecrawl.js`, especially `scrapeUrl()` and `getTodaysFixtures()`.
> 2. Run the direct live fixture command and capture the actual Firecrawl extraction response shape without exposing secrets.
> 3. Determine whether the problem is FlashScore blocking, changed markup, wrong extraction shape, wrong date, or no matches on the source.
> 4. Add robust parsing and structured diagnostics for arrays, `{fixtures}`, `{matches}`, JSON strings, and blocked/error responses.
> 5. Normalize `epl`/`laliga`/`seriea` aliases to the keys used by `LEAGUE_SLUGS`.
> 6. Add a safe live-source fallback if FlashScore returns no fixtures. Never use the historical CSV as a live fallback.
> 7. Preserve strict date validation for `Africa/Dar_es_Salaam` and reject previous-season fixtures.
> 8. Make the dashboard/API distinguish zero fixtures from scan failure.
> 9. Add focused tests or a deterministic parser test for each supported extraction shape.
> 10. Run `npm run lint`, `npm run build`, direct fixture scan, and the dashboard API checks. Report exact fixture count and source used.
>
> Do not rotate or print secrets. Do not commit `.env.local`.

## Security Note

`.env.local` is ignored by Git, which is correct. However, credentials were visible during troubleshooting. Rotate any database, Firecrawl, Groq, or OpenRouter keys that may have been shared outside the local machine.
