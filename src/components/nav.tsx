import Link from "next/link";
import { logoutAction } from "@/app/actions";
import type { PublicUser } from "@/lib/auth/core";
import { money } from "@/lib/format";
import { NavLinks } from "./nav-links";

export function Nav({ user }: { user: PublicUser | null }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="display flex items-center gap-2 text-2xl font-extrabold tracking-wide">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm text-accent-ink">
              S
            </span>
            Sinks
          </Link>
          <NavLinks signedIn={!!user} variant="top" />
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/bets"
                  title="Play-money balance"
                  className="num rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold"
                >
                  {money(user.balanceCents)}
                </Link>
                <Link href={`/u/${user.username}`} className="hidden text-sm text-muted hover:text-text sm:block">
                  @{user.username}
                </Link>
                <form action={logoutAction}>
                  <button className="text-sm text-faint hover:text-text">Log out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-muted hover:text-text">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink">
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {/* Outside the header: its backdrop-filter would trap a fixed child. */}
      <NavLinks signedIn={!!user} variant="bottom" />
    </>
  );
}
