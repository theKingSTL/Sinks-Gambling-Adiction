"use client";

import { useSlip, type SlipLeg } from "./slip/slip-context";

export function TailButton({ postId, legs, reason }: { postId: string; legs: SlipLeg[]; reason: string | null }) {
  const slip = useSlip();
  if (reason) return <span className="text-xs text-faint">{reason}</span>;
  return (
    <button
      onClick={() => slip.loadTail(postId, legs)}
      className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink transition hover:brightness-110"
    >
      Tail this
    </button>
  );
}
