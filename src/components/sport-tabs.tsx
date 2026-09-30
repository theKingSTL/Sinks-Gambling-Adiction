import Link from "next/link";
import { SPORT_KEYS, SPORTS, type SportKey } from "@/lib/sports";

export function SportTabs({ active }: { active: SportKey }) {
  return (
    <nav aria-label="Sport" className="-mx-4 flex gap-1 overflow-x-auto px-4">
      {SPORT_KEYS.map((key) => (
        <Link
          key={key}
          href={`/${key}`}
          aria-current={key === active ? "page" : undefined}
          className={`display shrink-0 rounded-lg px-4 py-2 text-lg font-bold ${
            key === active ? "bg-text text-bg" : "text-muted hover:bg-raised hover:text-text"
          }`}
        >
          {SPORTS[key].label}
        </Link>
      ))}
    </nav>
  );
}
