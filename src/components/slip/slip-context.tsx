"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LineChange } from "@/lib/bets/service";
import type { Selection } from "@/lib/games/types";

export type SlipLeg = Selection & { matchup: string; startsAt: string };

type SlipState = { legs: SlipLeg[]; tailedFromPostId?: string; notice?: string };

type SlipApi = SlipState & {
  has: (id: string) => boolean;
  toggle: (leg: SlipLeg) => void;
  remove: (id: string) => void;
  clear: () => void;
  loadTail: (postId: string, legs: SlipLeg[]) => void;
  applyChanges: (changes: LineChange[]) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const MAX_LEGS = 10;
const STORAGE_KEY = "sinks:slip:v1";
const SlipContext = createContext<SlipApi | null>(null);

export function SlipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SlipState>({ legs: [] });
  const [open, setOpen] = useState(false);

  // Restore after mount so server and client render the same first frame.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SlipState;
      const live = saved.legs.filter((l) => Date.parse(l.startsAt) > Date.now());
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
      setState({ legs: live, tailedFromPostId: saved.tailedFromPostId });
    } catch {
      /* storage unavailable — start empty */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ legs: state.legs, tailedFromPostId: state.tailedFromPostId }));
    } catch {
      /* ignore */
    }
  }, [state.legs, state.tailedFromPostId]);

  const toggle = useCallback((leg: SlipLeg) => {
    setState((s) => {
      if (s.legs.some((l) => l.id === leg.id)) {
        return { legs: s.legs.filter((l) => l.id !== leg.id) };
      }
      const sameGame = s.legs.find((l) => l.gameId === leg.gameId);
      const others = s.legs.filter((l) => l.gameId !== leg.gameId);
      if (others.length >= MAX_LEGS) return { ...s, notice: `Parlays max out at ${MAX_LEGS} legs` };
      // Editing the slip by hand means it's no longer a straight tail.
      return {
        legs: [...others, leg],
        notice: sameGame ? `Swapped ${sameGame.label} — one pick per game` : undefined,
      };
    });
  }, []);

  const api = useMemo<SlipApi>(
    () => ({
      ...state,
      has: (id) => state.legs.some((l) => l.id === id),
      toggle,
      remove: (id) => setState((s) => ({ legs: s.legs.filter((l) => l.id !== id) })),
      clear: () => setState({ legs: [] }),
      loadTail: (postId, legs) => {
        setState({ legs, tailedFromPostId: postId, notice: "Tailing at current lines" });
        setOpen(true);
      },
      applyChanges: (changes) =>
        setState((s) => ({
          ...s,
          legs: s.legs.flatMap((leg) => {
            const change = changes.find((c) => c.selectionId === leg.id);
            if (!change) return [leg];
            return change.selection ? [{ ...leg, ...change.selection }] : [];
          }),
          notice: "Lines moved — check the new numbers and place again",
        })),
      open,
      setOpen,
    }),
    [state, toggle, open],
  );

  return <SlipContext.Provider value={api}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipApi {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error("useSlip must be used inside <SlipProvider>");
  return ctx;
}
