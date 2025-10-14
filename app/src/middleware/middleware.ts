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
let dbConnectionPool = {
  activeConnections: 0,
  maxConnections: 10,
  lastCleanup: Date.now(),
};

// Enhanced rate limiting for status page lookups
const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimiter.get(ip);

  if (!record || now > record.resetTime) {
    rateLimiter.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  record.count++;
  return false;
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
  });

  if (error instanceof Error) {
    if (error.message.includes("timeout")) {
      return NextResponse.json(
        {
          error: "Service temporarily unavailable",
          message: "Status page lookup timed out. Please try again.",
          retryAfter: 30,
        },
        {
          status: 503,
          headers: {
            "Retry-After": "30",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    if (error.message.includes("connection")) {
      return NextResponse.json(
        {
          error: "Database connection error",
          message: "Unable to connect to the database. Please try again later.",
        },
        {
          status: 503,
          headers: {
            "Retry-After": "60",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    if (error.message.includes("pool exhausted")) {
      return NextResponse.json(
        {
          error: "Service overloaded",
          message:
            "Too many concurrent requests. Please try again in a moment.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "5",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }
  }

  return NextResponse.json(
    {
      error: "Internal server error",
      message: "An unexpected error occurred. Please try again.",
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}

// Enhanced middleware with improved status page routing
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Handle subdomain routing for status pages
  const subdomain = extractSubdomain(hostname);

  // Check if this is a status page subdomain
  if (isStatusPageSubdomain(hostname) && subdomain) {
    // Apply rate limiting for status page lookups
    if (isRateLimited(clientIP)) {
      return NextResponse.json(
        {
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    try {
      // Check cache first
      const cached = subdomainCache.get(subdomain);

      if (cached && cached.id) {
        // Cache hit - rewrite to the public status page route
        const url = request.nextUrl.clone();
        url.pathname = `/status-pages/${cached.id}/public${pathname}`;

        const response = NextResponse.rewrite(url);

        // Add cache headers for successful responses
        response.headers.set(
          "Cache-Control",
          "public, max-age=300, stale-while-revalidate=60"
        );
        response.headers.set("X-Cache", "HIT");

        return response;
      }

      // Cache miss - query database
      const statusPage = await queryStatusPage(subdomain);

      if (statusPage) {
        // Update cache
        subdomainCache.set(subdomain, {
          id: statusPage.id,
          status: statusPage.status,
        });

        // Rewrite to the public status page route
        const url = request.nextUrl.clone();
        url.pathname = `/status-pages/${statusPage.id}/public${pathname}`;

        const response = NextResponse.rewrite(url);

        // Add cache headers for successful responses
        response.headers.set(
          "Cache-Control",
          "public, max-age=300, stale-while-revalidate=60"
        );
        response.headers.set("X-Cache", "MISS");

        return response;
      } else {
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

        return response;
      }
    } catch (error) {
      return handleError(error, hostname);
    }
  }

  // Skip authentication for status page subdomains
  const isStatusPageSubdomainRequest =
    isStatusPageSubdomain(hostname) && subdomain;

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
