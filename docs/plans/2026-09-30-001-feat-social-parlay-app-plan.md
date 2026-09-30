---
title: Sinks Social Parlays - Plan
date: 2026-09-30
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
---

# Sinks Social Parlays - Plan

## Goal Capsule

- **Objective:** A social sports-betting app for the NBA. It pulls live game data, offers bettable lines, settles fake-money bets with real sportsbook math, and lets users post parlays that friends can tail.
- **Product authority:** Repo owner. They asked for the build to proceed on defaults, with no question rounds (`session-settled: user said "do it all now"`).
- **Open blockers:** None. Real sportsbook odds are unavailable for most preseason games, so a transparent fallback line model covers the gap (see R4).

## Product Contract

### Problem

Friends who bet on the NBA share their slips as screenshots in group chats. You can't bet along from a screenshot, it doesn't carry live stats, and there's no shared record of who is actually good. This app puts the stats, the slip and the social layer in one place, with no real money at risk.

### Actors

- **Bettor:** signs up, gets a play-money bankroll, builds bets and parlays, and follows friends.
- **Tailer:** sees a posted parlay and joins it with their own stake.

### Requirements

- **R1 Live NBA data:** Scoreboard for today plus upcoming days with live scores, game status, clock and period. Game detail shows team records, box score and leaders whenever the source has them.
- **R2 Markets:** Every game that hasn't started offers moneyline, point spread and game total (over/under), in American odds.
- **R3 Real odds first:** Use sportsbook odds from the live data source when it has them. An optional The Odds API key adds a second real source.
- **R4 Transparent fallback:** When no book has posted a line, generate a "house line" from team scoring data with standard vig. Every line shows its source.
- **R5 Fake money only:** Each account starts with a $1,000 play-money balance. No deposits, withdrawals or cash value, and the UI says so. When a balance drops below $10, the user can reset it to $1,000 once per day.
- **R6 Correct bet math:** Straight bets and parlays of 2 to 10 legs, at most one leg per game. Payouts follow standard American-odds math (parlay = product of decimal odds). A win pays stake × decimal odds. A push drops that leg from the parlay. A parlay where every leg pushes is refunded. Any losing leg loses the parlay.
- **R7 Line integrity:** Bets lock at the line shown to the user. If the line moved or the game started before submission, the bet is rejected and the new line is shown. Stakes can't exceed the balance.
- **R8 Settlement:** Once games go final, open bets are graded automatically and idempotently: no double payouts, even when settlement runs concurrently.
- **R9 Social:** Users follow other users. Posting a placed bet puts it in a feed with a caption. Anyone can tail a posted bet at current lines with their own stake. Posts show tail count and outcome.
- **R10 Profiles and leaderboard:** Profile shows record (W-L-P), profit and ROI. A leaderboard ranks users by profit.

### Scope Boundaries

- **In:** NBA only; pregame markets; web app; username + password accounts.
- **Out (for now):** in-play betting, player props (no free prop source), real money, other leagues, comments/DMs, push notifications.

### Success Criteria

- A new user can sign up, place a 3-leg parlay, post it, and have a second user tail it in under two minutes.
- Unit tests cover odds conversion, parlay pricing, leg grading and parlay settlement, including push and all-push cases.
- Betting keeps working when the data source has no odds (fallback lines), and every line shows its source.

### Key Decisions

- ESPN's public site API supplies scores and stats because it needs no key. Line priority is ESPN → The Odds API (optional) → house model.
- Money is stored as integer cents and odds as integers, so rounding stays deterministic.
- Tailing copies the legs but re-prices them at current lines, because the original odds may have moved.
