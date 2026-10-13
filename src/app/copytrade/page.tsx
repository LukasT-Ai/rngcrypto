import type { Metadata } from "next"
import CopyTradeDashboard from "./CopyTradeDashboard"

export const metadata: Metadata = {
  title: "Copy Trade | Top Hyperliquid Traders on BTC and ADA",
  description: "Stack-ranked leaderboard of the best Hyperliquid perp traders filtered by asset: realized BTC and ADA PnL, win rate, volume, open positions and recent fills, with wallet addresses and explorer links.",
  openGraph: {
    title: "Copy Trade | RnGcrypto",
    description: "Top Hyperliquid traders on BTC and ADA: PnL, win rate, open positions and recent fills from public on-chain data.",
    url: "https://www.rngcrypto.com/copytrade",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Copy Trade | RnGcrypto", description: "Top Hyperliquid traders on BTC and ADA, ranked by realized PnL.", creator: "@rngcrypto" },
}

export default function CopyTradePage() {
  return <CopyTradeDashboard />
}
