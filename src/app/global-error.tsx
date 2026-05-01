"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ background: "#06080F", color: "#fff", fontFamily: "system-ui" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
          <div style={{ maxWidth: "28rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Something went wrong
            </h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={reset}
              style={{
                background: "#00FF88",
                color: "#06080F",
                border: "none",
                borderRadius: "9999px",
                padding: "0.625rem 1.5rem",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
