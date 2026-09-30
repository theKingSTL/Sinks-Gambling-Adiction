import type { LineModel } from "@/lib/sports";
import { probabilityToAmerican } from "./odds";

/**
 * Fallback line model, used only when no sportsbook has posted a number.
 * Expected score for each side = average of its own scoring and what the
 * opponent allows, plus home advantage. Margin -> win probability via a
 * normal distribution with a sport-specific spread.
 */

export type TeamRating = { pointsFor: number; pointsAgainst: number };

const VIG = 0.045; // ~4.5% overround, split across both sides
const STANDARD_JUICE = -110;

export const NBA_MODEL: LineModel = {
  homeAdvantage: 2.5,
  marginSd: 12,
  leagueAverage: 114,
  spreadMode: "model",
  minGamesForRatings: 10,
};

export type HouseLines = {
  homeSpread: number;
  homeSpreadPrice: number;
  awaySpreadPrice: number;
  total: number;
  totalPrice: number;
  homeMoneyline: number;
  awayMoneyline: number;
};

export type Projection = { homeScore: number; awayScore: number; homeWinProb: number };

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

const toHalf = (n: number) => Math.round(n * 2) / 2;
const clampP = (p: number) => Math.min(0.98, Math.max(0.02, p));
const juiced = (p: number) => Math.min(0.99, p + VIG / 2);

export function leagueAverage(model: LineModel): TeamRating {
  return { pointsFor: model.leagueAverage, pointsAgainst: model.leagueAverage };
}

/** Projected score and win probability. `confidence` (0..1) shrinks the margin toward a coin flip. */
export function project(home: TeamRating, away: TeamRating, model: LineModel = NBA_MODEL, confidence = 1): Projection {
  const rawHome = (home.pointsFor + away.pointsAgainst) / 2;
  const rawAway = (away.pointsFor + home.pointsAgainst) / 2;
  const mid = (rawHome + rawAway) / 2;
  const margin = (rawHome - rawAway + model.homeAdvantage) * confidence;
  return {
    homeScore: mid + margin / 2,
    awayScore: mid - margin / 2,
    homeWinProb: clampP(normalCdf(margin / model.marginSd)),
  };
}

export function houseLines(
  home: TeamRating,
  away: TeamRating,
  confidence = 1,
  model: LineModel = NBA_MODEL,
): HouseLines {
  const p = project(home, away, model, confidence);
  const margin = p.homeScore - p.awayScore;
  const moneylines = {
    homeMoneyline: probabilityToAmerican(juiced(p.homeWinProb), 5),
    awayMoneyline: probabilityToAmerican(juiced(1 - p.homeWinProb), 5),
  };
  const total = toHalf(p.homeScore + p.awayScore);

  if (model.spreadMode === "runline") {
    // Favorite gives 1.5; price it by the chance of winning by 2+.
    const homeFav = margin >= 0;
    const favMargin = Math.abs(margin);
    const pCover = clampP(1 - normalCdf((1.5 - favMargin) / model.marginSd));
    const favPrice = probabilityToAmerican(juiced(pCover), 5);
    const dogPrice = probabilityToAmerican(juiced(1 - pCover), 5);
    return {
      homeSpread: homeFav ? -1.5 : 1.5,
      homeSpreadPrice: homeFav ? favPrice : dogPrice,
      awaySpreadPrice: homeFav ? dogPrice : favPrice,
      total,
      totalPrice: STANDARD_JUICE,
      ...moneylines,
    };
  }

  const spread = toHalf(-margin);
  return {
    homeSpread: spread === 0 ? -0.5 : spread, // avoid a pick'em spread that duplicates the moneyline
    homeSpreadPrice: STANDARD_JUICE,
    awaySpreadPrice: STANDARD_JUICE,
    total,
    totalPrice: STANDARD_JUICE,
    ...moneylines,
  };
}
