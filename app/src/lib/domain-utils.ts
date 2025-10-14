/**
 * Utility functions for domain handling
 */

/**
 * Extracts the base domain from NEXT_PUBLIC_APP_URL
 * @returns The base domain (e.g., "supercheck.io" from "https://demo.supercheck.io")
 */
export function getBaseDomain(): string {
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
 * Constructs a status page URL using the base domain (not subdomain of app)
 * Status pages are on *.supercheck.io, not *.demo.supercheck.io
 * @param subdomain The subdomain for the status page
 * @returns The full status page URL
 */
export function getStatusPageUrl(subdomain: string): string {
  const baseDomain = getBaseDomain();
  const protocol = baseDomain === "localhost" ? "http" : "https";
  return `${protocol}://${subdomain}.${baseDomain}`;
}

/**
 * Extracts subdomain from a hostname
 * @param hostname The full hostname (e.g., "abc123.supercheck.io")
 * @returns The subdomain or null if not found
 */
export function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split(".");
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
    "localhost",
  ];
  return !reservedSubdomains.includes(subdomain.toLowerCase());
}
