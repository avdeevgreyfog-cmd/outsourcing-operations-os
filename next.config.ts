import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["terminal.local"],
  reactStrictMode: true,
  experimental: {
    typedEnv: false
  }
};

export default nextConfig;
