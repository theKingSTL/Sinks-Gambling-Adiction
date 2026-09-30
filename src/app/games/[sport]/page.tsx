import { notFound, redirect } from "next/navigation";
import { isSportKey } from "@/lib/sports";

/** `/games/<id>` links from before multi-sport were NBA; `/games/<sport>` goes to that sport's schedule. */
export default async function LegacyGameRedirect({ params }: PageProps<"/games/[sport]">) {
  const { sport } = await params;
  if (/^\d+$/.test(sport)) redirect(`/games/nba/${sport}`);
  if (isSportKey(sport)) redirect(`/${sport}`);
  notFound();
}
