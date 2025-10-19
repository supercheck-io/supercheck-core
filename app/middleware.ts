import { NextRequest, NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";

/**
 * Production-ready middleware for status page subdomain routing
 *
 * Architecture:
 * 1. ALL subdomains (except NEXT_PUBLIC_APP_URL) are routed to status pages
 * 2. Cloudflare handles specific subdomain routing (www, api, cdn, etc.)
 * 3. NO database queries in middleware - keeps it fast and edge-compatible
 * 4. API key validation moved to route handlers for best practices
 * 5. Page components handle DB lookups and 404s
 *
 * Flow:
 * subdomain.supercheck.io → Middleware detects subdomain → Rewrites to /status/[subdomain] → Page handles DB lookup
 */

// Extract subdomain from hostname (production only: uuid.{STATUS_PAGE_DOMAIN})
function extractSubdomain(hostname: string): string | null {
  if (!hostname || typeof hostname !== "string") {
    return null;
  }

  // Remove port from hostname
  const cleanHostname = hostname.split(":")[0];

  // Get status page domain from env (e.g., "supercheck.io")
  const statusPageDomain = process.env.NEXT_PUBLIC_STATUS_PAGE_DOMAIN || "";

  if (!statusPageDomain || !cleanHostname.endsWith(statusPageDomain)) {
    return null;
  }

  // Extract subdomain by removing the status page domain
  // e.g., "f134b5f9f2b048069deaf7cfb924a0b3.supercheck.io" → "f134b5f9f2b048069deaf7cfb924a0b3"
  const subdomain = cleanHostname.replace(new RegExp(`\\.${statusPageDomain}$`), "");

  // Valid subdomain: alphanumeric and hyphens only, 1-63 chars
  return /^[a-zA-Z0-9-]{1,63}$/.test(subdomain) ? subdomain : null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get hostname from headers (prefer X-Forwarded-Host for proxied requests)
  const hostname = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";

  // Extract subdomain from hostname (matches NEXT_PUBLIC_STATUS_PAGE_DOMAIN)
  const subdomain = extractSubdomain(hostname);

  // If subdomain matches the status page domain, route to status page (PUBLIC - no auth)
  // BUT: Don't rewrite if this is the main app domain
  if (subdomain) {
    // Get main app hostname to exclude it from subdomain rewriting
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    let mainAppHostname: string | null = null;
    try {
      const url = new URL(appUrl);
      mainAppHostname = url.hostname;
    } catch (error) {
      // Invalid URL, skip check
    }

    // Only rewrite if this hostname is NOT the main app domain
    const isMainApp = mainAppHostname && hostname === mainAppHostname;

    if (!isMainApp) {
      const url = request.nextUrl.clone();
      const newPath =
        pathname === "/"
          ? `/status/${subdomain}`
          : `/status/${subdomain}${pathname}`;
      url.pathname = newPath;

      const response = NextResponse.rewrite(url);

      // Add security headers
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("X-XSS-Protection", "1; mode=block");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

      return response;
    }
  }

  // Main app or direct /status/ route - handle authentication
  // getCookieCache returns a value that could be undefined or null if no session
  let session;
  try {
    session = getCookieCache(request);
  } catch (error) {
    session = null;
  }

  const isAuthPage =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPublicStatusRoute = pathname.startsWith("/status/");
  const isJobTrigger = pathname.match(/^\/api\/jobs\/[^\\/]+\/trigger$/);

  // Skip authentication for public status page routes
  if (isPublicStatusRoute) {
    return NextResponse.next();
  }

  // Handle auth pages
  if (isAuthPage) {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Handle job trigger endpoints with API key authentication
  if (isJobTrigger) {
    const authHeader = request.headers.get("authorization");
    const apiKeyFromHeader = authHeader?.replace(/^Bearer\s+/i, "");

    if (!apiKeyFromHeader) {
      return NextResponse.json(
        {
          error: "API key required",
          message: "Include API key as Bearer token in Authorization header",
        },
        { status: 401 }
      );
    }

    if (!apiKeyFromHeader.trim() || apiKeyFromHeader.length < 10) {
      return NextResponse.json(
        {
          error: "Invalid API key format",
          message: "API key must be at least 10 characters long",
        },
        { status: 401 }
      );
    }

    // Note: Actual API key DB validation happens in the route handler
    // This is best practice - middleware only validates format, not DB state
    return NextResponse.next();
  }

  // Other API routes require authentication
  if (pathname.startsWith("/api/") && !isAuthApi) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Frontend routes require authentication
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
