# Status Page Subdomain Fix

## Problem

Status page subdomains were not resolving when running on Dokploy with Cloudflare DNS setup. The URL `https://hd3753f1000614b068cbecc71ff5e9947.supercheck.io/` was returning a 404 error.

## Root Cause

The Traefik configuration in `docker-compose-secure.yml` was only routing traffic for the main domain (`demo.supercheck.io`) but not handling wildcard subdomains for status pages. Additionally, the status pages are on `*.supercheck.io` while the main app is on `demo.supercheck.io`, requiring separate domain handling.

## Solution

Updated the Traefik configuration to support wildcard subdomain routing with a simplified catch-all approach:

### Changes Made

1. **Simplified to a catch-all router**:

   - Single router handles all domains and subdomains
   - Uses regex pattern to match any subdomain of both `supercheck.io` and `demo.supercheck.io`
   - Eliminates complexity of multiple routers

2. **Disabled Let's Encrypt**:

   - Removed ACME configuration since Cloudflare handles SSL termination
   - Added TLS options for Cloudflare proxy

3. **Added Status Page Domain**:
   - Added `STATUS_PAGE_DOMAIN` environment variable
   - Defaults to `supercheck.io` for proper subdomain generation

### Updated Configuration

```yaml
labels:
  - "traefik.enable=true"
  # Catch-all router for all hosts (main domain + all subdomains)
  - "traefik.http.routers.app.rule=Host(`${APP_DOMAIN:-demo.supercheck.io}`) || Host(`${STATUS_PAGE_DOMAIN:-supercheck.io}`) || HostRegexp(`^[a-zA-Z0-9-]+\\.(demo\\.)?supercheck\\.io$`)"
  - "traefik.http.routers.app.entrypoints=websecure"
  - "traefik.http.routers.app.tls=true"
  - "traefik.http.routers.app.service=app"
  # HTTP to HTTPS redirect for all hosts
  - "traefik.http.routers.app-http.rule=Host(`${APP_DOMAIN:-demo.supercheck.io}`) || Host(`${STATUS_PAGE_DOMAIN:-supercheck.io}`) || HostRegexp(`^[a-zA-Z0-9-]+\\.(demo\\.)?supercheck\\.io$`)"
  - "traefik.http.routers.app-http.entrypoints=web"
  - "traefik.http.routers.app-http.middlewares=app-https-redirect"
  - "traefik.http.routers.app-http.service=app"
  # Middleware and service configuration
  - "traefik.http.middlewares.app-https-redirect.redirectscheme.scheme=https"
  - "traefik.http.services.app.loadbalancer.server.port=3000"
  - "traefik.http.services.app.loadbalancer.healthCheck.path=/api/health"
```

## DNS Configuration Requirements

Ensure your Cloudflare DNS has:

1. **A Record**: `demo` → `91.98.19.170` (Proxied)
   - Routes the main application domain
2. **A Record**: `supercheck.io` → `91.98.19.170` (Proxied)
   - Routes the base domain for status pages
3. **CNAME Record**: `*` → `supercheck.io` (Proxied)
   - Routes all wildcard subdomains to the server

## Testing

After deployment, test the status page subdomains:

1. Create and publish a status page in the dashboard
2. Access it via: `https://hd3753f1000614b068cbecc71ff5e9947.supercheck.io/`
3. Check Traefik logs: `docker-compose logs -f traefik`

## Middleware Behavior

The Next.js middleware already handles subdomain routing correctly:

- Extracts subdomain from hostname
- Checks database for published status page
- Rewrites URL to `/status-pages/[id]/public`
- Returns 404 for non-existent pages

## Better Auth Configuration

Status page subdomains also need to be trusted by Better Auth to avoid authentication redirects. Updated `app/src/utils/auth.ts`:

```typescript
trustedOrigins:
  process.env.NODE_ENV === "production"
    ? [
        process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL!,
        // Add status page domain for wildcard subdomains
        process.env.STATUS_PAGE_DOMAIN || "supercheck.io",
        // Add wildcard pattern for all subdomains
        "https://*.supercheck.io",
        "https://*.demo.supercheck.io",
      ]
    : undefined,
```

This ensures Better Auth treats all status page subdomains as trusted origins and doesn't require authentication for them.
The fix ensures Traefik routes these requests to the Next.js app properly.
