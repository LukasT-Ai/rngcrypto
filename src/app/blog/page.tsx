import type { Metadata } from "next"
import BlogContent from "./blog-content"

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Thoughts on Web3, DeFi, trading, and the decentralized future from RnGcrYptO.",
}

export default function BlogPage() {
  return <BlogContent />
}
