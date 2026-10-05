import type { Metadata } from "next"
import SignalsDashboard from "../dashboard"

export const metadata: Metadata = {
  title: "Ascend Signals | BTC, Gold, Cardano & WTI",
  description:
    "Plain-English recommendations for Bitcoin, Gold, Cardano and WTI crude — the markets behind Ascend event perpetuals — with live catalyst headlines, scenario forecasts and macro event intelligence.",
  openGraph: {
    title: "Ascend Signals | RnGcrypto",
    description: "BTC, Gold, Cardano and WTI signals with catalyst headlines and macro event intelligence.",
    url: "https://www.rngcrypto.com/signals/ascend",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Ascend Signals | RnGcrypto", description: "BTC, Gold, Cardano and WTI signals with catalyst headlines.", creator: "@rngcrypto" },
}

export default function AscendSignalsPage() {
  return <SignalsDashboard variant="ascend" />
}
