"use client"

import { useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Asset, LeaderboardResponse, SortKey, TraderDetail, Window } from "./types"

/** `?mock=1` serves the fixture; development only, so the production bundle never ships it. Server snapshot is
 * false so SSR and hydration agree; the client value lands on the first post-hydration render. */
const noop = () => () => {}
const mockSnap = () => process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("mock") === "1"
export function useMock(): boolean {
  return useSyncExternalStore(noop, mockSnap, () => false)
}

export interface ListParams {
  asset: Asset
  window: Window
  sort: SortKey
  minVolume: number
  limit?: number
}

export const LIST_POLL_MS = 60_000
export const DETAIL_POLL_MS = 30_000

export function useLeaderboard(p: ListParams, mock: boolean) {
  const qs = new URLSearchParams({ asset: p.asset, window: p.window, sort: p.sort, minVolume: String(p.minVolume), limit: String(p.limit ?? 100) })
  return useQuery<LeaderboardResponse>({
    queryKey: ["copytrade", "list", mock, qs.toString()],
    queryFn: async () => {
      if (mock) {
        const m = await import("./__fixtures__/mock")
        return m.mockLeaderboard(p.asset, p.window, p.sort, p.minVolume)
      }
      const r = await fetch(`/api/copytrade?${qs.toString()}`)
      if (!r.ok) throw new Error(`copytrade ${r.status}`)
      return r.json()
    },
    refetchInterval: LIST_POLL_MS,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useTrader(address: string | null, asset: Asset, mock: boolean) {
  return useQuery<TraderDetail>({
    queryKey: ["copytrade", "trader", mock, address, asset],
    enabled: address != null,
    queryFn: async () => {
      if (mock) {
        const m = await import("./__fixtures__/mock")
        const d = m.mockTrader(address!, asset)
        if (!d) throw new Error("trader 404")
        return d
      }
      const r = await fetch(`/api/copytrade/trader?address=${encodeURIComponent(address!)}&asset=${asset}`)
      if (!r.ok) throw new Error(`trader ${r.status}`)
      return r.json()
    },
    refetchInterval: address ? DETAIL_POLL_MS : false,
    staleTime: 15_000,
    retry: 1,
  })
}
