import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <p className="display text-3xl font-bold">Air ball</p>
      <p className="mt-1 text-sm text-muted">That page doesn&apos;t exist.</p>
      <Link href="/" className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink">
        Back to games
      </Link>
    </div>
  );
}
