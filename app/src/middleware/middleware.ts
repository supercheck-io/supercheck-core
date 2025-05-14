import { NextRequest, NextResponse } from 'next/server';

// This middleware will run for all requests
export function middleware(request: NextRequest) {
  // Set headers to help with SSL issues
  const headers = new Headers(request.headers);
  
  // Add security headers to bypass SSL validation in corporate environments
  const response = NextResponse.next({
    request: {
      headers,
    },
  });

  // Add response headers to help with SSL issues
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return response;
}

// Configure the middleware to run for specific paths
export const config = {
  matcher: [
    // Apply to all API routes
    '/api/:path*',
  ],
};
