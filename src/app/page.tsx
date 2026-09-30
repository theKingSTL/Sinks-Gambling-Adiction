import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { GameCard } from "@/components/game-card";
import { dayLabel } from "@/lib/format";
import { dayKey, findNextSlate, getMarkets, getScoreboard, shiftDay } from "@/lib/nba/espn";

export default async function GamesPage({ searchParams }: PageProps<"/">) {
  const { day } = await searchParams;
  const today = dayKey(new Date());
  const requested = typeof day === "string" && /^\d{8}$/.test(day) ? day : null;

  let selected = requested ?? today;
  let games = await getScoreboard(selected);
  let jumped = false;
  if (!requested && games.length === 0) {
    const next = await findNextSlate(shiftDay(today, 1));
    if (next) {
      selected = next;
      games = await getScoreboard(next);
      jumped = true;
    }
  }

  const markets = await getMarkets(games);
  const order = { in: 0, pre: 1, post: 2 } as const;
  games.sort((a, b) => order[a.state] - order[b.state] || a.startsAt.localeCompare(b.startsAt));
  const hasLive = games.some((g) => g.state === "in");
  const days = Array.from({ length: 8 }, (_, i) => shiftDay(today, i - 1));

  return (
    <div className="space-y-5">
      {(hasLive || selected === today) && <AutoRefresh seconds={hasLive ? 20 : 60} />}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl font-extrabold">NBA</h1>
          <p className="text-sm text-muted">
            {games.length} {games.length === 1 ? "game" : "games"} · {dayLabel(selected, today)}
            {games[0]?.seasonType === 1 && " · Preseason"}
          </p>
        </div>
        {hasLive && (
          <span className="flex items-center gap-2 text-sm font-semibold text-live">
            <span className="live-dot h-2 w-2 rounded-full bg-live" aria-hidden /> Live now
          </span>
        )}
      </div>

      <nav aria-label="Pick a day" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => (
          <Link
            key={d}
            href={d === today ? "/" : `/?day=${d}`}
            aria-current={d === selected ? "date" : undefined}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${
              d === selected ? "border-accent bg-accent-soft text-text" : "border-line text-muted hover:text-text"
            }`}
          >
            {dayLabel(d, today)}
          </Link>
        ))}
      </nav>

      {jumped && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          No games today — showing the next slate.
        </p>
      )}

      {games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <p className="display text-2xl font-bold">No games on this day</p>
          <p className="mt-1 text-sm text-muted">Pick another day above.</p>
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
