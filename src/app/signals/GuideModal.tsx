"use client"

import { HelpCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AMBER, GREEN } from "./shared"

const WHITE = "rgba(255,255,255,0.85)"

const SECTIONS = [
  {
    title: "Grades and evidence",
    color: WHITE,
    items: [
      { label: "A+ / A", desc: "Strong setup. Evidence 75+ with several factor groups aligned. Worth a trade with proper sizing." },
      { label: "B", desc: "Decent setup. Evidence 60+. Consider a smaller position." },
      { label: "C", desc: "Marginal. Evidence 45+. High risk, needs extra confirmation." },
      { label: "NO TRADE", desc: "Below threshold. Stay out." },
      { label: "% TP1", desc: "When the grade chip shows a percentage, it is the calibrated probability of reaching the first target, with its interval. Until 100 decided calls exist on the current engine, the chip shows raw evidence strength instead, which is a score and not a probability." },
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
    title: "Plan tiles",
    color: WHITE,
    items: [
      { label: "Stop", desc: "The invalidation price. The small line under it names the anchor (a swing low, the 200MA) when the engine publishes one." },
      { label: "R:R TP2", desc: "Reward to risk at the second target. Below 1.5 is flagged in amber; skip those." },
      { label: "Hold", desc: "Median time to the first target for this symbol, direction and regime, with the 25th and 75th percentiles. Marked estimate until enough calls have resolved." },
      { label: "Size", desc: "Position size multiplier after event, session, weekend, counter-trend and funding haircuts. Amber means smaller than normal." },
    ],
  },
  {
    title: "Wrong if, flips if, next, history",
    color: WHITE,
    items: [
      { label: "Wrong if", desc: "The price or condition that invalidates the call. Jump to the levels behind it." },
      { label: "Flips if", desc: "What would turn the call the other way, or confirm it. The two closest conditions." },
      { label: "Next", desc: "The next scheduled release that matters for this ticker, with the market-implied expectation when a prediction market prices it." },
      { label: "History", desc: "How past calls on this symbol and grade did, as a count with a Wilson interval. Under 8 decided calls no percentage is shown." },
    ],
  },
  {
    title: "Trend regime (cloud, 200MA & ADX)",
    color: WHITE,
    items: [
      { label: "Cloud", desc: "Ichimoku cloud on 15m, 4h and daily. Above the cloud is a bull regime, below is bear, inside is undecided. Do not trade against the daily cloud without a confirmed reversal." },
      { label: "TK cross", desc: "Tenkan crossing Kijun. A bullish cross above the cloud is a strong continuation signal; a cross inside the cloud is weak." },
      { label: "200MA", desc: "Price above a rising 200-period average is a bull regime; below a falling one is bear. Distance is shown in ATR: more than 3 ATR away means stretched, expect a pullback toward it." },
      { label: "ADX", desc: "Strength, not direction. Below 20 means no trend: a bullish regime with weak ADX is a range, not a breakout. Above 25 with +DI leading confirms the move. Above 40 the move is stretched." },
      { label: "Counter-trend", desc: "A call against the 4h and daily regime. Half size, targets capped at the 4h Kijun or 200MA, no adds." },
      { label: "Coupling", desc: "For BTC, gold and oil: how tightly the asset tracks macro right now. Low coupling silences macro and event weights." },
    ],
  },
  {
    title: "Event window",
    color: AMBER,
    items: [
      { label: "Pre", desc: "A scheduled release is within two hours. Size shrinks from T-60m and no new entries are taken from T-30m." },
      { label: "No entry", desc: "Amber bar: calls are paused from 30 minutes before to 10 minutes after the print." },
      { label: "Releasing", desc: "The print is out. The first five minutes decide whether the move confirms or fails." },
      { label: "Post", desc: "The event lean still applies for a while: smaller size, wider stop, watch the confirmation word." },
    ],
  },
  {
    title: "Order flow (Flow tab)",
    color: WHITE,
    items: [
      { label: "Liquidations", desc: "Forced closes on OKX perps, split long vs short over 1h, 4h and the covered window. Mostly longs = buyers being flushed, which removes fuel for further downside and often precedes a bounce. Mostly shorts = a squeeze; chasing it is late." },
      { label: "Buy / sell walls", desc: "Resting orders at least 3x the median level. Buy walls below price are bounce points and cover for a stop; sell walls above are where to bank partial profit. Walls can be pulled, so treat them as intent." },
      { label: "Book imbalance", desc: "Bids vs asks inside the covered band. A book leaning against your direction is a reason to size down, not a reason to flip." },
    ],
  },
  {
    title: "What to look at first",
    color: WHITE,
    items: [
      { label: "1. Verdict", desc: "Direction and grade. If it is C or NO TRADE, skip. Only trade A+, A or B setups." },
      { label: "2. Wrong if", desc: "Know the invalidation before the entry. If the stop is too far for your size, pass." },
      { label: "3. Timeframes", desc: "Momentum tab: check whether 1H, 4H and Daily agree. Aligned means a stronger signal." },
      { label: "4. R:R", desc: "Only take trades where reward is at least 1.5x the risk." },
      { label: "5. Event window", desc: "An amber bar on the verdict overrides everything. Respect it." },
    ],
  },
]

export function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-modal="true" className="max-h-[85vh] overflow-y-auto border-white/[0.08] bg-[#0A0E17] p-0 text-white sm:max-w-2xl scrollbar-none [&>button]:top-4 [&>button]:right-5 [&>button]:text-white/60 [&>button]:hover:text-white">
        <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-3 space-y-0 border-b border-white/[0.06] bg-[#0A0E17]/95 px-6 py-4 backdrop-blur-sm text-left">
          <HelpCircle className="size-5 shrink-0" style={{ color: AMBER }} />
          <div>
            <DialogTitle className="text-lg font-bold text-white">Quick guide</DialogTitle>
            <DialogDescription className="text-xs text-white/50">How to read the verdict and the tabs. Escape closes.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-6 p-6 pt-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: section.color }}>
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.label} className="flex gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                    <span className="mt-0.5 min-w-[80px] shrink-0 font-mono text-xs font-bold" style={{ color: section.color }}>
                      {item.label}
                    </span>
                    <span className="text-sm leading-relaxed text-white/65">{item.desc}</span>
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
      </DialogContent>
    </Dialog>
  )
}
