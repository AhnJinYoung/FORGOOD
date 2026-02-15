/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "standalone" is used by Docker (Dockerfile.web), but Vercel ignores it —
  // Vercel uses its own build system. Keeping it here is harmless and lets
  // both Docker & Vercel work from the same config.
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }
  },
  // Allow images from the EC2 API domain
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  async rewrites() {
    // Rewrites are only used in local dev and Docker (where INTERNAL_API_URL
    // is set). On Vercel, NEXT_PUBLIC_API_URL is used directly by the browser.
    const apiUrl = process.env.INTERNAL_API_URL || "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
