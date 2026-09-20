import type { NextConfig } from "next";

const githubPagesDemo = process.env.GITHUB_PAGES_DEMO === "1";
const githubPagesBasePath = githubPagesDemo ? "/outsourcing-operations-os" : "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["terminal.local"],
  reactStrictMode: true,
  ...(githubPagesDemo ? {
    output: "export" as const,
    basePath: githubPagesBasePath,
    assetPrefix: githubPagesBasePath,
    trailingSlash: true,
    images: { unoptimized: true },
  } : {}),
  experimental: {
    typedEnv: false
  }
};

export default nextConfig;
