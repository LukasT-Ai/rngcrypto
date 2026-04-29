import fs from "fs"
import path from "path"
import matter from "gray-matter"
import readingTime from "reading-time"

const CONTENT_DIR = path.join(process.cwd(), "src/content/blog")

export type BlogPost = {
  slug: string
  title: string
  description: string
  date: string
  category: string
  readTime: string
  featured: boolean
  content: string
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return []

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".mdx"))

  const posts = files
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "")
      const filePath = path.join(CONTENT_DIR, filename)
      const raw = fs.readFileSync(filePath, "utf-8")
      const { data, content } = matter(raw)

      return {
        slug,
        title: data.title ?? slug,
        description: data.description ?? "",
        date: data.date ?? "",
        category: data.category ?? "General",
        readTime: readingTime(content).text,
        featured: data.featured ?? false,
        content,
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return posts
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, "utf-8")
  const { data, content } = matter(raw)

  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? "",
    date: data.date ?? "",
    category: data.category ?? "General",
    readTime: readingTime(content).text,
    featured: data.featured ?? false,
    content,
  }
}
