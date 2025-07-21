import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  serverExternalPackages: ["child_process", "fs", "path"],
  experimental: {
    // Add any experimental features here
  },
  // Configure server options
  serverRuntimeConfig: {
    // Will only be available on the server side
    ignoreSSLErrors: true,
  },
  // Configure environment variables for both client and server
  publicRuntimeConfig: {
    // Will be available on both server and client
    apiTimeout: 60000, // 60 seconds
  },
};

export default nextConfig;
