import "server-only";
import type { TeamRating } from "@/lib/betting/house-lines";
import { buildMarkets } from "./markets";
import { applyOddsApi, fetchOddsApi } from "./odds-api";
import { parseScoreboardEvent, parseStandings, parseSummary, type GameDetail } from "./parse";
import type { Game, GameMarkets } from "./types";

const BASE = "https://site.api.espn.com/apis";
const TZ = "America/New_York";

/** YYYYMMDD in league time (ESPN's scoreboard days are Eastern). */
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replaceAll("-", "");
}

export function shiftDay(key: string, days: number): string {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8) + days, 12));
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

async function getJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, {
    next: { revalidate },
    // ESPN rejects Node's default user-agent with a 403.
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; SinksApp/1.0)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

export async function getScoreboard(key: string): Promise<Game[]> {
  const today = dayKey(new Date());
  // Live days refresh fast; past and future days rarely change.
  const revalidate = key === today ? 15 : key > today ? 300 : 3600;
  const data = (await getJson(`${BASE}/site/v2/sports/basketball/nba/scoreboard?dates=${key}`, revalidate)) as {
    events?: unknown[];
  };
  const games = (data.events ?? []).map(parseScoreboardEvent).filter((g): g is Game => g !== null);
  return applyOddsApi(games, await fetchOddsApi());
}

export async function getGameDetail(id: string): Promise<GameDetail | null> {
  if (!/^\d+$/.test(id)) return null;
  const data = await getJson(`${BASE}/site/v2/sports/basketball/nba/summary?event=${id}`, 15);
  const detail = parseSummary(data);
  if (!detail) return null;
  const [game] = applyOddsApi([detail.game], await fetchOddsApi());
  return { ...detail, game };
}

/** Final or current score, used by settlement. */
export async function getGame(id: string): Promise<Game | null> {
  return (await getGameDetail(id))?.game ?? null;
}

async function standingsFor(season: number) {
  const data = await getJson(`${BASE}/v2/sports/basketball/nba/standings?season=${season}`, 3600);
  return parseStandings(data);
}

/**
 * Team scoring ratings for the house line model. Early in a season the sample
 * is too small, so fall back to last season's numbers.
 */
export async function getRatings(): Promise<Map<string, TeamRating>> {
  const now = new Date();
  // NBA seasons are labelled by the year they end: Oct 2026 -> 2027.
  const season = now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  try {
    let rows = await standingsFor(season);
    const avgGp = rows.reduce((s, r) => s + r.gamesPlayed, 0) / Math.max(rows.length, 1);
    if (avgGp < 10) rows = await standingsFor(season - 1);
    return new Map(rows.map((r) => [r.teamId, { pointsFor: r.pointsFor, pointsAgainst: r.pointsAgainst }]));
  } catch (err) {
    console.error("[espn] standings unavailable, using league average", err);
    return new Map();
  }
}

export async function getMarkets(games: Game[]): Promise<Map<string, GameMarkets>> {
  const ratings = await getRatings();
  return new Map(games.map((g) => [g.id, buildMarkets(g, (id) => ratings.get(id))]));
}

export async function getMarketsForGame(game: Game): Promise<GameMarkets> {
  const ratings = await getRatings();
  return buildMarkets(game, (id) => ratings.get(id));
}

/** Next day with games at or after `from`, looking ahead up to `limit` days. */
export async function findNextSlate(from: string, limit = 10): Promise<string | null> {
  for (let i = 0; i < limit; i++) {
    const key = shiftDay(from, i);
    if ((await getScoreboard(key)).length > 0) return key;
  }
  return null;
}
