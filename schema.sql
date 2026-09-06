-- ================================================================
-- MkekaBOT v3.4 — PostgreSQL Schema (FLAT — matches scorer.js)
-- ================================================================
-- Drop order matters (child tables first)
DROP TABLE IF EXISTS learning_log CASCADE;
DROP TABLE IF EXISTS reconciliation_log CASCADE;
DROP TABLE IF EXISTS odds_cache CASCADE;
DROP TABLE IF EXISTS referee_match_cache CASCADE;
DROP TABLE IF EXISTS referee_cache CASCADE;
DROP TABLE IF EXISTS team_stats_cache CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── PREDICTIONS ──────────────────────────────────────────────────
CREATE TABLE predictions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_date       DATE    NOT NULL,
  league           VARCHAR(100) NOT NULL,
  home_team        VARCHAR(150) NOT NULL,
  away_team        VARCHAR(150) NOT NULL,
  kickoff          VARCHAR(50),
  matchday         INT,
  referee_name     VARCHAR(150),
  ref_confirmed    BOOLEAN DEFAULT false,

  bot_line         DECIMAL(4,2),
  davy_line        DECIMAL(4,2),
  confidence       DECIMAL(5,2),
  market_odds      DECIMAL(6,2),
  opening_odds     DECIMAL(6,2),
  current_odds     DECIMAL(6,2),

  reasoning        TEXT,
  audit_trail      JSONB DEFAULT '{}',
  warnings         JSONB DEFAULT '[]',
  verdict          VARCHAR(20) NOT NULL CHECK (verdict IN ('BET','SKIP')),
  should_bet       BOOLEAN NOT NULL DEFAULT false,
  skip_reason      TEXT,
  data_quality     JSONB DEFAULT '{}',

  actual_cards     INT,
  home_cards_actual INT,
  away_cards_actual INT,
  result           VARCHAR(10) CHECK (result IN ('WIN','LOSS',NULL)),
  reconciled_at    TIMESTAMP WITH TIME ZONE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (match_date, home_team, away_team)
);

-- ── TEAM STATS CACHE ─────────────────────────────────────────────
CREATE TABLE team_stats_cache (
  team_name              VARCHAR(150) NOT NULL,
  league                 VARCHAR(100) NOT NULL,
  avg_cards_per_game     DECIMAL(4,2),
  last5_cards_given      JSONB DEFAULT '[]',
  season_total_cards     INT,
  matches_played         INT,
  suspended_players      JSONB DEFAULT '[]',
  players_near_suspension JSONB DEFAULT '[]',
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (team_name, league)
);

-- ── REFEREE CACHE ─────────────────────────────────────────────────
CREATE TABLE referee_cache (
  referee_name       VARCHAR(150) PRIMARY KEY,
  avg_cards_per_game DECIMAL(4,2),
  games_this_season  INT DEFAULT 0,
  last10_games_cards JSONB DEFAULT '[]',
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── REFEREE MATCH CACHE (confirmed officials per fixture) ─────────
CREATE TABLE referee_match_cache (
  id               SERIAL PRIMARY KEY,
  cache_key        VARCHAR(200) NOT NULL UNIQUE,
  home_team        VARCHAR(150),
  away_team        VARCHAR(150),
  league           VARCHAR(100),
  match_date       DATE,
  referee_name     VARCHAR(150),
  ref_avg_cards    DECIMAL(4,2),
  ref_last10_cards JSONB DEFAULT '[]',
  ref_games_season INT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── ODDS CACHE (opening vs current for movement tracking) ─────────
CREATE TABLE odds_cache (
  id              SERIAL PRIMARY KEY,
  cache_key       VARCHAR(200) NOT NULL UNIQUE,
  home_team       VARCHAR(150),
  away_team       VARCHAR(150),
  match_date      DATE,
  league          VARCHAR(100),
  opening_over25  DECIMAL(5,2),
  opening_over35  DECIMAL(5,2),
  opening_over45  DECIMAL(5,2),
  current_over25  DECIMAL(5,2),
  current_over35  DECIMAL(5,2),
  current_over45  DECIMAL(5,2),
  movement_over35 DECIMAL(5,3),
  movement_signal VARCHAR(30),
  bookmaker       VARCHAR(50),
  fetch_time      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── RECONCILIATION LOG ────────────────────────────────────────────
CREATE TABLE reconciliation_log (
  id               SERIAL PRIMARY KEY,
  log_date         DATE NOT NULL UNIQUE,
  total_predictions INT DEFAULT 0,
  wins             INT DEFAULT 0,
  losses           INT DEFAULT 0,
  win_rate_pct     DECIMAL(5,2),
  errors           JSONB DEFAULT '[]',
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── LEARNING LOG (Claude self-learning insights) ──────────────────
CREATE TABLE learning_log (
  id          SERIAL PRIMARY KEY,
  log_date    DATE NOT NULL,
  insights    JSONB,
  sample_size INT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────────
CREATE INDEX idx_pred_date      ON predictions (match_date);
CREATE INDEX idx_pred_league    ON predictions (league);
CREATE INDEX idx_pred_verdict   ON predictions (verdict);
CREATE INDEX idx_pred_result    ON predictions (result);
CREATE INDEX idx_team_cache     ON team_stats_cache (team_name, league);
CREATE INDEX idx_ref_cache      ON referee_cache (referee_name);
CREATE INDEX idx_ref_match      ON referee_match_cache (cache_key);
CREATE INDEX idx_odds_date      ON odds_cache (match_date);

-- ── STATS VIEW ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW prediction_stats AS
SELECT
  match_date,
  league,
  COUNT(*) FILTER (WHERE verdict = 'BET')  AS total_bets,
  COUNT(*) FILTER (WHERE result = 'WIN')   AS wins,
  COUNT(*) FILTER (WHERE result = 'LOSS')  AS losses,
  COUNT(*) FILTER (WHERE verdict = 'SKIP') AS skipped,
  ROUND(
    COUNT(*) FILTER (WHERE result = 'WIN')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE result IS NOT NULL), 0) * 100, 1
  ) AS win_rate_pct,
  ROUND(AVG(confidence)::numeric, 1)       AS avg_confidence,
  ROUND(AVG(actual_cards)::numeric, 1)     AS avg_actual_cards
FROM predictions
GROUP BY match_date, league
ORDER BY match_date DESC, league;

-- ================================================================
-- Run: psql $DATABASE_URL < schema.sql
-- ================================================================
