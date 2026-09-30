"use client";

import { formatAmerican } from "@/lib/betting/odds";
import { useSlip, type SlipLeg } from "./slip/slip-context";

export function OddsButton({ leg, disabled, top }: { leg: SlipLeg; disabled?: boolean; top?: string }) {
  const slip = useSlip();
  const active = slip.has(leg.id);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${leg.label} at ${formatAmerican(leg.price)}`}
      onClick={() => slip.toggle(leg)}
      className={`flex h-12 w-full flex-col items-center justify-center rounded-lg border text-sm leading-tight transition ${
        active
          ? "border-accent bg-accent text-accent-ink"
          : "border-line bg-raised hover:border-line-strong disabled:opacity-35 disabled:hover:border-line"
      } disabled:cursor-not-allowed`}
    >
      {top && <span className={`num text-[11px] ${active ? "text-accent-ink/80" : "text-muted"}`}>{top}</span>}
      <span className="num font-semibold">{formatAmerican(leg.price)}</span>
    </button>
  );
}
