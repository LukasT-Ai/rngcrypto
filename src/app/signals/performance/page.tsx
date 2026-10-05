import type { Metadata } from "next"
import PerformanceDashboard from "./PerformanceDashboard"

export const metadata: Metadata = {
  title: "Signal Performance | Verified Track Record",
  description:
    "Every logged RnGcrypto signal checked against 5-minute candles: take-profit ladder, stop-outs, realized R, equity curve, calibration by confidence and grade, and breakdowns by asset, bias, time and regime.",
  openGraph: {
    title: "Signal Performance | RnGcrypto",
    description: "Verified track record: TP ladder, realized R, equity curve and calibration for every logged signal.",
    url: "https://www.rngcrypto.com/signals/performance",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Signal Performance | RnGcrypto", description: "Verified track record for every logged signal.", creator: "@rngcrypto" },
}

export default function PerformancePage() {
  return <PerformanceDashboard />
}
