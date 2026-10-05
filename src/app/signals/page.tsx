import type { Metadata } from "next"
import SignalsDashboard from "./dashboard"

export const metadata: Metadata = {
  title: "Live Signals | BTC, ETH, Gold, Oil, Stocks & Indices Trade Calls",
  description:
    "Plain-English trade recommendations for 31 markets — Bitcoin, Ethereum, Cardano, Gold, WTI Oil, Tesla, Nvidia, S&P 500 and more — with entry, stop, targets, catalyst headlines and scenario forecasts. Updated every 30 seconds.",
  openGraph: {
    title: "Live Trade Signals | RnGcrypto",
    description:
      "Plain-English trade recommendations for crypto, commodities, stocks and indices with entry, stop, targets and live catalyst headlines.",
    url: "https://www.rngcrypto.com/signals",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Trade Signals | RnGcrypto",
    description:
      "Plain-English trade recommendations for crypto, commodities, stocks and indices with entry, stop, targets and live catalyst headlines.",
    creator: "@rngcrypto",
  },
}

export default function SignalsPage() {
  return <SignalsDashboard />
}
