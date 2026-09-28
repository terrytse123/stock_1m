import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SwingStatus } from "./swing";

export type SwingMark = {
  status: SwingStatus;
  note: string;
};

type Book = {
  watched: string[];
  extras: string[];
  plans: Record<string, SwingMark>;
  toggle: (symbol: string) => void;
  track: (symbol: string) => void;
  setPlan: (symbol: string, patch: Partial<SwingMark>) => void;
};

const emptyMark: SwingMark = { status: "watch", note: "" };

export const useBook = create<Book>()(
  persist(
    (set, get) => ({
      watched: [],
      extras: [],
      plans: {},
      toggle: (symbol) => {
        const watched = get().watched.includes(symbol)
          ? get().watched.filter((item) => item !== symbol)
          : [...get().watched, symbol];
        set({ watched });
      },
      track: (symbol) => {
        if (get().extras.includes(symbol)) return;
        set({ extras: [...get().extras, symbol].slice(-12) });
      },
      setPlan: (symbol, patch) => {
        const current = get().plans[symbol] ?? emptyMark;
        set({ plans: { ...get().plans, [symbol]: { ...current, ...patch } } });
      },
    }),
    { name: "yuesheng-book", skipHydration: true },
  ),
);
