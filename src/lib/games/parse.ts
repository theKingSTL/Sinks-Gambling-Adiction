import type { SportKey } from "@/lib/sports";
import type { BookOdds, Game, GameState, Prediction, TeamSide } from "./types";

/**
 * Normalizers for ESPN's public site API (all leagues share one shape). The
 * feed is untyped and changes between seasons, so every read is defensive and
 * missing data maps to null instead of throwing.
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
  const rank = num(obj(competitor.curatedRank).current) ?? num(competitor.rank);
  return {
    id: str(team.id) ?? "",
    abbr: str(team.abbreviation) ?? "",
    name: str(team.displayName) ?? "",
    shortName: str(team.shortDisplayName) ?? str(team.name) ?? "",
    logo: str(team.logo) ?? str(obj(arr(team.logos)[0]).href),
    color: str(team.color),
    score: num(competitor.score),
    record: overall ? str(overall.summary) : null,
    rank: rank !== null && rank > 0 && rank <= 25 ? rank : null, // ESPN uses 99 for unranked
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
    provider: str(obj(o.provider).displayName) ?? str(obj(o.provider).name) ?? "Sportsbook",
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

export function parseScoreboardEvent(raw: unknown, sport: SportKey): Game | null {
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
    sport,
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
export function parseSummaryGame(raw: unknown, sport: SportKey): Game | null {
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
  return parseScoreboardEvent(event, sport);
}

export type BoxPlayer = { id: string; name: string; starter: boolean; dnp: boolean; stats: string[] };
export type BoxGroup = { name: string; labels: string[]; players: BoxPlayer[] };
export type BoxTeam = { teamId: string; abbr: string; groups: BoxGroup[] };
export type TeamStatLine = { teamId: string; stats: { label: string; value: string }[] };
export type Leader = { teamId: string; category: string; player: string; value: string };

export type GameDetail = {
  game: Game;
  box: BoxTeam[];
  teamStats: TeamStatLine[];
  leaders: Leader[];
  /** ESPN's own Matchup Predictor, when published (football mostly). */
  espnPrediction: Pick<Prediction, "homeWinProb"> | null;
};

const titleCase = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

export function parseSummary(raw: unknown, sport: SportKey): GameDetail | null {
  const game = parseSummaryGame(raw, sport);
  if (!game) return null;
  const summary = obj(raw);
  const boxscore = obj(summary.boxscore);

  const box: BoxTeam[] = arr(boxscore.players).map((t) => {
    const team = obj(obj(t).team);
    return {
      teamId: str(team.id) ?? "",
      abbr: str(team.abbreviation) ?? "",
      groups: arr(obj(t).statistics)
        .map(obj)
        .map((g) => ({
          name: titleCase(str(g.text) ?? str(g.name) ?? str(g.type) ?? ""),
          labels: arr(g.labels).map((l) => String(l)),
          players: arr(g.athletes).map((a) => {
            const athlete = obj(obj(a).athlete);
            return {
              id: str(athlete.id) ?? "",
              name: str(athlete.shortName) ?? str(athlete.displayName) ?? "",
              starter: obj(a).starter === true,
              dnp: obj(a).didNotPlay === true,
              stats: arr(obj(a).stats).map((s) => String(s)),
            };
          }),
        }))
        .filter((g) => g.players.length > 0 && g.labels.length > 0),
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

  const predictor = obj(summary.predictor);
  const homePct = num(obj(predictor.homeTeam).gameProjection);
  const awayPct = num(obj(predictor.awayTeam).gameProjection);
  const espnPrediction =
    homePct !== null && awayPct !== null && homePct + awayPct > 0 ? { homeWinProb: homePct / (homePct + awayPct) } : null;

  return { game, box, teamStats, leaders, espnPrediction };
}

export type StandingRow = { teamId: string; abbr: string; pointsFor: number; pointsAgainst: number; gamesPlayed: number };

/** Standings nest conferences -> divisions; entries can repeat stats (overall first, then conference). */
function standingEntries(node: Json): Json[] {
  const own = arr(obj(node.standings).entries).map(obj);
  return [...own, ...arr(node.children).flatMap((c) => standingEntries(obj(c)))];
}

export function parseStandings(raw: unknown): StandingRow[] {
  const seen = new Set<string>();
  return standingEntries(obj(raw)).flatMap((entry) => {
    const team = obj(entry.team);
    const teamId = str(team.id);
    if (!teamId || seen.has(teamId)) return [];
    seen.add(teamId);

    const statList = arr(entry.stats).map(obj);
    const stats = new Map<unknown, number | null>();
    for (const s of statList) if (!stats.has(s.name)) stats.set(s.name, num(s.value));
    // Some leagues (college football) omit losses; the overall "W-L[-T]" string always has them.
    const overall = str(statList.find((s) => s.type === "total" || s.name === "overall")?.displayValue);
    const fromRecord = overall ? overall.split("-").reduce((sum, n) => sum + (Number(n) || 0), 0) : 0;
    const gp =
      stats.get("gamesPlayed") ??
      (fromRecord || (stats.get("wins") ?? 0) + (stats.get("losses") ?? 0) + (stats.get("ties") ?? 0));
    if (!gp) return [];
    const pf = stats.get("avgPointsFor") ?? (stats.get("pointsFor") != null ? stats.get("pointsFor")! / gp : null);
    const pa =
      stats.get("avgPointsAgainst") ?? (stats.get("pointsAgainst") != null ? stats.get("pointsAgainst")! / gp : null);
    if (pf == null || pa == null) return [];
    return [{ teamId, abbr: str(team.abbreviation) ?? "", pointsFor: pf, pointsAgainst: pa, gamesPlayed: gp }];
  });
}

export type CalendarWeek = { seasonType: number; week: number; label: string; detail: string; start: string; end: string };

/** Football season calendar from the scoreboard's league block. */
export function parseCalendar(raw: unknown): CalendarWeek[] {
  const league = obj(arr(obj(raw).leagues)[0]);
  return arr(league.calendar).flatMap((section) => {
    const s = obj(section);
    const seasonType = num(s.value);
    if (seasonType === null || seasonType > 3) return []; // skip off-season
    return arr(s.entries).flatMap((e) => {
      const entry = obj(e);
      const week = num(entry.value);
      const start = str(entry.startDate);
      const end = str(entry.endDate);
      if (week === null || !start || !end) return [];
      return [{ seasonType, week, label: str(entry.label) ?? `Week ${week}`, detail: str(entry.detail) ?? "", start, end }];
    });
  });
}

export function parseSeasonYear(raw: unknown): number | null {
  return num(obj(obj(arr(obj(raw).leagues)[0]).season).year);
}
