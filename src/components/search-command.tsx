"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  LayoutDashboard,
  BarChart3,
  Globe,
  Layers,
  Newspaper,
  PenSquare,
  Gamepad2,
  Youtube,
  Bot,
  Search,
  Bitcoin,
  TrendingUp,
} from "lucide-react"

const pages = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Markets", href: "/markets", icon: BarChart3 },
  { name: "Macro Economy", href: "/macro", icon: Globe },
  { name: "DeFi", href: "/defi", icon: Layers },
  { name: "News", href: "/news", icon: Newspaper },
  { name: "Blog", href: "/blog", icon: PenSquare },
  { name: "Web3 Entertainment", href: "/web3", icon: Gamepad2 },
  { name: "YouTube", href: "/youtube", icon: Youtube },
  { name: "RnG Bot", href: "/bot", icon: Bot },
  { name: "About", href: "/about", icon: Search },
  { name: "Subscribe", href: "/subscribe", icon: PenSquare },
]

const quickTokens = [
  { name: "Bitcoin (BTC)", id: "bitcoin" },
  { name: "Ethereum (ETH)", id: "ethereum" },
  { name: "Solana (SOL)", id: "solana" },
  { name: "Cardano (ADA)", id: "cardano" },
  { name: "Chainlink (LINK)", id: "chainlink" },
  { name: "Avalanche (AVAX)", id: "avalanche-2" },
  { name: "Polkadot (DOT)", id: "polkadot" },
  { name: "Polygon (MATIC)", id: "matic-network" },
]

export function SearchCommand() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} showCloseButton={false}>
        <CommandInput placeholder="Search pages, tokens, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Pages">
            {pages.map((page) => (
              <CommandItem
                key={page.href}
                onSelect={() => navigate(page.href)}
              >
                <page.icon className="mr-2 size-4 text-muted-foreground" />
                {page.name}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Quick Tokens">
            {quickTokens.map((token) => (
              <CommandItem
                key={token.id}
                onSelect={() => navigate(`/markets/${token.id}`)}
              >
                <TrendingUp className="mr-2 size-4 text-muted-foreground" />
                {token.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

export function SearchTrigger() {
  return (
    <button
      className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        )
      }}
    >
      <Search className="size-3.5" />
      <span>Search...</span>
      <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
        Ctrl+K
      </kbd>
    </button>
  )
}
