"use client";

import { useState, useTransition } from "react";
import { resetBankrollAction } from "@/app/actions";

export function ResetBankroll() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() => start(async () => setMsg((await resetBankrollAction()).error ?? "Refilled to $1,000"))}
        className="rounded-full border border-accent px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
      >
        Reset to $1,000
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
