"use client"

import { useState } from "react"
import { Twitter, Link2, Linkedin, Check } from "lucide-react"

interface ShareButtonsProps {
  url: string
  title: string
  description: string
}

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const buttonBase =
    "inline-flex items-center justify-center size-10 rounded-full bg-white/5 border border-white/10 hover:border-[#00FF88]/30 hover:bg-white/10 transition-all duration-200 text-muted-foreground hover:text-foreground"

  function shareOnTwitter() {
    const text = encodeURIComponent(`${title} #RnGcrypto`)
    const shareUrl = encodeURIComponent(url)
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  function shareOnLinkedIn() {
    const shareUrl = encodeURIComponent(url)
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea")
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Share</span>
      <button
        onClick={shareOnTwitter}
        className={buttonBase}
        aria-label="Share on X/Twitter"
        title="Share on X"
      >
        <Twitter className="size-4" />
      </button>
      <button
        onClick={shareOnLinkedIn}
        className={buttonBase}
        aria-label="Share on LinkedIn"
        title="Share on LinkedIn"
      >
        <Linkedin className="size-4" />
      </button>
      <button
        onClick={copyLink}
        className={buttonBase}
        aria-label="Copy link"
        title="Copy link"
      >
        {copied ? (
          <Check className="size-4 text-[#00FF88]" />
        ) : (
          <Link2 className="size-4" />
        )}
      </button>
      {copied && (
        <span className="text-xs text-[#00FF88] animate-in fade-in duration-200">
          Copied!
        </span>
      )}
    </div>
  )
}
