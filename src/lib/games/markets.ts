import { houseLines, leagueAverage, project, type TeamRating } from "@/lib/betting/house-lines";
import type { Market, Side } from "@/lib/betting/grading";
import { impliedProbability } from "@/lib/betting/odds";
import { isSportKey, SPORTS, type SportKey } from "@/lib/sports";
import type { Game, GameMarkets, LineSource, Prediction, Selection } from "./types";

export type RatingLookup = (teamId: string) => TeamRating | undefined;

const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const gameKey = (sport: SportKey, gameId: string) => `${sport}:${gameId}`;

export function selectionId(sport: SportKey, gameId: string, market: Market, side: Side): string {
  return `${sport}:${gameId}:${market}:${side}`;
}

export function parseSelectionId(id: string): { sport: SportKey; gameId: string; market: Market; side: Side } | null {
  const m = /^([a-z]+):(\d+):(ml|spread|total):(home|away|over|under)$/.exec(id);
  if (!m || !isSportKey(m[1])) return null;
  const [, sport, gameId, market, side] = m as unknown as [string, SportKey, string, Market, Side];
  const valid = market === "total" ? side === "over" || side === "under" : side === "home" || side === "away";
  return valid ? { sport, gameId, market, side } : null;
}

/** Betting closes at kickoff/tip-off; only pregame games take action. */
export function isBettable(game: Game, now = Date.now()): boolean {
  return game.state === "pre" && !game.completed && Date.parse(game.startsAt) > now;
}

/** Remove the book's vig from a two-way moneyline to get its implied home win probability. */
export function noVigHomeProb(homeMl: number, awayMl: number): number {
  const h = impliedProbability(homeMl);
  const a = impliedProbability(awayMl);
  return h / (h + a);
}

/**
 * Real book lines win per market; the house model fills any market the book
 * didn't post. Each selection records where its number came from. The
 * prediction prefers the market's (de-vigged) view over the model's.
 */
export function buildMarkets(game: Game, ratings: RatingLookup, now = Date.now()): GameMarkets {
  const sport = SPORTS[game.sport];
  const book = game.bookOdds;
  const confidence = game.seasonType === 1 ? 0.5 : 1;
  const avg = leagueAverage(sport.model);
  const homeRating = ratings(game.home.id) ?? avg;
  const awayRating = ratings(game.away.id) ?? avg;
  const house = houseLines(homeRating, awayRating, confidence, sport.model);
  const model = project(homeRating, awayRating, sport.model, confidence);

  const make = (
    market: Market,
    side: Side,
    line: number | null,
    price: number,
    label: string,
    source: LineSource,
  ): Selection => ({
    id: selectionId(game.sport, game.id, market, side),
    sport: game.sport,
    gameId: game.id,
    market,
    side,
    line,
    price,
    label,
    source,
    provider: source === "book" ? (book?.provider ?? "Sportsbook") : "House line",
  });

  const bookMl = book?.homeMoneyline != null && book.awayMoneyline != null;
  const bookSpread = book?.homeSpread != null && book.homeSpread !== 0;
  const bookTotal = book?.total != null;

  const homeSpread = bookSpread ? book!.homeSpread! : house.homeSpread;
  const total = bookTotal ? book!.total! : house.total;
  const { home, away } = game;
  const spreadSource: LineSource = bookSpread ? "book" : "house";
  const totalSource: LineSource = bookTotal ? "book" : "house";

  // Prediction: market win probability when priced, else the model; projected
  // score from the posted total and (for margin-based spreads) the posted spread.
  const homeWinProb = bookMl ? noVigHomeProb(book!.homeMoneyline!, book!.awayMoneyline!) : model.homeWinProb;
  const projTotal = bookTotal ? book!.total! : model.homeScore + model.awayScore;
  const projMargin =
    bookSpread && sport.model.spreadMode === "model" ? -book!.homeSpread! : model.homeScore - model.awayScore;
  const prediction: Prediction = {
    homeWinProb,
    homeScore: (projTotal + projMargin) / 2,
    awayScore: (projTotal - projMargin) / 2,
    source: bookMl ? "market" : "model",
  };

  return {
    sport: game.sport,
    gameId: game.id,
    open: isBettable(game, now),
    moneyline: [
      make("ml", "away", null, bookMl ? book!.awayMoneyline! : house.awayMoneyline, `${away.abbr} ML`, bookMl ? "book" : "house"),
      make("ml", "home", null, bookMl ? book!.homeMoneyline! : house.homeMoneyline, `${home.abbr} ML`, bookMl ? "book" : "house"),
    ],
    spread: [
      make(
        "spread",
        "away",
        -homeSpread,
        (bookSpread && book!.awaySpreadPrice) || house.awaySpreadPrice,
        `${away.abbr} ${fmtLine(-homeSpread)}`,
        spreadSource,
      ),
      make(
        "spread",
        "home",
        homeSpread,
        (bookSpread && book!.homeSpreadPrice) || house.homeSpreadPrice,
        `${home.abbr} ${fmtLine(homeSpread)}`,
        spreadSource,
      ),
    ],
    total: [
      make("total", "over", total, (bookTotal && book!.overPrice) || house.totalPrice, `Over ${total}`, totalSource),
      make("total", "under", total, (bookTotal && book!.underPrice) || house.totalPrice, `Under ${total}`, totalSource),
    ],
    prediction,
  };
}

export function allSelections(markets: GameMarkets): Selection[] {
  return [markets.moneyline, markets.spread, markets.total].flatMap((pair) => pair ?? []);
}
