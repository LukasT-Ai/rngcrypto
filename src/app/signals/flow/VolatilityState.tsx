"use client"

import React from "react"
import { Gauge, MoveVertical, Scale, Waves } from "lucide-react"
import { AMBER, Chip, SectionTitle, fmt, useNow } from "../shared"
import type { SignalsResponse } from "../types"
import { FeatureTile } from "./FeatureTile"
import { fmtPct, fmtSd, fmtSignedPct, readFeatures, staleLabel } from "./features-contract"

// F2.4 "Volatility state" section for the Momentum tab. DVOL and basis are Deribit BTC/ETH series, so the section
// is hidden for every other asset. Tiles: DVOL (value, percentile, 24h change), expected move 1d and 4h (sd scaled
// by sqrt(4/24)), basis annualized with z and curve slope, and a BACKWARDATION warning chip when `stress` is true.
// DVOL percentile >= 80: value amber (wider stops); < 20: white/60 with a `compressed` tag. Basis is never green/red.

const DERIBIT_ASSETS = new Set(["BTC", "ETH"])
const SQRT_4H = Math.sqrt(4 / 24)

export const VolatilityState = React.memo(function VolatilityState({ d }: { d: SignalsResponse }) {
  const now = useNow(60_000)
  if (!DERIBIT_ASSETS.has(d.asset)) return null
  const f = readFeatures(d)
  const vol = f?.vol ?? null
  const basis = f?.basis ?? null
  const price = d.price.mark

  const hot = vol != null && vol.dvolPct >= 80
  const compressed = vol != null && vol.dvolPct < 20
  const em4hPct = vol ? vol.expectedMove24hPct * SQRT_4H : null
  const em4hUsd = vol ? (Number.isFinite(vol.expectedMove24hUsd) && vol.expectedMove24hUsd > 0 ? vol.expectedMove24hUsd : price * (vol.expectedMove24hPct / 100)) * SQRT_4H : null

  return (
    <div id="sec-volatility">
      <SectionTitle
        icon={Waves}
        right={
          <span className="ml-auto flex items-center gap-2">
            {basis?.stress && (
              <Chip variant="warning" tip="Front future below index: event or funding stress; confidence haircut applied.">
                backwardation
              </Chip>
            )}
            {hot && (
              <Chip variant="warning" tip={`Implied volatility is in its ${fmtPct(vol.dvolPct)} over the past year. Stops sized on a calm tape will be too tight; the engine widens them.`}>
                wider stops
              </Chip>
            )}
            <span className="text-[10px] text-[#9CA3AF]/80">Deribit {d.asset} options</span>
          </span>
        }
      >
        Volatility state
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <FeatureTile
          label="DVOL"
          icon={Gauge}
          off={vol == null}
          offText="Deribit off"
          stale={staleLabel(vol, now)}
          color={hot ? AMBER : compressed ? "rgba(255,255,255,0.6)" : undefined}
          hint="Deribit implied volatility index (annualized, 30-day constant maturity). The percentile places today against the last year; a high reading means the options market expects a wide range, a low one means compression that often precedes a breakout."
          value={vol ? fmt(vol.dvol, 1) : null}
          sub={
            vol ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {fmtPct(vol.dvolPct)} · 24h {fmtSignedPct(vol.change24hPct, 0)}
                {compressed && <Chip variant="vol">compressed</Chip>}
              </span>
            ) : null
          }
        />
        <FeatureTile
          label="Expected move 1d"
          icon={MoveVertical}
          off={vol == null}
          offText="Deribit off"
          stale={staleLabel(vol, now)}
          hint="One standard deviation move over the next 24h implied by DVOL (DVOL / sqrt(365)). Price stays inside this band about two thirds of the time; the Levels chart draws it as two hairlines."
          value={vol ? `±${vol.expectedMove24hPct.toFixed(2)}%` : null}
          sub={vol ? `±$${fmt(vol.expectedMove24hUsd > 0 ? vol.expectedMove24hUsd : price * (vol.expectedMove24hPct / 100), price >= 1000 ? 0 : 2)} · 1 sd` : null}
        />
        <FeatureTile
          label="Expected move 4h"
          icon={MoveVertical}
          off={vol == null}
          offText="Deribit off"
          stale={staleLabel(vol, now)}
          hint="The 24h expected move scaled to 4h by the square root of time. Useful for sizing an intraday stop: a stop inside this band is likely to be hit by noise alone."
          value={em4hPct != null ? `±${em4hPct.toFixed(2)}%` : null}
          sub={em4hUsd != null ? `±$${fmt(em4hUsd, price >= 1000 ? 0 : 2)} · sqrt-time scaled` : null}
        />
        <FeatureTile
          label="Basis"
          icon={Scale}
          off={basis == null}
          offText="Deribit off"
          stale={staleLabel(basis, now)}
          hint="Annualized premium of the front Deribit future over index. Positive and rising means leveraged longs are paying for exposure; negative (backwardation) means stress. z is against the 90-day distribution; curve is the slope from front to next expiry."
          value={basis ? `${basis.annPct >= 0 ? "+" : ""}${basis.annPct.toFixed(1)}% ann` : null}
          sub={basis ? `z ${fmtSd(basis.z).replace(" sd", "")} · curve ${basis.curveSlope >= 0 ? "+" : ""}${basis.curveSlope.toFixed(1)}${basis.stress ? " · stress" : ""}` : null}
          color={basis?.stress ? AMBER : undefined}
        />
      </div>
    </div>
  )
})
