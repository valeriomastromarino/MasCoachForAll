import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the phone on the home Wi-Fi load the dev server (e.g. http://192.168.1.9:3000).
  allowedDevOrigins: ["192.168.1.*"],
  cacheComponents: true,
  partialPrefetching: true,
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
