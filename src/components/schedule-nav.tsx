import Link from "next/link";
import { dayLabel } from "@/lib/format";
import type { CalendarWeek } from "@/lib/games/parse";
import type { SportKey } from "@/lib/sports";
import { WeekSelect } from "./week-select";

const pill = (active: boolean) =>
  `shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${
    active ? "border-accent bg-accent-soft text-text" : "border-line text-muted hover:text-text"
  }`;
const arrow = "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted hover:text-text";

const shift = (key: string, days: number) => {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8) + days, 12));
  return d.toISOString().slice(0, 10).replaceAll("-", "");
};
const toInput = (key: string) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;

/** Day-by-day browsing: arrows step a day, the strip shows the surrounding week, the picker jumps anywhere. */
export function DayNav({ sport, selected, today }: { sport: SportKey; selected: string; today: string }) {
  const href = (d: string) => (d === today ? `/${sport}` : `/${sport}?day=${d}`);
  const days = Array.from({ length: 7 }, (_, i) => shift(selected, i - 3));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href={href(shift(selected, -1))} aria-label="Previous day" className={arrow}>
          ‹
        </Link>
        <nav aria-label="Pick a day" className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {days.map((d) => (
            <Link key={d} href={href(d)} aria-current={d === selected ? "date" : undefined} className={pill(d === selected)}>
              {dayLabel(d, today)}
            </Link>
          ))}
        </nav>
        <Link href={href(shift(selected, 1))} aria-label="Next day" className={arrow}>
          ›
        </Link>
      </div>
      <form action={`/${sport}`} className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="date" className="text-muted">
          Jump to
        </label>
        <input
          id="date"
          name="date"
          type="date"
          defaultValue={toInput(selected)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-text [color-scheme:inherit]"
        />
        <button className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-text">Go</button>
        {selected !== today && (
          <Link href={`/${sport}`} className="text-accent hover:underline">
            Back to today
          </Link>
        )}
        <Link href={`/${sport}?next=${selected}`} className="ml-auto text-muted hover:text-text">
          Next game day →
        </Link>
      </form>
    </div>
  );
}

const weekHref = (sport: SportKey, w: CalendarWeek) => `/${sport}?type=${w.seasonType}&week=${w.week}`;
export const weekId = (w: CalendarWeek) => `${w.seasonType}-${w.week}`;

/** Football: every week of the season, regular and postseason. */
export function WeekNav({
  sport,
  weeks,
  selected,
  current,
}: {
  sport: SportKey;
  weeks: CalendarWeek[];
  selected: CalendarWeek;
  current: CalendarWeek | null;
}) {
  const i = weeks.findIndex((w) => weekId(w) === weekId(selected));
  const prev = weeks[i - 1];
  const next = weeks[i + 1];
  const options = weeks.map((w) => ({
    value: weekHref(sport, w),
    label: `${w.seasonType === 3 ? "Postseason · " : ""}${w.label}${w.detail ? ` (${w.detail})` : ""}`,
  }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {prev ? (
        <Link href={weekHref(sport, prev)} aria-label={`Previous: ${prev.label}`} className={arrow}>
          ‹
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden>
          ‹
        </span>
      )}
      <WeekSelect options={options} value={weekHref(sport, selected)} />
      {next ? (
        <Link href={weekHref(sport, next)} aria-label={`Next: ${next.label}`} className={arrow}>
          ›
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden>
          ›
        </span>
      )}
      {current && weekId(current) !== weekId(selected) && (
        <Link href={`/${sport}`} className="text-sm text-accent hover:underline">
          This week
        </Link>
      )}
    </div>
  );
}
