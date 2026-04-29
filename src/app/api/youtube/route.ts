import { NextRequest, NextResponse } from "next/server"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 900_000 // 15 minutes

// RnGcrYptO YouTube channel
// To find channel ID: youtube.com/@RnGcrYptO -> view source -> "channelId"
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? ""
const API_KEY = process.env.YOUTUBE_API_KEY ?? ""

export async function GET(req: NextRequest) {
  const maxResults = req.nextUrl.searchParams.get("max") ?? "8"

  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=900" },
    })
  }

  if (!API_KEY || !CHANNEL_ID) {
    // Return placeholder data when API key not configured
    const placeholder = {
      videos: [
        {
          id: "placeholder-1",
          title: "BTC to $100K? Here's What the Charts Say",
          thumbnail: "",
          publishedAt: "2026-02-25T14:00:00Z",
          viewCount: "12400",
          duration: "PT14M32S",
        },
        {
          id: "placeholder-2",
          title: "SOL Deep Dive: Why Solana Could 5x This Cycle",
          thumbnail: "",
          publishedAt: "2026-02-23T16:00:00Z",
          viewCount: "8200",
          duration: "PT18M45S",
        },
        {
          id: "placeholder-3",
          title: "DeFi 101: Yield Farming Explained for Beginners",
          thumbnail: "",
          publishedAt: "2026-02-21T12:00:00Z",
          viewCount: "5100",
          duration: "PT12M10S",
        },
        {
          id: "placeholder-4",
          title: "Weekly Crypto Recap: Feb 17-23, 2026",
          thumbnail: "",
          publishedAt: "2026-02-23T20:00:00Z",
          viewCount: "15000",
          duration: "PT22M30S",
        },
      ],
      channelStats: {
        subscriberCount: "0",
        videoCount: "0",
        viewCount: "0",
      },
      isPlaceholder: true,
    }
    return NextResponse.json(placeholder)
  }

  try {
    // Fetch latest videos from channel
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=${maxResults}&order=date&type=video&key=${API_KEY}`
    )

    if (!searchRes.ok) {
      const err = await searchRes.text()
      console.error("[YouTube API] Search error:", err)
      return NextResponse.json({ error: "YouTube API error" }, { status: searchRes.status })
    }

    const searchData = await searchRes.json()
    const videoIds = searchData.items
      ?.map((item: any) => item.id?.videoId)
      .filter(Boolean)
      .join(",")

    // Fetch video details (view counts, durations)
    let videoDetails: any[] = []
    if (videoIds) {
      const detailRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${API_KEY}`
      )
      if (detailRes.ok) {
        const detailData = await detailRes.json()
        videoDetails = detailData.items ?? []
      }
    }

    // Fetch channel stats
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CHANNEL_ID}&key=${API_KEY}`
    )
    let channelStats = { subscriberCount: "0", videoCount: "0", viewCount: "0" }
    if (channelRes.ok) {
      const channelData = await channelRes.json()
      channelStats = channelData.items?.[0]?.statistics ?? channelStats
    }

    const videos = videoDetails.map((v: any) => ({
      id: v.id,
      title: v.snippet?.title,
      thumbnail: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.default?.url,
      publishedAt: v.snippet?.publishedAt,
      viewCount: v.statistics?.viewCount ?? "0",
      likeCount: v.statistics?.likeCount ?? "0",
      duration: v.contentDetails?.duration ?? "",
      description: v.snippet?.description?.slice(0, 200),
    }))

    const data = { videos, channelStats, isPlaceholder: false }
    cache = { data, timestamp: Date.now() }

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=900" },
    })
  } catch (err) {
    console.error("[YouTube API] Error:", err)
    return NextResponse.json({ error: "Failed to fetch YouTube data" }, { status: 500 })
  }
}
