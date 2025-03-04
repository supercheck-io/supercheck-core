import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Increase timeout for API routes to handle corporate networks
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb',
    },
    externalResolver: true,
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

// Set environment variable for Node.js to ignore SSL certificate errors
// This is needed for corporate environments with SSL inspection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default nextConfig;
