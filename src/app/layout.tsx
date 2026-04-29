import type { Metadata } from "next"
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
    default: "RnGcrYptO | Web3, DeFi & Autonomous Trading",
    template: "%s | RnGcrYptO",
  },
  description:
    "Web3 creator, DeFi degen, and builder of autonomous trading bots on Cardano. Follow the journey through Ascend Market, Good Vibes Club, Arbiter, Liqwid, and Midnight.",
  keywords: [
    "RnGcrYptO",
    "Cardano",
    "DeFi",
    "Web3",
    "NFT",
    "trading bot",
    "Ascend Market",
    "Good Vibes Club",
    "Arbiter",
    "Midnight",
    "Liqwid Finance",
    "Bitcoin",
    "autonomous trading",
  ],
  openGraph: {
    title: "RnGcrYptO | Web3, DeFi & Autonomous Trading",
    description:
      "Web3 creator, DeFi degen, and builder of autonomous trading bots. Live bot performance, NFT collections, and the Web3 journey.",
    url: "https://rngcrypto.com",
    siteName: "RnGcrYptO",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "RnGcrYptO — Web3, DeFi & Autonomous Trading",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RnGcrYptO | Web3, DeFi & Autonomous Trading",
    description:
      "Autonomous trading bots, NFTs, DeFi, and the Web3 journey. Live bot stats on-site.",
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
