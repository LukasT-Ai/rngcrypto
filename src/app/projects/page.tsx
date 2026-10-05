import type { Metadata } from "next"
import { ProjectsContent } from "./projects-content"

export const metadata: Metadata = {
  title: "Projects & Ecosystem",
  description:
    "What is live at RnGcrYptO today: plain-English trade signals across Strike and Ascend markets, a verified signal track record, and ecosystem positions across Cardano, Midnight and Ethereum.",
  openGraph: {
    title: "Projects & Ecosystem | RnGcrYptO",
    description:
      "Live signals for Strike and Ascend markets, verified performance, and the Cardano, Midnight and Ethereum ecosystem.",
  },
}

export default function ProjectsPage() {
  return <ProjectsContent />
}
