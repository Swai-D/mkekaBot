-- ================================================================
-- MKEKA BOT — PostgreSQL Schema
-- Yellow Cards Betting Analysis System
-- ================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- LEAGUES
-- ================================================================
CREATE TABLE leagues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(100),
  apify_id VARCHAR(100),
  active BOOLEAN DEFAULT true,
  avg_cards_per_game DECIMAL(4,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO leagues (name, country, apify_id) VALUES
  ('Premier League', 'England', 'epl'),
  ('La Liga', 'Spain', 'laliga'),
  ('Bundesliga', 'Germany', 'bundesliga'),
  ('Serie A', 'Italy', 'seriea'),
  ('Ligue 1', 'France', 'ligue1');

-- ================================================================
-- REFEREES
-- ================================================================
CREATE TABLE referees (
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
-- TEAMS
-- ================================================================
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  league_id INT REFERENCES leagues(id),
  apify_id VARCHAR(100),
  -- Cards discipline
  avg_cards_home DECIMAL(4,2) DEFAULT 0,
  avg_cards_away DECIMAL(4,2) DEFAULT 0,
  avg_yellows_per_game DECIMAL(4,2) DEFAULT 0,
  fouls_per_game DECIMAL(4,2) DEFAULT 0,
  -- Form
  last_5_cards JSONB DEFAULT '[]', -- array of card counts last 5 games
  is_aggressive BOOLEAN DEFAULT false,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- FIXTURES
-- ================================================================
CREATE TABLE fixtures (
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
  -- Actual results (filled after game)
  actual_home_yellows INT,
  actual_away_yellows INT,
  actual_total_yellows INT,
  actual_reds INT,
  actual_total_cards INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- H2H HISTORY
-- ================================================================
CREATE TABLE h2h_records (
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
-- PREDICTIONS (Bot Output)
-- ================================================================
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fixture_id UUID REFERENCES fixtures(id),
  prediction_date TIMESTAMP DEFAULT NOW(),

  -- What the bot decided
  should_bet BOOLEAN NOT NULL,
  skip_reason TEXT, -- if should_bet = false, why?

  -- Cards prediction
  predicted_line DECIMAL(4,2), -- e.g. 3.5, 4.5
  predicted_direction VARCHAR(10), -- OVER or UNDER
  predicted_total_cards DECIMAL(4,2), -- bot's estimated total

  -- Confidence
  confidence_score INT CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_label VARCHAR(20), -- LOW, MEDIUM, HIGH, VERY_HIGH

  -- Factor breakdown (what drove the decision)
  factor_referee INT DEFAULT 0,       -- contribution 0-35
  factor_home_discipline INT DEFAULT 0, -- contribution 0-20
  factor_away_discipline INT DEFAULT 0, -- contribution 0-20
  factor_derby INT DEFAULT 0,           -- contribution 0-15
  factor_h2h INT DEFAULT 0,             -- contribution 0-10

  -- Claude's reasoning
  ai_reasoning TEXT,
  raw_data_snapshot JSONB, -- full data snapshot used for this prediction

  -- Post-match outcome
  outcome VARCHAR(20), -- WIN, LOSS, PUSH, PENDING
  actual_total_cards INT,
  profit_loss DECIMAL(10,2),

  -- Self-learning
  was_correct BOOLEAN,
  error_magnitude DECIMAL(4,2), -- how far off the prediction was

  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- MODEL WEIGHTS (Self-Learning)
-- ================================================================
CREATE TABLE model_weights (
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

-- Initial weights
INSERT INTO model_weights (weight_name, current_value, initial_value, notes) VALUES
  ('referee_strictness', 0.35, 0.35, 'Weight for referee avg cards factor'),
  ('home_discipline', 0.20, 0.20, 'Weight for home team card history'),
  ('away_discipline', 0.20, 0.20, 'Weight for away team card history'),
  ('derby_flag', 0.15, 0.15, 'Weight for derby/rivalry matches'),
  ('h2h_history', 0.10, 0.10, 'Weight for head-to-head card history'),
  ('confidence_threshold', 0.65, 0.65, 'Minimum confidence to recommend betting'),
  ('min_data_games', 5.00, 5.00, 'Minimum games needed for reliable stats');

-- ================================================================
-- DAILY PERFORMANCE SUMMARY
-- ================================================================
CREATE TABLE daily_performance (
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

-- ================================================================
-- BOT ACTIVITY LOGS
-- ================================================================
CREATE TABLE bot_logs (
  id SERIAL PRIMARY KEY,
  log_date TIMESTAMP DEFAULT NOW(),
  log_type VARCHAR(50), -- SCRAPE, ANALYSIS, RECONCILE, WEIGHT_UPDATE, ERROR
  message TEXT,
  data JSONB,
  success BOOLEAN DEFAULT true,
  duration_ms INT
);

-- ================================================================
-- INDEXES for performance
-- ================================================================
CREATE INDEX idx_fixtures_date ON fixtures(match_date_local);
CREATE INDEX idx_fixtures_status ON fixtures(status);
CREATE INDEX idx_predictions_fixture ON predictions(fixture_id);
CREATE INDEX idx_predictions_date ON predictions(prediction_date);
CREATE INDEX idx_predictions_outcome ON predictions(outcome);
CREATE INDEX idx_h2h_teams ON h2h_records(home_team_id, away_team_id);
CREATE INDEX idx_bot_logs_date ON bot_logs(log_date);

-- ================================================================
-- VIEWS
-- ================================================================

-- Today's picks view
CREATE VIEW v_todays_picks AS
SELECT
  p.id as prediction_id,
  f.match_date,
  hl.name as league,
  ht.name as home_team,
  at.name as away_team,
  COALESCE(r.name, 'TBC') as referee,
  COALESCE(r.avg_cards_per_game, 0) as referee_avg_cards,
  COALESCE(r.strictness_rating, 'unknown') as referee_strictness,
  p.should_bet,
  p.predicted_line,
  p.predicted_direction,
  p.predicted_total_cards,
  p.confidence_score,
  p.confidence_label,
  p.ai_reasoning,
  p.factor_referee,
  p.factor_home_discipline,
  p.factor_away_discipline,
  p.factor_derby,
  p.factor_h2h,
  f.is_derby,
  f.match_importance,
  p.outcome
FROM predictions p
JOIN fixtures f ON p.fixture_id = f.id
JOIN leagues hl ON f.league_id = hl.id
JOIN teams ht ON f.home_team_id = ht.id
JOIN teams at ON f.away_team_id = at.id
LEFT JOIN referees r ON f.referee_id = r.id;

-- Model performance over time
CREATE VIEW v_model_performance AS
SELECT
  DATE(prediction_date) as date,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE should_bet = true) as bets_recommended,
  COUNT(*) FILTER (WHERE was_correct = true) as correct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE was_correct = true) / NULLIF(COUNT(*) FILTER (WHERE outcome != 'PENDING'), 0), 2) as accuracy_pct,
  ROUND(AVG(confidence_score), 1) as avg_confidence,
  SUM(profit_loss) as total_pnl
FROM predictions
WHERE outcome != 'PENDING'
GROUP BY DATE(prediction_date)
ORDER BY date DESC;
