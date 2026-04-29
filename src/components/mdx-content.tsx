"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function MdxContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-10 mb-4 text-2xl font-bold font-display">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-8 mb-3 text-xl font-semibold font-display">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-6 mb-2 text-lg font-semibold font-display">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-4 text-muted-foreground leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-4 ml-6 list-disc space-y-1 text-muted-foreground">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 ml-6 list-decimal space-y-1 text-muted-foreground">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-l-2 border-primary/50 pl-4 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-")
          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm text-foreground">
                {children}
              </code>
            )
          }
          return (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="mb-4 overflow-x-auto rounded-lg bg-muted">{children}</pre>
        ),
        hr: () => <hr className="my-8 border-border" />,
        table: ({ children }) => (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted px-3 py-2 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-3 py-2 text-muted-foreground">
            {children}
          </td>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt ?? ""}
            className="my-4 rounded-lg border border-border"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
