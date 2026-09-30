import { houseLines, LEAGUE_AVERAGE, type TeamRating } from "@/lib/betting/house-lines";
import type { Market, Side } from "@/lib/betting/grading";
import type { Game, GameMarkets, LineSource, Selection } from "./types";

export type RatingLookup = (teamId: string) => TeamRating | undefined;

const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function selectionId(gameId: string, market: Market, side: Side): string {
  return `${gameId}:${market}:${side}`;
}

export function parseSelectionId(id: string): { gameId: string; market: Market; side: Side } | null {
  const m = /^(\d+):(ml|spread|total):(home|away|over|under)$/.exec(id);
  if (!m) return null;
  const [, gameId, market, side] = m as unknown as [string, string, Market, Side];
  const valid = market === "total" ? side === "over" || side === "under" : side === "home" || side === "away";
  return valid ? { gameId, market, side } : null;
}

/** Betting closes at tip-off; only pregame games take action. */
export function isBettable(game: Game, now = Date.now()): boolean {
  return game.state === "pre" && !game.completed && Date.parse(game.startsAt) > now;
}

/**
 * Real book lines win per market; the house model fills any market the book
 * didn't post. Each selection records where its number came from.
 */
export function buildMarkets(game: Game, ratings: RatingLookup, now = Date.now()): GameMarkets {
  const book = game.bookOdds;
  const confidence = game.seasonType === 1 ? 0.5 : 1;
  const house = houseLines(
    ratings(game.home.id) ?? LEAGUE_AVERAGE,
    ratings(game.away.id) ?? LEAGUE_AVERAGE,
    confidence,
  );

  const make = (
    market: Market,
    side: Side,
    line: number | null,
    price: number,
    label: string,
    source: LineSource,
  ): Selection => ({
    id: selectionId(game.id, market, side),
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
  const bookSpread = book?.homeSpread != null;
  const bookTotal = book?.total != null;

  const homeSpread = bookSpread ? book!.homeSpread! : house.homeSpread;
  const total = bookTotal ? book!.total! : house.total;
  const { home, away } = game;

  return {
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
        (bookSpread && book!.awaySpreadPrice) || house.spreadPrice,
        `${away.abbr} ${fmtLine(-homeSpread)}`,
        bookSpread ? "book" : "house",
      ),
      make(
        "spread",
        "home",
        homeSpread,
        (bookSpread && book!.homeSpreadPrice) || house.spreadPrice,
        `${home.abbr} ${fmtLine(homeSpread)}`,
        bookSpread ? "book" : "house",
      ),
    ],
    total: [
      make("total", "over", total, (bookTotal && book!.overPrice) || house.totalPrice, `Over ${total}`, bookTotal ? "book" : "house"),
      make("total", "under", total, (bookTotal && book!.underPrice) || house.totalPrice, `Under ${total}`, bookTotal ? "book" : "house"),
    ],
  };
}

export function allSelections(markets: GameMarkets): Selection[] {
  return [markets.moneyline, markets.spread, markets.total].flatMap((pair) => pair ?? []);
}
