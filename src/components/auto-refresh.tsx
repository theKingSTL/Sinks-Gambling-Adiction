"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render server data on an interval while the tab is visible (live scores). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
