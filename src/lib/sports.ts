/**
 * Per-league configuration. Everything sport-specific — feed paths, how the
 * schedule is browsed, and the house-line model's constants — lives here.
 */

export const SPORT_KEYS = ["nfl", "ncaaf", "mlb", "nba"] as const;
export type SportKey = (typeof SPORT_KEYS)[number];

export type LineModel = {
  /** Home advantage in points/runs. */
  homeAdvantage: number;
  /** Standard deviation of the final margin. */
  marginSd: number;
  /** Typical points/runs per team per game, used when a team has no rating. */
  leagueAverage: number;
  /** "model": spread follows the projected margin. "runline": fixed ±1.5, priced by probability. */
  spreadMode: "model" | "runline";
  /** Games a team needs this season before its ratings are trusted over last season's. */
  minGamesForRatings: number;
};

export type SportConfig = {
  key: SportKey;
  label: string;
  name: string;
  /** ESPN site API path segment. */
  path: string;
  /** Extra scoreboard query (e.g. all FBS games instead of just the top 25). */
  scoreboardQuery: string;
  /** Football is browsed by week; everything else by day. */
  browse: "week" | "day";
  spreadLabel: string;
  scoreUnit: string;
  oddsApiKey: string;
  model: LineModel;
};

export const SPORTS: Record<SportKey, SportConfig> = {
  nfl: {
    key: "nfl",
    label: "NFL",
    name: "NFL",
    path: "football/nfl",
    scoreboardQuery: "",
    browse: "week",
    spreadLabel: "Spread",
    scoreUnit: "pts",
    oddsApiKey: "americanfootball_nfl",
    model: { homeAdvantage: 1.5, marginSd: 13.5, leagueAverage: 22.5, spreadMode: "model", minGamesForRatings: 3 },
  },
  ncaaf: {
    key: "ncaaf",
    label: "NCAAF",
    name: "College Football",
    path: "football/college-football",
    scoreboardQuery: "groups=80&limit=300",
    browse: "week",
    spreadLabel: "Spread",
    scoreUnit: "pts",
    oddsApiKey: "americanfootball_ncaaf",
    model: { homeAdvantage: 2.5, marginSd: 16, leagueAverage: 28, spreadMode: "model", minGamesForRatings: 3 },
  },
  mlb: {
    key: "mlb",
    label: "MLB",
    name: "MLB",
    path: "baseball/mlb",
    scoreboardQuery: "",
    browse: "day",
    spreadLabel: "Run line",
    scoreUnit: "runs",
    oddsApiKey: "baseball_mlb",
    model: { homeAdvantage: 0.15, marginSd: 4.4, leagueAverage: 4.5, spreadMode: "runline", minGamesForRatings: 20 },
  },
  nba: {
    key: "nba",
    label: "NBA",
    name: "NBA",
    path: "basketball/nba",
    scoreboardQuery: "",
    browse: "day",
    spreadLabel: "Spread",
    scoreUnit: "pts",
    oddsApiKey: "basketball_nba",
    model: { homeAdvantage: 2.5, marginSd: 12, leagueAverage: 114, spreadMode: "model", minGamesForRatings: 10 },
  },
};

export function isSportKey(v: unknown): v is SportKey {
  return typeof v === "string" && (SPORT_KEYS as readonly string[]).includes(v);
}
