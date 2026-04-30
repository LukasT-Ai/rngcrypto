import type { Metadata } from "next"
import AscendDashboard from "./dashboard"

export const metadata: Metadata = {
  title: "Live Trading | Ascend Bot Performance",
  description:
    "Real-time performance dashboard for the Ascend autonomous trading bot. Live P&L, open positions, trade history, and asset breakdowns.",
  openGraph: {
    title: "Live Ascend Bot Trading | RnGcrypto",
    description:
      "Autonomous event perpetuals trading on Cardano. Live P&L, win rate, open positions, and full trade history.",
    url: "https://www.rngcrypto.com/ascend",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Ascend Bot Trading | RnGcrypto",
    description:
      "Autonomous event perpetuals trading on Cardano. Live P&L, win rate, open positions, and full trade history.",
    creator: "@rngcrypto",
  },
}

export default function AscendPage() {
  return <AscendDashboard />
}
