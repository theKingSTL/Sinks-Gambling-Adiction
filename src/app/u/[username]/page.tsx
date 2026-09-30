import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { followAction } from "@/app/actions";
import { PostCard, tailOptions } from "@/components/post-card";
import { StatRow } from "@/components/stat-row";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getFeed, getFollowCounts, getStats, isFollowing } from "@/lib/social/service";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  return { title: `@${(await params).username}` };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = db
    .select({ id: users.id, username: users.username, displayName: users.displayName, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .get();
  if (!profile) notFound();

  const viewer = await getCurrentUser();
  const isMe = viewer?.id === profile.id;
  const following = viewer && !isMe ? isFollowing(db, viewer.id, profile.id) : false;
  const counts = getFollowCounts(db, profile.id);
  const stats = getStats(db, profile.id);
  const items = getFeed(db, { viewerId: viewer?.id ?? null, scope: "everyone", authorId: profile.id });
  const tails = await tailOptions(items, viewer?.id ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center gap-4">
        <div className="display grid h-16 w-16 place-items-center rounded-full bg-raised text-3xl font-bold text-accent" aria-hidden>
          {profile.displayName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-3xl font-extrabold">{profile.displayName}</h1>
          <p className="text-sm text-muted">
            @{profile.username} · <span className="num text-text">{counts.followers}</span> followers ·{" "}
            <span className="num text-text">{counts.following}</span> following
          </p>
        </div>
        {viewer && !isMe && (
          <form action={followAction}>
            <input type="hidden" name="username" value={profile.username} />
            <input type="hidden" name="follow" value={following ? "0" : "1"} />
            <button
              className={`rounded-full px-5 py-2 text-sm font-semibold ${
                following ? "border border-line-strong text-muted hover:text-text" : "bg-accent text-accent-ink hover:brightness-110"
              }`}
            >
              {following ? "Following" : "Follow"}
            </button>
          </form>
        )}
      </header>

      <StatRow stats={stats} />

      <h2 className="display text-xl font-bold">Posted bets</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          {isMe ? "Post a bet from My bets and it shows up here." : "Nothing posted yet."}
        </p>
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
