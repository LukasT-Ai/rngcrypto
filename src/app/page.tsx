import { getAllPosts } from "@/lib/blog"
import HomeContent, { type HomePost } from "./home-content"

// Server shell: reads the latest posts from disk, hands everything live to the client page.
export default function HomePage() {
  const posts: HomePost[] = getAllPosts()
    .slice(0, 3)
    .map((p) => ({ slug: p.slug, title: p.title, description: p.description, date: p.date, category: p.category, readTime: p.readTime }))
  return <HomeContent posts={posts} />
}
