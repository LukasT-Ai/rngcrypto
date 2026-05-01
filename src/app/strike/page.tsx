import type { Metadata } from "next"
import StrikeDashboard from "./dashboard"

export const metadata: Metadata = {
  title: "Live Trading | Strike Finance Bot Performance",
  description:
    "Real-time performance dashboard for the Strike Finance autonomous trading bot. Live P&L, open positions, trade history, and asset breakdowns on Cardano perpetuals.",
  openGraph: {
    title: "Live Strike Bot Trading | RnGcrypto",
    description:
      "Autonomous perpetual futures trading on Cardano via Strike Finance. Live P&L, win rate, open positions, and full trade history.",
    url: "https://www.rngcrypto.com/strike",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Strike Bot Trading | RnGcrypto",
    description:
      "Autonomous perpetual futures trading on Cardano via Strike Finance. Live P&L, win rate, open positions, and full trade history.",
    creator: "@rngcrypto",
  },
}

export default function StrikePage() {
  return <StrikeDashboard />
}
