import { NextRequest, NextResponse } from "next/server";
import { getCookieCache } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getCookieCache(request);

  const isAuthPage =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  if (isAuthPage) {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/tests/:path*",
    "/jobs/:path*",
    "/runs/:path*",
    "/monitors/:path*",
    "/alerts/:path*",
    "/settings/:path*",
    "/create/:path*",
    "/playground/:path*",
    "/sign-in",
    "/sign-up",
  ],
};
