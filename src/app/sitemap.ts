import { MetadataRoute } from "next"
import { getAllPosts } from "@/lib/blog"

const CONTENT_UPDATED = new Date("2026-10-05T00:00:00Z")

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.rngcrypto.com"

  const livePages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}`, lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: `${baseUrl}/signals`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.95 },
    { url: `${baseUrl}/signals/strike`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/signals/ascend`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/signals/performance`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.85 },
    { url: `${baseUrl}/markets`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${baseUrl}/news`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.7 },
  ]

  const staticPages: MetadataRoute.Sitemap = [
    "/blog",
    "/macro",
    "/web3",
    "/ascend",
    "/strike",
    "/hype",
    "/about",
    "/projects",
    "/proposals",
    "/subscribe",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: CONTENT_UPDATED,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  const blogPosts: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }))

  return [...livePages, ...staticPages, ...blogPosts]
}
