/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use "standalone" only in Docker builds. On Vercel it causes path issues.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
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
  // Suppress missing optional peer dependencies from wallet libs
  webpack: (config, { webpack }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "lokijs": false,
      "encoding": false,
    };
    // Ignore react-native modules that MetaMask SDK optionally imports
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-async-storage\/async-storage$/,
      })
    );
    return config;
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
