import { create } from "zustand"
import { persist } from "zustand/middleware"

interface WatchlistState {
  tokens: string[]
  addToken: (id: string) => void
  removeToken: (id: string) => void
  hasToken: (id: string) => boolean
}

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      tokens: ["bitcoin", "ethereum", "solana", "cardano"],
      addToken: (id) =>
        set((state) => ({
          tokens: state.tokens.includes(id)
            ? state.tokens
            : [...state.tokens, id],
        })),
      removeToken: (id) =>
        set((state) => ({
          tokens: state.tokens.filter((t) => t !== id),
        })),
      hasToken: (id) => get().tokens.includes(id),
    }),
    {
      name: "rng-watchlist",
    }
  )
)
