import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { GameCard } from "@/components/game-card";
import { DayNav, WeekNav, weekId } from "@/components/schedule-nav";
import { SportTabs } from "@/components/sport-tabs";
import { dayLabel } from "@/lib/format";
import {
  currentWeek,
  dayKey,
  FeedUnavailableError,
  findNextDay,
  getDayScoreboard,
  getMarkets,
  getSeasonInfo,
  getWeekScoreboard,
  shiftDay,
} from "@/lib/games/espn";
import type { CalendarWeek } from "@/lib/games/parse";
import type { Game, GameMarkets } from "@/lib/games/types";
import { isSportKey, SPORTS } from "@/lib/sports";

export async function generateMetadata({ params }: PageProps<"/[sport]">): Promise<Metadata> {
  const { sport } = await params;
  return { title: isSportKey(sport) ? SPORTS[sport].name : "Not found" };
}

type NavState =
  | { kind: "week"; weeks: CalendarWeek[]; selected: CalendarWeek; current: CalendarWeek | null }
  | { kind: "day"; selected: string; today: string }
  | null;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SportPage({ params, searchParams }: PageProps<"/[sport]">) {
  const { sport } = await params;
  if (!isSportKey(sport)) notFound();
  const q = await searchParams;
  const config = SPORTS[sport];

  let heading: string;
  let nav: NavState = null;
  let games: Game[] = [];
  let notice: string | null = null;
  let isToday = false;

  try {
    if (config.browse === "week") {
      const { weeks } = await getSeasonInfo(sport);
      const current = currentWeek(weeks);
      const type = Number(one(q.type));
      const week = Number(one(q.week));
      const selected = weeks.find((w) => w.seasonType === type && w.week === week) ?? current;
      if (!selected) throw new FeedUnavailableError("No schedule");
      games = await getWeekScoreboard(sport, selected);
      isToday = !!current && weekId(current) === weekId(selected);
      heading = `${selected.seasonType === 3 ? "Postseason · " : ""}${selected.label}${selected.detail ? ` · ${selected.detail}` : ""}`;
      nav = { kind: "week", weeks, selected, current };
    } else {
      const today = dayKey(new Date());
      const date = one(q.date);
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`/${sport}?day=${date.replaceAll("-", "")}`);
      const next = one(q.next);
      if (next && /^\d{8}$/.test(next)) {
        const after = await findNextDay(sport, shiftDay(next, 1), 60);
        redirect(after ? `/${sport}?day=${after}` : `/${sport}?day=${next}&none=1`);
      }
      const requested = one(q.day);
      let selected = requested && /^\d{8}$/.test(requested) ? requested : today;
      games = await getDayScoreboard(sport, selected);
      if (!requested && games.length === 0) {
        const upcoming = await findNextDay(sport, shiftDay(today, 1));
        if (upcoming) {
          selected = upcoming;
          games = await getDayScoreboard(sport, upcoming);
          notice = `No ${config.label} games today — showing the next game day.`;
        }
      }
      if (one(q.none)) notice = "No more games found in the next 60 days.";
      isToday = selected === today;
      heading = dayLabel(selected, today);
      nav = { kind: "day", selected, today };
    }
  } catch (err) {
    if (!(err instanceof FeedUnavailableError)) throw err;
    console.error(`[${sport}] feed unavailable`, err);
    heading = "";
    nav = null;
    notice = "Live scores are temporarily unavailable. Try again in a minute.";
  }

  const markets = games.length ? await getMarkets(sport, games) : new Map<string, GameMarkets>();
  const order = { in: 0, pre: 1, post: 2 } as const;
  games.sort((a, b) => order[a.state] - order[b.state] || a.startsAt.localeCompare(b.startsAt));
  const hasLive = games.some((g) => g.state === "in");
  const preseason = games[0]?.seasonType === 1;

  return (
    <div className="space-y-5">
      {(hasLive || isToday) && <AutoRefresh seconds={hasLive ? 20 : 60} />}
      <SportTabs active={sport} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl font-extrabold">{config.name}</h1>
          <p className="text-sm text-muted">
            {games.length} {games.length === 1 ? "game" : "games"}
            {heading ? ` · ${heading}` : ""}
            {preseason && " · Preseason"}
          </p>
        </div>
        {hasLive && (
          <span className="flex items-center gap-2 text-sm font-semibold text-live">
            <span className="live-dot h-2 w-2 rounded-full bg-live" aria-hidden /> Live now
          </span>
        )}
      </div>

      {nav?.kind === "week" && <WeekNav sport={sport} weeks={nav.weeks} selected={nav.selected} current={nav.current} />}
      {nav?.kind === "day" && <DayNav sport={sport} selected={nav.selected} today={nav.today} />}

      {notice && <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{notice}</p>}

      {games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <p className="display text-2xl font-bold">No games here</p>
          <p className="mt-1 text-sm text-muted">Use the arrows or jump to another {config.browse}.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {games.map((g) => (
            <GameCard key={g.id} game={g} markets={markets.get(g.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
