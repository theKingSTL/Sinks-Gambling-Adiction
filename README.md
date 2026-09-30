# Sinks

Sinks is a social NBA betting app that uses **play money only**. It has live scores, stats and lines. You build parlays with fake money, post them, and friends can tail them with one tap.

> No deposits, no withdrawals, no cash value. Every account starts with $1,000 in play money.

## What it does

- **Live NBA data:** scoreboard for any day, live scores and clock (refreshes every 20 seconds during games), box scores, team stats and leaders. Data comes from ESPN's public API, which needs no key.
- **Real lines when they exist:** moneyline, spread and total for every game that hasn't tipped off. The order of preference is:
  1. Sportsbook odds from ESPN's feed (DraftKings / ESPN BET when posted).
  2. [The Odds API](https://the-odds-api.com), if you set `ODDS_API_KEY`.
  3. A **house line** for anything no book has posted, such as most preseason games. It predicts each team's score from last season's scoring for and against, adds home-court advantage, and applies standard vig. Every line is labeled with its source.
- **Correct bet math:** straight bets and parlays of 2 to 10 legs, one pick per game.
  - Payouts use exact fractions, so a 10-leg parlay never drifts by a cent.
  - A losing leg loses the parlay immediately.
  - A pushed leg drops out and the parlay is re-priced over the remaining legs. If every leg pushes, the stake is refunded.
  - A postponed game that never finishes is voided after 48 hours.
- **Line integrity:** your bet locks at the line you saw. If the line moved or the game tipped off, the bet is rejected and your slip updates to the new numbers.
- **Social:** post a bet with a caption, follow friends, and read a Following or Everyone feed. **Tail** any open post: it loads the same picks at *current* lines with your own stake. Posts show a tail count, profiles show record, profit and ROI, and there's a leaderboard.
- **Busted?** When your balance is under $10, you can reset it to $1,000 once per day.

## Run it

```bash
npm install
cp .env.example .env.local   # optional keys
npm run dev                  # http://localhost:3000
```

A SQLite database is created and migrated automatically at `data/sinks.db` on first run.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit and integration tests (Vitest, in-memory SQLite) |
| `npm run typecheck` | Route types plus `tsc` |
| `npm run lint` | ESLint |
| `npm run ci` | lint, then typecheck, then test, then build |
| `npm run db:generate` | Create a migration after editing `src/lib/db/schema.ts` |

## Settlement

Open bets are graded automatically once their games go final. Page loads trigger a throttled settlement pass. For a guaranteed schedule, call the cron endpoint every few minutes:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/settle
```

Settlement is idempotent: each payout is guarded on the bet still being open, so running it twice (or at the same time) never pays twice.

## Stack and layout

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript (strict) · Tailwind v4 · Drizzle ORM + SQLite (better-sqlite3) · Zod · bcrypt · Vitest.

```
src/lib/betting/   odds math, grading, house-line model (pure, fully tested)
src/lib/nba/       ESPN + Odds API clients, parsers, market builder
src/lib/bets/      place / settle / reset (transactional)
src/lib/social/    posts, follows, feed, stats, leaderboard
src/lib/auth/      password auth, hashed session tokens
src/app/           pages + server actions
src/components/    UI (bet slip, game cards, tickets, posts)
docs/plans/        product requirements
```

## Security notes

- Passwords are hashed with bcrypt (cost 12). Session tokens are random 256-bit values, stored only as SHA-256 hashes, in `httpOnly`, `SameSite=Lax` cookies.
- Server Actions check the request origin, and all input is validated with Zod.
- Login, sign-up and betting are rate limited. The limiter is in memory, so swap in Redis before running more than one instance.
- Balance changes are atomic and written to an append-only ledger.
