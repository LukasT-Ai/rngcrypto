"use client"

import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"
import { ArrowRight, Calendar, Clock, Search, Mail } from "lucide-react"

type Category = "DeFi" | "Trading" | "NFTs" | "Cardano" | "Ethereum" | "Opinion"

interface BlogPost {
  slug: string
  title: string
  date: string
  categories: Category[]
  excerpt: string
  readingTime: number
}

const posts: BlogPost[] = [
  {
    slug: "why-cardano-defi-just-getting-started",
    title: "Why Cardano's DeFi Ecosystem Is Just Getting Started",
    date: "Apr 28, 2026",
    categories: ["DeFi", "Cardano"],
    excerpt:
      "Cardano DeFi TVL has been climbing steadily, but we are still in the early innings. From Minswap to Liqwid, the composability layer is maturing fast and the best protocols are just now hitting their stride.",
    readingTime: 6,
  },
  {
    slug: "midnight-mainnet-data-protection-web3",
    title: "Midnight Mainnet: What Data Protection Means for Web3",
    date: "Mar 15, 2026",
    categories: ["Cardano"],
    excerpt:
      "Midnight brings data protection to Cardano through zero-knowledge proofs. This is not just a privacy chain. It is a paradigm shift for regulatory compliance and enterprise adoption in Web3.",
    readingTime: 5,
  },
  {
    slug: "building-autonomous-trading-bot-ascend",
    title: "Building an Autonomous Trading Bot on Ascend Market",
    date: "Apr 10, 2026",
    categories: ["Trading"],
    excerpt:
      "A deep dive into how I built an autonomous event perpetuals trading bot on Ascend Market's testnet. EMA crossovers, RSI filters, ATR-based sizing, and the lessons learned from letting code trade for you.",
    readingTime: 8,
  },
  {
    slug: "good-vibes-club-more-than-pfps",
    title: "Good Vibes Club: More Than Just PFPs",
    date: "Feb 22, 2026",
    categories: ["NFTs", "Ethereum"],
    excerpt:
      "6,968 3D PFPs on Ethereum crafted by Toast studio. GVC built an entire ecosystem around Vibetown: Vibe Off, Smash The Wall, SpotiVibe, and AI tools. This is why the community stayed.",
    readingTime: 4,
  },
  {
    slug: "why-liqwid-is-the-best-on-cardano",
    title: "Why Liqwid Is the Best DeFi Protocol on Cardano",
    date: "Mar 5, 2026",
    categories: ["DeFi", "Cardano"],
    excerpt:
      "With $32M+ TVL, Lombard loans that let you borrow against staked ADA without losing rewards, and a governance token with real utility, Liqwid Finance is the DeFi protocol I trust most on Cardano.",
    readingTime: 6,
  },
  {
    slug: "arbiter-passive-ada-from-forex",
    title: "Arbiter: Earning Passive ADA From Dubai Forex Trading",
    date: "Feb 10, 2026",
    categories: ["NFTs", "Cardano"],
    excerpt:
      "1,718 NFTs backed by ATS, a Dubai forex firm running AUD/CAD strategies. Transparent Myfxbook results, passive ADA rewards, no token dilution. This is real yield in the NFT space.",
    readingTime: 5,
  },
  {
    slug: "midnight-fair-launch-zk-privacy",
    title: "Midnight: The Fairest Token Launch in Crypto History",
    date: "Mar 20, 2026",
    categories: ["Cardano"],
    excerpt:
      "37 million wallets received the NIGHT airdrop. Node operators include Worldpay, MoneyGram, and Google Cloud. Midnight's ZK privacy layer is not just another L1, it is enterprise infrastructure.",
    readingTime: 5,
  },
  {
    slug: "case-for-liqwid-finance-multi-chain",
    title: "The Case for Liqwid Finance in a Multi-Chain World",
    date: "Jan 18, 2026",
    categories: ["DeFi", "Cardano"],
    excerpt:
      "Liqwid Finance is Cardano's leading lending and borrowing protocol. In a world where every chain has an Aave fork, here is why Liqwid's native approach and growing TVL make it stand out.",
    readingTime: 5,
  },
  {
    slug: "my-web3-journey-degen-to-builder",
    title: "My Web3 Journey: From Degen to Builder",
    date: "Jan 5, 2026",
    categories: ["Opinion"],
    excerpt:
      "I started in crypto chasing pumps. Now I build trading bots, run a YouTube channel, and ship code daily. This is the story of how Web3 turned a retail degen into a full-time builder.",
    readingTime: 6,
  },
]

const allCategories: Category[] = ["DeFi", "Trading", "NFTs", "Cardano", "Ethereum", "Opinion"]

const categoryColors: Record<Category, string> = {
  DeFi: "bg-[#00FF88]/10 text-[#00FF88] border-[#00FF88]/20",
  Trading: "bg-[#6366F1]/10 text-[#6366F1] border-[#6366F1]/20",
  NFTs: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20",
  Cardano: "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/20",
  Ethereum: "bg-[#627EEA]/10 text-[#627EEA] border-[#627EEA]/20",
  Opinion: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
}

