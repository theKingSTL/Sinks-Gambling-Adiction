import Link from "next/link";
import { allSelections } from "@/lib/nba/markets";
import { resolveMarkets } from "@/lib/server";
import type { FeedItem } from "@/lib/social/service";
import { timeAgo } from "@/lib/format";
import { BetTicket } from "./bet-ticket";
import { toSlipLeg } from "./game-card";
import type { SlipLeg } from "./slip/slip-context";
import { TailButton } from "./tail-button";

type Tailable = { legs: SlipLeg[]; reason: string | null };

/** Current-line versions of each post's legs, so a tail re-prices honestly. */
export async function tailOptions(items: FeedItem[], viewerId: string | null): Promise<Map<string, Tailable>> {
  const now = Date.now();
  const gameIds = [
    ...new Set(items.flatMap((i) => i.legs.filter((l) => l.startsAt.getTime() > now).map((l) => l.gameId))),
  ];
  const live = gameIds.length ? await resolveMarkets(gameIds) : new Map();

  return new Map(
    items.map((item): [string, Tailable] => {
      const none = (reason: string | null) => [item.postId, { legs: [], reason }] as [string, Tailable];
      if (item.author.id === viewerId) return none(null);
      if (item.tailedByViewer) return none("You tailed this");
      if (item.bet.status !== "open" || item.legs.some((l) => l.startsAt.getTime() <= now)) return none("Tip-off passed");
      const legs: SlipLeg[] = [];
      for (const leg of item.legs) {
        const entry = live.get(leg.gameId);
        const sel = entry?.markets.open ? allSelections(entry.markets).find((s) => s.market === leg.market && s.side === leg.side) : undefined;
        if (!entry || !sel) return none("Lines closed");
        legs.push(toSlipLeg(sel, entry.game));
      }
      return [item.postId, { legs, reason: null }];
    }),
  );
}

export function PostCard({ item, tail }: { item: FeedItem; tail: Tailable | undefined }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <header className="mb-3 flex items-center gap-3">
        <Link
          href={`/u/${item.author.username}`}
          className="display grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raised text-lg font-bold text-accent"
          aria-hidden
          tabIndex={-1}
        >
          {item.author.displayName.slice(0, 1)}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${item.author.username}`} className="font-semibold hover:underline">
            {item.author.displayName}
          </Link>
          <p className="text-xs text-faint">
            @{item.author.username} · {timeAgo(item.createdAt)}
          </p>
        </div>
      </header>
      {item.caption && <p className="mb-3 whitespace-pre-wrap break-words">{item.caption}</p>}
      <BetTicket bet={item.bet} legs={item.legs} />
      <footer className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted">
          <span className="num font-semibold text-text">{item.tails}</span> {item.tails === 1 ? "tail" : "tails"}
        </span>
        {tail && (tail.legs.length > 0 || tail.reason) && (
          <TailButton postId={item.postId} legs={tail.legs} reason={tail.reason} />
        )}
      </footer>
    </article>
  );
}
