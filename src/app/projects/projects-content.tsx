"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import {
  ExternalLink,
  ArrowRight,
  Bot,
  Coins,
  Shield,
  Palette,
  Bitcoin,
  TrendingUp,
} from "lucide-react"

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
}

const chainColors: Record<string, string> = {
  cardano: "#0033AD",
  midnight: "#6366F1",
  ethereum: "#627EEA",
  bitcoin: "#F7931A",
}

type Project = {
  name: string
  tagline: string
  description: string
  status: string
  statusColor: string
  categories: string[]
  chain: "cardano" | "midnight" | "ethereum" | "bitcoin"
  icon: React.ElementType
  href?: string
  externalHref?: string
  images?: { src: string; alt: string }[]
  stats?: { label: string; value: string }[]
  gradient: string
}

const projects: Project[] = [
  {
    name: "Good Vibes Club",
    tagline: "Kill Em' With Kindness",
    description:
      "6,969 3D PFP NFTs on Ethereum by Toast. A community built on positive energy and good vibes. RnGcrYptO is a proud holder and active community member.",
    status: "Holder",
    statusColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    categories: ["NFT", "Ethereum", "Community"],
    chain: "ethereum",
    icon: Palette,
    images: [
      { src: "/avatar/avatar.jpg", alt: "Good Vibes Club zombie green PFP" },
    ],
    stats: [
      { label: "Collection", value: "6,969" },
      { label: "Type", value: "3D PFP" },
    ],
    gradient: "from-purple-500/15 via-transparent to-transparent",
  },
  {
    name: "Liqwid Finance",
    tagline: "Cardano's Leading Lending Protocol",
    description:
      "$32M+ TVL and growing. The V3 upgrade cemented Liqwid as the go-to lending and borrowing protocol on Cardano. A cornerstone of Cardano DeFi.",
    status: "Active",
    statusColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    categories: ["DeFi", "Cardano", "Lending"],
    chain: "cardano",
    icon: Coins,
    externalHref: "https://liqwid.finance",
    stats: [
      { label: "TVL", value: "$32M+" },
      { label: "Protocol", value: "Lending" },
    ],
    gradient: "from-cyan-500/15 via-transparent to-transparent",
  },
  {
    name: "Midnight",
    tagline: "Data Protection Blockchain",
    description:
      "Built by IOG from the Cardano ecosystem. Mainnet launched March 17, 2026. Zero-knowledge proofs enable selective disclosure, letting users control exactly what data they share on-chain.",
    status: "Building",
    statusColor: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    categories: ["L1", "Privacy", "ZK"],
    chain: "midnight",
    icon: Shield,
    externalHref: "https://midnight.network",
    stats: [
      { label: "Launch", value: "Mar 2026" },
      { label: "Tech", value: "ZK Proofs" },
    ],
    gradient: "from-indigo-500/15 via-transparent to-transparent",
  },
  {
    name: "Arbiter",
    tagline: "Tokenized Forex on Cardano",
    description:
      "Tokenized Forex assets and an NFT collection on Cardano. RnGcrYptO is a holder, tracking the intersection of traditional forex markets and blockchain-native assets.",
    status: "Holder",
    statusColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    categories: ["NFT", "Cardano", "Forex"],
    chain: "cardano",
    icon: TrendingUp,
    images: [
      { src: "/avatar/character.jpg", alt: "Arbiter NFT character with gold shades" },
      { src: "/avatar/mascot.jpg", alt: "Arbiter NFT mascot close-up" },
    ],
    stats: [
      { label: "Type", value: "Forex NFT" },
      { label: "Chain", value: "Cardano" },
    ],
    gradient: "from-amber-500/15 via-transparent to-transparent",
  },
  {
    name: "Bitcoin",
    tagline: "The OG",
    description:
      "The foundation of everything. RnGcrYptO covers BTC market analysis, macro correlation, and trading strategies. Every portfolio starts here.",
    status: "Active",
    statusColor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    categories: ["L1", "Trading", "Analysis"],
    chain: "bitcoin",
    icon: Bitcoin,
    stats: [
      { label: "Since", value: "2009" },
      { label: "Role", value: "Foundation" },
    ],
    gradient: "from-orange-500/15 via-transparent to-transparent",
  },
]

