"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <p className="display text-2xl font-bold">Couldn&apos;t load this</p>
      <p className="mt-1 text-sm text-muted">The live NBA feed may be slow. Try again in a moment.</p>
      <button onClick={reset} className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink">
        Retry
      </button>
    </div>
  );
}
