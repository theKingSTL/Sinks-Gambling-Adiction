import { describe, expect, it } from "vitest";
import { gradeLeg, settleBet } from "./grading";

const score = { home: 110, away: 104 }; // home by 6, total 214

describe("gradeLeg", () => {
  it("grades moneyline", () => {
    expect(gradeLeg({ market: "ml", side: "home", line: null }, score)).toBe("won");
    expect(gradeLeg({ market: "ml", side: "away", line: null }, score)).toBe("lost");
  });

  it("grades spreads from the picked side", () => {
    expect(gradeLeg({ market: "spread", side: "home", line: -5.5 }, score)).toBe("won");
    expect(gradeLeg({ market: "spread", side: "home", line: -6.5 }, score)).toBe("lost");
    expect(gradeLeg({ market: "spread", side: "home", line: -6 }, score)).toBe("push");
    expect(gradeLeg({ market: "spread", side: "away", line: 6.5 }, score)).toBe("won");
    expect(gradeLeg({ market: "spread", side: "away", line: 5.5 }, score)).toBe("lost");
    expect(gradeLeg({ market: "spread", side: "away", line: 6 }, score)).toBe("push");
  });

  it("grades totals", () => {
    expect(gradeLeg({ market: "total", side: "over", line: 213.5 }, score)).toBe("won");
    expect(gradeLeg({ market: "total", side: "under", line: 213.5 }, score)).toBe("lost");
    expect(gradeLeg({ market: "total", side: "under", line: 214 }, score)).toBe("push");
  });

  it("rejects mismatched market and side", () => {
    expect(() => gradeLeg({ market: "total", side: "home", line: 200 }, score)).toThrow();
    expect(() => gradeLeg({ market: "ml", side: "over", line: null }, score)).toThrow();
  });
});

describe("settleBet", () => {
  it("stays open while legs are pending", () => {
    expect(settleBet(1_000, [{ price: -110, result: "won" }, { price: 120, result: "open" }])).toEqual({
      status: "open",
    });
  });

  it("loses as soon as any leg loses", () => {
    expect(settleBet(1_000, [{ price: -110, result: "lost" }, { price: 120, result: "open" }])).toEqual({
      status: "lost",
      payoutCents: 0,
    });
  });

  it("pays a winning parlay", () => {
    expect(settleBet(10_000, [{ price: -110, result: "won" }, { price: -110, result: "won" }])).toEqual({
      status: "won",
      payoutCents: 36_446,
    });
  });

  it("drops pushed legs and re-prices the rest", () => {
    expect(settleBet(10_000, [{ price: 150, result: "won" }, { price: -110, result: "push" }])).toEqual({
      status: "won",
      payoutCents: 25_000,
    });
  });

  it("refunds when every leg pushes", () => {
    expect(settleBet(10_000, [{ price: 150, result: "push" }, { price: -110, result: "push" }])).toEqual({
      status: "push",
      payoutCents: 10_000,
    });
  });
});
