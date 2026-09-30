"use client";

import { useRouter } from "next/navigation";

/** Native select that navigates on change — every week of the season in one control. */
export function WeekSelect({ options, value }: { options: { value: string; label: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="min-w-0 flex-1 sm:flex-none">
      <span className="sr-only">Week</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value)}
        className="w-full rounded-full border border-accent bg-accent-soft px-4 py-2 text-sm font-semibold text-text sm:w-auto"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
