import { MetadataRoute } from "next"
import { getAllPosts } from "@/lib/blog"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://rngcrypto.com"

  const staticPages = [
    "",
    "/markets",
    "/macro",
    "/news",
    "/blog",
    "/web3",
    "/youtube",
    "/bot",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? ("hourly" as const) : ("daily" as const),
    priority: route === "" ? 1 : 0.8,
  }))

  const blogPosts = getAllPosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }))

  return [...staticPages, ...blogPosts]
}
