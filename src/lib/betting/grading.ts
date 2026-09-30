import { payoutCents } from "./odds";

export type Market = "ml" | "spread" | "total";
export type Side = "home" | "away" | "over" | "under";
export type LegResult = "won" | "lost" | "push";
export type BetResult = "won" | "lost" | "push";

export type GradableLeg = {
  market: Market;
  side: Side;
  /** Spread from the picked side's perspective (e.g. -3.5), or the game total. Null for moneyline. */
  line: number | null;
};

export type FinalScore = { home: number; away: number };

const SIDES_BY_MARKET: Record<Market, readonly Side[]> = {
  ml: ["home", "away"],
  spread: ["home", "away"],
  total: ["over", "under"],
};

export function isValidSide(market: Market, side: Side): boolean {
  return SIDES_BY_MARKET[market].includes(side);
}

function compare(diff: number): LegResult {
  if (diff > 0) return "won";
  if (diff < 0) return "lost";
  return "push";
}

export function gradeLeg(leg: GradableLeg, score: FinalScore): LegResult {
  if (!isValidSide(leg.market, leg.side)) {
    throw new Error(`Side ${leg.side} is not valid for market ${leg.market}`);
  }
  const picked = leg.side === "home" ? score.home : score.away;
  const other = leg.side === "home" ? score.away : score.home;

  switch (leg.market) {
    case "ml":
      // NBA games cannot end tied; a tie here means bad data, so refund rather than guess.
      return compare(picked - other);
    case "spread":
      if (leg.line === null) throw new Error("Spread leg is missing its line");
      return compare(picked + leg.line - other);
    case "total": {
      if (leg.line === null) throw new Error("Total leg is missing its line");
      const total = score.home + score.away;
      return compare(leg.side === "over" ? total - leg.line : leg.line - total);
    }
  }
}

export type SettlementLeg = { price: number; result: LegResult | "open" };

export type Settlement =
  | { status: "open" }
  | { status: BetResult; payoutCents: number };

/**
 * Settle a straight bet or parlay. Any loss settles immediately as lost, even
 * with legs still open. Pushed legs drop out and the parlay re-prices over the
 * remaining legs; if every leg pushes the stake is refunded.
 */
export function settleBet(stakeCents: number, legs: readonly SettlementLeg[]): Settlement {
  if (legs.some((l) => l.result === "lost")) return { status: "lost", payoutCents: 0 };
  if (legs.some((l) => l.result === "open")) return { status: "open" };

  const winning = legs.filter((l) => l.result === "won").map((l) => l.price);
  if (winning.length === 0) return { status: "push", payoutCents: stakeCents };
  return { status: "won", payoutCents: payoutCents(stakeCents, winning) };
}
