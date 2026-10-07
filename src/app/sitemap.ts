import { MetadataRoute } from "next"
import { getAllPosts } from "@/lib/blog"

const CONTENT_UPDATED = new Date("2026-10-07T00:00:00Z")
const BASE = "https://www.rngcrypto.com"

// Every entry is a real, linked page. Redirect-only routes (/strike, /ascend, /hype, /bot, /macro, /news) are
// deliberately absent.
export default function sitemap(): MetadataRoute.Sitemap {
  const live: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/signals/strike`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/signals/ascend`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/signals/performance`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.85 },
    { url: `${BASE}/markets`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.6 },
  ]
  const fixed: MetadataRoute.Sitemap = ["/blog", "/projects", "/proposals", "/about", "/subscribe", "/defi", "/web3", "/youtube"].map((route) => ({
    url: `${BASE}${route}`,
    lastModified: CONTENT_UPDATED,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }))
  const posts: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))
  return [...live, ...fixed, ...posts]
}
