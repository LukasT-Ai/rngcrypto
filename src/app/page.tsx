"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  TrendingUp,
  Trophy,
  Zap,
  BarChart3,
  ExternalLink,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@/lib/utils"

type AscendStats = {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  openPositions: number
}

function StatCard({
  label,
  value,
  subtext,
  color = "green",
  delay = 0,
}: {
  label: string
  value: string
  subtext?: string
  color?: "green" | "white" | "red"
  delay?: number
}) {
  const colorMap = {
    green: "text-[#00FF88]",
    white: "text-white",
    red: "text-[#FF3B5C]",
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm transition-all duration-300 hover:border-[#00FF88]/20 hover:bg-white/[0.04]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#00FF88]/[0.02] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <p className="relative text-xs font-medium uppercase tracking-widest text-white/40">
        {label}
      </p>
      <p
        className={cn(
          "relative mt-2 font-mono text-3xl font-bold tracking-tight",
          colorMap[color]
        )}
      >
        {value}
      </p>
      {subtext && (
        <p className="relative mt-1 text-xs text-white/30">{subtext}</p>
      )}
    </motion.div>
  )
}

function LivePulse() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00FF88] opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-[#00FF88]" />
    </span>
  )
}

function AscendPreview() {
  const { data, isLoading } = useQuery<AscendStats>({
    queryKey: ["ascend-overview"],
    queryFn: async () => {
      const res = await fetch("/api/ascend?view=overview")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      return json.stats
    },
    refetchInterval: 30_000,
    retry: false,
  })

  const stats = data ?? {
    totalTrades: 903,
    wins: 757,
    losses: 127,
    winRate: 85.6,
    totalPnl: 350862,
    openPositions: 0,
  }

  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 flex flex-col items-center text-center"
        >
          <div className="mb-4 flex items-center gap-2 rounded-full border border-[#00FF88]/20 bg-[#00FF88]/5 px-4 py-1.5">
            <LivePulse />
            <span className="text-xs font-medium text-[#00FF88]">
              Live on Ascend Market
            </span>
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Autonomous Trading Bot
          </h2>
          <p className="mt-3 max-w-xl text-white/40">
            14-source evaluation engine trading event perpetuals on Midnight.
            Every trade, every stat, fully transparent.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total P&L"
            value={`+$${stats.totalPnl.toLocaleString()}`}
            subtext="Testnet"
            color="green"
            delay={0.1}
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate}%`}
            subtext={`${stats.wins}W / ${stats.losses}L`}
            color="green"
            delay={0.2}
          />
          <StatCard
            label="Total Trades"
            value={stats.totalTrades.toLocaleString()}
            subtext="And counting"
            color="white"
            delay={0.3}
          />
          <StatCard
            label="Open Now"
            value={String(stats.openPositions)}
            subtext={isLoading ? "Loading..." : "Positions"}
            color="white"
            delay={0.4}
          />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 flex justify-center"
        >
          <Link
            href="/ascend"
            className="group flex items-center gap-2 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/5 px-6 py-3 text-sm font-medium text-[#00FF88] transition-all hover:border-[#00FF88]/60 hover:bg-[#00FF88]/10"
          >
            <BarChart3 className="size-4" />
            View Full Dashboard
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

const ecosystemProjects = [
  {
    name: "Ascend Market",
    handle: "@ascendperps",
    description: "Event perpetuals on Cardano using ZK proofs via Midnight",
    href: "/projects#ascend",
    color: "#00FF88",
    icon: TrendingUp,
  },
  {
    name: "Good Vibes Club",
    handle: "@goodvibesclub",
    description: "6,968 3D PFP NFTs on Ethereum by Toast studio. Kill em' with kindness.",
    href: "/projects#gvc",
    color: "#A855F7",
    icon: Trophy,
  },
  {
    name: "Liqwid Finance",
    handle: "@laborable",
    description: "Leading DeFi lending and borrowing protocol on Cardano",
    href: "/projects#liqwid",
    color: "#22D3EE",
    icon: Zap,
  },
]

function ProjectsPreview() {
  return (
    <section className="relative py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00FF88]/[0.01] to-transparent" />
      <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            The Ecosystem
          </h2>
          <p className="mt-3 text-white/40">
            Building at the intersection of DeFi, NFTs, and autonomous trading.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {ecosystemProjects.map((project, i) => (
            <motion.div
              key={project.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Link
                href={project.href}
                className="group flex h-full flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div
                  className="mb-4 flex size-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: project.color + "15" }}
                >
                  <project.icon
                    className="size-5"
                    style={{ color: project.color }}
                  />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {project.name}
                </h3>
                <p className="mt-1 text-xs text-white/30">{project.handle}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-white/50">
                  {project.description}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-white/30 transition-colors group-hover:text-white/60">
                  Learn more
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function LatestContent() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 flex items-end justify-between"
        >
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Latest
            </h2>
            <p className="mt-3 text-white/40">
              Thoughts, alpha, and build logs from the trenches.
            </p>
          </div>
          <Link
            href="/blog"
            className="hidden items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/60 sm:flex"
          >
            All posts
            <ArrowRight className="size-3" />
          </Link>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Building an Autonomous Trading Bot on Ascend Market",
              tag: "Build Log",
              date: "Apr 2026",
              excerpt:
                "How I built a 14-source evaluation engine that trades event perpetuals on Cardano with 85%+ win rate.",
            },
            {
              title: "Why Liqwid Is the Best DeFi Protocol on Cardano",
              tag: "DeFi",
              date: "Mar 2026",
              excerpt:
                "$32M+ TVL, Lombard loans, and real governance. Here's why Liqwid stands out.",
            },
            {
              title: "Midnight: The Fairest Token Launch in Crypto History",
              tag: "Cardano",
              date: "Mar 2026",
              excerpt:
                "37M wallets airdropped NIGHT tokens. Enterprise node operators. ZK privacy done right.",
            },
          ].map((post, i) => (
            <motion.div
              key={post.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Link
                href="/blog"
                className="group flex h-full flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[#00FF88]/10 px-2.5 py-0.5 text-xs font-medium text-[#00FF88]">
                    {post.tag}
                  </span>
                  <span className="text-xs text-white/30">{post.date}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold leading-snug text-white group-hover:text-[#00FF88] transition-colors duration-200">
                  {post.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-white/40">
                  {post.excerpt}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SocialProof() {
  return (
    <section className="border-t border-white/[0.06] py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-center sm:gap-16">
          <a
            href="https://x.com/RnGcrYptO"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 text-white/40 transition-colors hover:text-white/80"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-white/60 group-hover:text-white/90">
                @RnGcrYptO
              </p>
              <p className="text-xs text-white/30">Follow on X</p>
            </div>
          </a>

          <a
            href="https://www.youtube.com/@RnGcrYptO"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 text-white/40 transition-colors hover:text-red-400/80"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-white/60 group-hover:text-white/90">
                @RnGcrYptO
              </p>
              <p className="text-xs text-white/30">Subscribe on YouTube</p>
            </div>
          </a>

          <a
            href="https://x.com/ascendperps"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 text-white/40 transition-colors hover:text-[#00FF88]/80"
          >
            <TrendingUp className="size-5" />
            <div>
              <p className="text-sm font-semibold text-white/60 group-hover:text-white/90">
                @ascendperps
              </p>
              <p className="text-xs text-white/30">Trading on Ascend</p>
            </div>
          </a>
        </div>
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0">
          {/* Radial gradient from center */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,255,136,0.06)_0%,_transparent_70%)]" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
          {/* Noise texture */}
          <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")" }} />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 py-32 lg:px-8">
          {/* Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative mb-8"
          >
            <div className="relative size-28 overflow-hidden rounded-3xl ring-2 ring-white/10 sm:size-32">
              <Image
                src="/avatar/character.jpg"
                alt="RnGcrYptO"
                fill
                className="object-cover"
                priority
              />
            </div>
            <div className="absolute -bottom-1 -right-1 flex items-center gap-1 rounded-full bg-[#06080F] px-2 py-1 ring-1 ring-white/10">
              <LivePulse />
              <span className="text-[10px] font-medium text-[#00FF88]">
                Bot Live
              </span>
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-center font-display text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          >
            <span className="text-[#00FF88]">RnG</span>
            <span className="text-white">crYptO</span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="mt-4 max-w-lg text-center text-lg text-white/40 sm:text-xl"
          >
            Web3 builder. DeFi degen. Autonomous trading across chains.
          </motion.p>

          {/* Subtitle badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-6 flex flex-wrap justify-center gap-2"
          >
            {["Cardano", "Ethereum", "Bitcoin", "Midnight", "DeFi", "NFTs"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-white/40"
              >
                {tag}
              </span>
            ))}
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.6 }}
            className="mt-10 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              href="/ascend"
              className="group flex items-center justify-center gap-2 rounded-full bg-[#00FF88] px-8 py-3.5 text-sm font-semibold text-[#06080F] transition-all hover:bg-[#00FF88]/90 hover:shadow-[0_0_30px_rgba(0,255,136,0.3)]"
            >
              <BarChart3 className="size-4" />
              Live Bot Performance
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/blog"
              className="flex items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.03] px-8 py-3.5 text-sm font-medium text-white/70 transition-all hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-white"
            >
              Read the Blog
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="flex flex-col items-center gap-2 text-white/20"
            >
              <span className="text-[10px] uppercase tracking-widest">
                Scroll
              </span>
              <div className="h-8 w-px bg-gradient-to-b from-white/20 to-transparent" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Ascend Bot Stats */}
      <AscendPreview />

      {/* Projects */}
      <ProjectsPreview />

      {/* Latest Content */}
      <LatestContent />

      {/* Social */}
      <SocialProof />
    </>
  )
}
