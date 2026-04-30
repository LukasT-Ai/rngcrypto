"use client"

import { motion } from "framer-motion"
import { FileText, Download, ExternalLink, Lightbulb } from "lucide-react"

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const proposals = [
  {
    title: "The Ascending Arbiters",
    subtitle: "Ascend Market x Arbiter NFT",
    description:
      "A partnership proposal exploring how Ascend's event perpetuals platform and Arbiter's forex-backed NFT collection can create a compounding yield flywheel on Cardano. Covers NFT-gated trading perks, treasury cross-pollination, fund performance prediction markets, and DEX liquidity incentives.",
    status: "Submitted",
    date: "May 2026",
    pdfUrl: "/proposals/the-ascending-arbiters.pdf",
    tags: ["Ascend", "Arbiter", "Cardano", "Midnight", "DeFi"],
  },
]

export default function ProposalsContent() {
  return (
    <main className="min-h-screen pt-28 pb-20 px-4">
      <motion.div
        className="max-w-4xl mx-auto space-y-16"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Community{" "}
            <span className="text-[#00FF88]">Proposals</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Partnership ideas and collaboration proposals for the Cardano and
            Midnight ecosystem. Built by the community, for the community.
          </p>
        </motion.div>

        <motion.div variants={stagger} className="space-y-6">
          {proposals.map((proposal) => (
            <motion.div
              key={proposal.title}
              variants={fadeUp}
              className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm overflow-hidden hover:border-zinc-700 transition-colors"
            >
              <div className="p-6 md:p-8 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-[#00FF88]" />
                      <h2 className="text-xl md:text-2xl font-bold text-white">
                        {proposal.title}
                      </h2>
                    </div>
                    <p className="text-zinc-400 text-sm pl-8">
                      {proposal.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium px-3 py-1 rounded-full bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20">
                    {proposal.status}
                  </span>
                </div>

                <p className="text-zinc-300 text-sm leading-relaxed">
                  {proposal.description}
                </p>

                <div className="flex flex-wrap gap-2">
                  {proposal.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-zinc-500">{proposal.date}</span>
                  <div className="flex gap-3">
                    <a
                      href={proposal.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-[#00FF88] transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View PDF
                    </a>
                    <a
                      href={proposal.pdfUrl}
                      download
                      className="inline-flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-[#00FF88] transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:p-8 text-center space-y-4"
        >
          <Lightbulb className="w-8 h-8 text-[#00FF88] mx-auto" />
          <h3 className="text-lg font-semibold text-white">
            Have a proposal idea?
          </h3>
          <p className="text-zinc-400 text-sm max-w-lg mx-auto">
            If you have a partnership or collaboration idea for the Cardano
            ecosystem, reach out on{" "}
            <a
              href="https://x.com/rngcrypto"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00FF88] hover:underline"
            >
              X @rngcrypto
            </a>{" "}
            and let's build together.
          </p>
        </motion.div>
      </motion.div>
    </main>
  )
}
