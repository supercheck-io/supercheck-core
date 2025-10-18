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

// Extract subdomain from hostname following DNS specifications (for production use)
function extractSubdomain(hostname: string): string | null {
  if (!hostname || typeof hostname !== "string") {
    return null;
  }

  const cleanHostname = hostname.split(":")[0];
  const parts = cleanHostname.split(".");

  // For production domains, require 3+ parts (subdomain.example.com)
  if (parts.length >= 3) {
    const subdomain = parts[0];
    return /^[a-zA-Z0-9-]{1,63}$/.test(subdomain) ? subdomain : null;
  }

  return null;
}

// Get main app subdomain from NEXT_PUBLIC_APP_URL (for production)
function getMainAppSubdomain(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const url = new URL(appUrl);
    return extractSubdomain(url.hostname);
  } catch (error) {
    console.error("Invalid NEXT_PUBLIC_APP_URL:", appUrl, error);
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";

  // Extract subdomain from hostname
  const subdomain = extractSubdomain(hostname);
  const mainAppSubdomain = getMainAppSubdomain();

  // Check if this is the main app subdomain (from NEXT_PUBLIC_APP_URL)
  const isMainApp =
    mainAppSubdomain &&
    subdomain?.toLowerCase() === mainAppSubdomain.toLowerCase();

  // PRODUCTION ROUTING: All subdomains except main app → status pages
  // Cloudflare handles routing for specific subdomains (www, api, cdn, etc.)
  if (subdomain && !isMainApp) {
    // Rewrite to status page route - page component handles DB lookup and 404s
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
