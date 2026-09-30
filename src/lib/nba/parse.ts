import type { BookOdds, Game, GameState, TeamSide } from "./types";

/**
 * Normalizers for ESPN's public site API. The feed is untyped and changes
 * shape between seasons, so every read is defensive and missing data maps to
 * null instead of throwing.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/^[ou]/i, "");
    if (/^even$/i.test(cleaned)) return 100;
    const n = Number(cleaned);
    return cleaned !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/** American prices must be integers outside (-100, 100). */
function price(v: unknown): number | null {
  const n = num(v);
  return n !== null && Number.isInteger(n) && Math.abs(n) >= 100 ? n : null;
}

function parseTeam(competitor: Json): TeamSide {
  const team = obj(competitor.team);
  const records = arr(competitor.records ?? competitor.record).map(obj);
  const overall = records.find((r) => r.type === "total" || r.name === "overall") ?? records[0];
  return {
    id: str(team.id) ?? "",
    abbr: str(team.abbreviation) ?? "",
    name: str(team.displayName) ?? "",
    shortName: str(team.shortDisplayName) ?? str(team.name) ?? "",
    logo: str(team.logo) ?? str(obj(arr(team.logos)[0]).href),
    color: str(team.color),
    score: num(competitor.score),
    record: overall ? str(overall.summary) : null,
  };
}

function closeOrOpen(v: unknown): Json {
  const o = obj(v);
  return obj(o.close ?? o.current ?? o.open);
}

export function parseBookOdds(raw: unknown): BookOdds | null {
  const o = obj(arr(raw)[0]);
  if (Object.keys(o).length === 0) return null;

  const home = obj(o.homeTeamOdds);
  const away = obj(o.awayTeamOdds);
  const ml = obj(o.moneyline);
  const ps = obj(o.pointSpread);
  const tot = obj(o.total);

  const homeSpread = num(closeOrOpen(ps.home).line) ?? num(home.spread) ?? num(o.spread);
  const odds: BookOdds = {
    provider: str(obj(o.provider).name) ?? "Sportsbook",
    homeMoneyline: price(closeOrOpen(ml.home).odds) ?? price(home.moneyLine),
    awayMoneyline: price(closeOrOpen(ml.away).odds) ?? price(away.moneyLine),
    homeSpread,
    homeSpreadPrice: price(closeOrOpen(ps.home).odds) ?? price(home.spreadOdds),
    awaySpreadPrice: price(closeOrOpen(ps.away).odds) ?? price(away.spreadOdds),
    total: num(closeOrOpen(tot.over).line) ?? num(o.overUnder),
    overPrice: price(closeOrOpen(tot.over).odds) ?? price(o.overOdds),
    underPrice: price(closeOrOpen(tot.under).odds) ?? price(o.underOdds),
  };
  const hasAny = [odds.homeMoneyline, odds.homeSpread, odds.total].some((v) => v !== null);
  return hasAny ? odds : null;
}

function parseState(v: unknown): GameState {
  return v === "in" || v === "post" ? v : "pre";
}

export function parseScoreboardEvent(raw: unknown): Game | null {
  const event = obj(raw);
  const comp = obj(arr(event.competitions)[0]);
  const competitors = arr(comp.competitors).map(obj);
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  const id = str(event.id);
  const startsAt = str(event.date);
  if (!id || !startsAt || !home || !away) return null;

  const statusType = obj(obj(event.status).type);
  return {
    id,
    startsAt,
    state: parseState(statusType.state),
    completed: statusType.completed === true,
    statusText: str(statusType.shortDetail) ?? str(statusType.detail) ?? "",
    seasonType: num(obj(event.season).type) ?? 2,
    home: parseTeam(home),
    away: parseTeam(away),
    bookOdds: parseBookOdds(comp.odds),
  };
}

/** Summary endpoint: header carries status + competitors, pickcenter carries odds. */
export function parseSummaryGame(raw: unknown): Game | null {
  const summary = obj(raw);
  const header = obj(summary.header);
  const comp = obj(arr(header.competitions)[0]);
  const event = {
    id: header.id,
    date: comp.date,
    season: header.season,
    status: comp.status,
    competitions: [{ competitors: comp.competitors, odds: summary.pickcenter ?? summary.odds }],
  };
  return parseScoreboardEvent(event);
}

export type BoxPlayer = { id: string; name: string; starter: boolean; dnp: boolean; stats: string[] };
export type BoxTeam = { teamId: string; abbr: string; labels: string[]; players: BoxPlayer[] };
export type TeamStatLine = { teamId: string; stats: { label: string; value: string }[] };
export type Leader = { teamId: string; category: string; player: string; value: string };

export type GameDetail = {
  game: Game;
  box: BoxTeam[];
  teamStats: TeamStatLine[];
  leaders: Leader[];
};

export function parseSummary(raw: unknown): GameDetail | null {
  const game = parseSummaryGame(raw);
  if (!game) return null;
  const summary = obj(raw);
  const boxscore = obj(summary.boxscore);

  const box: BoxTeam[] = arr(boxscore.players).map((t) => {
    const team = obj(obj(t).team);
    const stats = obj(arr(obj(t).statistics)[0]);
    return {
      teamId: str(team.id) ?? "",
      abbr: str(team.abbreviation) ?? "",
      labels: arr(stats.labels).map((l) => String(l)),
      players: arr(stats.athletes).map((a) => {
        const athlete = obj(obj(a).athlete);
        return {
          id: str(athlete.id) ?? "",
          name: str(athlete.shortName) ?? str(athlete.displayName) ?? "",
          starter: obj(a).starter === true,
          dnp: obj(a).didNotPlay === true,
          stats: arr(obj(a).stats).map((s) => String(s)),
        };
      }),
    };
  });

  const teamStats: TeamStatLine[] = arr(boxscore.teams).map((t) => ({
    teamId: str(obj(obj(t).team).id) ?? "",
    stats: arr(obj(t).statistics)
      .map(obj)
      .map((s) => ({ label: str(s.abbreviation) ?? str(s.label) ?? "", value: str(s.displayValue) ?? "" }))
      .filter((s) => s.label && s.value),
  }));

  const leaders: Leader[] = arr(summary.leaders).flatMap((t) => {
    const teamId = str(obj(obj(t).team).id) ?? "";
    return arr(obj(t).leaders).flatMap((cat) => {
      const top = obj(arr(obj(cat).leaders)[0]);
      const player = str(obj(top.athlete).displayName);
      const value = str(top.displayValue);
      const category = str(obj(cat).displayName) ?? "";
      return player && value ? [{ teamId, category, player, value }] : [];
    });
  });

  return { game, box, teamStats, leaders };
}

export type StandingRow = { teamId: string; abbr: string; pointsFor: number; pointsAgainst: number; gamesPlayed: number };

export function parseStandings(raw: unknown): StandingRow[] {
  return arr(obj(raw).children).flatMap((conf) =>
    arr(obj(obj(conf).standings).entries).flatMap((e) => {
      const entry = obj(e);
      const team = obj(entry.team);
      const stats = new Map(arr(entry.stats).map(obj).map((s) => [s.name, num(s.value)]));
      const pf = stats.get("avgPointsFor");
      const pa = stats.get("avgPointsAgainst");
      const gp = (stats.get("wins") ?? 0) + (stats.get("losses") ?? 0);
      const teamId = str(team.id);
      if (!teamId || pf == null || pa == null || gp === 0) return [];
      return [{ teamId, abbr: str(team.abbreviation) ?? "", pointsFor: pf, pointsAgainst: pa, gamesPlayed: gp }];
    }),
  );
}
