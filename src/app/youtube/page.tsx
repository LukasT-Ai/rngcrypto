"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageTransition } from "@/components/page-transition"
import { Button } from "@/components/ui/button"
import { Youtube, ExternalLink, Play, Users, Eye, Film } from "lucide-react"

function formatViews(n: string | number): string {
  const num = typeof n === "string" ? parseInt(n) : n
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return `${num}`
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return ""
  const h = match[1] ? `${match[1]}:` : ""
  const m = match[2] ?? "0"
  const s = (match[3] ?? "0").padStart(2, "0")
  return `${h}${h ? m.padStart(2, "0") : m}:${s}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function YouTubePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["youtube-videos"],
    queryFn: async () => {
      const res = await fetch("/api/youtube")
      return res.json()
    },
    refetchInterval: 900_000,
  })

  const videos = data?.videos ?? []
  const stats = data?.channelStats
  const featured = videos[0]
  const rest = videos.slice(1)

  return (
    <PageTransition>
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">YouTube</h1>
          <Badge variant="secondary" className="bg-red-500/10 text-red-400 text-xs">
            <Youtube className="mr-1 size-3" />
            RnGcrYptO
          </Badge>
        </div>
        <a
          href="https://youtube.com/@RnGcrYptO"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
            Subscribe
            <ExternalLink className="size-3" />
          </Button>
        </a>
      </div>

      {/* Channel Stats */}
      {stats && !data?.isPlaceholder && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="size-5 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Subscribers</p>
                <p className="font-mono text-lg font-semibold">
                  {formatViews(stats.subscriberCount)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <Eye className="size-5 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total Views</p>
                <p className="font-mono text-lg font-semibold">
                  {formatViews(stats.viewCount)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <Film className="size-5 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Videos</p>
                <p className="font-mono text-lg font-semibold">
                  {stats.videoCount}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Featured Video */}
      {featured && (
        <Card className="group border-border bg-card overflow-hidden transition-all hover:-translate-y-px">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row">
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-red-500/20 via-card to-card md:w-[480px] md:aspect-auto md:min-h-56">
                {featured.thumbnail ? (
                  <img
                    src={featured.thumbnail}
                    alt={featured.title}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <Play className="size-12 text-red-400/60" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="size-12 text-white" />
                </div>
                <Badge className="absolute top-3 left-3 bg-red-500/80 text-white text-xs">
                  Latest
                </Badge>
                {featured.duration && (
                  <span className="absolute bottom-3 right-3 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
                    {parseDuration(featured.duration)}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-center p-6">
                <h2 className="text-xl font-semibold leading-snug group-hover:text-primary transition-colors">
                  {featured.title}
                </h2>
                <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{formatViews(featured.viewCount)} views</span>
                  <span>|</span>
                  <span>{timeAgo(featured.publishedAt)}</span>
                </div>
                {!data?.isPlaceholder && featured.id && (
                  <a
                    href={`https://youtube.com/watch?v=${featured.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4"
                  >
                    <Button size="sm" className="gap-1.5">
                      <Play className="size-3.5" />
                      Watch Now
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? [...Array(4)].map((_, i) => (
              <Card key={i} className="border-border bg-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="skeleton aspect-video w-full" />
                  <div className="p-3 space-y-2">
                    <div className="skeleton h-4 w-full rounded" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </div>
                </CardContent>
              </Card>
            ))
          : rest.map((video: any) => (
              <a
                key={video.id}
                href={
                  data?.isPlaceholder
                    ? "#"
                    : `https://youtube.com/watch?v=${video.id}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <Card className="group border-border bg-card overflow-hidden transition-all hover:-translate-y-px">
                  <CardContent className="p-0">
                    <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-red-500/10 to-card">
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : (
                        <Play className="size-8 text-muted-foreground/40 group-hover:text-red-400 transition-colors" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="size-8 text-white" />
                      </div>
                      {video.duration && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1 py-0.5 font-mono text-[10px] text-white">
                          {parseDuration(video.duration)}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
                        {video.title}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatViews(video.viewCount)} views</span>
                        <span>|</span>
                        <span>{timeAgo(video.publishedAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
      </div>

      {/* Social Links */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center justify-center gap-4 py-4">
          <a
            href="https://youtube.com/@RnGcrYptO"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Youtube className="size-4 text-red-400" />
            youtube.com/@RnGcrYptO
          </a>
          <span className="text-border">|</span>
          <a
            href="https://x.com/rngcrypto"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            x.com/rngcrypto
          </a>
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  )
}
