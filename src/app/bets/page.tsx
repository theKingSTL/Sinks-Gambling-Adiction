import type { Metadata } from "next";
import Link from "next/link";
import { BetTicket } from "@/components/bet-ticket";
import { PostBetForm } from "@/components/post-bet-form";
import { ResetBankroll } from "@/components/reset-bankroll";
import { StatRow } from "@/components/stat-row";
import { requireUser } from "@/lib/auth/session";
import { RESET_THRESHOLD_CENTS } from "@/lib/bets/service";
import { db } from "@/lib/db";
import { money, timeAgo } from "@/lib/format";
import { getStats, getUserBets } from "@/lib/social/service";

export const metadata: Metadata = { title: "My bets" };

export default async function MyBetsPage({ searchParams }: PageProps<"/bets">) {
  const user = await requireUser();
  const { show } = await searchParams;
  const settled = show === "settled";
  const all = getUserBets(db, user.id);
  const rows = all.filter((r) => (settled ? r.bet.status !== "open" : r.bet.status === "open"));
  const stats = getStats(db, user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-4xl font-extrabold">My bets</h1>
          <p className="text-sm text-muted">
            Balance <span className="num font-semibold text-text">{money(user.balanceCents)}</span> play money
          </p>
        </div>
        {user.balanceCents < RESET_THRESHOLD_CENTS && <ResetBankroll />}
      </div>

      <StatRow stats={stats} />

      <div role="tablist" className="flex gap-2">
        {[
          { key: "open", label: `Open (${stats.open})`, href: "/bets" },
          { key: "settled", label: "Settled", href: "/bets?show=settled" },
        ].map((t) => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={(t.key === "settled") === settled}
            href={t.href}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              (t.key === "settled") === settled ? "border-accent bg-accent-soft font-semibold" : "border-line text-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="display text-2xl font-bold">{settled ? "Nothing settled yet" : "No open bets"}</p>
          <p className="mt-1 text-sm text-muted">
            <Link href="/" className="text-accent underline">
              Browse tonight&apos;s games
            </Link>{" "}
            and tap a line to start a slip.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map(({ bet, legs, posted }) => (
            <li key={bet.id} className="space-y-2">
              <BetTicket bet={bet} legs={legs} />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="text-xs text-faint">
                  Placed {timeAgo(bet.placedAt)} ago{bet.tailedFromPostId ? " · tailed" : ""}
                </span>
                {posted ? <span className="text-xs text-muted">Posted</span> : <PostBetForm betId={bet.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
