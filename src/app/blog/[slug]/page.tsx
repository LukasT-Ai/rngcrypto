import { getAllPosts, getPostBySlug } from "@/lib/blog"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Clock, Calendar } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { NewsletterForm } from "@/components/newsletter-form"
import { MdxContent } from "@/components/mdx-content"
import { ShareButtons } from "@/components/share-buttons"

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}
  const ogParams = new URLSearchParams({
    title: post.title,
    description: post.description,
    ...(post.category && { category: post.category }),
  })
  const ogImage = `/api/og?${ogParams.toString()}`

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-6">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Blog
      </Link>

      <article>
        <header className="space-y-3">
          <Badge variant="secondary" className="text-xs">
            {post.category}
          </Badge>
          <h1 className="font-display text-3xl font-bold leading-tight lg:text-4xl">
            {post.title}
          </h1>
          <p className="text-lg text-muted-foreground">{post.description}</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {post.date}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {post.readTime}
            </div>
          </div>
          <ShareButtons
            url={`https://www.rngcrypto.com/blog/${slug}`}
            title={post.title}
            description={post.description}
          />
        </header>

        <div className="mt-8">
          <MdxContent content={post.content} />
        </div>
      </article>

      <div className="border-t border-border pt-6 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Share this article</p>
        <ShareButtons
          url={`https://www.rngcrypto.com/blog/${slug}`}
          title={post.title}
          description={post.description}
        />
      </div>

      <div className="border-t border-border pt-6">
        <NewsletterForm variant="card" />
      </div>
    </div>
  )
}
