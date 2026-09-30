import { describe, expect, it } from "vitest";
import scoreboard from "./__fixtures__/scoreboard-final.json";
import ncaafScoreboard from "./__fixtures__/ncaaf-scoreboard.json";
import ncaafStandings from "./__fixtures__/ncaaf-standings.json";
import ncaafSummary from "./__fixtures__/ncaaf-summary.json";
import nflDefault from "./__fixtures__/nfl-scoreboard-default.json";
import summary from "./__fixtures__/summary-final.json";
import { buildMarkets, isBettable, noVigHomeProb, parseSelectionId } from "./markets";
import {
  num,
  parseBookOdds,
  parseCalendar,
  parseScoreboardEvent,
  parseSeasonYear,
  parseStandings,
  parseSummary,
} from "./parse";
import type { Game } from "./types";

describe("parseScoreboardEvent (real ESPN payload)", () => {
  const game = parseScoreboardEvent(scoreboard.events[0], "nba")!;

  it("normalizes teams, scores and status", () => {
    expect(game.id).toMatch(/^\d+$/);
    expect(game.state).toBe("post");
    expect(game.completed).toBe(true);
    expect(game.home.abbr).toBe("PHI");
    expect(game.home.score).toBe(109);
    expect(game.home.record).toBe("45-37");
    expect(game.away.score).toBeTypeOf("number");
  });
});

describe("parseSummary (real ESPN payload)", () => {
  const detail = parseSummary(summary, "nba")!;

  it("reads the game header", () => {
    expect(detail.game.home.abbr).toBe("PHI");
    expect(detail.game.completed).toBe(true);
    expect(detail.game.home.score).toBe(109);
  });

  it("reads the box score", () => {
    expect(detail.box).toHaveLength(2);
    const group = detail.box[0].groups[0];
    expect(group.labels).toContain("PTS");
    expect(group.players.length).toBeGreaterThan(5);
    expect(group.players[0].stats.length).toBe(group.labels.length);
  });

  it("reads leaders", () => {
    expect(detail.leaders.some((l) => l.player === "Tyrese Maxey")).toBe(true);
  });
});

describe("parseBookOdds", () => {
  it("reads the nested close/open format", () => {
    const odds = parseBookOdds([
      {
        provider: { name: "ESPN BET" },
        moneyline: { home: { close: { odds: "-380" } }, away: { close: { odds: "+300" } } },
        pointSpread: { home: { close: { line: "-8.5", odds: "-110" } }, away: { close: { line: "+8.5", odds: "-110" } } },
        total: { over: { close: { line: "o228.5", odds: "-115" } }, under: { close: { line: "u228.5", odds: "-105" } } },
      },
    ]);
    expect(odds).toEqual({
      provider: "ESPN BET",
      homeMoneyline: -380,
      awayMoneyline: 300,
      homeSpread: -8.5,
      homeSpreadPrice: -110,
      awaySpreadPrice: -110,
      total: 228.5,
      overPrice: -115,
      underPrice: -105,
    });
  });

  it("reads the legacy flat format", () => {
    const odds = parseBookOdds([
      { provider: { name: "DraftKings" }, spread: -3, overUnder: 219, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 130 } },
    ]);
    expect(odds?.homeSpread).toBe(-3);
    expect(odds?.total).toBe(219);
    expect(odds?.homeMoneyline).toBe(-150);
    expect(odds?.homeSpreadPrice).toBeNull();
  });

  it("returns null when nothing is posted", () => {
    expect(parseBookOdds(null)).toBeNull();
    expect(parseBookOdds([{ provider: { name: "X" } }])).toBeNull();
  });

  it("parses EVEN and junk", () => {
    expect(num("EVEN")).toBe(100);
    expect(num("n/a")).toBeNull();
  });
});

const futureGame = (over: Partial<Game> = {}): Game => ({
  sport: "nba",
  id: "401",
  startsAt: new Date(Date.now() + 3_600_000).toISOString(),
  state: "pre",
  completed: false,
  statusText: "7:30 PM",
  seasonType: 2,
  home: { id: "1", abbr: "BOS", name: "Boston Celtics", shortName: "Celtics", logo: null, color: null, score: null, record: null, rank: null },
  away: { id: "2", abbr: "NY", name: "New York Knicks", shortName: "Knicks", logo: null, color: null, score: null, record: null, rank: null },
  bookOdds: null,
  ...over,
});

