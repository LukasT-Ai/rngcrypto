"use client"

import { useRef, useState } from "react"
import { toPng } from "html-to-image"
import { Download, Check, Link2 } from "lucide-react"

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

type Variant = "ascend" | "strike" | "hype"

const VARIANTS: Record<Variant, {
  name: string
  accent: string
  accentAlt: string
  handle: string
  token: string
  unit: string
  tagline: string
  url: string
  gradient: string
}> = {
  ascend: {
    name: "Ascend.Market",
    accent: "#E8622C",
    accentAlt: "#FF8C42",
    handle: "@AscendPerps",
    token: "$ASCEND",
    unit: "USDT",
    tagline: "Autonomous Event Perpetuals on Midnight",
    url: "https://www.rngcrypto.com/ascend",
    gradient: "from-[#E8622C] via-[#FF8C42] to-[#00FF88]",
  },
  strike: {
    name: "Strike Finance",
    accent: "#22D3EE",
    accentAlt: "#06B6D4",
    handle: "@strikeperps",
    token: "$STRIKE",
    unit: "USD",
    tagline: "Autonomous Perpetual Futures on Cardano",
    url: "https://www.rngcrypto.com/strike",
    gradient: "from-[#22D3EE] via-[#06B6D4] to-[#00FF88]",
  },
  hype: {
    name: "Hyperliquid",
    accent: "#7BEBC2",
    accentAlt: "#00FF88",
    handle: "@HyperliquidX",
    token: "$HYPE",
    unit: "USDC",
    tagline: "Autonomous Perpetual Futures on Hyperliquid",
    url: "https://www.rngcrypto.com/hype",
    gradient: "from-[#7BEBC2] via-[#00FF88] to-[#00CC6A]",
  },
}

interface FlexCardProps {
  open: boolean
  onClose: () => void
  stats: {
    totalPnl: number
    winRate: number
    totalTrades: number
    wins: number
    losses: number
    avgPnl: number
    bestTrade: number
    worstTrade: number
  } | null
  openPositionCount: number
  bestAsset: string | null
  variant?: Variant
}

export function FlexCard({ open, onClose, stats, openPositionCount, bestAsset, variant = "ascend" }: FlexCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const v = VARIANTS[variant]
  const pnl = stats?.totalPnl ?? 0
  const pnlColor = pnl >= 0 ? "#00FF88" : "#FF3B5C"
  const pnlSign = pnl >= 0 ? "+" : ""

  async function captureImage(): Promise<string | null> {
    if (!cardRef.current) return null
    try {
      return await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#06080F",
      })
    } catch {
      return null
    }
  }

  async function downloadImage() {
    setDownloading(true)
    const dataUrl = await captureImage()
    if (dataUrl) {
      const link = document.createElement("a")
      link.download = `rng-${variant}-stats-${new Date().toISOString().slice(0, 10)}.png`
      link.href = dataUrl
      link.click()
    }
    setDownloading(false)
  }

  async function copyImage() {
    const dataUrl = await captureImage()
    if (dataUrl) {
      try {
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ])
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        setCopied(false)
      }
    }
  }

  async function shareOnX() {
    const dataUrl = await captureImage()
    if (dataUrl) {
      try {
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ])
      } catch { /* best effort — image in clipboard for paste */ }
    }
    const text = encodeURIComponent(
      `${pnlSign}$${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} P&L | ${stats?.winRate ?? 0}% Win Rate | ${stats?.totalTrades ?? 0} Trades\n\nFully autonomous bot trading perpetual futures on ${v.handle}\n\n100% of platform fees go back to ${v.token} holders. Real yield, no gimmicks.\n\n#Cardano $ADA ${v.token}`
    )
    const url = encodeURIComponent(v.url)
    window.open(
      `https://x.com/intent/tweet?text=${text}&url=${url}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {/* The capturable card */}
        <div
          ref={cardRef}
          className="relative w-[600px] overflow-hidden rounded-2xl"
          style={{ backgroundColor: "#06080F" }}
        >
          {/* Background image */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "url(/hero-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.35,
            }}
          />
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#06080F]/60 via-[#06080F]/40 to-[#06080F]/80" />
          {/* Top accent */}
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${v.gradient}`} />

          <div className="relative px-8 py-7">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold"><span className="text-[#00FF88]">RnG</span><span className="text-white">crYptO</span></span>
                <span className="text-xs text-white/30">&times;</span>
                <span className="text-sm font-semibold" style={{ color: v.accent }}>{v.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#00FF88] animate-pulse" />
                <span className="text-xs font-medium text-[#00FF88]/80 uppercase tracking-wider">Bot Active</span>
              </div>
            </div>

            {/* Main P&L */}
            <div className="text-center mb-6">
              <p className="text-xs uppercase tracking-widest text-white/40 mb-1">Total P&L</p>
              <p
                className="font-mono text-5xl font-black tabular-nums"
                style={{ color: pnlColor }}
              >
                {pnlSign}${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-white/30 mt-1">{v.unit}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <StatBox label="Win Rate" value={`${stats?.winRate ?? 0}%`} accent={v.accent} />
              <StatBox label="Trades" value={`${stats?.totalTrades ?? 0}`} accent={v.accentAlt} />
              <StatBox label="W / L" value={`${stats?.wins ?? 0} / ${stats?.losses ?? 0}`} accent="#00FF88" />
              <StatBox label="Open" value={`${openPositionCount}`} accent="#22D3EE" />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <StatBox label="Avg P&L" value={`${(stats?.avgPnl ?? 0) >= 0 ? "+" : ""}${(stats?.avgPnl ?? 0).toFixed(2)}`} accent="#9CA3AF" small />
              <StatBox label="Best Trade" value={`+${(stats?.bestTrade ?? 0).toFixed(2)}`} accent="#00FF88" small />
              <StatBox label="Worst Trade" value={`${(stats?.worstTrade ?? 0).toFixed(2)}`} accent="#FF3B5C" small />
            </div>

            {/* Best Asset */}
            {bestAsset && (
              <div className="text-center mb-4">
                <span className="text-xs text-white/30">Best Asset: </span>
                <span className="text-xs font-semibold" style={{ color: v.accent }}>{bestAsset}</span>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
              <span className="text-[10px] text-white/20">{v.tagline}</span>
              <span className="text-[10px] text-white/20">@rngcrypto</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={downloadImage}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 px-5 py-2.5 text-sm font-medium text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/50 hover:shadow-[0_0_16px_rgba(0,255,136,0.2)] transition-all"
          >
            <Download className="size-4" />
            {downloading ? "Saving..." : "Download"}
          </button>
          <button
            onClick={shareOnX}
            className="inline-flex items-center gap-2 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 px-5 py-2.5 text-sm font-medium text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/50 hover:shadow-[0_0_16px_rgba(0,255,136,0.2)] transition-all"
          >
            <XIcon className="size-4" />
            Share on X
          </button>
          <button
            onClick={copyImage}
            className="inline-flex items-center gap-2 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 px-5 py-2.5 text-sm font-medium text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/50 hover:shadow-[0_0_16px_rgba(0,255,136,0.2)] transition-all"
          >
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied ? "Copied!" : "Copy Image"}
          </button>
        </div>

        {/* Hints */}
        <p className="text-xs text-white/40">Share on X copies the image to your clipboard — just paste it in the tweet</p>
        <p className="text-xs text-white/20">Click outside to close</p>
      </div>
    </div>
  )
}

function StatBox({ label, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{label}</p>
      <p
        className={`font-mono font-bold tabular-nums ${small ? "text-sm" : "text-lg"}`}
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  )
}