const filterChains = ["all", "cardano", "midnight", "ethereum", "bitcoin"] as const

type AscendOverview = {
  stats: {
    totalTrades: number
    wins: number
    losses: number
    winRate: number
    totalPnl: number
    avgPnl: number
    bestTrade: number
    worstTrade: number
  }
}

type AscendLive = {
  openPositions: { id: string }[]
}

function StatusBadge({ status, className }: { status: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

function FeaturedAscendCard() {
  const { data: overview } = useQuery<AscendOverview>({
    queryKey: ["ascend-overview"],
    queryFn: async () => {
      const res = await fetch("/api/ascend?view=overview")
      if (!res.ok) throw new Error("Failed to fetch")
      return res.json()
    },
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: live } = useQuery<AscendLive>({
    queryKey: ["ascend-live"],
    queryFn: async () => {
      const res = await fetch("/api/ascend?view=live")
      if (!res.ok) throw new Error("Failed to fetch")
      return res.json()
    },
    refetchInterval: 15_000,
    retry: false,
  })

  const stats = overview?.stats
  const openCount = live?.openPositions?.length ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative mb-10 overflow-hidden rounded-2xl border border-[#00FF88]/20 bg-gradient-to-br from-[#00FF88]/[0.06] via-[#06080F] to-[#06080F] p-8"
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
              <Bot className="size-5 text-white/70" />
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight lg:text-2xl">
              Ascend Market
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/20 px-2.5 py-0.5 text-xs font-medium text-[#00FF88]">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[#00FF88]" />
              </span>
              LIVE
            </span>
          </div>
          <p className="mt-1 text-sm text-white/40">Leveraged Prediction Perpetuals</p>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
            Up to 1001x leverage on event outcome perpetuals built on the Midnight blockchain. RnGcrYptO runs a fully autonomous trading bot on the testnet, executing strategies around the clock.
          </p>

          <div className="mt-6 flex flex-wrap gap-6">
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-white/90">
                {stats?.totalTrades?.toLocaleString() ?? "---"}
              </div>
              <div className="mt-0.5 text-xs uppercase tracking-wider text-white/40">Total Trades</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-[#00FF88]">
                {stats?.winRate != null ? `${stats.winRate}%` : "---"}
              </div>
              <div className="mt-0.5 text-xs uppercase tracking-wider text-white/40">Win Rate</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-white/90">
                {openCount}
              </div>
              <div className="mt-0.5 text-xs uppercase tracking-wider text-white/40">Open Positions</div>
            </div>
            <div className="text-center">
              <div className={`font-mono text-lg font-bold ${stats?.totalPnl != null && stats.totalPnl >= 0 ? "text-[#00FF88]" : "text-[#FF3B5C]"}`}>
                {stats?.totalPnl != null
                  ? `${stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toLocaleString()} ADA`
                  : "---"}
              </div>
              <div className="mt-0.5 text-xs uppercase tracking-wider text-white/40">Total PnL</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/ascend"
              className="inline-flex items-center gap-2 rounded-full bg-[#00FF88] px-6 py-2.5 text-sm font-semibold text-[#06080F] transition-opacity hover:opacity-90"
            >
              Live Dashboard
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="https://x.com/ascendperps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] px-5 py-2.5 text-sm text-white/60 transition-colors hover:border-white/[0.2] hover:text-white/80"
            >
              <ExternalLink className="size-3.5" />
              View on X
            </a>
          </div>
        </div>

        <div className="hidden w-[300px] shrink-0 lg:block">
          <div className="relative h-[200px] w-full overflow-hidden rounded-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00FF88]/10 via-[#00FF88]/5 to-transparent" />
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0,255,136,0.15) 1px, transparent 0)`,
              backgroundSize: "20px 20px",
            }} />
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#06080F] to-transparent" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00FF88]/40 to-transparent" />
    </motion.div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const chainColor = chainColors[project.chain]
  const isArbiter = project.name === "Arbiter"
  const isGoodVibes = project.name === "Good Vibes Club"

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 transition-all hover:border-white/[0.12]"
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${project.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08]">
              <project.icon className="size-5 text-white/70" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold tracking-tight">
                  {project.name}
                </h3>
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: chainColor }}
                  />
                  {project.chain}
                </span>
              </div>
              <p className="text-sm text-white/40">{project.tagline}</p>
            </div>
          </div>
          <StatusBadge status={project.status} className={project.statusColor} />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-white/60">
          {project.description}
        </p>

        {project.images && project.images.length > 0 && (
          <div className="mt-5">
            {isGoodVibes ? (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.01]">
                <Image
                  src={project.images[0].src}
                  alt={project.images[0].alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>
            ) : isArbiter ? (
              <div className="flex gap-3">
                {project.images.map((img) => (
                  <div
                    key={img.src}
                    className="relative h-[140px] w-[140px] overflow-hidden rounded-xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.02]"
                  >
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover"
                      sizes="140px"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-3">
                {project.images.map((img) => (
                  <div
                    key={img.src}
                    className="relative h-32 w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.02]"
                  >
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {project.stats && project.stats.length > 0 && (
          <div className="mt-4 flex gap-4 rounded-lg bg-white/[0.02] px-4 py-3">
            {project.stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-[10px] uppercase tracking-wider text-white/30">{stat.label}</div>
                <div className="font-mono text-sm font-semibold text-white/80">{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {project.categories.map((cat) => (
              <Badge
                key={cat}
                variant="secondary"
                className="border-white/[0.06] bg-white/[0.04] text-[11px] text-white/50"
              >
                {cat}
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {project.externalHref && (
              <a
                href={project.externalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
              >
                <ExternalLink className="size-3.5" />
                <span className="hidden sm:inline">Visit</span>
              </a>
            )}
            {project.href && (
              <Link
                href={project.href}
                className="flex items-center gap-1.5 rounded-lg bg-[#00FF88]/10 px-3 py-1.5 text-xs font-semibold text-[#00FF88] transition-all hover:bg-[#00FF88]/20"
              >
                View
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function ProjectsContent() {
  const [activeFilter, setActiveFilter] = useState<string>("all")

  const filteredProjects =
    activeFilter === "all"
      ? projects
      : projects.filter((p) => p.chain === activeFilter)

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-16 text-center"
      >
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Projects{" "}
          <span className="bg-gradient-to-r from-[#00FF88] to-[#00FF88]/60 bg-clip-text text-transparent">
            &amp; Ecosystem
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/50">
          The Web3 journey across Cardano, Midnight, Ethereum, and Bitcoin.
          From autonomous trading bots to NFT communities, DeFi protocols
          to Layer 1 infrastructure.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {["Cardano", "Midnight", "Ethereum", "Bitcoin"].map((chain) => (
            <span
              key={chain}
              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/40"
            >
              {chain}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-6 mt-8">
          {[
            { value: "6", label: "Active Projects" },
            { value: "4", label: "Blockchains" },
            { value: "$32M+", label: "Ecosystem TVL" },
            { value: "24/7", label: "Bot Uptime" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-mono text-2xl font-bold text-[#00FF88]">{stat.value}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/40">{stat.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-2 justify-center mb-10">
        {filterChains.map((chain) => (
          <button
            key={chain}
            onClick={() => setActiveFilter(chain)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium capitalize transition-all ${
              activeFilter === chain
                ? "bg-[#00FF88]/15 text-[#00FF88] border-[#00FF88]/30"
                : "bg-white/[0.03] text-white/40 border-white/[0.06] hover:border-white/[0.12] hover:text-white/60"
            }`}
          >
            {chain === "all" ? "All" : chain}
          </button>
        ))}
      </div>

      <FeaturedAscendCard />

      <AnimatePresence mode="popLayout">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {filteredProjects.map((project) => (
            <ProjectCard key={project.name} project={project} />
          ))}
        </motion.div>
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-16 text-center"
      >
        <p className="text-sm text-white/30">
          Building in public. Follow the journey on{" "}
          <a
            href="https://x.com/RnGcrYptO"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00FF88]/70 transition-colors hover:text-[#00FF88]"
          >
            @RnGcrYptO
          </a>
        </p>
      </motion.div>
    </div>
  )
}
