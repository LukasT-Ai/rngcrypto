import type { Metadata } from "next"
import { ProjectsContent } from "./projects-content"

export const metadata: Metadata = {
  title: "Projects & Ecosystem",
  description:
    "Explore the RnGcrYptO Web3 portfolio across Cardano, Midnight, Ethereum, and Bitcoin. Autonomous trading bots, DeFi, NFT collections, and blockchain infrastructure.",
  openGraph: {
    title: "Projects & Ecosystem | RnGcrYptO",
    description:
      "Autonomous trading, DeFi, NFTs, and L1 infrastructure. The full RnGcrYptO Web3 journey.",
  },
}

export default function ProjectsPage() {
  return <ProjectsContent />
}
