import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static export. A Worker serves ./out and does not run server code.
  // Cache Components (and partial prefetching) prerender with a server resume step,
  // which Next.js rejects when output is "export".
  output: "export",
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
