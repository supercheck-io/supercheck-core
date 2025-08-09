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

  // Only apply Webpack customizations when not running the dev server (so Turbopack won't warn)
  if (!isDev) {
    baseConfig.webpack = (config, { isServer }) => {
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

      return config;
    };
  }

  return baseConfig;
};

export default createNextConfig;
