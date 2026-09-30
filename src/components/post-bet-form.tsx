"use client";

import { useState, useTransition } from "react";
import { postBetAction } from "@/app/actions";

export function PostBetForm({ betId }: { betId: string }) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-accent hover:underline">
        Post to feed
      </button>
    );
  }
  return (
    <form
      className="mt-2 flex w-full flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await postBetAction({ betId, caption });
          if (!res.ok) setError(res.error ?? "Could not post");
        });
      }}
    >
      <input
        autoFocus
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={280}
        placeholder="Say something about it…"
        aria-label="Caption"
        className="flex-1 rounded-xl border border-line-strong bg-sunken px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button disabled={pending} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
        {pending ? "Posting…" : "Post"}
      </button>
      {error && <p className="text-sm text-loss">{error}</p>}
    </form>
  );
}
