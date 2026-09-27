import { create } from "zustand";
import { persist } from "zustand/middleware";

type Book = {
  watched: string[];
  extras: string[];
  toggle: (symbol: string) => void;
  track: (symbol: string) => void;
};

export const useBook = create<Book>()(
  persist(
    (set, get) => ({
      watched: [],
      extras: [],
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
    }),
    { name: "yuesheng-book", skipHydration: true },
  ),
);
