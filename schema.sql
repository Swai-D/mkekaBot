-- ================================================================
-- MKEKA BOT — PostgreSQL Unified Schema (v3.3 & v3.4 Hybrid)
-- Resolves conflicts between legacy normalized schemas and newer flat models
-- ================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- 1. LEAGUES
-- ================================================================
CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(100),
  apify_id VARCHAR(100),
  active BOOLEAN DEFAULT true,
  avg_cards_per_game DECIMAL(4,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial leagues if they don't exist
INSERT INTO leagues (name, country, apify_id) 
VALUES
  ('Premier League', 'England', 'epl'),
  ('La Liga', 'Spain', 'laliga'),
  ('Bundesliga', 'Germany', 'bundesliga'),
  ('Serie A', 'Italy', 'seriea'),
  ('Ligue 1', 'France', 'ligue1')
ON CONFLICT DO NOTHING;

-- ================================================================
-- 2. REFEREES
-- ================================================================
CREATE TABLE IF NOT EXISTS referees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  league_id INT REFERENCES leagues(id),
  avg_cards_per_game DECIMAL(4,2) DEFAULT 0,
  avg_yellows_per_game DECIMAL(4,2) DEFAULT 0,
  avg_reds_per_game DECIMAL(4,2) DEFAULT 0,
  total_games INT DEFAULT 0,
  strictness_rating VARCHAR(20) DEFAULT 'medium', -- low, medium, high, very_high
  last_updated TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- 3. TEAMS
-- ================================================================
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  league_id INT REFERENCES leagues(id),
  apify_id VARCHAR(100),
  avg_cards_home DECIMAL(4,2) DEFAULT 0,
  avg_cards_away DECIMAL(4,2) DEFAULT 0,
  avg_yellows_per_game DECIMAL(4,2) DEFAULT 0,
  fouls_per_game DECIMAL(4,2) DEFAULT 0,
  last_5_cards JSONB DEFAULT '[]', -- array of card counts last 5 games
  is_aggressive BOOLEAN DEFAULT false,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- 4. FIXTURES
-- ================================================================
CREATE TABLE IF NOT EXISTS fixtures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id INT REFERENCES leagues(id),
  home_team_id INT REFERENCES teams(id),
  away_team_id INT REFERENCES teams(id),
  referee_id INT REFERENCES referees(id),
  match_date TIMESTAMP NOT NULL,
  match_date_local DATE GENERATED ALWAYS AS (DATE(match_date)) STORED,
  venue VARCHAR(200),
  is_derby BOOLEAN DEFAULT false,
  is_cup BOOLEAN DEFAULT false,
  match_importance VARCHAR(20) DEFAULT 'normal', -- low, normal, high, critical
  status VARCHAR(30) DEFAULT 'scheduled', -- scheduled, live, finished, cancelled
  actual_home_yellows INT,
  actual_away_yellows INT,
  actual_total_yellows INT,
  actual_reds INT,
  actual_total_cards INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- 5. H2H HISTORY
-- ================================================================
CREATE TABLE IF NOT EXISTS h2h_records (
  id SERIAL PRIMARY KEY,
  home_team_id INT REFERENCES teams(id),
  away_team_id INT REFERENCES teams(id),
  match_date DATE,
  total_cards INT,
  total_yellows INT,
  total_reds INT,
  referee_id INT REFERENCES referees(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- 6. PREDICTIONS (Unified Flat & Normalized Table)
-- Supports both direct (flat) insertions and relational lookups
-- ================================================================
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relational link (Legacy & structural compatibility)
  fixture_id UUID REFERENCES fixtures(id) ON DELETE SET NULL,
  
  -- Flat parameters (Direct insertions from Next.js v3.3 scorer.js)
  match_date DATE NOT NULL DEFAULT CURRENT_DATE,
  league VARCHAR(100) NOT NULL,
  home_team VARCHAR(150) NOT NULL,
  away_team VARCHAR(150) NOT NULL,
  kickoff TIMESTAMP,
  matchday INT,
  referee_name VARCHAR(150),
  
  -- Bot outputs / Decisions
  should_bet BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT, 
  verdict VARCHAR(20),             -- 'BET' or 'SKIP'
  bot_line DECIMAL(4,2),           -- AI estimated line
  davy_line VARCHAR(10),           -- Safety/Betting line (e.g. '2.5', 'SKIP')
  confidence DECIMAL(5,2),         -- Float/percentage
  market_odds DECIMAL(6,2),        -- Current over line odds
  opening_odds DECIMAL(6,2),
  current_odds DECIMAL(6,2),

  -- Legacy outputs for joins
  predicted_line DECIMAL(4,2),
  predicted_direction VARCHAR(10),
  predicted_total_cards DECIMAL(4,2),
  confidence_score INT,
  confidence_label VARCHAR(20),
  
  -- Factor breakdown (Heuristic weights)
  factor_referee INT DEFAULT 0,
  factor_home_discipline INT DEFAULT 0,
  factor_away_discipline INT DEFAULT 0,
  factor_derby INT DEFAULT 0,
  factor_h2h INT DEFAULT 0,
  
  -- Claude / AI Brain output
  reasoning TEXT,
  ai_reasoning TEXT,
  audit_trail JSONB DEFAULT '{}',   -- Analysis logs
  warnings JSONB DEFAULT '[]',
  raw_data_snapshot JSONB,
  
  -- Outcomes & Performance (Reconciliation data)
  actual_cards INT,
  home_cards_actual INT,
  away_cards_actual INT,
  result VARCHAR(20),              -- 'WIN' or 'LOSS'
  outcome VARCHAR(20),             -- WIN, LOSS, PUSH, PENDING
  actual_total_cards INT,
  profit_loss DECIMAL(10,2),
  was_correct BOOLEAN,
  error_magnitude DECIMAL(4,2),
  reconciled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- 7. MODEL WEIGHTS (Self-Learning Core)
-- ================================================================
CREATE TABLE IF NOT EXISTS model_weights (
  id SERIAL PRIMARY KEY,
  weight_name VARCHAR(100) NOT NULL UNIQUE,
  current_value DECIMAL(6,4) NOT NULL,
  initial_value DECIMAL(6,4) NOT NULL,
  min_value DECIMAL(6,4) DEFAULT 0,
  max_value DECIMAL(6,4) DEFAULT 1,
  total_adjustments INT DEFAULT 0,
  last_adjusted TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Seed initial weights
INSERT INTO model_weights (weight_name, current_value, initial_value, notes) VALUES
  ('referee_strictness', 0.35, 0.35, 'Weight for referee avg cards factor'),
  ('home_discipline', 0.20, 0.20, 'Weight for home team card history'),
  ('away_discipline', 0.20, 0.20, 'Weight for away team card history'),
  ('derby_flag', 0.15, 0.15, 'Weight for derby/rivalry matches'),
  ('h2h_history', 0.10, 0.10, 'Weight for head-to-head card history'),
  ('confidence_threshold', 0.65, 0.65, 'Minimum confidence to recommend betting'),
  ('min_data_games', 5.00, 5.00, 'Minimum games needed for reliable stats')
ON CONFLICT (weight_name) DO NOTHING;

-- ================================================================
-- 8. PERFORMANCE & LEARNING CACHES
-- ================================================================

-- Team Stats Cache (avoid scraping historical stats repeatedly)
CREATE TABLE IF NOT EXISTS team_stats_cache (
  team_name VARCHAR(150) NOT NULL,
  league VARCHAR(100) NOT NULL,
  last5_cards_given JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (team_name, league)
);

-- Referee Cache (consistency profiling)
CREATE TABLE IF NOT EXISTS referee_cache (
  referee_name VARCHAR(150) PRIMARY KEY,
  last10_games_cards JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily Performance Logs
CREATE TABLE IF NOT EXISTS daily_performance (
  id SERIAL PRIMARY KEY,
  summary_date DATE UNIQUE NOT NULL,
  total_predictions INT DEFAULT 0,
  bets_placed INT DEFAULT 0,
  bets_skipped INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  pushes INT DEFAULT 0,
  win_rate DECIMAL(5,2) DEFAULT 0,
  avg_confidence DECIMAL(5,2) DEFAULT 0,
  total_profit_loss DECIMAL(10,2) DEFAULT 0,
  model_version VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reconciliation logs
CREATE TABLE IF NOT EXISTS reconciliation_log (
  id SERIAL PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  total_predictions INT,
  wins INT,
  losses INT,
  win_rate_pct DECIMAL(5,2),
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Learning Logs (Feedback loops)
CREATE TABLE IF NOT EXISTS learning_log (
  id SERIAL PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  insights JSONB,
  sample_size INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Activity log
CREATE TABLE IF NOT EXISTS bot_logs (
  id SERIAL PRIMARY KEY,
  log_date TIMESTAMP DEFAULT NOW(),
  log_type VARCHAR(50), -- SCRAPE, ANALYSIS, RECONCILE, WEIGHT_UPDATE, ERROR
  message TEXT,
  data JSONB,
  success BOOLEAN DEFAULT true,
  duration_ms INT
);

-- ================================================================
-- 9. PERFORMANCE INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures(match_date_local);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(match_date);
CREATE INDEX IF NOT EXISTS idx_predictions_verdict ON predictions(verdict);
CREATE INDEX IF NOT EXISTS idx_predictions_result ON predictions(result);
CREATE INDEX IF NOT EXISTS idx_h2h_teams ON h2h_records(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_date ON bot_logs(log_date);

-- ================================================================
-- 10. COMPATIBILITY VIEWS
-- ================================================================

-- Today's Picks View (Works for both normalized structures and flat queries)
CREATE OR REPLACE VIEW v_todays_picks AS
SELECT
  p.id as prediction_id,
  p.match_date,
  p.league,
  p.home_team,
  p.away_team,
  COALESCE(p.referee_name, 'TBC') as referee,
  p.should_bet,
  p.bot_line,
  p.davy_line,
  p.confidence,
  p.market_odds,
  p.reasoning,
  p.audit_trail,
  p.verdict,
  p.result,
  p.actual_cards
FROM predictions p
WHERE p.match_date = CURRENT_DATE;

-- Model Performance over time
CREATE OR REPLACE VIEW v_model_performance AS
SELECT
  match_date as date,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE verdict = 'BET') as bets_recommended,
  COUNT(*) FILTER (WHERE result = 'WIN') as correct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'WIN') / NULLIF(COUNT(*) FILTER (WHERE result IS NOT NULL), 0), 2) as accuracy_pct,
  ROUND(AVG(confidence), 1) as avg_confidence,
  SUM(profit_loss) as total_pnl
FROM predictions
WHERE result IS NOT NULL
GROUP BY match_date
ORDER BY date DESC;
