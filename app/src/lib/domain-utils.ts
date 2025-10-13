/**
 * Utility functions for domain handling
 */

/**
 * Extracts the base domain from NEXT_PUBLIC_APP_URL
 * @returns The base domain (e.g., "supercheck.io" from "https://supercheck.io")
 */
export function getBaseDomain(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const url = new URL(appUrl);
    return url.hostname;
  } catch (error) {
    console.error("Invalid NEXT_PUBLIC_APP_URL:", appUrl, error);
    // Fallback to localhost for development
    return "localhost";
  }
}

/**
 * Constructs a status page URL using the dynamic domain
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
    "localhost",
  ];
  return !reservedSubdomains.includes(subdomain.toLowerCase());
}
