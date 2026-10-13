"use client"

import React from "react"
import { Coins, Droplets } from "lucide-react"
import { Chip, GREEN, RED, fmtCompact } from "../shared"
import { FeatureTile } from "./FeatureTile"
import { fmtSd, fmtSignedPct, staleLabel, type StablecoinFeature } from "./features-contract"

// F2.6 stablecoin tiles (crypto only), replacing the dead ETF flow tile. Tile 1: `+1.8% 7d`, sub `+1.2 sd · tailwind`.
// Tile 2: `USDT mint 24h $650M` with a `≥ $500M flag` tag when active. Cadence is daily, source DefiLlama. The
// flag words tailwind/headwind are green/red at 70% opacity (slow directional feature); the numbers stay white/90.

const MINT_FLAG_USD = 500e6

export const StablecoinTiles = React.memo(function StablecoinTiles({ sc, now }: { sc: StablecoinFeature | null | undefined; now: number }) {
  const off = sc == null
  const stale = staleLabel(sc, now)
  const flagColor = sc?.flag === "tailwind" ? GREEN : sc?.flag === "headwind" ? RED : undefined
  const mintFlag = !off && (sc.mintFlag ?? (sc.usdtMint24hUsd != null && sc.usdtMint24hUsd >= MINT_FLAG_USD))
  return (
    <>
      <FeatureTile
        label="Stablecoin supply 7d"
        icon={Coins}
        off={off || sc.supply7dChgPct == null}
        offText="DefiLlama off"
        stale={stale}
        hint="Change in total stablecoin supply over 7 days (DefiLlama, daily). Growing supply is dry powder for crypto; shrinking supply is money leaving. Slow feature: it sets the backdrop, not the entry."
        value={sc ? `${fmtSignedPct(sc.supply7dChgPct)} 7d` : null}
        sub={
          sc ? (
            <>
              {fmtSd(sc.z)}
              {sc.flag && (
                <>
                  {" · "}
                  <span style={{ color: flagColor, opacity: 0.7 }}>{sc.flag}</span>
                </>
              )}
              {" · daily"}
            </>
          ) : null
        }
      />
      <FeatureTile
        label="USDT mint 24h"
        icon={Droplets}
        off={off || sc.usdtMint24hUsd == null}
        offText="DefiLlama off"
        stale={stale}
        hint="Net USDT issued in the last 24h. Mints of $500M or more have historically preceded buying pressure within days; the flag marks that threshold."
        value={sc ? `$${fmtCompact(sc.usdtMint24hUsd)}` : null}
        sub={
          sc ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              daily · DefiLlama
              {mintFlag && <Chip variant="neutral" size="eyebrow" tip="Mint at or above $500M in 24h: a historically meaningful inflow.">≥ $500M flag</Chip>}
            </span>
          ) : null
        }
      />
    </>
  )
})
