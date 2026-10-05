"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { PenSquare, Layers, User, Menu, X, Zap, Activity, Crosshair, ChevronDown, TrendingUp, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useRef } from "react"

// Vendor colors verified from strikefinance.org / ascend.market stylesheets (see app/src/app/signals/themes.ts).
const STRIKE = "#4EFAB0"
const ASCEND = "#F35233"
const RNG = "#00FF88"

type NavChild = { href: string; label: string; icon: React.ElementType; color: string; blurb: string }
type NavItem = { href: string; label: string; icon: React.ElementType; children?: NavChild[] }

// Bot dashboards (/ascend, /strike, /hype) remain live but are intentionally unlinked.
const navItems: NavItem[] = [
  {
    href: "/signals/strike",
    label: "Signals",
    icon: Crosshair,
    children: [
      { href: "/signals/strike", label: "Strike", icon: TrendingUp, color: STRIKE, blurb: "All 31 Strike Finance perpetual markets" },
      { href: "/signals/ascend", label: "Ascend", icon: BarChart3, color: ASCEND, blurb: "BTC, Gold, Cardano and WTI" },
    ],
  },
  { href: "/signals/performance", label: "Performance", icon: Activity },
  { href: "/projects", label: "Projects", icon: Layers },
  { href: "/proposals", label: "Proposals", icon: Zap },
  { href: "/blog", label: "Blog", icon: PenSquare },
  { href: "/about", label: "About", icon: User },
]

function activeColorFor(pathname: string, item: NavItem): string {
  const child = item.children?.find((c) => pathname.startsWith(c.href))
  return child?.color ?? RNG
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.children) return item.children.some((c) => pathname.startsWith(c.href))
  return pathname.startsWith(item.href)
}

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setOpenMenu(null)
  }, [pathname])

  const openNow = (label: string) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setOpenMenu(label)
  }
  const closeSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 140)
  }

  return (
    <header className={cn("fixed top-0 z-50 w-full transition-all duration-300", scrolled ? "border-b border-white/5 bg-[#06080F]/90 backdrop-blur-xl" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative size-8 overflow-hidden rounded-full ring-1 ring-white/10">
            <Image src="/avatar/character.jpg" alt="RnGcrYptO" fill className="object-cover" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            <span className="text-[#00FF88]">RnG</span>
            <span className="text-foreground/90">crYptO</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const isActive = isItemActive(pathname, item)
            const color = activeColorFor(pathname, item)
            if (!item.children) {
              return (
                <Link key={item.href} href={item.href} className={cn("relative px-4 py-2 text-sm font-medium transition-all duration-200", isActive ? "" : "text-white/50 hover:text-white/80")} style={isActive ? { color } : undefined}>
                  {item.label}
                  {isActive && <span className="absolute inset-x-4 -bottom-[1px] h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />}
                </Link>
              )
            }
            const open = openMenu === item.label
            return (
              <div key={item.label} className="relative" onMouseEnter={() => openNow(item.label)} onMouseLeave={closeSoon}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => (open ? setOpenMenu(null) : openNow(item.label))}
                  onKeyDown={(e) => e.key === "Escape" && setOpenMenu(null)}
                  className={cn("relative flex items-center gap-1 px-4 py-2 text-sm font-medium transition-all duration-200", isActive ? "" : "text-white/50 hover:text-white/80")}
                  style={isActive ? { color } : undefined}
                >
                  {item.label}
                  <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                  {isActive && <span className="absolute inset-x-4 -bottom-[1px] h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />}
                </button>
                {open && (
                  <div role="menu" className="absolute left-1/2 top-full z-50 mt-1 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#06080F]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                    {item.children.map((c) => {
                      const childActive = pathname.startsWith(c.href)
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          role="menuitem"
                          className={cn("flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors", childActive ? "" : "hover:bg-white/5")}
                          style={childActive ? { backgroundColor: `${c.color}14` } : undefined}
                        >
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${c.color}1F`, color: c.color }}>
                            <c.icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold" style={{ color: c.color }}>{c.label} Signals</span>
                            <span className="block text-[11px] text-white/45">{c.blurb}</span>
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          <a href="https://x.com/RnGcrYptO" target="_blank" rel="noopener noreferrer" className="hidden text-white/40 transition-colors hover:text-white/80 sm:block">
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a href="https://www.youtube.com/@RnGcrYptO" target="_blank" rel="noopener noreferrer" className="hidden text-white/40 transition-colors hover:text-red-400 sm:block">
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </a>
          <Button variant="ghost" size="icon" className="text-white/50 md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="border-t border-white/5 bg-[#06080F]/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col px-4 py-4">
            {navItems.map((item) => {
              const isActive = isItemActive(pathname, item)
              const color = activeColorFor(pathname, item)
              if (!item.children) {
                return (
                  <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors", isActive ? "" : "text-white/50 hover:bg-white/5 hover:text-white/80")} style={isActive ? { color, backgroundColor: `${color}1A` } : undefined}>
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                )
              }
              return (
                <div key={item.label} className="mb-1">
                  <div className="flex items-center gap-3 px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    <item.icon className="size-3.5" />
                    {item.label}
                  </div>
                  {item.children.map((c) => {
                    const childActive = pathname.startsWith(c.href)
                    return (
                      <Link key={c.href} href={c.href} className={cn("ml-3 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors", childActive ? "" : "text-white/60 hover:bg-white/5 hover:text-white/85")} style={childActive ? { color: c.color, backgroundColor: `${c.color}1A` } : undefined}>
                        <c.icon className="size-4" style={{ color: c.color }} />
                        {c.label} Signals
                        <span className="ml-auto text-[11px] text-white/35">{c.blurb}</span>
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </div>
      )}
    </header>
  )
}