describe("buildMarkets", () => {
  it("falls back to house lines and labels the source", () => {
    const m = buildMarkets(futureGame(), () => undefined);
    expect(m.open).toBe(true);
    expect(m.spread![1].source).toBe("house");
    expect(m.spread![0].line).toBe(-m.spread![1].line!);
    expect(m.total![0].line).toBe(m.total![1].line);
  });

  it("prefers book lines per market and fills gaps with the house", () => {
    const m = buildMarkets(
      futureGame({
        bookOdds: {
          provider: "ESPN BET",
          homeMoneyline: -200,
          awayMoneyline: 170,
          homeSpread: -5.5,
          homeSpreadPrice: -112,
          awaySpreadPrice: -108,
          total: null,
          overPrice: null,
          underPrice: null,
        },
      }),
      () => undefined,
    );
    expect(m.moneyline![1]).toMatchObject({ price: -200, source: "book", provider: "ESPN BET" });
    expect(m.spread![0]).toMatchObject({ line: 5.5, price: -108, label: "NY +5.5" });
    expect(m.total![0].source).toBe("house");
  });

  it("closes markets at tip-off", () => {
    expect(isBettable(futureGame({ state: "in" }))).toBe(false);
    expect(isBettable(futureGame({ startsAt: new Date(Date.now() - 1000).toISOString() }))).toBe(false);
  });
});

describe("parseSelectionId", () => {
  it("round-trips valid ids and rejects bad ones", () => {
    expect(parseSelectionId("nfl:401:spread:home")).toEqual({ sport: "nfl", gameId: "401", market: "spread", side: "home" });
    expect(parseSelectionId("nba:401:total:home")).toBeNull();
    expect(parseSelectionId("nba:401:ml:over")).toBeNull();
    expect(parseSelectionId("nba:x:ml:home")).toBeNull();
    expect(parseSelectionId("nhl:401:ml:home")).toBeNull();
    expect(parseSelectionId("401:ml:home")).toBeNull();
  });
});

describe("college football (real ESPN payloads)", () => {
  const game = parseScoreboardEvent(ncaafScoreboard.events[0], "ncaaf")!;

  it("reads rankings and book odds, including a road favorite", () => {
    expect(game.sport).toBe("ncaaf");
    expect(game.away.rank).toBe(3); // Notre Dame
    expect(game.home.rank).toBeNull(); // unranked (ESPN sends 99)
    expect(game.bookOdds?.homeSpread).toBe(21);
    expect(game.bookOdds?.total).toBe(47.5);
    expect(game.bookOdds?.provider).toBe("Draft Kings");
  });

  it("builds markets and a market-based prediction", () => {
    const m = buildMarkets(game, () => undefined, Date.parse(game.startsAt) - 3_600_000);
    expect(m.spread![0]).toMatchObject({ label: "ND -21", line: -21, source: "book" });
    expect(m.prediction.source).toBe("market");
    expect(m.prediction.homeWinProb).toBeLessThan(0.2);
    expect(m.prediction.awayScore - m.prediction.homeScore).toBeCloseTo(21, 5);
    expect(m.prediction.awayScore + m.prediction.homeScore).toBeCloseTo(47.5, 5);
  });

  it("reads ESPN's matchup predictor", () => {
    const detail = parseSummary(ncaafSummary, "ncaaf")!;
    expect(detail.espnPrediction?.homeWinProb).toBeCloseTo(0.087, 3);
  });

  it("reads nested standings and derives per-game scoring", () => {
    const rows = parseStandings(ncaafStandings);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(r.gamesPlayed).toBeGreaterThan(0);
      expect(r.pointsFor).toBeGreaterThan(5);
      expect(r.pointsFor).toBeLessThan(70);
    }
    expect(new Set(rows.map((r) => r.teamId)).size).toBe(rows.length);
  });
});

describe("football calendar", () => {
  it("lists every regular-season and postseason week", () => {
    const weeks = parseCalendar(nflDefault);
    expect(parseSeasonYear(nflDefault)).toBe(2026);
    expect(weeks.filter((w) => w.seasonType === 2)).toHaveLength(18);
    expect(weeks.some((w) => w.seasonType === 3)).toBe(true);
    expect(weeks.every((w) => Date.parse(w.start) < Date.parse(w.end))).toBe(true);
  });
});

describe("predictions without book odds", () => {
  it("falls back to the model", () => {
    const m = buildMarkets(futureGame(), (id) => (id === "1" ? { pointsFor: 120, pointsAgainst: 108 } : undefined));
    expect(m.prediction.source).toBe("model");
    expect(m.prediction.homeWinProb).toBeGreaterThan(0.5);
    expect(m.prediction.homeScore).toBeGreaterThan(m.prediction.awayScore);
  });

  it("de-vigs the book moneyline", () => {
    expect(noVigHomeProb(-110, -110)).toBeCloseTo(0.5, 6);
    expect(noVigHomeProb(-200, 170)).toBeCloseTo(0.643, 3);
  });
});
