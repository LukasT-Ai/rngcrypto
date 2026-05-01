"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[RNGcrypto] Client error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur-sm max-w-lg">
        <h2 className="text-2xl font-bold text-white mb-2">
          Something went wrong
        </h2>
        <p className="text-white/40 text-sm mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="rounded-full bg-[#00FF88] px-6 py-2.5 text-sm font-semibold text-[#06080F] transition-all hover:bg-[#00FF88]/90"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
