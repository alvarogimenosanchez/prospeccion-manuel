import type { NextConfig } from "next";

const RAILWAY = "https://prospeccion-manuel-production.up.railway.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/scraping/:path*",
        destination: `${RAILWAY}/scraping/:path*`,
      },
      {
        source: "/api/seguimiento/:path*",
        destination: `${RAILWAY}/seguimiento/:path*`,
      },
      {
        source: "/api/linkedin/:path*",
        destination: `${RAILWAY}/linkedin/:path*`,
      },
      {
        source: "/api/backend/:path*",
        destination: `${RAILWAY}/:path*`,
      },
    ];
  },
};

export default nextConfig;
