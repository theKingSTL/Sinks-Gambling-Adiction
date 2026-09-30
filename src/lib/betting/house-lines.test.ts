import { describe, expect, it } from "vitest";
import { houseLines, LEAGUE_AVERAGE, normalCdf } from "./house-lines";
import { impliedProbability } from "./odds";

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
});
