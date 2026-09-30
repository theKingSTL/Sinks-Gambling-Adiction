"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { placeBetAction, postBetAction } from "@/app/actions";
import { formatAmerican, parlayAmerican, payoutCents } from "@/lib/betting/odds";
import { money } from "@/lib/format";
import { useSlip } from "./slip-context";

const QUICK_STAKES = [10, 25, 50, 100];

export function BetSlip({ signedIn, balanceCents }: { signedIn: boolean; balanceCents: number | null }) {
  const slip = useSlip();
  const count = slip.legs.length;

  return (
    <>
      {/* Desktop: sticky rail */}
      <aside aria-label="Bet slip" className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-[340px] shrink-0 lg:block">
        <SlipPanel signedIn={signedIn} balanceCents={balanceCents} />
      </aside>

      {/* Mobile: bottom bar + sheet */}
      <div className="lg:hidden">
        {count > 0 && !slip.open && (
          <button
            onClick={() => slip.setOpen(true)}
            className="fixed inset-x-4 bottom-[4.25rem] z-30 md:bottom-4 flex items-center justify-between rounded-2xl bg-accent px-5 py-4 font-semibold text-accent-ink shadow-2xl"
          >
            <span>Bet slip · {count}</span>
            <span className="num">{count > 1 ? formatAmerican(parlayAmerican(slip.legs.map((l) => l.price))) : formatAmerican(slip.legs[0].price)}</span>
          </button>
        )}
        {slip.open && (
          <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => slip.setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Bet slip"
              className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <SlipPanel signedIn={signedIn} balanceCents={balanceCents} onClose={() => slip.setOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SlipPanel({ signedIn, balanceCents, onClose }: { signedIn: boolean; balanceCents: number | null; onClose?: () => void }) {
  const slip = useSlip();
  const [stake, setStake] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ betId: string; summary: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const prices = slip.legs.map((l) => l.price);
  const stakeCents = Math.round((Number.parseFloat(stake) || 0) * 100);
  const combined = prices.length === 0 ? null : prices.length === 1 ? prices[0] : parlayAmerican(prices);
  const toWin = prices.length && stakeCents > 0 ? payoutCents(stakeCents, prices) : 0;
  const overBalance = balanceCents !== null && stakeCents > balanceCents;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await placeBetAction({
        stakeCents,
        tailedFromPostId: slip.tailedFromPostId,
        legs: slip.legs.map((l) => ({ selectionId: l.id, price: l.price, line: l.line })),
      });
      if (res.ok) {
        const summary = slip.legs.length > 1 ? `${slip.legs.length}-leg parlay` : slip.legs[0].label;
        setPlaced({ betId: res.betId, summary });
        slip.clear();
      } else {
        setError(res.error);
        if (res.changes) slip.applyChanges(res.changes);
      }
    });
  }

  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="display text-lg font-bold">
          {slip.legs.length > 1 ? `Parlay · ${slip.legs.length} legs` : "Bet slip"}
        </h2>
        <div className="flex items-center gap-3">
          {slip.legs.length > 0 && (
            <button onClick={slip.clear} className="text-sm text-muted hover:text-text">
              Clear
            </button>
          )}
          {onClose && (
            <button onClick={onClose} aria-label="Close slip" className="text-2xl leading-none text-muted hover:text-text">
              ×
            </button>
          )}
        </div>
      </header>

      {placed ? (
        <PlacedCard {...placed} onDone={() => setPlaced(null)} />
      ) : slip.legs.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-medium">Your slip is empty</p>
          <p className="mt-1 text-sm text-muted">Tap any line to add it. Add two or more to build a parlay.</p>
        </div>
      ) : (
        <>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {slip.legs.map((leg) => (
              <li key={leg.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{leg.label}</p>
                  <p className="text-xs text-muted">
                    {leg.matchup} · {leg.market === "ml" ? "Moneyline" : leg.market === "spread" ? "Spread" : "Total"}
                  </p>
                  {leg.source === "house" && <p className="mt-0.5 text-[11px] text-faint">House line</p>}
                </div>
                <span className="num pt-0.5 font-semibold">{formatAmerican(leg.price)}</span>
                <button
                  onClick={() => slip.remove(leg.id)}
                  aria-label={`Remove ${leg.label}`}
                  className="-mr-1 px-1 text-lg leading-none text-faint hover:text-text"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-3 border-t border-line bg-raised/50 p-4">
            {slip.notice && <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-text">{slip.notice}</p>}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Odds</span>
              <span className="num font-semibold">{combined !== null ? formatAmerican(combined) : "—"}</span>
            </div>

            <label className="block">
              <span className="sr-only">Stake in dollars</span>
              <div className="flex items-center rounded-xl border border-line-strong bg-sunken px-3 focus-within:border-accent">
                <span className="text-muted">$</span>
                <input
                  inputMode="decimal"
                  value={stake}
                  onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ""))}
                  className="num w-full bg-transparent px-2 py-2.5 text-lg outline-none"
                  aria-label="Stake"
                />
              </div>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_STAKES.map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(String(v))}
                  className="num rounded-lg border border-line py-1.5 text-sm text-muted hover:border-line-strong hover:text-text"
                >
                  ${v}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Returns</span>
              <span className="num text-xl font-bold text-win">{money(toWin)}</span>
            </div>

            {error && (
              <p role="alert" className="text-sm text-loss">
                {error}
              </p>
            )}

            {signedIn ? (
              <button
                onClick={submit}
                disabled={pending || stakeCents < 100 || overBalance}
                className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Placing…" : overBalance ? "Not enough play money" : `Place ${money(stakeCents)}`}
              </button>
            ) : (
              <Link
                href="/login"
                className="block w-full rounded-xl bg-accent py-3 text-center font-semibold text-accent-ink hover:brightness-110"
              >
                Sign in to bet
              </Link>
            )}
            <p className="text-center text-[11px] text-faint">Play money only. No deposits, no cash value.</p>
          </div>
        </>
      )}
    </div>
  );
}

function PlacedCard({ betId, summary, onDone }: { betId: string; summary: string; onDone: () => void }) {
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<"idle" | "posted" | string>("idle");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 p-5">
      <div>
        <p className="display text-2xl font-bold text-win">Bet placed</p>
        <p className="text-sm text-muted">{summary} is live on your card.</p>
      </div>
      {status === "posted" ? (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">
          Posted. <Link href="/feed" className="font-semibold underline">See it in the feed</Link>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await postBetAction({ betId, caption });
              setStatus(res.ok ? "posted" : (res.error ?? "Could not post"));
            });
          }}
          className="space-y-2"
        >
          <label htmlFor="caption" className="text-sm font-medium">
            Post it so friends can tail
          </label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Lock of the night…"
            className="w-full resize-none rounded-xl border border-line-strong bg-sunken px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {status !== "idle" && <p className="text-sm text-loss">{status}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-ink disabled:opacity-50">
            {pending ? "Posting…" : "Post to feed"}
          </button>
        </form>
      )}
      <button onClick={onDone} className="w-full rounded-xl border border-line py-2.5 text-sm text-muted hover:text-text">
        Build another
      </button>
    </div>
  );
}
