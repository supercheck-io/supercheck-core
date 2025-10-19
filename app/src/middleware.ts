import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight middleware for status page subdomain routing
 *
 * Responsibility: ONLY subdomain detection and URL rewriting
 * - Detects UUID subdomains (e.g., f134b5f9f2b048069deaf7cfb924a0b3.supercheck.io)
 * - Rewrites to /status/[uuid] for status page routes
 * - All authentication is handled by layout/route handlers
 *
 * Why this approach?
 * - Middleware stays fast and focused (one job: subdomain routing)
 * - Auth logic in layout follows Next.js best practices
 * - Avoids middleware-induced redirect loops
 */

// Extract subdomain from hostname (production only: uuid.supercheck.io)
function extractSubdomain(hostname: string): string | null {
  if (!hostname || typeof hostname !== "string") {
    return null;
  }

  // Remove port from hostname
  const cleanHostname = hostname.split(":")[0];

  // Get status page domain from runtime env (NOT NEXT_PUBLIC_ - those are build-time only)
  // Use regular env var which is available at runtime in middleware
  const statusPageDomain = process.env.STATUS_PAGE_DOMAIN || "";

  if (!statusPageDomain || !cleanHostname.endsWith(statusPageDomain)) {
    return null;
  }

  // Extract subdomain by removing the status page domain
  // e.g., "f134b5f9f2b048069deaf7cfb924a0b3.supercheck.io" → "f134b5f9f2b048069deaf7cfb924a0b3"
  const subdomain = cleanHostname.replace(
    new RegExp(`\\.${statusPageDomain}$`),
    ""
  );

  // Valid subdomain: alphanumeric and hyphens only, 1-63 chars
  return /^[a-zA-Z0-9-]{1,63}$/.test(subdomain) ? subdomain : null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes and internal Next.js routes should never be rewritten
  // These are shared functionality accessed from any domain
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Get hostname from headers (prefer X-Forwarded-Host for proxied requests)
  const hostname =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";

  // Extract subdomain from hostname
  const subdomain = extractSubdomain(hostname);

  // If subdomain detected, route to status page
  // Don't rewrite if this is the main app domain
  if (subdomain) {
    // Get main app hostname from runtime env (NOT NEXT_PUBLIC_ - those are build-time only)
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    let mainAppHostname: string | null = null;
    try {
      const url = new URL(appUrl);
      mainAppHostname = url.hostname;
    } catch {
      // Invalid URL, skip check
      mainAppHostname = null;
    }

    // Only rewrite if this hostname is NOT the main app domain
    const isMainApp =
      mainAppHostname &&
      (hostname === mainAppHostname || hostname.startsWith("localhost"));

    if (!isMainApp) {
      const url = request.nextUrl.clone();
      const newPath =
        pathname === "/"
          ? `/status/${subdomain}`
          : `/status/${subdomain}${pathname}`;
      url.pathname = newPath;

      const response = NextResponse.rewrite(url);

      // Add security headers for status pages
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("X-XSS-Protection", "1; mode=block");
      response.headers.set(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
      );

      return response;
    }
  }

  // Pass through all other requests - auth is handled by layout/route handlers
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
