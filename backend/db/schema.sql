-- ============================================
-- MKEKA BOT - PostgreSQL Schema
-- Yellow Cards Prediction System
-- ============================================

-- ENUMS
CREATE TYPE prediction_status AS ENUM ('pending', 'confirmed', 'skipped');
CREATE TYPE bet_result AS ENUM ('win', 'loss', 'void', 'pending');
CREATE TYPE card_market AS ENUM ('under_2.5', 'under_3.5', 'under_4.5', 'under_5.5', 'over_2.5', 'over_3.5', 'over_4.5', 'over_5.5');

-- ============================================
-- LEAGUES
-- ============================================
CREATE TABLE leagues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  api_id VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  avg_cards_per_game DECIMAL(4,2),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO leagues (name, country, api_id, is_active) VALUES
  ('Premier League', 'England', 'EPL', true),
  ('Bundesliga', 'Germany', 'BL1', true),
  ('La Liga', 'Spain', 'PD', true),
  ('Serie A', 'Italy', 'SA', true),
  ('Ligue 1', 'France', 'FL1', true);

-- ============================================
-- REFEREES
-- ============================================
CREATE TABLE referees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(100),
  avg_cards_per_game DECIMAL(4,2) DEFAULT 0,
  avg_yellow_per_game DECIMAL(4,2) DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  last_5_games_cards INTEGER[] DEFAULT '{}',
  profile_url TEXT,
  scraped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TEAMS
