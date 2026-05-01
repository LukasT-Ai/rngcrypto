import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "RnGcrypto Strike Bot - Live Perpetual Futures Dashboard"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(145deg, #0A0E17 0%, #0D1320 40%, #111827 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow effects */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-80px",
            left: "-80px",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,255,136,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "5px",
            background: "linear-gradient(90deg, #22D3EE 0%, #06B6D4 50%, #22D3EE 100%)",
          }}
        />

        {/* Content container */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "50px 70px 40px",
            flex: 1,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "36px",
            }}
          >
            <span
              style={{
                color: "#00FF88",
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "-0.5px",
              }}
            >
              RnG
            </span>
            <span
              style={{
                color: "#F9FAFB",
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "-0.5px",
              }}
            >
              crYptO
            </span>
          </div>

          {/* Main title */}
          <h1
            style={{
              color: "#F9FAFB",
              fontSize: "58px",
              fontWeight: 800,
              lineHeight: 1.05,
              marginBottom: "14px",
              letterSpacing: "-1.5px",
            }}
          >
            Live Strike Bot Trading
          </h1>

          {/* Subtitle */}
          <p
            style={{
              color: "#9CA3AF",
              fontSize: "22px",
              lineHeight: 1.4,
              marginBottom: "44px",
            }}
          >
            Autonomous Perpetual Futures Trading on Cardano via Strike Finance
          </p>

          {/* Stat boxes row */}
          <div
            style={{
              display: "flex",
              gap: "20px",
            }}
          >
            {/* Win Rate */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,211,238,0.25)",
                borderRadius: "16px",
                padding: "22px 32px",
                minWidth: "200px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#22D3EE",
                  }}
                />
                <span
                  style={{
                    color: "#9CA3AF",
                    fontSize: "14px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                  }}
                >
                  Win Rate
                </span>
              </div>
              <span
                style={{
                  color: "#22D3EE",
                  fontSize: "36px",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                }}
              >
                LIVE
              </span>
            </div>

            {/* Total Trades */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,211,238,0.25)",
                borderRadius: "16px",
                padding: "22px 32px",
                minWidth: "200px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "4px",
                    background: "#06B6D4",
                  }}
                />
                <span
                  style={{
                    color: "#9CA3AF",
                    fontSize: "14px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                  }}
                >
                  Total Trades
                </span>
              </div>
              <span
                style={{
                  color: "#06B6D4",
                  fontSize: "36px",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                }}
              >
                LIVE
              </span>
            </div>

            {/* Sharpe Ratio */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,211,238,0.25)",
                borderRadius: "16px",
                padding: "22px 32px",
                minWidth: "200px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    background: "#00FF88",
                    transform: "rotate(45deg)",
                  }}
                />
                <span
                  style={{
                    color: "#9CA3AF",
                    fontSize: "14px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                  }}
                >
                  Live P&L
                </span>
              </div>
              <span
                style={{
                  color: "#00FF88",
                  fontSize: "36px",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                }}
              >
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 70px 30px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <span style={{ color: "#6B7280", fontSize: "16px" }}>
              www.rngcrypto.com/strike
            </span>
            <span style={{ color: "#374151" }}>|</span>
            <span style={{ color: "#6B7280", fontSize: "16px" }}>
              @rngcrypto
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#22D3EE",
              }}
            />
            <span
              style={{
                color: "#22D3EE",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              BOT ACTIVE
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
