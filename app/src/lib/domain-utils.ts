/**
 * Utility functions for domain handling
 */

/**
 * Extracts the base domain from NEXT_PUBLIC_APP_URL or current window location
 * @returns The base domain (e.g., "supercheck.io" from "https://demo.supercheck.io")
 */
export function getBaseDomain(requestHostname?: string): string {
  // On client side, use the actual window location as source of truth
  // This ensures we get the correct domain even when NEXT_PUBLIC_APP_URL
  // was baked in at build time with a different value
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    // Extract base domain (e.g., "supercheck.io" from "demo.supercheck.io")
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      // Return the last two parts (e.g., "supercheck.io")
      return parts.slice(-2).join(".");
    }
    return hostname;
  }

  // On server side, if request hostname is provided (from middleware), use it
  if (requestHostname) {
    // Extract base domain from the actual request hostname
    const parts = requestHostname.split(".");
    if (parts.length >= 2) {
      // Return the last two parts (e.g., "supercheck.io")
      return parts.slice(-2).join(".");
    }
    return requestHostname;
  }

  // Fallback to NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const url = new URL(appUrl);
    const hostname = url.hostname;

    // Extract base domain (e.g., "supercheck.io" from "demo.supercheck.io")
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      // Return the last two parts (e.g., "supercheck.io")
      return parts.slice(-2).join(".");
    }
    return hostname;
  } catch (error) {
    console.error("Invalid NEXT_PUBLIC_APP_URL:", appUrl, error);
    // Fallback to localhost for development
    return "localhost";
  }
}

/**
 * Gets the base domain specifically for status pages
 * This uses the STATUS_PAGE_BASE_DOMAIN environment variable if available,
 * otherwise falls back to the standard base domain detection
 * @param requestHostname Optional hostname from the request
 * @returns The base domain for status pages
 */
export function getStatusPageBaseDomain(requestHostname?: string): string {
  // First check if STATUS_PAGE_BASE_DOMAIN is explicitly configured
  if (process.env.STATUS_PAGE_BASE_DOMAIN) {
    return process.env.STATUS_PAGE_BASE_DOMAIN;
  }

  // If not configured, extract from request hostname or use standard detection
  if (requestHostname) {
    const parts = requestHostname.split(".");
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return requestHostname;
  }

  // Fallback to standard base domain detection
  return getBaseDomain();
}

/**
 * Constructs a status page URL using the base domain (not subdomain of app)
 * Status pages are on *.supercheck.io, not *.demo.supercheck.io
 * @param subdomain The subdomain for the status page
 * @param requestHostname Optional hostname from the request (for server-side usage)
 * @returns The full status page URL
 */
export function getStatusPageUrl(
  subdomain: string,
  requestHostname?: string
): string {
  const baseDomain = getStatusPageBaseDomain(requestHostname);
  const protocol = baseDomain === "localhost" ? "http" : "https";
  const url = `${protocol}://${subdomain}.${baseDomain}`;

  // Debug logging (only in development)
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log("getStatusPageUrl:", {
      subdomain,
      baseDomain,
      protocol,
      url,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      STATUS_PAGE_BASE_DOMAIN: process.env.STATUS_PAGE_BASE_DOMAIN,
      requestHostname,
    });
  }

  return url;
}

/**
 * Extracts subdomain from a hostname
 * @param hostname The full hostname (e.g., "abc123.supercheck.io" or "demo.localhost")
 * @returns The subdomain or null if not found
 */
export function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split(".");

  // Handle localhost specially - demo.localhost has 2 parts
  if (parts.length === 2 && parts[1] === "localhost") {
    return parts[0];
  }

  // For production domains, require 3+ parts (subdomain.example.com)
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

/**
 * Checks if a hostname is a status page subdomain
 * @param hostname The full hostname
 * @returns True if it's a status page subdomain
 */
export function isStatusPageSubdomain(hostname: string): boolean {
  const subdomain = extractSubdomain(hostname);
  if (!subdomain) return false;

  // For local development, allow all subdomains except the main app
  const isLocalhost = hostname.includes("localhost");
  if (isLocalhost) {
    // For localhost, only treat "localhost" (no subdomain) as the main app
    // Everything else can be a status page for testing
    // Note: "localhost" as a subdomain (e.g., localhost.localhost) is not valid
    // So we check if the hostname is exactly "localhost" or has a subdomain
    return hostname !== "localhost";
  }

  // Reserved subdomains that should NOT be treated as status pages
  const reservedSubdomains = [
    "www",
    "app",
    "api",
    "admin",
    "status",
    "cdn",
    "mail",
    "staging",
    "dev",
    "demo", // Main app subdomain
  ];
  return !reservedSubdomains.includes(subdomain.toLowerCase());
}
