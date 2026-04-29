"use client"

import Link from "next/link"
import { useState } from "react"
import { ExternalLink } from "lucide-react"

const exploreLinks = [
  { href: "/ascend", label: "Ascend" },
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
]

const ecosystemLinks = [
  { href: "https://ascend.trade", label: "Ascend Market" },
  { href: "https://liqwid.finance", label: "Liqwid Finance" },
  { href: "https://midnight.network", label: "Midnight" },
]

export function Footer() {
  const [email, setEmail] = useState("")

  return (
    <footer className="border-t border-white/5 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="font-display text-xl font-bold">
              <span className="text-primary">RnG</span>
              <span className="text-foreground">crYptO</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Web3 creator, DeFi degen, and builder of autonomous trading bots.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <a
                href="https://x.com/RnGcrYptO"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 transition-colors hover:text-white/80"
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-current">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.youtube.com/@RnGcrYptO"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 transition-colors hover:text-red-400"
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-current">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Explore
            </h3>
            <ul className="space-y-2.5">
              {exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Ecosystem
            </h3>
            <ul className="space-y-2.5">
              {ecosystemLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                    <ExternalLink className="size-3 opacity-50" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Stay in the loop
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              Trading bot updates, DeFi alpha, and Web3 insights.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setEmail("")
              }}
              className="flex gap-2"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-white/30 focus:border-[#00FF88]/30 focus:outline-none focus:ring-1 focus:ring-[#00FF88]/30"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-[#00FF88] px-4 py-2 text-sm font-semibold text-[#06080F] transition-colors hover:bg-[#00FF88]/90"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/5 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; 2026 RnGcrYptO. All rights reserved.</p>
          <p className="text-white/30">Not financial advice. DYOR.</p>
        </div>
      </div>
    </footer>
  )
}
