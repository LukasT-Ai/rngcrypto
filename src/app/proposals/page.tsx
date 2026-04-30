import type { Metadata } from "next"
import ProposalsContent from "./proposals-content"

export const metadata: Metadata = {
  title: "Community Proposals | RnGcrypto",
  description:
    "Community-driven partnership proposals and collaboration ideas for the Cardano DeFi ecosystem.",
  openGraph: {
    title: "Community Proposals | RnGcrypto",
    description:
      "Community-driven partnership proposals and collaboration ideas for the Cardano DeFi ecosystem.",
  },
}

export default function ProposalsPage() {
  return <ProposalsContent />
}
