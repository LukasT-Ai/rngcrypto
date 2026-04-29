import type { Metadata } from "next"
import AscendDashboard from "./dashboard"

export const metadata: Metadata = {
  title: "Live Trading | Ascend Bot Performance",
  description:
    "Real-time performance dashboard for the Ascend autonomous trading bot. Live P&L, open positions, trade history, and asset breakdowns.",
  openGraph: {
    title: "Live Trading | Ascend Bot Performance",
    description:
      "Real-time performance dashboard for the Ascend autonomous trading bot on event perpetuals.",
  },
}

export default function AscendPage() {
  return <AscendDashboard />
}
