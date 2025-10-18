import { NextRequest, NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";
import { db } from "@/utils/db";
import { apikey, statusPages } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { extractSubdomain, isStatusPageSubdomain } from "@/lib/domain-utils";

// Enhanced in-memory cache for subdomain lookups with LRU eviction
interface CacheEntry {
  id: string;
  status: string;
  timestamp: number;
  hits: number;
}

class SubdomainCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000; // Maximum cache entries
  private ttl = 5 * 60 * 1000; // 5 minutes TTL

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update hit count for LRU
    entry.hits++;
    return entry;
  }

  set(key: string, value: Omit<CacheEntry, "timestamp" | "hits">): void {
    // Evict least recently used entries if cache is full
    if (this.cache.size >= this.maxSize) {
      let lruKey = "";
      let minHits = Infinity;

      for (const [k, entry] of this.cache.entries()) {
        if (entry.hits < minHits) {
          minHits = entry.hits;
          lruKey = k;
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(key, {
      ...value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const subdomainCache = new SubdomainCache();

// Cleanup cache every 5 minutes
setInterval(() => {
  subdomainCache.cleanup();
}, 5 * 60 * 1000);

// Database connection pool management
const dbConnectionPool = {
  activeConnections: 0,
  maxConnections: 10,
  lastCleanup: Date.now(),
};

// Enhanced rate limiting for status page lookups
const rateLimiter = new Map<string, { count: number; resetTime: number; lastWarned?: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

function isRateLimited(ip: string): { limited: boolean; remaining?: number; resetTime?: number } {
  const now = Date.now();
  const record = rateLimiter.get(ip);

  if (!record || now > record.resetTime) {
    rateLimiter.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    // Log warning every 5 minutes for repeated rate limit violations
    if (!record.lastWarned || now - record.lastWarned > 5 * 60 * 1000) {
      console.warn("🚫 RATE LIMIT EXCEEDED:", { ip, count: record.count });
      record.lastWarned = now;
    }
    return {
      limited: true,
      resetTime: Math.ceil((record.resetTime - now) / 1000)
    };
  }

  record.count++;
  const remaining = RATE_LIMIT_MAX_REQUESTS - record.count;
  return { limited: false, remaining: remaining >= 0 ? remaining : 0 };
}

// Enhanced database query with connection pooling
async function queryStatusPage(
  subdomain: string
): Promise<{ id: string; status: string } | null> {
  // Prevent database overload
  if (dbConnectionPool.activeConnections >= dbConnectionPool.maxConnections) {
    throw new Error("Database connection pool exhausted");
  }

  dbConnectionPool.activeConnections++;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database query timeout")), 5000)
    );

    const queryPromise = db
      .select({
        id: statusPages.id,
        status: statusPages.status,
      })
      .from(statusPages)
      .where(
        and(
          eq(statusPages.subdomain, subdomain),
          eq(statusPages.status, "published") // Only query for published pages
        )
      )
      .limit(1);

    const result = await Promise.race([queryPromise, timeoutPromise]);

    return result.length > 0 ? result[0] : null;
  } finally {
    dbConnectionPool.activeConnections--;

    // Periodic cleanup of rate limiter
    const now = Date.now();
    if (now - dbConnectionPool.lastCleanup > 5 * 60 * 1000) {
      for (const [ip, record] of rateLimiter.entries()) {
        if (now > record.resetTime) {
          rateLimiter.delete(ip);
        }
      }
      dbConnectionPool.lastCleanup = now;
    }
  }
}

// Enhanced error handling with proper status codes
function handleError(error: unknown, hostname: string): NextResponse {
  console.error("Error in enhanced subdomain routing:", {
    error: error instanceof Error ? error.message : String(error),
    hostname,
    timestamp: new Date().toISOString(),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // For status page errors, return a proper 404 page instead of JSON
  if (error instanceof Error) {
    if (error.message.includes("timeout")) {
      console.log("⏰ DATABASE TIMEOUT - Returning 503 for status page");
      const url = new URL("/503", `https://${hostname}`);
      const response = NextResponse.rewrite(url);
      response.headers.set("Retry-After", "30");
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response.headers.set("X-Status-Page-Error", "timeout");
      return response;
    }

    if (error.message.includes("connection") || error.message.includes("ECONNREFUSED")) {
      console.log("🔌 DATABASE CONNECTION ERROR - Returning 503 for status page");
      const url = new URL("/503", `https://${hostname}`);
      const response = NextResponse.rewrite(url);
      response.headers.set("Retry-After", "60");
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response.headers.set("X-Status-Page-Error", "connection");
      return response;
    }

    if (error.message.includes("pool exhausted")) {
      console.log("🏊 DATABASE POOL EXHAUSTED - Returning 429 for status page");
      const url = new URL("/429", `https://${hostname}`);
      const response = NextResponse.rewrite(url);
      response.headers.set("Retry-After", "5");
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response.headers.set("X-Status-Page-Error", "pool_exhausted");
      return response;
    }
  }

  // Generic error - return 500 but render as status page error
  console.log("💥 GENERIC ERROR - Returning 500 for status page");
  const url = new URL("/500", `https://${hostname}`);
  const response = NextResponse.rewrite(url);
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("X-Status-Page-Error", "internal_error");
  return response;
}

// Enhanced middleware with improved status page routing
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // DEBUG: Add logging to understand what's happening
  console.log("🔍 MIDDLEWARE DEBUG:", {
    hostname,
    pathname,
    clientIP,
    timestamp: new Date().toISOString(),
    headers: Object.fromEntries(request.headers.entries()),
  });

  // Handle subdomain routing for status pages
  const subdomain = extractSubdomain(hostname);
  const isStatusSubdomain = isStatusPageSubdomain(hostname);

  // DEBUG: Log subdomain detection
  console.log("🔍 SUBDOMAIN DEBUG:", {
    hostname,
    subdomain,
    isStatusSubdomain,
    extractSubdomainResult: extractSubdomain(hostname),
    isStatusPageSubdomainResult: isStatusPageSubdomain(hostname),
  });

  // Check if this is a status page subdomain
  if (isStatusSubdomain && subdomain) {
    console.log("✅ STATUS PAGE SUBDOMAIN DETECTED:", { subdomain, hostname });
    // Apply rate limiting for status page lookups
    const rateLimitResult = isRateLimited(clientIP);
    if (rateLimitResult.limited) {
      console.log("🚫 RATE LIMITED:", { clientIP, hostname, subdomain });
      const url = new URL("/429", `https://${hostname}`);
      const response = NextResponse.rewrite(url);
      response.headers.set("Retry-After", String(rateLimitResult.resetTime || 60));
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
      response.headers.set("X-RateLimit-Remaining", "0");
      response.headers.set("X-RateLimit-Reset", String(rateLimitResult.resetTime || 60));
      return response;
    }

    // Add rate limit headers to successful responses
    // These will be added to the final response

    try {
      // Check cache first
      const cached = subdomainCache.get(subdomain);

      if (cached && cached.id) {
        // Cache hit - rewrite to the public status page route
        const url = request.nextUrl.clone();
        // For root path, just use /status/[id], otherwise append the path
        const newPath = pathname === "/"
          ? `/status/${cached.id}`
          : `/status/${cached.id}${pathname}`;
        url.pathname = newPath;

        console.log("🔄 CACHE HIT - REWRITING URL:", {
          originalPath: pathname,
          newPath,
          cachedId: cached.id,
          hostname,
          subdomain,
        });

        const response = NextResponse.rewrite(url);

        // Add security and cache headers for successful responses
        response.headers.set(
          "Cache-Control",
          "public, max-age=300, stale-while-revalidate=60"
        );
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
        response.headers.set("X-XSS-Protection", "1; mode=block");
        response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
        response.headers.set("X-Cache", "HIT");

        // Add rate limit headers
        response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
        response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining || 0));
        response.headers.set("X-RateLimit-Reset", String(Math.ceil((rateLimitResult.resetTime || 60) / 1000)));

        return response;
      }

      // Cache miss - query database
      console.log("🔍 CACHE MISS - QUERYING DATABASE:", { subdomain });
      const statusPage = await queryStatusPage(subdomain);

      if (statusPage) {
        // Update cache
        subdomainCache.set(subdomain, {
          id: statusPage.id,
          status: statusPage.status,
        });

        // Rewrite to the public status page route
        const url = request.nextUrl.clone();
        // For root path, just use /status/[id], otherwise append the path
        const newPath = pathname === "/"
          ? `/status/${statusPage.id}`
          : `/status/${statusPage.id}${pathname}`;
        url.pathname = newPath;

        console.log("🔄 DATABASE HIT - REWRITING URL:", {
          originalPath: pathname,
          newPath,
          statusPageId: statusPage.id,
          hostname,
          subdomain,
        });

        const response = NextResponse.rewrite(url);

        // Add security and cache headers for successful responses
        response.headers.set(
          "Cache-Control",
          "public, max-age=300, stale-while-revalidate=60"
        );
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
        response.headers.set("X-XSS-Protection", "1; mode=block");
        response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
        response.headers.set("X-Cache", "MISS");

        // Add rate limit headers
        response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS));
        response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining || 0));
        response.headers.set("X-RateLimit-Reset", String(Math.ceil((rateLimitResult.resetTime || 60) / 1000)));

        return response;
      } else {
        console.log("❌ STATUS PAGE NOT FOUND:", { subdomain, hostname });

        // Cache negative result
        subdomainCache.set(subdomain, {
          id: "",
          status: "not_found",
        });

        // Return 404 for non-existent status pages
        const url = request.nextUrl.clone();
        url.pathname = "/404";

        const response = NextResponse.rewrite(url);
        response.headers.set("Cache-Control", "public, max-age=60");
        response.headers.set("X-Cache", "MISS");
        response.headers.set("X-Status-Page-Error", "not_found");

        return response;
      }
    } catch (error) {
      return handleError(error, hostname);
    }
  }

  // Skip authentication for status page subdomains and rewritten status page routes
  const isStatusPageSubdomainRequest =
    isStatusPageSubdomain(hostname) && subdomain;
  const isStatusPageRoute = pathname.startsWith("/status/");

  // Debug logging for authentication bypass
  if (isStatusPageSubdomainRequest || isStatusPageRoute) {
    console.log("🔓 BYPASSING AUTH FOR STATUS PAGE:", {
      hostname,
      pathname,
      subdomain,
      isStatusPageSubdomainRequest,
      isStatusPageRoute,
    });
  }

  if (!isStatusPageSubdomainRequest && !isStatusPageRoute) {
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

  console.log("⚠️ FALLING THROUGH TO NEXT:", {
    hostname,
    pathname,
    subdomain,
    isStatusSubdomain,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except for static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
