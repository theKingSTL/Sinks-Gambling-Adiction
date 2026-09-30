import { describe, expect, it } from "vitest";
import { SPORTS } from "@/lib/sports";
import { houseLines, leagueAverage, NBA_MODEL, normalCdf, project } from "./house-lines";
import { impliedProbability } from "./odds";

const LEAGUE_AVERAGE = leagueAverage(NBA_MODEL);

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe("houseLines", () => {
  it("gives the home team a small edge between equal teams", () => {
    const lines = houseLines(LEAGUE_AVERAGE, LEAGUE_AVERAGE);
    expect(lines.homeSpread).toBe(-2.5);
    expect(lines.total).toBe(228);
    expect(lines.homeMoneyline).toBeLessThan(0);
    expect(lines.awayMoneyline).toBeGreaterThan(0);
  });

  it("favors the stronger road team", () => {
    const strong = { pointsFor: 122, pointsAgainst: 108 };
    const weak = { pointsFor: 108, pointsAgainst: 120 };
    const lines = houseLines(weak, strong);
    expect(lines.homeSpread).toBeGreaterThan(0);
    expect(lines.awayMoneyline).toBeLessThan(lines.homeMoneyline);
  });

  it("builds in vig so both sides imply more than 100%", () => {
    const lines = houseLines({ pointsFor: 118, pointsAgainst: 112 }, LEAGUE_AVERAGE);
    const book = impliedProbability(lines.homeMoneyline) + impliedProbability(lines.awayMoneyline);
    expect(book).toBeGreaterThan(1.02);
    expect(book).toBeLessThan(1.08);
  });

  it("shrinks the margin when confidence is low", () => {
    const strong = { pointsFor: 122, pointsAgainst: 108 };
    const full = houseLines(strong, LEAGUE_AVERAGE, 1);
    const half = houseLines(strong, LEAGUE_AVERAGE, 0.5);
    expect(Math.abs(half.homeSpread)).toBeLessThan(Math.abs(full.homeSpread));
  });

  it("never posts a zero spread", () => {
    const lines = houseLines(
      { pointsFor: 112, pointsAgainst: 114.5 },
      { pointsFor: 114.5, pointsAgainst: 112 },
    );
    expect(lines.homeSpread).not.toBe(0);
  });

  it("prices MLB with a fixed 1.5 run line", () => {
    const mlb = SPORTS.mlb.model;
    const lines = houseLines({ pointsFor: 5.2, pointsAgainst: 3.8 }, { pointsFor: 4.1, pointsAgainst: 4.6 }, 1, mlb);
    expect(lines.homeSpread).toBe(-1.5);
    // favorite laying 1.5 runs is usually plus money, the dog getting 1.5 is juiced
    expect(lines.homeSpreadPrice).toBeGreaterThan(lines.awaySpreadPrice);
    expect(lines.homeMoneyline).toBeLessThan(0);
    expect(lines.total % 0.5).toBe(0);
  });

  it("uses football-sized numbers for the NFL", () => {
    const nfl = SPORTS.nfl.model;
    const lines = houseLines(leagueAverage(nfl), leagueAverage(nfl), 1, nfl);
    expect(lines.homeSpread).toBe(-1.5);
    expect(lines.total).toBe(45);
  });
});

describe("project", () => {
  it("returns a projected score and win probability", () => {
    const p = project({ pointsFor: 120, pointsAgainst: 110 }, { pointsFor: 110, pointsAgainst: 118 });
    expect(p.homeScore).toBeGreaterThan(p.awayScore);
    expect(p.homeWinProb).toBeGreaterThan(0.5);
    expect(p.homeWinProb).toBeLessThan(1);
  });
});
