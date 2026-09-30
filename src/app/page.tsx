import { redirect } from "next/navigation";
import { SPORT_KEYS } from "@/lib/sports";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Links from before multi-sport (`/?day=…`) were NBA.
  const { day } = await searchParams;
  redirect(typeof day === "string" ? `/nba?day=${encodeURIComponent(day)}` : `/${SPORT_KEYS[0]}`);
}
