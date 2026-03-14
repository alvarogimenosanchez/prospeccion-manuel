import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "https://prospeccion-manuel-production.up.railway.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/scraping/:path*",
        destination: `${BACKEND_URL}/scraping/:path*`,
      },
      {
        source: "/api/seguimiento/:path*",
        destination: `${BACKEND_URL}/seguimiento/:path*`,
      },
      {
        source: "/api/linkedin/:path*",
        destination: `${BACKEND_URL}/linkedin/:path*`,
      },
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
