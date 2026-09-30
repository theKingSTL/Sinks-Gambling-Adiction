import { probabilityToAmerican } from "./odds";

/**
 * Fallback line model, used only when no sportsbook has posted a number.
 * Expected score for each side = average of its own scoring and what the
 * opponent allows, plus home-court advantage. Margin -> win probability via a
 * normal distribution (NBA final margins have sd ~12 points).
 */

export type TeamRating = { pointsFor: number; pointsAgainst: number };

export const LEAGUE_AVERAGE: TeamRating = { pointsFor: 114, pointsAgainst: 114 };
const HOME_COURT = 2.5;
const MARGIN_SD = 12;
const VIG = 0.045; // ~4.5% overround, split across both sides
const STANDARD_JUICE = -110;

export type HouseLines = {
  homeSpread: number; // e.g. -4.5
  total: number;
  homeMoneyline: number;
  awayMoneyline: number;
  spreadPrice: number;
  totalPrice: number;
};

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

const toHalf = (n: number) => Math.round(n * 2) / 2;

export function houseLines(
  home: TeamRating,
  away: TeamRating,
  /** 0..1 — how much of the ratings to trust (preseason rosters are noisy). */
  confidence = 1,
): HouseLines {
  const homeExp = (home.pointsFor + away.pointsAgainst) / 2 + HOME_COURT / 2;
  const awayExp = (away.pointsFor + home.pointsAgainst) / 2 - HOME_COURT / 2;
  const margin = (homeExp - awayExp) * confidence;

  const pHome = Math.min(0.98, Math.max(0.02, normalCdf(margin / MARGIN_SD)));
  const juiced = (p: number) => Math.min(0.99, p + VIG / 2);

  const spread = toHalf(-margin);
  return {
    homeSpread: spread === 0 ? -0.5 : spread, // avoid a pick'em spread that duplicates the moneyline
    total: toHalf(homeExp + awayExp),
    homeMoneyline: probabilityToAmerican(juiced(pHome), 5),
    awayMoneyline: probabilityToAmerican(juiced(1 - pHome), 5),
    spreadPrice: STANDARD_JUICE,
    totalPrice: STANDARD_JUICE,
  };
}
