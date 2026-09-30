import { formatAmerican } from "@/lib/betting/odds";
import type { Bet, BetLeg } from "@/lib/db/schema";
import { money, signedMoney } from "@/lib/format";
import { SPORTS } from "@/lib/sports";

const STATUS_STYLE = {
  open: "text-muted",
  won: "text-win",
  lost: "text-loss",
  push: "text-push",
} as const;

const MARKET = { ml: "Moneyline", spread: "Spread", total: "Total" } as const;

export function StatusBadge({ status }: { status: Bet["status"] }) {
  const label = status === "open" ? "Open" : status === "won" ? "Won" : status === "lost" ? "Lost" : "Push";
  const tone = {
    open: "border-line-strong text-muted",
    won: "border-win/40 bg-win/10 text-win",
    lost: "border-loss/40 bg-loss/10 text-loss",
    push: "border-push/40 bg-push/10 text-push",
  }[status];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{label}</span>;
}

function LegIcon({ status }: { status: BetLeg["status"] }) {
  const glyph = { open: "", won: "✓", lost: "✕", push: "–" }[status];
  const tone = {
    open: "border-line-strong",
    won: "border-win bg-win text-bg",
    lost: "border-loss bg-loss text-bg",
    push: "border-push bg-push text-bg",
  }[status];
  return (
    <span aria-label={status} className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${tone}`}>
      {glyph}
    </span>
  );
}

export function BetTicket({ bet, legs }: { bet: Bet; legs: BetLeg[] }) {
  const profit = bet.status === "open" ? null : (bet.payoutCents ?? 0) - bet.stakeCents;
  return (
    <div className="rounded-xl border border-line bg-sunken">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {legs.length > 1 ? `${legs.length}-leg parlay` : "Straight"}
        </span>
        <div className="flex items-center gap-2">
          <span className="num text-sm font-semibold">{formatAmerican(bet.price)}</span>
          <StatusBadge status={bet.status} />
        </div>
      </div>
      <ul className="divide-y divide-line/70">
        {legs.map((leg) => (
          <li key={leg.id} className="flex items-center gap-3 px-3 py-2">
            <LegIcon status={leg.status} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${STATUS_STYLE[leg.status]} ${leg.status === "open" ? "!text-text" : ""}`}>
                {leg.label}
              </p>
              <p className="text-[11px] text-faint">
                {SPORTS[leg.sport].label} · {leg.matchup} · {MARKET[leg.market]}
                {leg.source === "house" ? " · house line" : ""}
              </p>
            </div>
            <span className="num text-xs text-muted">{formatAmerican(leg.price)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-3 py-2 text-sm">
        <span className="text-muted">
          Stake <span className="num text-text">{money(bet.stakeCents)}</span>
        </span>
        {profit === null ? (
          <span className="text-muted">
            To return <span className="num font-semibold text-text">{money(bet.potentialPayoutCents)}</span>
          </span>
        ) : (
          <span className={`num font-semibold ${profit > 0 ? "text-win" : profit < 0 ? "text-loss" : "text-push"}`}>
            {signedMoney(profit)}
          </span>
        )}
      </div>
    </div>
  );
}
