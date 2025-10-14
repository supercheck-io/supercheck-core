import { NextRequest, NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";
import { extractSubdomain, isStatusPageSubdomain } from "@/lib/domain-utils";

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
        // Call API endpoint to check status page
        try {
          const apiUrl = new URL(
            `/api/status-pages/check?subdomain=${encodeURIComponent(
              subdomain
            )}`,
            request.url
          );

          const response = await fetch(apiUrl.toString(), {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();
            statusPageId = data.id;
            statusPageStatus = data.status;

            // Update cache
            subdomainCache.set(subdomain, {
              id: statusPageId!,
              status: statusPageStatus!,
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
        } catch (error) {
          console.error("Error calling status page API:", error);
          // Cache negative result on API error
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

    if (isAuthPage) {
      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.next();
    }

    // For other API routes, check authentication (excluding job triggers which handle their own auth)
    const isJobTrigger = pathname.match(/^\/api\/jobs\/[^\/]+\/trigger$/);
    if (pathname.startsWith("/api/") && !isAuthApi && !isJobTrigger) {
      if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = "/api/auth/error";
        url.searchParams.set("error", "Unauthorized");
        return NextResponse.rewrite(url);
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
