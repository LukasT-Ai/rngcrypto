"use client"

import { motion } from "framer-motion"
import { HelpCircle, X } from "lucide-react"
import { AMBER, GREEN, RED } from "./shared"

const SECTIONS = [
  {
    title: "Grades",
    color: "rgba(255,255,255,0.85)",
    items: [
      { label: "A+ / A", desc: "Strong setup. Confidence 75+ with several factor groups aligned. Worth a trade with proper sizing." },
      { label: "B", desc: "Decent setup. Confidence 60+. Consider a smaller position." },
      { label: "C", desc: "Marginal. Confidence 45+. High risk, needs extra confirmation." },
      { label: "NO TRADE", desc: "Below threshold. Stay out." },
    ],
  },
  {
    title: "Direction",
    color: GREEN,
    items: [
      { label: "Long", desc: "The engine favors upside. Targets are above entry." },
      { label: "Short", desc: "The engine favors downside. Targets are below entry." },
      { label: "Stand aside", desc: "Conditions are unclear. No active setup. Do not force a trade." },
    ],
  },
  {
    title: "Regime",
    color: "rgba(255,255,255,0.7)",
    items: [
      { label: "Trending", desc: "ADX above 25. Price is moving directionally. Favor trend-following entries." },
      { label: "Transitional", desc: "ADX 20 to 25. Market shifting between trend and range. Be cautious." },
      { label: "Ranging", desc: "ADX below 20. Choppy price action. Fade extremes, tighten stops." },
    ],
  },
  {
    title: "Order flow (Flow tab)",
    color: AMBER,
    items: [
      { label: "Liquidations", desc: "Forced closes on OKX perps, split long vs short over 1h, 4h and the covered window. Mostly longs = buyers being flushed, which removes fuel for further downside and often precedes a bounce. Mostly shorts = a squeeze; chasing it is late." },
      { label: "Flush zones", desc: "Price buckets where the most positions were liquidated. A long-flush zone below price often becomes support; a short-flush zone above often becomes resistance." },
      { label: "Buy / sell walls", desc: "Resting orders at least 3x the median level. Buy walls below price are bounce points and cover for a stop; sell walls above are where to bank partial profit. Walls can be pulled, so treat them as intent." },
      { label: "Book imbalance", desc: "Bids vs asks inside the covered band. A book leaning against your direction is a reason to size down, not a reason to flip." },
    ],
  },
  {
    title: "What to look at first",
    color: RED,
    items: [
      { label: "1. Verdict", desc: "Direction and grade. If it is C or NO TRADE, skip. Only trade A+, A or B setups." },
      { label: "2. Timeframes", desc: "Momentum tab: check whether 1H, 4H and Daily agree. Aligned means a stronger signal." },
      { label: "3. Confidence", desc: "More aligned factors means higher confidence. Mixed means weaker." },
      { label: "4. R:R", desc: "Only take trades where reward is at least 1.5x the risk." },
      { label: "5. Alerts", desc: "Squeeze and catalyst warnings override everything. Respect them." },
    ],
  },
  {
    title: "Key indicators",
    color: "#7BEBC2",
    items: [
      { label: "RSI", desc: "Below 30 is oversold (look for longs). Above 70 is overbought (look for shorts)." },
      { label: "MACD", desc: "Positive histogram is bullish momentum. Negative is bearish." },
      { label: "Supertrend", desc: "Bullish or bearish overlay. Confirms or contradicts the EMA stack." },
      { label: "Bollinger", desc: "Price at the lower band is a potential bounce. Upper band is a potential rejection." },
      { label: "CVD", desc: "Cumulative Volume Delta. Positive means net buyers. Negative means net sellers." },
      { label: "Divergences", desc: "Price makes a new low but RSI does not: bullish reversal signal." },
    ],
  },
]

export function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0A0E17] shadow-2xl scrollbar-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0A0E17]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <HelpCircle className="size-5" style={{ color: AMBER }} />
            <h2 className="text-lg font-bold text-white">Quick guide</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors" aria-label="Close guide">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: section.color }}>{section.title}</h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.label} className="flex gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                    <span className="shrink-0 font-mono text-xs font-bold mt-0.5 min-w-[80px]" style={{ color: section.color }}>{item.label}</span>
                    <span className="text-sm text-white/60 leading-relaxed">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl border p-4" style={{ borderColor: `${AMBER}33`, backgroundColor: `${AMBER}0A` }}>
            <p className="text-xs leading-relaxed" style={{ color: `${AMBER}CC` }}>
              Signals refresh every 30 seconds. This is a decision-support tool, not financial advice. Always manage risk, use stop losses, and never risk more than you can afford to lose.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
