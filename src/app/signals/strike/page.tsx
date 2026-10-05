import type { Metadata } from "next"
import SignalsDashboard from "../dashboard"

export const metadata: Metadata = {
  title: "Strike Signals | Trade Calls for Strike Finance Perpetuals",
  description:
    "Plain-English recommendations with entry, stop and targets for every market on Strike Finance perpetuals — crypto, gold, oil, stocks and indices — plus live catalyst headlines and macro event intelligence.",
  openGraph: {
    title: "Strike Signals | RnGcrypto",
    description: "Trade calls for every Strike Finance perpetual market, updated every 30 seconds.",
    url: "https://www.rngcrypto.com/signals/strike",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Strike Signals | RnGcrypto", description: "Trade calls for every Strike Finance perpetual market.", creator: "@rngcrypto" },
}

export default function StrikeSignalsPage() {
  return <SignalsDashboard variant="strike" />
}
