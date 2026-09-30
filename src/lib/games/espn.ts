import "server-only";
import type { TeamRating } from "@/lib/betting/house-lines";
import { SPORTS, type SportKey } from "@/lib/sports";
import { buildMarkets } from "./markets";
import { applyOddsApi, fetchOddsApi } from "./odds-api";
import {
  parseCalendar,
  parseScoreboardEvent,
  parseSeasonYear,
  parseStandings,
  parseSummary,
  type CalendarWeek,
  type GameDetail,
} from "./parse";
import type { Game, GameMarkets } from "./types";

const BASE = "https://site.api.espn.com/apis";
const TZ = "America/New_York";
// ESPN's edge rejects default Node and browser-lookalike agents; identify honestly.
const USER_AGENT = "sinks/1.0 (+https://github.com/theKingSTL/Sinks-Gambling-Adiction)";
const RETRY_DELAYS_MS = [250, 800];

/** YYYYMMDD in US Eastern time (ESPN's scoreboard days are Eastern). */
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replaceAll("-", "");
}

export function shiftDay(key: string, days: number): string {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8) + days, 12));
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

export class FeedUnavailableError extends Error {}

// Last good payload per URL, so an upstream blip serves slightly stale data instead of an error page.
const globalForFeed = globalThis as unknown as { feedStale?: Map<string, unknown> };
const stale = (globalForFeed.feedStale ??= new Map<string, unknown>());

async function getJson(url: string, revalidate: number): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        next: { revalidate },
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (stale.size > 2_000) stale.clear();
        stale.set(url, data);
        return data;
      }
      lastError = new Error(`ESPN ${res.status} for ${url}`);
      if (res.status !== 403 && res.status !== 429 && res.status < 500) break; // not retryable
    } catch (err) {
      lastError = err;
    }
    if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  if (stale.has(url)) {
    console.warn("[espn] serving stale data", lastError);
    return stale.get(url);
  }
  throw new FeedUnavailableError(lastError instanceof Error ? lastError.message : "ESPN unavailable");
}

const siteUrl = (sport: SportKey, path: string, query: string) => {
  const extra = SPORTS[sport].scoreboardQuery;
  const q = [query, extra].filter(Boolean).join("&");
  return `${BASE}/site/v2/sports/${SPORTS[sport].path}/${path}${q ? `?${q}` : ""}`;
};

function revalidateForDay(key: string): number {
  const today = dayKey(new Date());
  // Live days refresh fast; past and future days rarely change.
  return key === today ? 15 : key > today ? 300 : 3600;
}

async function scoreboard(sport: SportKey, query: string, revalidate: number): Promise<Game[]> {
  const data = (await getJson(siteUrl(sport, "scoreboard", query), revalidate)) as { events?: unknown[] };
  const games = (data.events ?? [])
    .map((e) => parseScoreboardEvent(e, sport))
    .filter((g): g is Game => g !== null)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return applyOddsApi(games, await fetchOddsApi(sport));
}

export function getDayScoreboard(sport: SportKey, key: string): Promise<Game[]> {
  return scoreboard(sport, `dates=${key}`, revalidateForDay(key));
}

export async function getWeekScoreboard(sport: SportKey, week: CalendarWeek): Promise<Game[]> {
  const now = Date.now();
  const live = Date.parse(week.start) <= now && now <= Date.parse(week.end);
  return scoreboard(sport, `week=${week.week}&seasontype=${week.seasonType}`, live ? 15 : 300);
}

/** Current season calendar (football) and season year, from the default scoreboard. */
export async function getSeasonInfo(sport: SportKey): Promise<{ year: number | null; weeks: CalendarWeek[] }> {
  const data = await getJson(siteUrl(sport, "scoreboard", ""), 3600);
  return { year: parseSeasonYear(data), weeks: parseCalendar(data) };
}

/** The week containing `now`, or the next one to start. */
export function currentWeek(weeks: CalendarWeek[], now = Date.now()): CalendarWeek | null {
  return (
    weeks.find((w) => Date.parse(w.start) <= now && now <= Date.parse(w.end)) ??
    weeks.find((w) => Date.parse(w.start) > now) ??
    weeks.at(-1) ??
    null
  );
}

