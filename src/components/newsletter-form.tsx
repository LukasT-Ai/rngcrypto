"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, CheckCircle, Loader2 } from "lucide-react"

export function NewsletterForm({ variant = "inline" }: { variant?: "inline" | "card" }) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setStatus("loading")

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setStatus("success")
        setEmail("")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-center gap-2 text-sm text-gain">
        <CheckCircle className="size-4" />
        You're in! Check your inbox.
      </div>
    )
  }

  const form = (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="max-w-xs"
        required
      />
      <Button type="submit" disabled={status === "loading"} size="sm">
        {status === "loading" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <Mail className="mr-1.5 size-4" />
            Subscribe
          </>
        )}
      </Button>
    </form>
  )

  if (variant === "card") {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-6">
          <h3 className="font-display text-lg font-semibold">
            <span className="text-primary">RnG</span> Newsletter
          </h3>
          <p className="text-center text-sm text-muted-foreground">
            Weekly market analysis, trading signals, and macro insights. Free.
          </p>
          {form}
          {status === "error" && (
            <p className="text-xs text-loss">Something went wrong. Try again.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return form
}
