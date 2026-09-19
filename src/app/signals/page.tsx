import type { Metadata } from "next"
import SignalsDashboard from "./dashboard"

export const metadata: Metadata = {
  title: "Live Signals | BTC Trade Calls",
  description:
    "Real-time BTC trade signals with entry, stop-loss, and take-profit levels. Updated every 30 seconds.",
  openGraph: {
    title: "Live BTC Signals | RnGcrypto",
    description:
      "Real-time BTC trade signals with entry, stop-loss, and take-profit levels.",
    url: "https://www.rngcrypto.com/signals",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live BTC Signals | RnGcrypto",
    description:
      "Real-time BTC trade signals with entry, stop-loss, and take-profit levels.",
    creator: "@rngcrypto",
  },
}

export default function SignalsPage() {
  return <SignalsDashboard />
}
