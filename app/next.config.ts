import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const createNextConfig = (phase: string): NextConfig => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  const baseConfig: NextConfig = {
    /* config options here */
    output: "standalone",
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

  // Apply Webpack customizations for both dev and production
  baseConfig.webpack = (config, { isServer }) => {
    if (!isDev) {
      config.ignoreWarnings = [
        {
          module: /node_modules\/bullmq/,
          message:
            /Critical dependency: the request of a dependency is an expression/,
        },
        {
          module: /node_modules\/bullmq/,
          message: /the request of a dependency is an expression/,
        },
      ];
    }

    // Server-side only modules - no polyfills needed for client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        buffer: false,
        stream: false,
      };
    }

    return config;
  };

  return baseConfig;
};

export default createNextConfig;
