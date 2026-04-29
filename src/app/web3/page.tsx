"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Gamepad2,
  Music,
  Film,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Play,
  Trophy,
  Headphones,
  Clapperboard,
  Crosshair,
  Globe,
  Sword,
  Star,
} from "lucide-react"
import { PageTransition } from "@/components/page-transition"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const GAMING_TOKENS = ["gala", "immutable-x", "shrapnel", "beam-2", "ronin", "axie-infinity", "big-time", "echelon-prime", "star-atlas", "pixels"]
const MUSIC_TOKENS = ["gala", "audius", "opulous"]
const FILM_TOKENS = ["gala", "theta-token", "livepeer", "render-token"]

const gamingProjects = [
  {
    name: "Gala Games",
    desc: "The Web3 entertainment powerhouse. Gala Games is a full ecosystem of player-owned titles spanning multiple genres, powered by the GALA token and a decentralized node network of 50,000+ operators.",
    url: "https://games.gala.com",
    token: "gala",
    tag: "Ecosystem",
    highlights: ["50K+ node operators", "GALA token", "Multiple AAA titles", "Player ownership"],
    featured: true,
  },
  {
    name: "Off The Grid",
    desc: "AAA cyberpunk battle royale by Gunzilla Games. Built on Avalanche with Unreal Engine 5. Free-to-play with full NFT item ownership. Hit #1 on Epic Games Store at launch.",
    url: "https://otg.gg",
    token: null,
    tag: "AAA BR",
    highlights: ["Unreal Engine 5", "#1 Epic Games Store", "Free-to-play", "Avalanche"],
    featured: true,
  },
  {
    name: "Shrapnel",
    desc: "AAA first-person extraction shooter built by veteran devs from HALO, Call of Duty, and Westworld. Moddable maps, player-created content, and real asset ownership on Avalanche.",
    url: "https://www.shrapnel.com",
    token: "shrapnel",
    tag: "AAA FPS",
    highlights: ["HALO/CoD veterans", "Extraction shooter", "Moddable", "Avalanche subnet"],
    featured: true,
  },
  {
    name: "Common Ground World",
    desc: "Next-gen social metaverse focused on real community building. Immersive 3D spaces for events, collaboration, and social experiences. Bridging Web2 and Web3 with accessible onboarding.",
    url: "https://commonground.world",
    token: null,
    tag: "Metaverse",
    highlights: ["Social-first", "3D immersive spaces", "Events platform", "Web2-friendly"],
    featured: true,
  },
  {
    name: "Immutable zkEVM",
    desc: "Leading L2 for blockchain gaming. Zero gas fees for players. Powers Gods Unchained, Guild of Guardians, Illuvium, and 200+ titles. Partnered with Polygon.",
    url: "https://www.immutable.com",
    token: "immutable-x",
    tag: "L2",
    highlights: ["200+ games", "Zero gas fees", "Polygon partnership"],
    featured: false,
  },
  {
    name: "Ronin Network",
    desc: "Purpose-built gaming chain by Sky Mavis. Home of Axie Infinity, Pixels, and The Machines Arena. 2.7M+ daily active users.",
    url: "https://roninchain.com",
    token: "ronin",
    tag: "Chain",
    highlights: ["2.7M+ daily active", "Axie ecosystem", "Mavis Hub"],
    featured: false,
  },
  {
    name: "Beam",
    desc: "Gaming-focused chain built on Avalanche. Backs the Merit Circle DAO gaming ecosystem with SDK tools for game developers.",
    url: "https://beam.gg",
    token: "beam-2",
    tag: "Subnet",
    highlights: ["Beam SDK", "Merit Circle DAO", "Dev tools"],
    featured: false,
  },
  {
    name: "The Sandbox",
    desc: "Voxel-based metaverse where players build, own, and monetize gaming experiences. Major brand partnerships with Adidas, Gucci, Warner Music.",
    url: "https://www.sandbox.game",
    token: "the-sandbox",
    tag: "Metaverse",
    highlights: ["Brand partnerships", "Virtual land", "Creator economy"],
    featured: false,
  },
  {
    name: "Axie Infinity",
    desc: "The pioneer play-to-earn monster-battle game. Breed, collect, and battle Axies. Now evolving into a full MMORPG (Atia's Legacy) on the Ronin chain.",
    url: "https://axieinfinity.com",
    token: "axie-infinity",
    tag: "P2E",
    highlights: ["OG play-to-earn", "Ronin chain", "AXS + SLP tokens"],
    featured: false,
  },
  {
    name: "Big Time",
    desc: "Free-to-play multiplayer action RPG from Epic, Blizzard, and Riot veterans. Fight across historical timelines and earn NFT loot drops.",
    url: "https://bigtime.gg",
    token: "big-time",
    tag: "Action RPG",
    highlights: ["AAA studio vets", "Free-to-play", "NFT loot"],
    featured: false,
  },
  {
    name: "Parallel",
    desc: "Sci-fi trading card game with AI-powered NFT cards that evolve. Build decks from five factions and compete in ranked leagues for PRIME tokens.",
    url: "https://parallel.life",
    token: "echelon-prime",
    tag: "TCG",
    highlights: ["AI NPCs", "Sci-fi factions", "PRIME token"],
    featured: false,
  },
  {
    name: "Star Atlas",
    desc: "Grand strategy space exploration MMO on Solana with Unreal Engine 5 cinema-quality visuals. Mine resources, control territory, wage faction wars.",
    url: "https://staratlas.com",
    token: "star-atlas",
    tag: "Space MMO",
    highlights: ["UE5 visuals", "Solana", "Faction warfare"],
    featured: false,
  },
  {
    name: "Pixels",
    desc: "Retro-style farming and social RPG on Ronin that hit 1M+ daily active users. Cultivate land, craft items, and earn PIXEL tokens.",
    url: "https://pixels.xyz",
    token: "pixels",
    tag: "Farming RPG",
    highlights: ["1M+ daily users", "Ronin network", "Play-to-earn"],
    featured: false,
  },
  {
    name: "Illuvium",
    desc: "AAA open-world RPG with auto-battler combat. Built on Immutable zkEVM with stunning Unreal Engine graphics. Capture creatures called Illuvials.",
    url: "https://illuvium.io",
    token: "illuvium",
    tag: "RPG",
    highlights: ["Unreal Engine", "Open-world", "Immutable L2"],
    featured: false,
  },
  {
    name: "Nifty Island",
    desc: "Free-to-play social game world. Build islands, host events, play mini-games, and bring NFTs from any collection to life as playable characters.",
    url: "https://niftyisland.com",
    token: "nifty-island",
    tag: "Social",
    highlights: ["NFT interop", "Island builder", "Mini-games"],
    featured: false,
  },
  {
    name: "Aurory",
    desc: "Japanese-inspired RPG on Solana. Two game modes: Seekers of Tokane (JRPG) and Aurory Tactics (PvP auto-battler). Collect and battle Nefties.",
    url: "https://aurory.io",
    token: "aurory",
    tag: "JRPG",
    highlights: ["Solana", "Turn-based", "Creature battles"],
    featured: false,
  },
]

