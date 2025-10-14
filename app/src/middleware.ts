import { NextRequest, NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";
import { db } from "@/utils/db";
import { apikey, statusPages } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import {
  extractSubdomain,
  isStatusPageSubdomain,
  getStatusPageUrl,
} from "@/lib/domain-utils";

// Simple in-memory cache for subdomain lookups (5 minute TTL)
const subdomainCache = new Map<
  string,
  { id: string; status: string; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const xForwardedHost = request.headers.get("x-forwarded-host");

  // Use x-forwarded-host if available (when behind proxy like Cloudflare)
  const actualHostname = xForwardedHost || hostname;

  // Skip subdomain processing for internal IP addresses (Docker health checks)
  if (
    actualHostname.includes(":3000") ||
    actualHostname.includes("172.") ||
    actualHostname.includes("192.168.") ||
    actualHostname.includes("10.")
  ) {
    return NextResponse.next();
  }

  // Log all requests in production for debugging subdomain issues
  console.log("Middleware:", {
    pathname,
    hostname,
    actualHostname,
    xForwardedHost,
  });

  // Handle subdomain routing for status pages
  const subdomain = extractSubdomain(actualHostname);

  // Log subdomain extraction
  console.log("Subdomain extraction:", {
    subdomain,
    isStatusPageSubdomain: isStatusPageSubdomain(actualHostname),
  });

  // Check if this is a status page subdomain
  if (isStatusPageSubdomain(actualHostname) && subdomain) {
    try {
      // Check cache first
      const cached = subdomainCache.get(subdomain);
      const now = Date.now();

      let statusPageId: string | null = null;
      let statusPageStatus: string | null = null;

      if (cached && now - cached.timestamp < CACHE_TTL) {
        // Use cached data
        statusPageId = cached.id;
        statusPageStatus = cached.status;
      } else {
        // Query database with timeout (2 seconds to fail fast)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database query timeout")), 2000)
        );

        const queryPromise = db
          .select({
            id: statusPages.id,
            status: statusPages.status,
          })
          .from(statusPages)
          .where(eq(statusPages.subdomain, subdomain))
          .limit(1);

        const statusPageResult = (await Promise.race([
          queryPromise,
          timeoutPromise,
        ])) as Array<{ id: string; status: string }>;

        if (statusPageResult.length > 0) {
          statusPageId = statusPageResult[0].id;
          statusPageStatus = statusPageResult[0].status;

          // Update cache
          subdomainCache.set(subdomain, {
            id: statusPageId,
            status: statusPageStatus,
            timestamp: now,
          });
        } else {
          // Cache negative result
          subdomainCache.set(subdomain, {
            id: "",
            status: "not_found",
            timestamp: now,
          });
        }
      }

      // Only show published status pages publicly
      if (statusPageId && statusPageStatus === "published") {
        // Rewrite to the public status page route
        const url = request.nextUrl.clone();
        url.pathname = `/status-pages/${statusPageId}/public${pathname}`;
        return NextResponse.rewrite(url);
      }

      // If subdomain doesn't exist or page is not published, show 404
      const url = request.nextUrl.clone();
      url.pathname = "/404";
      return NextResponse.rewrite(url);
    } catch (error) {
      console.error("Error in subdomain routing:", error);
      // On database errors, return 404 to fail gracefully
      // (Cloudflare will cache this and not keep retrying)
      const url = request.nextUrl.clone();
      url.pathname = "/404";
      return NextResponse.rewrite(url);
    }
  }

  // Skip authentication for status page subdomains
  const isStatusPageSubdomainRequest =
    isStatusPageSubdomain(actualHostname) && subdomain;

  if (!isStatusPageSubdomainRequest) {
    const session = await getCookieCache(request);

    const isAuthPage =
      pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

    // Allow auth-related API routes to pass through
    const isAuthApi = pathname.startsWith("/api/auth");

    // Check if this is a job trigger endpoint that uses API key auth
    const isJobTrigger = pathname.match(/^\/api\/jobs\/[^\/]+\/trigger$/);

    if (isAuthPage) {
      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.next();
    }

    // For job trigger endpoints, allow API key authentication
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

      // Basic API key format validation
      if (!apiKeyFromHeader.trim() || apiKeyFromHeader.length < 10) {
        return NextResponse.json(
          {
            error: "Invalid API key format",
            message: "API key must be at least 10 characters long",
          },
          { status: 401 }
        );
      }

      // Verify the API key
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

        // Check if API key is enabled
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

        // Check if API key has expired
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

        // Extract job ID from path for additional validation
        const jobIdMatch = pathname.match(/^\/api\/jobs\/([^\/]+)\/trigger$/);
        if (jobIdMatch) {
          const requestedJobId = jobIdMatch[1];

          // Validate that the API key is authorized for this specific job
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

        // Update last request timestamp asynchronously (don't wait for completion)
        db.update(apikey)
          .set({ lastRequest: new Date() })
          .where(eq(apikey.id, key.id))
          .catch((error) => {
            console.error(
              `Failed to update last request for API key ${key.id}:`,
              error
            );
          });

        // API key is valid, proceed with the request
        return NextResponse.next();
      } catch (error) {
        console.error("Error verifying API key:", error);

        // Check if this is a database connection error
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

    // For other API routes, check authentication
    if (pathname.startsWith("/api/") && !isAuthApi) {
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.next();
    }

    // For frontend routes, redirect to sign-in if not authenticated
    if (!session) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except for static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
