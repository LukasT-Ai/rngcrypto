"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import {
  BarChart3,
  PenSquare,
  Layers,
  User,
  Menu,
  X,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

const navItems = [
  { href: "/ascend", label: "Ascend", icon: BarChart3 },
  { href: "/projects", label: "Projects", icon: Layers },
  { href: "/blog", label: "Blog", icon: PenSquare },
  { href: "/about", label: "About", icon: User },
]

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-white/5 bg-[#06080F]/90 backdrop-blur-xl"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="relative size-8 overflow-hidden rounded-full ring-1 ring-white/10">
            <Image
              src="/avatar/avatar.jpg"
              alt="RnGcrYptO"
              fill
              className="object-cover"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            <span className="text-[#00FF88]">RnG</span>
            <span className="text-foreground/90">crYptO</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const isAscend = item.href === "/ascend"
            const activeColor = isAscend ? "text-[#E8622C]" : "text-[#00FF88]"
            const activeBar = isAscend ? "via-[#E8622C]" : "via-[#00FF88]"
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative px-4 py-2 text-sm font-medium transition-all duration-200",
                  isActive
                    ? activeColor
                    : "text-white/50 hover:text-white/80"
                )}
              >
                {item.label}
                {isActive && (
                  <span className={`absolute inset-x-4 -bottom-[1px] h-px bg-gradient-to-r from-transparent ${activeBar} to-transparent`} />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right: Subscribe CTA + Social links + mobile toggle */}
        <div className="flex items-center gap-3">
          <Link
            href="/subscribe"
            className="hidden items-center gap-1.5 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/5 px-4 py-1.5 text-xs font-medium text-[#00FF88] transition-all hover:border-[#00FF88]/50 hover:bg-[#00FF88]/10 md:inline-flex"
          >
            <Zap className="size-3" />
            Subscribe
          </Link>
          <a
            href="https://x.com/RnGcrYptO"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-white/40 transition-colors hover:text-white/80 sm:block"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://www.youtube.com/@RnGcrYptO"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-white/40 transition-colors hover:text-red-400 sm:block"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </a>

          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="border-t border-white/5 bg-[#06080F]/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col px-4 py-4">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              const isAscend = item.href === "/ascend"
              const mobileActiveClass = isAscend
                ? "bg-[#E8622C]/10 text-[#E8622C]"
                : "bg-[#00FF88]/10 text-[#00FF88]"
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? mobileActiveClass
                      : "text-white/50 hover:bg-white/5 hover:text-white/80"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
            <Link
              href="/subscribe"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#00FF88]/10 px-3 py-3 text-sm font-medium text-[#00FF88]"
            >
              <Zap className="size-4" />
              Subscribe
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
