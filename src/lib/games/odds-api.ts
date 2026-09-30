import "server-only";
import { SPORTS, type SportKey } from "@/lib/sports";
import type { BookOdds, Game } from "./types";

/**
 * Optional second source of real lines: https://the-odds-api.com (free tier
 * available). Only used when ODDS_API_KEY is set, and only fills games that
 * ESPN left without odds.
 */

type OddsApiOutcome = { name: string; price: number; point?: number };
export type OddsApiEvent = {
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { title: string; markets: { key: string; outcomes: OddsApiOutcome[] }[] }[];
};

const norm = (team: string) => team.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

export async function fetchOddsApi(sport: SportKey): Promise<OddsApiEvent[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return [];
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORTS[sport].oddsApiKey}/odds`);
  url.search = new URLSearchParams({
    apiKey: key,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
  }).toString();
  try {
    // Free tier is quota-limited; cache for 5 minutes.
    const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Odds API ${res.status}`);
    return (await res.json()) as OddsApiEvent[];
  } catch (err) {
    console.error("[odds-api] unavailable", err);
    return [];
  }
}

function toBookOdds(event: OddsApiEvent): BookOdds | null {
  const book = event.bookmakers[0];
  if (!book) return null;
  const market = (k: string) => book.markets.find((m) => m.key === k)?.outcomes ?? [];
  const find = (outs: OddsApiOutcome[], name: string) => outs.find((o) => o.name === name);

  const h2h = market("h2h");
  const spreads = market("spreads");
  const totals = market("totals");
  const homeSpread = find(spreads, event.home_team);
  const over = find(totals, "Over");
  return {
    provider: book.title,
    homeMoneyline: find(h2h, event.home_team)?.price ?? null,
    awayMoneyline: find(h2h, event.away_team)?.price ?? null,
    homeSpread: homeSpread?.point ?? null,
    homeSpreadPrice: homeSpread?.price ?? null,
    awaySpreadPrice: find(spreads, event.away_team)?.price ?? null,
    total: over?.point ?? null,
    overPrice: over?.price ?? null,
    underPrice: find(totals, "Under")?.price ?? null,
  };
}

/** Same team: names match, or one contains the other ("LA Clippers" vs "Los Angeles Clippers" handled by nickname). */
function sameTeam(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x) || x.split(" ").at(-1) === y.split(" ").at(-1);
}

export function applyOddsApi(games: Game[], events: OddsApiEvent[]): Game[] {
  if (events.length === 0) return games;
  return games.map((game) => {
    if (game.bookOdds) return game;
    const match = events.find(
      (e) =>
        sameTeam(e.home_team, game.home.name) &&
        sameTeam(e.away_team, game.away.name) &&
        Math.abs(Date.parse(e.commence_time) - Date.parse(game.startsAt)) < 12 * 3_600_000,
    );
    const odds = match ? toBookOdds(match) : null;
    return odds ? { ...game, bookOdds: odds } : game;
  });
}
