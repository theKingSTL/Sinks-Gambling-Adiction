import type { Market, Side } from "@/lib/betting/grading";
import type { SportKey } from "@/lib/sports";

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
  rank: number | null;
};

export type Game = {
  sport: SportKey;
  id: string;
  startsAt: string; // ISO
  state: GameState;
  completed: boolean;
  statusText: string; // "7:30 PM ET", "Q3 4:12", "Top 5th", "Final"
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
  /** Stable key: `${sport}:${gameId}:${market}:${side}` */
  id: string;
  sport: SportKey;
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

export type Prediction = {
  homeWinProb: number;
  homeScore: number;
  awayScore: number;
  /** "market" = de-vigged sportsbook prices, "model" = house model, "espn" = ESPN Matchup Predictor */
  source: "market" | "model" | "espn";
};

export type GameMarkets = {
  sport: SportKey;
  gameId: string;
  open: boolean;
  moneyline: [Selection, Selection] | null;
  spread: [Selection, Selection] | null;
  total: [Selection, Selection] | null;
  prediction: Prediction;
};
