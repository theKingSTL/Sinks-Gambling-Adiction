import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { BetSlip } from "@/components/slip/bet-slip";
import { SlipProvider } from "@/components/slip/slip-context";
import { getCurrentUser } from "@/lib/auth/session";
import { maybeSettle } from "@/lib/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Sinks — NBA parlays with friends", template: "%s · Sinks" },
  description: "Live NBA scores, stats and lines. Build parlays with play money and let your friends tail them.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Grade finished games before reading the balance shown in the nav.
  await maybeSettle();
  const user = await getCurrentUser();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full`}>
      <body className="min-h-full">
        <SlipProvider>
          <Nav user={user} />
          <div className="mx-auto flex max-w-7xl gap-6 px-4 pt-6 pb-28 lg:pb-12">
            <main className="min-w-0 flex-1">{children}</main>
            <BetSlip signedIn={!!user} balanceCents={user?.balanceCents ?? null} />
          </div>
        </SlipProvider>
      </body>
    </html>
  );
}
