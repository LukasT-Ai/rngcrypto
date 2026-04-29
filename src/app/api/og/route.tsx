import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

export const runtime = "edge"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const title = searchParams.get("title") ?? "RnGcrYptO"
  const description =
    searchParams.get("description") ??
    "Crypto Dashboard & Market Intelligence"

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #06080F 0%, #0A1628 50%, #0F172A 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #00FF88, #22D3EE)",
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "32px",
          }}
        >
          <span
            style={{
              color: "#00FF88",
              fontSize: "36px",
              fontWeight: 700,
            }}
          >
            RnG
          </span>
          <span
            style={{
              color: "#F9FAFB",
              fontSize: "36px",
              fontWeight: 700,
            }}
          >
            crYptO
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            color: "#F9FAFB",
            fontSize: "56px",
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: "16px",
            maxWidth: "900px",
          }}
        >
          {title}
        </h1>

        {/* Description */}
        <p
          style={{
            color: "#9CA3AF",
            fontSize: "24px",
            lineHeight: 1.4,
            maxWidth: "700px",
          }}
        >
          {description}
        </p>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            left: "80px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <span style={{ color: "#6B7280", fontSize: "18px" }}>
            rngcrypto.com
          </span>
          <span style={{ color: "#374151" }}>|</span>
          <span style={{ color: "#6B7280", fontSize: "18px" }}>
            @rngcrypto
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
