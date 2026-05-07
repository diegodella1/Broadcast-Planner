/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath: "/rtvtime",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.vimeocdn.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "localhost" }
    ]
  }
}

export default nextConfig