-- ============================================
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  league_id INTEGER REFERENCES leagues(id),
  avg_yellow_cards_home DECIMAL(4,2) DEFAULT 0,
  avg_yellow_cards_away DECIMAL(4,2) DEFAULT 0,
  avg_yellow_cards_overall DECIMAL(4,2) DEFAULT 0,
  discipline_rating INTEGER DEFAULT 50, -- 0-100, higher = more cards
  last_5_cards INTEGER[] DEFAULT '{}',
  scraped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- FIXTURES (Today's Matches)
-- ============================================
CREATE TABLE fixtures (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(100) UNIQUE,
  league_id INTEGER REFERENCES leagues(id),
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  referee_id INTEGER REFERENCES referees(id),
  match_date TIMESTAMP NOT NULL,
  venue VARCHAR(200),
  is_derby BOOLEAN DEFAULT false,
  match_importance INTEGER DEFAULT 50, -- 0-100
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, live, finished
  home_score INTEGER,
  away_score INTEGER,
  actual_yellow_cards INTEGER,
  actual_red_cards INTEGER,
  actual_total_cards INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- H2H HISTORY
-- ============================================
CREATE TABLE h2h_history (
  id SERIAL PRIMARY KEY,
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  match_date TIMESTAMP,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  total_cards INTEGER DEFAULT 0,
  referee_id INTEGER REFERENCES referees(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PREDICTIONS (Bot's Picks)
-- ============================================
CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id) ON DELETE CASCADE,
  
  -- Bot's Decision
  should_bet BOOLEAN NOT NULL,
  market card_market,              -- e.g., 'under_3.5'
  confidence_score INTEGER,        -- 0-100
  skip_reason TEXT,                -- Why bot said no
  
  -- Analysis Data Snapshot
  referee_avg_cards DECIMAL(4,2),
  home_team_avg_cards DECIMAL(4,2),
  away_team_avg_cards DECIMAL(4,2),
  h2h_avg_cards DECIMAL(4,2),
  is_derby BOOLEAN,
  league_avg_cards DECIMAL(4,2),
  
  -- Claude's Full Reasoning
  claude_reasoning TEXT,
  raw_analysis JSONB,              -- Full JSON from Claude
  
  -- User Action
  user_status prediction_status DEFAULT 'pending',
  user_confirmed_at TIMESTAMP,
  odds_placed DECIMAL(6,2),
  stake_amount DECIMAL(10,2),
  
  -- Result (filled end of day)
  actual_cards INTEGER,
  bet_result bet_result DEFAULT 'pending',
  profit_loss DECIMAL(10,2),
  
  -- BetTrack sync
  bettrack_id VARCHAR(100),
  synced_to_bettrack BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- MODEL WEIGHTS (Self-Learning)
-- ============================================
CREATE TABLE model_weights (
  id SERIAL PRIMARY KEY,
  version INTEGER DEFAULT 1,
  
  -- Feature weights (must sum = 1.0)
  referee_weight DECIMAL(4,3) DEFAULT 0.350,
  home_team_weight DECIMAL(4,3) DEFAULT 0.180,
  away_team_weight DECIMAL(4,3) DEFAULT 0.180,
  h2h_weight DECIMAL(4,3) DEFAULT 0.150,
  derby_weight DECIMAL(4,3) DEFAULT 0.080,
  league_avg_weight DECIMAL(4,3) DEFAULT 0.060,
  
  -- Performance at this version
  total_predictions INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0,
  
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial weights
INSERT INTO model_weights (version, is_current) VALUES (1, true);

-- ============================================
-- DAILY PERFORMANCE LOG
-- ============================================
CREATE TABLE daily_performance (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  total_predictions INTEGER DEFAULT 0,
  bets_placed INTEGER DEFAULT 0,
  bets_won INTEGER DEFAULT 0,
  bets_lost INTEGER DEFAULT 0,
  bets_void INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  profit_loss DECIMAL(10,2) DEFAULT 0,
  avg_confidence INTEGER,
  model_version INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SCRAPE LOGS
-- ============================================
CREATE TABLE scrape_logs (
  id SERIAL PRIMARY KEY,
  scrape_type VARCHAR(50), -- 'fixtures', 'referee_stats', 'team_stats', 'results'
  status VARCHAR(20), -- 'success', 'failed', 'partial'
  records_fetched INTEGER DEFAULT 0,
  error_message TEXT,
  apify_run_id VARCHAR(100),
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_fixtures_date ON fixtures(match_date);
CREATE INDEX idx_predictions_fixture ON predictions(fixture_id);
CREATE INDEX idx_predictions_date ON predictions(created_at);
CREATE INDEX idx_predictions_result ON predictions(bet_result);
CREATE INDEX idx_h2h_teams ON h2h_history(home_team_id, away_team_id);

-- ============================================
-- VIEWS
-- ============================================

-- Today's Picks View
CREATE VIEW today_picks AS
SELECT 
  p.id,
  p.confidence_score,
  p.market,
  p.should_bet,
  p.claude_reasoning,
  p.user_status,
  p.odds_placed,
  p.stake_amount,
  f.match_date,
  f.is_derby,
  f.actual_total_cards,
  ht.name AS home_team,
  at.name AS away_team,
  r.name AS referee,
  r.avg_cards_per_game AS referee_avg,
  l.name AS league,
  p.bet_result
FROM predictions p
JOIN fixtures f ON p.fixture_id = f.id
JOIN teams ht ON f.home_team_id = ht.id
JOIN teams at ON f.away_team_id = at.id
LEFT JOIN referees r ON f.referee_id = r.id
JOIN leagues l ON f.league_id = l.id
WHERE DATE(f.match_date) = CURRENT_DATE
ORDER BY p.confidence_score DESC;

-- Model Accuracy View (rolling 30 days)
CREATE VIEW model_accuracy_30d AS
SELECT
  COUNT(*) AS total_bets,
  SUM(CASE WHEN bet_result = 'win' THEN 1 ELSE 0 END) AS wins,
  ROUND(
    SUM(CASE WHEN bet_result = 'win' THEN 1 ELSE 0 END)::DECIMAL / 
    NULLIF(COUNT(CASE WHEN bet_result IN ('win','loss') THEN 1 END), 0) * 100, 
    2
  ) AS accuracy,
  SUM(profit_loss) AS total_pl
FROM predictions
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND bet_result IN ('win', 'loss');