const musicProjects = [
  {
    name: "Gala Music",
    desc: "Gala's dedicated music vertical. Artists release tracks as limited-edition NFTs that fans can collect and listen to. Node operators earn by supporting the music network. Part of the broader Gala ecosystem powered by the GALA token.",
    url: "https://music.gala.com",
    token: "gala",
    tag: "Gala Ecosystem",
    highlights: ["Artist NFT drops", "Node rewards", "GALA token", "Fan ownership"],
    featured: true,
  },
  {
    name: "Audius",
    desc: "Decentralized music streaming with 8M+ monthly users. Artists upload directly, fans stream free. Governance via AUDIO token. No gatekeepers.",
    url: "https://audius.co",
    token: "audius",
    tag: "Streaming",
    highlights: ["8M+ monthly users", "Direct uploads", "Free to stream"],
    featured: false,
  },
  {
    name: "Sound.xyz",
    desc: "Music NFT platform where fans collect songs as limited editions. Artists earn more per listener than any traditional streaming platform.",
    url: "https://sound.xyz",
    token: null,
    tag: "NFTs",
    highlights: ["Limited edition drops", "Fan-artist connection", "Higher artist revenue"],
    featured: false,
  },
  {
    name: "Opulous",
    desc: "DeFi meets music. Enables music-backed NFTs and lending, letting fans invest in royalty streams from real songs.",
    url: "https://opulous.org",
    token: "opulous",
    tag: "DeFi",
    highlights: ["Music royalty NFTs", "Lending protocol", "Real revenue backing"],
    featured: false,
  },
  {
    name: "Royal.io",
    desc: "Co-founded by 3LAU. Buy ownership stakes in songs and earn streaming royalties. Backed by a16z.",
    url: "https://royal.io",
    token: null,
    tag: "Royalties",
    highlights: ["Song ownership", "Streaming royalties", "a16z backed"],
    featured: false,
  },
  {
    name: "Anotherblock",
    desc: "Music royalty investment platform. Fractionalized streaming rights from major artists (The Weeknd, R3hab) into NFTs on Base/Ethereum. Pays holders USDC royalties.",
    url: "https://anotherblock.com",
    token: null,
    tag: "RWA",
    highlights: ["Fractional royalties", "Major artists", "USDC payouts"],
    featured: false,
  },
  {
    name: "Catalog",
    desc: "The original 1/1 music NFT platform. Artists mint songs as one-of-one digital records on Ethereum, keeping 100% of primary sales and earning on every resale.",
    url: "https://catalog.works",
    token: null,
    tag: "1/1 NFTs",
    highlights: ["100% artist revenue", "1-of-1 records", "Ethereum"],
    featured: false,
  },
  {
    name: "Nina Protocol",
    desc: "Decentralized music publishing on Solana. Artists self-publish, stream, and sell directly, retaining full control and revenue without intermediaries.",
    url: "https://ninaprotocol.com",
    token: null,
    tag: "Publishing",
    highlights: ["Self-publishing", "Solana", "Direct-to-fan"],
    featured: false,
  },
]

