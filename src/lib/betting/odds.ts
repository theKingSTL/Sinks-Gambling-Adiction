/**
 * American-odds math. All money is integer cents; all odds are integer
 * American prices (e.g. -110, +150). Payouts are computed with exact rational
 * arithmetic (BigInt) so a 10-leg parlay never drifts by a cent.
 */

export type Fraction = { num: bigint; den: bigint };

export function isValidAmerican(price: number): boolean {
  return Number.isInteger(price) && (price >= 100 || price <= -100);
}

/** Decimal odds as an exact fraction: +150 -> 250/100, -110 -> 210/110. */
export function americanToFraction(price: number): Fraction {
  if (!isValidAmerican(price)) throw new RangeError(`Invalid American odds: ${price}`);
  return price > 0
    ? { num: BigInt(price + 100), den: 100n }
    : { num: BigInt(-price + 100), den: BigInt(-price) };
}

export function americanToDecimal(price: number): number {
  const { num, den } = americanToFraction(price);
  return Number(num) / Number(den);
}

/** Nearest American price for a decimal multiplier (> 1). */
export function decimalToAmerican(decimal: number): number {
  if (!(decimal > 1)) throw new RangeError(`Decimal odds must be > 1: ${decimal}`);
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** Implied win probability, vig included. */
export function impliedProbability(price: number): number {
  return 1 / americanToDecimal(price);
}

/** Fair (vig-free) probability -> American price, optionally rounded to a step. */
export function probabilityToAmerican(p: number, step = 1): number {
  if (!(p > 0 && p < 1)) throw new RangeError(`Probability must be in (0, 1): ${p}`);
  const raw = p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p;
  const rounded = Math.round(raw / step) * step;
  // Never emit an illegal price in the (-100, 100) band.
  if (rounded > -100 && rounded < 100) return p >= 0.5 ? -100 : 100;
  return rounded;
}

/** Combined decimal odds of a parlay as an exact fraction. */
export function parlayFraction(prices: readonly number[]): Fraction {
  if (prices.length === 0) throw new RangeError("A bet needs at least one leg");
  return prices.reduce<Fraction>(
    (acc, price) => {
      const f = americanToFraction(price);
      return { num: acc.num * f.num, den: acc.den * f.den };
    },
    { num: 1n, den: 1n },
  );
}

/** Combined American price for display. */
export function parlayAmerican(prices: readonly number[]): number {
  const { num, den } = parlayFraction(prices);
  return decimalToAmerican(Number(num) / Number(den));
}

/** Total return (stake included), floored to the cent — the house keeps fractions. */
export function payoutCents(stakeCents: number, prices: readonly number[]): number {
  if (!Number.isInteger(stakeCents) || stakeCents < 0) {
    throw new RangeError(`Stake must be a non-negative integer of cents: ${stakeCents}`);
  }
  if (prices.length === 0) return stakeCents; // every leg pushed -> refund
  const { num, den } = parlayFraction(prices);
  return Number((BigInt(stakeCents) * num) / den);
}

export function formatAmerican(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}
