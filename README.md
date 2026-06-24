# ⚡ MkekaBOT — Yellow Cards Intelligence System

> AI-powered football yellow cards betting analysis. Built for professional bettors.

---

## 🏗️ Architecture

```
Apify (Web Scraping)
  ↓ FlashScore | FootyStats | WhoScored
Node.js Backend (Processing)
  ↓ Scoring Engine + Claude AI Brain
PostgreSQL (Memory + Learning)
  ↓ Predictions | Weights | History
Next.js Dashboard (Your Interface)
  ↓ Today's Picks | Analytics | Results
```

---

## 🧠 How The Bot Thinks

Every morning the bot:
1. **Fetches** today's fixtures from FlashScore
2. **Scrapes** referee stats (most important factor!)
3. **Scrapes** team card discipline data
4. **Scrapes** H2H history
5. **Sends** all data to Claude AI for analysis
6. **Claude decides**: Should I bet? Which line? Over or Under?
7. **Displays** picks on your dashboard with confidence scores

Every evening:
1. **Fetches** actual match results
2. **Compares** predictions vs reality
3. **Claude analyzes** errors and patterns
4. **Adjusts** model weights automatically
5. **Bot gets smarter** every single day

---

## 🚀 Setup Guide

### 1. Clone & Install
```bash
git clone <your-repo>
cd mkeka-bot
npm install
```

### 2. Database Setup
```bash
# Create PostgreSQL database
createdb mkeka_bot

# Run schema
psql mkeka_bot < schema.sql
```

### 3. Environment Variables
```bash
cp .env.example .env.local
# Fill in:
# DATABASE_URL
# ANTHROPIC_API_KEY (from console.anthropic.com)
# APIFY_API_TOKEN (from console.apify.com)
```

### 4. Apify Actors Setup
In your Apify console, you'll need:
- FlashScore scraper (for fixtures + results)
- FootyStats scraper (for team card stats)
- WhoScored scraper (for referee stats)

You can use the ready-made actors or modify the pageFunction in `lib/apify.js`.

### 5. Run Development
```bash
npm run dev
# Dashboard: http://localhost:3000
```

### 6. Start Cron Jobs (Production)
```bash
RUN_CRON=true node lib/cron.js
```

---

## 📊 Bot Decision Logic

### Yellow Cards — The Formula

| Factor | Weight | What Bot Checks |
|--------|--------|-----------------|
| **Referee** | 35% | Avg cards/game, strictness rating |
| **Home Team** | 20% | Avg yellows at home, fouls/game |
| **Away Team** | 20% | Avg yellows away, fouls/game |
| **Derby/Rivalry** | 15% | Known derby matchups |
| **H2H History** | 10% | Avg cards in last 10 meetings |

### When Bot Bets:
- Confidence score ≥ 65%
- Referee has 5+ games of data
- Both teams have 5+ games of data
- Clear signal in one direction

### Lines Bot Can Recommend:
- UNDER 2.5 (very lenient referee + both disciplined)
- UNDER 3.5 (lenient-medium referee)  
- UNDER 4.5 (default medium referee, clean teams)
- OVER 4.5 (strict referee OR derby)
- OVER 5.5 (very strict referee AND derby)

---

## 🔄 Daily Workflow

```
06:00 AM → Bot runs morning scan automatically
08:30 AM → You open dashboard, review picks
09:00 AM → You place bets on picks you like
[Games play...]
11:00 PM → Bot runs reconciliation
11:30 PM → Check results on dashboard
           → Enter actual card counts for any manual reconcile
```

---

## 🎯 Leagues Covered
- 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League (England)
- 🇪🇸 La Liga (Spain)
- 🇩🇪 Bundesliga (Germany)
- 🇮🇹 Serie A (Italy)
- 🇫🇷 Ligue 1 (France)

---

## 📈 Self-Learning System

The bot tracks every prediction and outcome. After each day:
- Claude analyzes which factors predicted correctly
- Model weights adjust automatically (±0.05 max per day)
- After 2-3 weeks, bot accuracy improves significantly

Target: **70%+ win rate** within 3 weeks

---

## 🔗 BetTrack Integration

To send confirmed bets to BetTrack automatically:
```env
BETTRACK_API_URL=http://localhost:3001
BETTRACK_API_KEY=your_key
```

When you confirm a bet in MkekaBOT, it auto-logs to BetTrack for P&L tracking.

---

## 📁 Project Structure

```
mkeka-bot/
├── app/
│   ├── page.js              # Main dashboard
│   ├── layout.js            # App layout
│   ├── globals.css          # All styles
│   └── api/
│       ├── analyze/         # Trigger analysis + get picks
│       ├── reconcile/       # Enter results + auto-reconcile
│       └── stats/           # Performance data
├── lib/
│   ├── db.js               # PostgreSQL connection
│   ├── apify.js            # Web scraping engine
│   ├── claude.js           # AI brain (THE MAIN ENGINE)
│   ├── scorer.js           # Data processing + DB ops
│   └── cron.js             # Scheduled jobs
├── schema.sql              # Full database schema
├── package.json
└── .env.example
```

---

## ⚠️ Responsible Betting

This system is a **decision support tool**. Always:
- Set a betting budget and stick to it
- Use Kelly Criterion for stake sizing (built into BetTrack)
- Never bet more than 3-5% of bankroll per bet
- Paper bet for 2 weeks before real money

---

*MkekaBOT — Built for Dar es Salaam, powered by AI*
