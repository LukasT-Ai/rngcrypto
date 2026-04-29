import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "icons.llama.fi" },
    ],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=300" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/newsletter",
        destination: "/subscribe",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
