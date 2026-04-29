import type { Metadata } from "next"
import AboutContent from "./about-content"

export const metadata: Metadata = {
  title: "About RnGcrypto",
  description:
    "The person behind RnGcrypto — Web3 creator, DeFi degen, autonomous bot builder, and Cardano ecosystem enthusiast.",
  openGraph: {
    title: "About RnGcrypto",
    description:
      "The person behind RnGcrypto — Web3 creator, DeFi degen, autonomous bot builder, and Cardano ecosystem enthusiast.",
  },
}

export default function AboutPage() {
  return <AboutContent />
}