const filmProjects = [
  {
    name: "Gala Film",
    desc: "Gala's film and entertainment vertical. Watch and own content as NFTs. Community-driven film production and distribution. Node operators participate in the content network alongside gaming and music.",
    url: "https://film.gala.com",
    token: "gala",
    tag: "Gala Ecosystem",
    highlights: ["Watch-to-own", "NFT content", "GALA token", "Community-funded"],
    featured: true,
  },
  {
    name: "Theta Network",
    desc: "Decentralized video delivery powered by users sharing bandwidth. THETA for governance, TFUEL for operations. Partnered with Samsung, Google, Sony.",
    url: "https://www.thetatoken.org",
    token: "theta-token",
    tag: "CDN",
    highlights: ["Samsung partnership", "Google Cloud validator", "Theta Edge Network"],
    featured: false,
  },
  {
    name: "Livepeer",
    desc: "Decentralized video transcoding infrastructure. Powers video for apps at 10x lower cost than AWS. Production-grade with 100K+ GPUs.",
    url: "https://livepeer.org",
    token: "livepeer",
    tag: "Infra",
    highlights: ["10x cheaper than AWS", "100K+ GPUs", "Production grade"],
    featured: false,
  },
  {
    name: "Render Network",
    desc: "Decentralized GPU rendering for 3D, AI, and visual effects. Used by studios for film-quality renders at scale.",
    url: "https://rendernetwork.com",
    token: "render-token",
    tag: "GPU",
    highlights: ["GPU marketplace", "Film-quality renders", "AI + 3D rendering"],
    featured: false,
  },
  {
    name: "Shibuya",
    desc: "Community-funded anime studio. Token holders vote on plot decisions. Produced 'White Rabbit' anime series.",
    url: "https://www.shibuya.xyz",
    token: null,
    tag: "DAO",
    highlights: ["Community governance", "Anime production", "Vote on storylines"],
    featured: false,
  },
  {
    name: "Decentralized Pictures",
    desc: "Coppola family-backed (American Zoetrope) nonprofit where the global community evaluates and greenlights indie film projects. Funding via TALNT token governance.",
    url: "https://decentralized.pictures",
    token: null,
    tag: "Film Funding",
    highlights: ["Coppola backed", "Community greenlight", "Indie cinema"],
    featured: false,
  },
  {
    name: "Mogul Productions",
    desc: "Decentralized film financing platform. Fans vote on, greenlight, and co-own Hollywood productions using STARS governance tokens. Featured in Forbes and Variety.",
    url: "https://mogulproductions.com",
    token: null,
    tag: "Film Finance",
    highlights: ["Fan governance", "Hollywood co-ownership", "Forbes featured"],
    featured: false,
  },
  {
    name: "Beem",
    desc: "Web3 video livestreaming toolkit built on Livepeer. Token-gate content, host NFT-unlocked premieres and concerts, monetize in both fiat and crypto.",
    url: "https://beem.xyz",
    token: null,
    tag: "Livestream",
    highlights: ["Token-gated video", "Livepeer powered", "Creator tools"],
    featured: false,
  },
]

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

