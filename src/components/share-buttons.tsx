"use client"

import { useState } from "react"
import { Link2, Check } from "lucide-react"

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

interface ShareButtonsProps {
  url: string
  title: string
  description: string
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  function shareOnX() {
    const text = encodeURIComponent(`${title} #RnGcrypto #Cardano`)
    const shareUrl = encodeURIComponent(url)
    window.open(
      `https://x.com/intent/tweet?text=${text}&url=${shareUrl}`,
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
        onClick={shareOnX}
        className="inline-flex items-center justify-center size-10 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 hover:border-[#00FF88]/60 hover:bg-[#00FF88]/20 hover:shadow-[0_0_12px_rgba(0,255,136,0.3)] transition-all duration-200 text-[#00FF88]"
        aria-label="Share on X"
        title="Share on X"
      >
        <XIcon className="size-4" />
      </button>
      <button
        onClick={copyLink}
        className="inline-flex items-center justify-center size-10 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 hover:border-[#00FF88]/60 hover:bg-[#00FF88]/20 hover:shadow-[0_0_12px_rgba(0,255,136,0.3)] transition-all duration-200 text-[#00FF88]"
        aria-label="Copy link"
        title="Copy link"
      >
        {copied ? (
          <Check className="size-4" />
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
