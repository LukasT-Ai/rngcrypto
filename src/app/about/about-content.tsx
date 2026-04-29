"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import {
  Bot,
  Youtube,
  Twitter,
  Microscope,
  Gem,
  ExternalLink,
} from "lucide-react"

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const milestones = [
  {
    year: "2021",
    title: "Fell down the Bitcoin rabbit hole",
    description:
      "What started as curiosity became a full obsession with decentralized money.",
  },
  {
    year: "2022",
    title: "Discovered Cardano & DeFi",
    description:
      "Liqwid, Minswap, the ecosystem. Found home base in Cardano DeFi.",
  },
  {
    year: "2023",
    title: "Collected first NFTs",
    description:
      "Good Vibes Club and Arbiter. NFTs are about the people, not just the JPEGs.",
  },
  {
    year: "2024",
    title: "Started building bots",
    description:
      "First autonomous trading code. Let the bot do the work, track everything transparently.",
  },
  {
    year: "2025",
    title: "Launched Ascend Agent",
    description:
      "Live testnet trading on Ascend Market. Transparent results, no black boxes.",
  },
  {
    year: "2026",
    title: "Launched rngcrypto.com",
    description:
      "Full platform, YouTube, content. Building in public every day.",
  },
]

const ecosystemItems = [
  { name: "Cardano", color: "#0033AD" },
  { name: "Liqwid", color: "#22D3EE" },
  { name: "Ascend", color: "#00FF88" },
  { name: "Midnight", color: "#6366F1" },
  { name: "Good Vibes Club", color: "#A855F7" },
  { name: "Arbiter", color: "#F59E0B" },
  { name: "Bitcoin", color: "#F7931A" },
]

const focuses = [
  {
    icon: Bot,
    title: "Autonomous Trading",
    description:
      "Building bots that trade event perpetuals on Ascend Market. Fully autonomous, data-driven, no manual intervention.",
    href: "/ascend",
    internal: true,
  },
  {
    icon: Twitter,
    title: "Content Creation",
    description:
      "Sharing the Web3 journey on X and YouTube. Market takes, DeFi breakdowns, bot updates.",
    href: "https://x.com/RnGcrYptO",
    internal: false,
  },
  {
    icon: Microscope,
    title: "DeFi Research",
    description:
      "Deep in the Cardano ecosystem. Liqwid Finance, Midnight, and the broader DeFi landscape.",
    href: "/projects",
    internal: true,
  },
  {
    icon: Gem,
    title: "NFT Community",
    description:
      "Collector and community member. Good Vibes Club, Arbiter, and more. NFTs are about the people.",
    href: "/projects",
    internal: true,
  },
]

const socials = [
  {
    icon: Twitter,
    label: "X / Twitter",
    handle: "@RnGcrYptO",
    href: "https://x.com/RnGcrYptO",
    accent: "hover:border-[#00FF88]/40 hover:shadow-[#00FF88]/10",
  },
  {
    icon: Youtube,
    label: "YouTube",
    handle: "@RnGcrYptO",
    href: "https://www.youtube.com/@RnGcrYptO",
    accent: "hover:border-[#FF3B5C]/40 hover:shadow-[#FF3B5C]/10",
  },
]