export async function getGameDetail(sport: SportKey, id: string): Promise<GameDetail | null> {
  if (!/^\d+$/.test(id)) return null;
  const data = await getJson(`${BASE}/site/v2/sports/${SPORTS[sport].path}/summary?event=${id}`, 15);
  const detail = parseSummary(data, sport);
  if (!detail) return null;
  const [game] = applyOddsApi([detail.game], await fetchOddsApi(sport));
  return { ...detail, game };
}

/** Current score and status, used by settlement and bet placement. */
export async function getGame(sport: SportKey, id: string): Promise<Game | null> {
  return (await getGameDetail(sport, id))?.game ?? null;
}

async function standingsFor(sport: SportKey, season: number | null) {
  const group = sport === "ncaaf" ? "group=80" : "";
  const q = [season ? `season=${season}` : "", group].filter(Boolean).join("&");
  const url = `${BASE}/v2/sports/${SPORTS[sport].path}/standings${q ? `?${q}` : ""}`;
  // Too large for the fetch cache; getRatings caches the parsed rows.
  const data = await getJson(url, sport === "ncaaf" ? 0 : 3600);
  return parseStandings(data);
}

/**
 * Team scoring ratings for the house line model. Early in a season the sample
 * is too small, so fall back to last season's numbers.
 */
const RATINGS_TTL_MS = 60 * 60_000;
// College standings are ~3 MB — over Next's 2 MB fetch-cache limit — so cache the parsed result instead.
const globalForRatings = globalThis as unknown as {
  ratingsCache?: Map<SportKey, { at: number; ratings: Promise<Map<string, TeamRating>> }>;
};
const ratingsCache = (globalForRatings.ratingsCache ??= new Map());

export function getRatings(sport: SportKey): Promise<Map<string, TeamRating>> {
  const hit = ratingsCache.get(sport);
  if (hit && Date.now() - hit.at < RATINGS_TTL_MS) return hit.ratings;
  const ratings = loadRatings(sport);
  ratingsCache.set(sport, { at: Date.now(), ratings });
  return ratings;
}

async function loadRatings(sport: SportKey): Promise<Map<string, TeamRating>> {
  try {
    const { year } = await getSeasonInfo(sport);
    let rows = await standingsFor(sport, year);
    const avgGp = rows.reduce((s, r) => s + r.gamesPlayed, 0) / Math.max(rows.length, 1);
    if (year && avgGp < SPORTS[sport].model.minGamesForRatings) rows = await standingsFor(sport, year - 1);
    return new Map(rows.map((r) => [r.teamId, { pointsFor: r.pointsFor, pointsAgainst: r.pointsAgainst }]));
  } catch (err) {
    console.error(`[espn] ${sport} standings unavailable, using league average`, err);
    ratingsCache.delete(sport); // retry on the next request instead of caching the failure
    return new Map();
  }
}

export async function getMarkets(sport: SportKey, games: Game[]): Promise<Map<string, GameMarkets>> {
  const ratings = await getRatings(sport);
  return new Map(games.map((g) => [g.id, buildMarkets(g, (id) => ratings.get(id))]));
}

export async function getMarketsForGame(game: Game): Promise<GameMarkets> {
  const ratings = await getRatings(game.sport);
  return buildMarkets(game, (id) => ratings.get(id));
}

/** Next day with games at or after `from`, looking ahead up to `limit` days. */
export async function findNextDay(sport: SportKey, from: string, limit = 14): Promise<string | null> {
  // Check a week at a time in parallel so long gaps (off days, All-Star break) stay fast.
  for (let start = 0; start < limit; start += 7) {
    const keys = Array.from({ length: Math.min(7, limit - start) }, (_, i) => shiftDay(from, start + i));
    const counts = await Promise.all(keys.map((k) => getDayScoreboard(sport, k).then((g) => g.length)));
    const hit = counts.findIndex((n) => n > 0);
    if (hit >= 0) return keys[hit];
  }
  return null;
}