function formatMcap(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

function TokenPriceBar({ ids }: { ids: string[] }) {
  const uniqueIds = [...new Set(ids)]
  const { data, isLoading } = useQuery({
    queryKey: ["web3-tokens", uniqueIds.join(",")],
    queryFn: async () => {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${uniqueIds.join(",")}&order=market_cap_desc&sparkline=false`
      )
      return res.json()
    },
    staleTime: 120_000,
  })

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {uniqueIds.map((id) => (
          <div key={id} className="skeleton h-16 w-36 shrink-0 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {(data ?? []).map((coin: any) => {
        const positive = coin.price_change_percentage_24h >= 0
        return (
          <div
            key={coin.id}
            className="flex shrink-0 items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 min-w-[160px]"
          >
            {coin.image && (
              <img src={coin.image} alt={coin.name} className="size-6 rounded-full" />
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{coin.symbol?.toUpperCase()}</span>
                <span className="font-mono text-sm">{formatPrice(coin.current_price)}</span>
              </div>
              <div className="flex items-center gap-1">
                {positive ? (
                  <TrendingUp className="size-3 text-gain" />
                ) : (
                  <TrendingDown className="size-3 text-loss" />
                )}
                <span
                  className={cn(
                    "font-mono text-xs font-medium",
                    positive ? "text-gain" : "text-loss"
                  )}
                >
                  {positive ? "+" : ""}
                  {coin.price_change_percentage_24h?.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  {formatMcap(coin.market_cap)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FeaturedProjectCard({
  project,
  accentColor,
}: {
  project: {
    name: string
    desc: string
    url: string
    token: string | null
    tag: string
    highlights: string[]
  }
  accentColor: string
}) {
  return (
    <Card className={`border-border bg-card transition-all hover:-translate-y-px ring-1 ${accentColor}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-primary fill-primary" />
            <h3 className="text-base font-semibold">{project.name}</h3>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] bg-primary/10 text-primary">
            {project.tag}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {project.desc}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.highlights.map((h) => (
            <Badge
              key={h}
              variant="secondary"
              className="bg-primary/5 text-primary/80 text-[10px] font-normal"
            >
              {h}
            </Badge>
          ))}
        </div>
        <div className="mt-4">
          <a href={project.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              Visit
              <ExternalLink className="size-3" />
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectCard({
  project,
}: {
  project: {
    name: string
    desc: string
    url: string
    token: string | null
    tag: string
    highlights: string[]
  }
}) {
  return (
    <Card className="border-border bg-card transition-all hover:-translate-y-px">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold">{project.name}</h3>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {project.tag}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {project.desc}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.highlights.map((h) => (
            <Badge
              key={h}
              variant="secondary"
              className="bg-primary/5 text-primary/80 text-[10px] font-normal"
            >
              {h}
            </Badge>
          ))}
        </div>
        <div className="mt-4">
          <a href={project.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              Visit
              <ExternalLink className="size-3" />
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

function GamingTab() {
  const featured = gamingProjects.filter((p) => p.featured)
  const others = gamingProjects.filter((p) => !p.featured)

  return (
    <div className="space-y-4">
      <TokenPriceBar ids={GAMING_TOKENS} />

      {/* Featured Projects */}
      <div className="grid gap-4 sm:grid-cols-2">
        {featured.map((p) => (
          <FeaturedProjectCard key={p.name} project={p} accentColor="ring-primary/30" />
        ))}
      </div>

      {/* Other Projects */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {others.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>

      {/* Gala Ecosystem Spotlight */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" />
            Gala Ecosystem
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
          <p>
            Gala isn't just a game studio. It's a full entertainment ecosystem spanning gaming, music, and film,
            all connected by the GALA token and a decentralized node network. Node operators earn rewards across
            all three verticals, creating a unified Web3 entertainment economy.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <a href="https://games.gala.com" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-border p-4 text-center transition-colors hover:bg-muted hover:border-primary/30">
              <Gamepad2 className="size-5 text-chart-5 mx-auto" />
              <p className="mt-2 font-medium text-foreground">Gala Games</p>
              <p className="mt-1 text-xs">Spider Tanks, Mirandus, Last Expedition, Town Star</p>
            </a>
            <a href="https://music.gala.com" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-border p-4 text-center transition-colors hover:bg-muted hover:border-primary/30">
              <Music className="size-5 text-chart-3 mx-auto" />
              <p className="mt-2 font-medium text-foreground">Gala Music</p>
              <p className="mt-1 text-xs">Artist NFT drops, fan ownership, node-powered streaming</p>
            </a>
            <a href="https://film.gala.com" target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-border p-4 text-center transition-colors hover:bg-muted hover:border-primary/30">
              <Film className="size-5 text-chart-4 mx-auto" />
              <p className="mt-2 font-medium text-foreground">Gala Film</p>
              <p className="mt-1 text-xs">Watch-to-own, community-funded content, NFT distribution</p>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* AAA Spotlight */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crosshair className="size-4 text-chart-4" />
            AAA Web3 Games to Watch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sword className="size-4 text-primary" />
                <p className="font-medium">Off The Grid</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Cyberpunk battle royale by Gunzilla Games. Free-to-play, UE5,
                hit #1 on Epic Games Store. Built on Avalanche with full item ownership.
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Crosshair className="size-4 text-primary" />
                <p className="font-medium">Shrapnel</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Extraction FPS from HALO and Call of Duty veterans. Player-created maps,
                moddable content, real asset ownership. Avalanche subnet.
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="size-4 text-primary" />
                <p className="font-medium">Common Ground World</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Social metaverse for real community building. Immersive 3D event spaces,
                collaboration tools, and accessible Web2-friendly onboarding.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-chart-5" />
            Gaming Ecosystem Highlights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="font-mono text-2xl font-bold text-primary">200+</p>
              <p className="mt-1 text-xs text-muted-foreground">Games on Immutable</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="font-mono text-2xl font-bold text-primary">50K+</p>
              <p className="mt-1 text-xs text-muted-foreground">Gala Node Operators</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="font-mono text-2xl font-bold text-primary">#1</p>
              <p className="mt-1 text-xs text-muted-foreground">OTG on Epic Store</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="font-mono text-2xl font-bold text-primary">5M+</p>
              <p className="mt-1 text-xs text-muted-foreground">Daily Active Gamers</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MusicTab() {
  const featured = musicProjects.filter((p) => p.featured)
  const others = musicProjects.filter((p) => !p.featured)

  return (
    <div className="space-y-4">
      <TokenPriceBar ids={MUSIC_TOKENS} />

      {/* Gala Music featured */}
      {featured.map((p) => (
        <FeaturedProjectCard key={p.name} project={p} accentColor="ring-chart-3/30" />
      ))}

      {/* Other music projects */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>

      {/* Audius embed */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Headphones className="size-4 text-chart-3" />
            Trending on Audius
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <iframe
              src="https://audius.co/embed/playlist/trending?flavor=card&playerSize=standard"
              width="100%"
              height="480"
              allow="encrypted-media"
              style={{ border: "none", background: "transparent" }}
              title="Audius Trending"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <a href="https://audius.co/explore/trending" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <Play className="size-3" />
                Open Audius
                <ExternalLink className="size-3" />
              </Button>
            </a>
            <a href="https://music.gala.com" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <Music className="size-3" />
                Open Gala Music
                <ExternalLink className="size-3" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* How Web3 music works */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How Web3 Music Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
          <p>
            Traditional streaming pays artists $0.003-0.005 per stream. On Audius, artists keep 90% of revenue.
            On Gala Music, artists release tracks as limited-edition NFTs that fans collect and truly own.
            On Sound.xyz, a single collector generates more revenue than 100,000 Spotify streams.
          </p>
          <p>
            The model shift: instead of millions of passive listeners paying fractions of a cent, Web3 music
            enables thousands of superfans to directly support artists through NFT ownership, royalty shares,
            and token-gated experiences. Gala Music takes this further by connecting music to a broader entertainment
            ecosystem where node operators earn across games, music, and film.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function FilmTab() {
  const featured = filmProjects.filter((p) => p.featured)
  const others = filmProjects.filter((p) => !p.featured)

  return (
    <div className="space-y-4">
      <TokenPriceBar ids={FILM_TOKENS} />

      {/* Gala Film featured */}
      {featured.map((p) => (
        <FeaturedProjectCard key={p.name} project={p} accentColor="ring-chart-4/30" />
      ))}

      {/* Other film projects */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>

      {/* Infra comparison */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clapperboard className="size-4 text-chart-4" />
            Decentralized Video Infrastructure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Protocol</th>
                  <th className="px-3 py-2 text-left font-medium">Focus</th>
                  <th className="px-3 py-2 text-left font-medium">Use Case</th>
                  <th className="px-3 py-2 text-left font-medium">Key Metric</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 font-medium">Gala Film</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Watch-to-own</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Content distribution</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">NFT ownership</Badge>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 font-medium">Theta</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Video CDN</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Streaming delivery</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">10K+ Edge Nodes</Badge>
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 font-medium">Livepeer</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Transcoding</td>
                  <td className="px-3 py-2.5 text-muted-foreground">Video processing</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">100K+ GPUs</Badge>
                  </td>
                </tr>
                <tr className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium">Render</td>
                  <td className="px-3 py-2.5 text-muted-foreground">GPU Rendering</td>
                  <td className="px-3 py-2.5 text-muted-foreground">3D/VFX/AI</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="secondary" className="text-[10px]">Film-grade output</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Why decentralized video */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Why Decentralized Video Matters</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
          <p>
            Video accounts for 80%+ of internet traffic. Gala Film is pioneering watch-to-own: instead of renting
            content from Netflix, you own it as an NFT. Community members fund productions and share in success.
          </p>
          <p>
            On the infrastructure side, Theta Network uses viewers' spare bandwidth to relay streams, cutting
            CDN costs by 80%. Livepeer handles transcoding at a fraction of AWS pricing across 100,000+ GPUs.
            Render Network extends this to 3D and VFX rendering for film-quality output.
          </p>
          <p>
            Together, these protocols are building the full stack of decentralized entertainment: from content
            creation (Gala Film, Shibuya) to processing (Livepeer, Render) to delivery (Theta) to ownership (NFTs).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Web3Page() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Web3 Entertainment</h1>
            <Badge variant="secondary" className="bg-chart-5/10 text-chart-5 text-xs">
              Gaming + Music + Film
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            The intersection of blockchain and entertainment. Featuring the Gala ecosystem (Games, Music, Film),
            AAA titles like Off The Grid and Shrapnel, social worlds like Common Ground, and the decentralized
            infrastructure powering it all.
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="gaming">
          <TabsList>
            <TabsTrigger value="gaming" className="gap-1.5">
              <Gamepad2 className="size-3.5" />
              Gaming
            </TabsTrigger>
            <TabsTrigger value="music" className="gap-1.5">
              <Music className="size-3.5" />
              Music
            </TabsTrigger>
            <TabsTrigger value="film" className="gap-1.5">
              <Film className="size-3.5" />
              Film & Video
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gaming" className="mt-4">
            <GamingTab />
          </TabsContent>

          <TabsContent value="music" className="mt-4">
            <MusicTab />
          </TabsContent>

          <TabsContent value="film" className="mt-4">
            <FilmTab />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