export default function AboutContent() {
  const { data } = useQuery<{
    stats: {
      totalTrades: number
      winRate: number
      wins: number
      losses: number
      totalPnl: number
    }
  }>({
    queryKey: ["ascend-overview-about"],
    queryFn: async () => {
      const res = await fetch("/api/ascend?view=overview")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    retry: false,
  })

  const botStats = data?.stats

  return (
    <div className="mx-auto max-w-7xl space-y-20 px-4 py-24 lg:px-8">
      <motion.section
        className="flex flex-col-reverse items-center gap-10 lg:flex-row lg:items-start lg:justify-between"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div className="flex-1 space-y-5" variants={fadeUp} transition={{ duration: 0.5 }}>
          <h1 className="font-display text-5xl font-bold tracking-tight lg:text-6xl">
            <span className="text-[#00FF88]">RnG</span>crYptO
          </h1>
          <p className="text-lg text-muted-foreground">
            Web3 Builder &middot; DeFi Degen &middot; Bot Builder
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["SINCE 2021", "CARDANO", "BOT BUILDER", "DeFi"].map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-white/50"
              >
                {badge}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
          <div className="relative size-[240px] overflow-hidden rounded-3xl shadow-[0_0_30px_rgba(0,255,136,0.2),0_0_60px_rgba(0,255,136,0.08)] ring-2 ring-[#00FF88]/30 lg:size-[280px]">
            <Image
              src="/avatar/character.jpg"
              alt="RnGcrypto avatar"
              fill
              className="object-cover"
              priority
            />
          </div>
        </motion.div>
      </motion.section>

      <motion.section
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        {[
          {
            label: "Total Bot Trades",
            value: botStats ? botStats.totalTrades.toLocaleString() : "900+",
          },
          {
            label: "Win Rate",
            value: botStats ? `${botStats.winRate}%` : "85%+",
          },
          { label: "Content Pieces", value: "23" },
          { label: "NFTs Held", value: "12" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            variants={fadeUp}
            transition={{ duration: 0.4 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5"
          >
            <p className="font-mono text-2xl font-bold tabular-nums text-[#00FF88]">
              {stat.value}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </motion.section>

      <motion.section
        className="space-y-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.h2
          className="font-display text-3xl font-bold"
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          The Journey
        </motion.h2>

        <div className="relative ml-4 border-l border-gradient-to-b from-[#00FF88]/20 via-[#00FF88]/40 to-[#00FF88]/60">
          <div
            className="absolute inset-0 w-px"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,255,136,0.15), rgba(0,255,136,0.5))",
            }}
          />
          <div className="space-y-10">
            {milestones.map((m, i) => (
              <motion.div
                key={m.year}
                className="relative pl-8"
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="absolute -left-[6.5px] top-1 size-3 rounded-full bg-[#00FF88] ring-4 ring-[#00FF88]/10" />
                <p className="font-mono text-sm font-bold text-[#00FF88]">
                  {m.year}
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold">
                  {m.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {m.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.h2
          className="mb-6 font-display text-3xl font-bold"
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          Ecosystem
        </motion.h2>
        <motion.div
          className="flex flex-wrap justify-center gap-3"
          variants={fadeUp}
          transition={{ duration: 0.4 }}
        >
          {ecosystemItems.map((item) => (
            <span
              key={item.name}
              className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/60 transition-all hover:border-white/[0.12] hover:text-white/80"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
          ))}
        </motion.div>
      </motion.section>

      <motion.section
        className="space-y-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.h2
          className="font-display text-3xl font-bold"
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          What I&apos;m Building
        </motion.h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {focuses.map((f) => {
            const inner = (
              <motion.div
                key={f.title}
                className="group relative flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 transition-all hover:border-[#00FF88]/20"
                variants={fadeUp}
                transition={{ duration: 0.4 }}
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#00FF88]/10">
                  <f.icon className="size-5 text-[#00FF88]" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
                <ExternalLink className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
              </motion.div>
            )

            return f.internal ? (
              <Link key={f.title} href={f.href}>
                {inner}
              </Link>
            ) : (
              <a
                key={f.title}
                href={f.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            )
          })}
        </div>
      </motion.section>

      <motion.section
        className="space-y-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.h2
          className="text-center font-display text-3xl font-bold"
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          Connect
        </motion.h2>

        <div className="mx-auto grid max-w-lg gap-4 sm:grid-cols-2">
          {socials.map((s) => (
            <motion.a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:shadow-lg ${s.accent}`}
              variants={fadeUp}
              transition={{ duration: 0.4 }}
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <s.icon className="size-6" />
              </div>
              <div>
                <p className="font-semibold">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.handle}</p>
              </div>
              <ExternalLink className="ml-auto size-4 text-muted-foreground" />
            </motion.a>
          ))}
        </div>
      </motion.section>
    </div>
  )
}
