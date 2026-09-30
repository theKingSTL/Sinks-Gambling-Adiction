import { describe, expect, it } from "vitest";
import {
  americanToDecimal,
  decimalToAmerican,
  impliedProbability,
  isValidAmerican,
  parlayAmerican,
  payoutCents,
  probabilityToAmerican,
} from "./odds";

describe("american odds conversion", () => {
  it("converts to decimal", () => {
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToDecimal(-200)).toBe(1.5);
    expect(americanToDecimal(100)).toBe(2);
    expect(americanToDecimal(-110)).toBeCloseTo(1.90909, 5);
  });

  it("rejects prices inside the (-100, 100) band", () => {
    expect(isValidAmerican(50)).toBe(false);
    expect(isValidAmerican(-99)).toBe(false);
    expect(isValidAmerican(110.5)).toBe(false);
    expect(() => americanToDecimal(0)).toThrow(RangeError);
  });

  it("round-trips decimal to american", () => {
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(americanToDecimal(-110))).toBe(-110);
  });

  it("computes implied probability", () => {
    expect(impliedProbability(-110)).toBeCloseTo(0.5238, 4);
    expect(impliedProbability(100)).toBe(0.5);
  });

  it("maps probability to a legal price", () => {
    expect(probabilityToAmerican(0.75)).toBe(-300);
    expect(probabilityToAmerican(0.25)).toBe(300);
    expect(probabilityToAmerican(0.5)).toBe(-100);
    expect(probabilityToAmerican(0.505, 5)).toBe(-100);
    expect(probabilityToAmerican(0.62, 5)).toBe(-165);
  });
});

describe("payouts", () => {
  it("pays a straight bet including stake", () => {
    expect(payoutCents(10_000, [150])).toBe(25_000);
    expect(payoutCents(11_000, [-110])).toBe(21_000);
  });

  it("floors fractional cents", () => {
    // $10 at -110 returns $19.0909... -> $19.09
    expect(payoutCents(1_000, [-110])).toBe(1_909);
  });

  it("multiplies parlay legs exactly", () => {
    // Two -110 legs: 1.90909^2 = 3.64463 -> $100 returns $364.46
    expect(payoutCents(10_000, [-110, -110])).toBe(36_446);
    expect(parlayAmerican([-110, -110])).toBe(264);
    // +100 x +100 x +100 = 8x
    expect(payoutCents(500, [100, 100, 100])).toBe(4_000);
  });

  it("refunds when no legs remain", () => {
    expect(payoutCents(2_500, [])).toBe(2_500);
  });

  it("rejects fractional stakes", () => {
    expect(() => payoutCents(10.5, [100])).toThrow(RangeError);
  });
});