const categoryGradients: Record<Category, string> = {
  DeFi: "from-[#00FF88]/15 to-[#00FF88]/5",
  Trading: "from-[#6366F1]/15 to-[#6366F1]/5",
  NFTs: "from-[#A855F7]/15 to-[#A855F7]/5",
  Cardano: "from-[#22D3EE]/15 to-[#22D3EE]/5",
  Ethereum: "from-[#627EEA]/15 to-[#627EEA]/5",
  Opinion: "from-[#F59E0B]/15 to-[#F59E0B]/5",
}

export default function BlogContent() {
  const [activeFilter, setActiveFilter] = useState<Category | "All">("All")
  const [searchQuery, setSearchQuery] = useState("")

  const featuredPost = posts[0]
  const gridPosts = posts.slice(1)

  const filtered = gridPosts.filter((p) => {
    const matchesCategory =
      activeFilter === "All" || p.categories.includes(activeFilter)
    const matchesSearch =
      searchQuery === "" ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const categoryCounts = allCategories.reduce(
    (acc, cat) => {
      acc[cat] = gridPosts.filter((p) => p.categories.includes(cat)).length
      return acc
    },
    {} as Record<Category, number>
  )

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-[#00FF88]/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-[1440px] px-4 py-16 lg:px-6 lg:py-24">
          <h1 className="font-display text-4xl font-bold tracking-tight lg:text-5xl">
            Blog
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground leading-relaxed">
            Thoughts on Web3, DeFi, trading, and the decentralized future.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-10 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link
            href={`/blog/${featuredPost.slug}`}
            className="group block"
          >
            <div className="relative rounded-2xl border border-[#00FF88]/20 bg-white/[0.03] p-8 sm:p-10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#00FF88]/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-[#00FF88] bg-[#00FF88]/10 rounded-full px-3 py-1">
                    Featured
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-white/40 font-mono">
                    <Clock className="size-3" />
                    {featuredPost.readingTime} min read
                  </span>
                </div>
                <h2 className="font-display text-2xl lg:text-3xl font-bold leading-snug text-foreground group-hover:text-[#00FF88] transition-colors">
                  {featuredPost.title}
                </h2>
                <p className="mt-4 text-base text-white/50 max-w-2xl leading-relaxed line-clamp-3">
                  {featuredPost.excerpt}
                </p>
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {featuredPost.categories.map((cat) => (
                      <span
                        key={cat}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryColors[cat]}`}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3" />
                      <span>{featuredPost.date}</span>
                    </div>
                    <span className="flex items-center gap-1 text-[#00FF88] opacity-0 transition-opacity group-hover:opacity-100">
                      Read Article <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00FF88]/40 to-transparent" />
            </div>
          </Link>
        </motion.div>

        <div className="mt-10 mb-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/30" />
            <input
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-56 rounded-full bg-white/[0.03] border border-white/[0.06] pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFilter("All")}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
                activeFilter === "All"
                  ? "border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
            >
              All ({gridPosts.length})
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
                  activeFilter === cat
                    ? `${categoryColors[cat]}`
                    : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                {cat} ({categoryCounts[cat]})
              </button>
            ))}
          </div>
        </div>

        <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((post) => (
              <motion.div
                key={post.slug}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
              >
                <Link href={`/blog/${post.slug}`} className="group block h-full">
                  <div className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden transition-all hover:border-white/[0.12]">
                    <div className={`relative h-[120px] bg-gradient-to-b ${categoryGradients[post.categories[0]]} flex items-end p-4`}>
                      <div className="flex flex-wrap gap-2">
                        {post.categories.map((cat) => (
                          <span
                            key={cat}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryColors[cat]}`}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h2 className="font-display text-lg font-semibold leading-snug text-foreground group-hover:text-[#00FF88] transition-colors">
                        {post.title}
                      </h2>
                      <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {post.excerpt}
                      </p>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="size-3" />
                            <span>{post.date}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="size-3" />
                            <span>{post.readingTime} min</span>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-[#00FF88] opacity-0 transition-opacity group-hover:opacity-100">
                          Read more <ArrowRight className="size-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-16"
        >
          <div className="rounded-2xl border border-[#00FF88]/20 bg-white/[0.03] p-8 text-center max-w-2xl mx-auto">
            <Mail className="size-8 text-[#00FF88] mx-auto mb-4" />
            <h2 className="font-display text-2xl font-bold">
              Get the alpha straight to your inbox
            </h2>
            <p className="text-muted-foreground mt-2">
              Web3 insights, bot updates, and market takes. No spam.
            </p>
            <div className="mt-6 flex gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="you@email.com"
                className="flex-1 rounded-full bg-white/[0.03] border border-white/[0.06] px-4 py-2.5 text-sm text-foreground placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
              />
              <button className="rounded-full bg-[#00FF88] text-[#06080F] px-6 py-2.5 text-sm font-semibold hover:bg-[#00FF88]/90 transition-colors cursor-pointer">
                Subscribe
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="border-t border-white/5">
        <div className="mx-auto max-w-[1440px] px-4 py-12 lg:px-6">
          <div className="mx-auto max-w-lg text-center">
            <p className="text-muted-foreground mb-4">
              Follow the journey on X and YouTube
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://x.com/RnGcrYptO"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:border-white/20 hover:bg-white/[0.07]"
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-current">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @RnGcrYptO
              </a>
              <a
                href="https://youtube.com/@RnGcrYptO"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:border-white/20 hover:bg-white/[0.07]"
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-current">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                @RnGcrYptO
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
