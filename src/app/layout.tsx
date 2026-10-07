import type { Metadata } from "next"
import Image from "next/image"
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://rngcrypto.com"),
  title: {
    default: "RnGcrYptO | Verified Trading Signals, Cardano DeFi",
    template: "%s | RnGcrYptO",
  },
  description:
    "Plain-English trade calls across 31 markets, every one logged and verified against the tape. Built around Ascend Market and Liqwid Finance on Cardano.",
  keywords: [
    "RnGcrYptO",
    "Cardano",
    "Ethereum",
    "DeFi",
    "Web3",
    "NFT",
    "trading signals",
    "Ascend Market",
    "Good Vibes Club",
    "Arbiter",
    "Midnight",
    "Liqwid Finance",
    "Bitcoin",
    "signal performance",
  ],
  openGraph: {
    title: "RnGcrYptO | Verified Trading Signals, Cardano DeFi",
    description:
      "Plain-English trade calls across 31 markets with a verified track record. Ascend Market and Liqwid Finance at the core.",
    url: "https://rngcrypto.com",
    siteName: "RnGcrYptO",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "RnGcrYptO — Verified Trading Signals",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RnGcrYptO | Verified Trading Signals, Cardano DeFi",
    description:
      "Verified trading signals across crypto, metals, oil and stocks. Cardano DeFi with Ascend and Liqwid.",
    creator: "@RnGcrYptO",
    images: ["/og-image.svg"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: "RnGcrYptO",
              url: "https://rngcrypto.com",
              sameAs: [
                "https://x.com/RnGcrYptO",
                "https://www.youtube.com/@RnGcrYptO",
              ],
              description:
                "DeFi degen publishing verified trading signals and building around Cardano DeFi: Ascend Market and Liqwid Finance.",
              knowsAbout: [
                "DeFi",
                "Trading Signals",
                "Cardano",
                "Ethereum",
                "NFTs",
                "Zero-Knowledge Proofs",
              ],
            }),
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            {/* Fixed parallax background */}
            <div className="fixed inset-0 -z-10">
              <Image
                src="/hero-bg.png"
                alt=""
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-[#06080F]/40" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_25%,_#06080F_80%)]" />
            </div>
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
