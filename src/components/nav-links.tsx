"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Games", auth: false },
  { href: "/feed", label: "Feed", auth: false },
  { href: "/bets", label: "My bets", auth: true },
  { href: "/leaderboard", label: "Leaders", auth: false },
];

export function NavLinks({ signedIn, variant }: { signedIn: boolean; variant: "top" | "bottom" }) {
  const path = usePathname();
  return (
    <nav
      aria-label={variant === "top" ? "Main" : "Main (mobile)"}
      className={
        variant === "top"
          ? "hidden md:flex"
          : "fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bg/95 backdrop-blur md:hidden"
      }
    >
      {LINKS.filter((l) => signedIn || !l.auth).map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/games") : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 py-3 text-center text-sm font-medium md:flex-none md:px-3 md:py-2 ${
              active ? "text-text md:rounded-full md:bg-raised" : "text-muted hover:text-text"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
