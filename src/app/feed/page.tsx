import type { Metadata } from "next";
import Link from "next/link";
import { PostCard, tailOptions } from "@/components/post-card";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getFeed, searchUsers } from "@/lib/social/service";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const { tab, q } = await searchParams;
  const user = await getCurrentUser();
  const scope = user && tab !== "everyone" ? "following" : "everyone";
  const items = getFeed(db, { viewerId: user?.id ?? null, scope });
  const tails = await tailOptions(items, user?.id ?? null);
  const query = typeof q === "string" ? q.slice(0, 40) : "";
  const people = query ? searchUsers(db, query) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="display text-4xl font-extrabold">Feed</h1>
        {user && (
          <div role="tablist" className="flex rounded-full border border-line p-1 text-sm">
            {(["following", "everyone"] as const).map((t) => (
              <Link
                key={t}
                role="tab"
                aria-selected={scope === t}
                href={t === "following" ? "/feed" : "/feed?tab=everyone"}
                className={`rounded-full px-3 py-1 capitalize ${scope === t ? "bg-raised font-semibold" : "text-muted"}`}
              >
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>

      <form action="/feed" className="flex gap-2">
        {scope === "everyone" && user && <input type="hidden" name="tab" value="everyone" />}
        <label htmlFor="q" className="sr-only">
          Find friends
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Find friends by username"
          className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button className="rounded-xl border border-line px-4 text-sm text-muted hover:text-text">Search</button>
      </form>

      {query && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {people.length === 0 && <li className="px-4 py-3 text-sm text-muted">No one matches “{query}”.</li>}
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/u/${p.username}`} className="flex items-center justify-between px-4 py-3 hover:bg-raised">
                <span className="font-medium">{p.displayName}</span>
                <span className="text-sm text-faint">@{p.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="display text-2xl font-bold">{scope === "following" ? "Your feed is quiet" : "No posts yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {scope === "following" ? (
              <>
                Follow friends, or check{" "}
                <Link href="/feed?tab=everyone" className="text-accent underline">
                  everyone
                </Link>
                .
              </>
            ) : (
              "Place a bet and post it — be the first."
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <PostCard key={item.postId} item={item} tail={tails.get(item.postId)} />
          ))}
        </div>
      )}
    </div>
  );
}
