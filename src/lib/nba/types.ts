import type { Market, Side } from "@/lib/betting/grading";

export type GameState = "pre" | "in" | "post";

export type TeamSide = {
  id: string;
  abbr: string;
  name: string;
  shortName: string;
  logo: string | null;
  color: string | null;
  score: number | null;
  record: string | null;
};

export type Game = {
  id: string;
  startsAt: string; // ISO
  state: GameState;
  completed: boolean;
  statusText: string; // "7:30 PM ET", "Q3 4:12", "Final"
  seasonType: number; // 1 preseason, 2 regular, 3 postseason, 5 play-in
  home: TeamSide;
  away: TeamSide;
  bookOdds: BookOdds | null;
};

/** Lines from a real sportsbook, if the feed carried them. Any field may be missing. */
export type BookOdds = {
  provider: string;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  homeSpread: number | null;
  homeSpreadPrice: number | null;
  awaySpreadPrice: number | null;
  total: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export type LineSource = "book" | "house";

export type Selection = {
  /** Stable key: `${gameId}:${market}:${side}` */
  id: string;
  gameId: string;
  market: Market;
  side: Side;
  /** Spread from this side's perspective, or the game total; null for moneyline. */
  line: number | null;
  price: number;
  label: string; // "BOS -4.5", "Over 221.5", "NYK ML"
  source: LineSource;
  provider: string;
};

export type GameMarkets = {
  gameId: string;
  open: boolean;
  moneyline: [Selection, Selection] | null;
  spread: [Selection, Selection] | null;
  total: [Selection, Selection] | null;
};
