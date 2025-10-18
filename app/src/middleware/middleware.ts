import { NextRequest, NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";
import { db } from "@/utils/db";
import { apikey } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { extractSubdomain, getMainAppSubdomain } from "@/lib/domain-utils";

/**
 * Production-ready middleware for status page subdomain routing
 *
 * Architecture:
 * 1. ALL subdomains (except NEXT_PUBLIC_APP_URL) are routed to status pages
 * 2. Cloudflare handles specific subdomain routing (www, api, cdn, etc.)
 * 3. NO database queries in middleware - keeps it fast and edge-compatible
 * 4. Page components handle DB lookups and 404s
 *
 * Flow:
 * subdomain.supercheck.io → Middleware detects subdomain → Rewrites to /status/[subdomain] → Page handles DB lookup
 */

export async function middleware(request: NextRequest) {
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
  const session = await getCookieCache(request);

  const isAuthPage =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPublicStatusRoute = pathname.startsWith("/status/");
  const isJobTrigger = pathname.match(/^\/api\/jobs\/[^\/]+\/trigger$/);

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

    // Verify API key
    try {
      const apiKey = await db
        .select({
          id: apikey.id,
          enabled: apikey.enabled,
          expiresAt: apikey.expiresAt,
          jobId: apikey.jobId,
          userId: apikey.userId,
          name: apikey.name,
          lastRequest: apikey.lastRequest,
        })
        .from(apikey)
        .where(eq(apikey.key, apiKeyFromHeader.trim()))
        .limit(1);

      if (apiKey.length === 0) {
        console.warn(
          `Invalid API key attempted: ${apiKeyFromHeader.substring(0, 8)}...`
        );
        return NextResponse.json(
          {
            error: "Invalid API key",
            message: "The provided API key is not valid",
          },
          { status: 401 }
        );
      }

      const key = apiKey[0];

      if (!key.enabled) {
        console.warn(`Disabled API key attempted: ${key.name} (${key.id})`);
        return NextResponse.json(
          {
            error: "API key disabled",
            message: "This API key has been disabled",
          },
          { status: 401 }
        );
      }

      if (key.expiresAt && new Date() > key.expiresAt) {
        console.warn(`Expired API key attempted: ${key.name} (${key.id})`);
        return NextResponse.json(
          {
            error: "API key expired",
            message: "This API key has expired",
          },
          { status: 401 }
        );
      }

      // Validate API key is authorized for this specific job
      const jobIdMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/trigger$/);
      if (jobIdMatch) {
        const requestedJobId = jobIdMatch[1];
        if (key.jobId !== requestedJobId) {
          console.warn(
            `API key unauthorized for job: ${key.name} attempted job ${requestedJobId}, authorized for ${key.jobId}`
          );
          return NextResponse.json(
            {
              error: "Unauthorized",
              message: "This API key is not authorized for the requested job",
            },
            { status: 403 }
          );
        }
      }

      // Update last request timestamp asynchronously
      db.update(apikey)
        .set({ lastRequest: new Date() })
        .where(eq(apikey.id, key.id))
        .catch((error) => {
          console.error(
            `Failed to update last request for API key ${key.id}:`,
            error
          );
        });

      return NextResponse.next();
    } catch (error) {
      console.error("Error verifying API key:", error);

      const isDbError =
        error instanceof Error &&
        (error.message.includes("connection") ||
          error.message.includes("timeout") ||
          error.message.includes("ECONNREFUSED"));

      return NextResponse.json(
        {
          error: "Authentication error",
          message: isDbError
            ? "Database connection issue. Please try again in a moment."
            : "Unable to verify API key at this time",
        },
        { status: isDbError ? 503 : 500 }
      );
    }
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
