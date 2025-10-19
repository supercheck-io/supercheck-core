# Status Page Subdomain Routing - Production Deployment Guide

## Overview

Status pages in Supercheck are accessed via UUID subdomains (e.g., `c3f33bf628b14b9b8169566796153335c.supercheck.io`). These pages are **completely public** with no authentication required.

This guide covers the production setup for Dokploy/Hetzner deployments using Traefik as the reverse proxy.

## Architecture

```
┌─────────────────────────────────────────┐
│  demo.supercheck.io                     │
│  (Main App - Requires Auth)             │
└─────────────────────────────────────────┘
              ▼
         Traefik Router
         Priority: 100
              ▼
        Next.js App
              ▼
    Middleware (Auth Check)
              ▼
       Dashboard (Protected)

┌─────────────────────────────────────────┐
│  uuid.supercheck.io                     │
│  (Status Page - Public)                 │
└─────────────────────────────────────────┘
              ▼
         Traefik Router
         Priority: 50
              ▼
        Next.js App
              ▼
    Middleware (Subdomain Detection)
              ▼
   Rewrite to /status/[uuid]
              ▼
   Status Page (Public - No Auth)
```

## Fixed Issues

### 1. Middleware Environment Variables (Build-time vs Runtime)

**Problem**: The middleware was using `process.env.NEXT_PUBLIC_STATUS_PAGE_DOMAIN` which was **empty at runtime** because `NEXT_PUBLIC_` environment variables are embedded at **build time** only. This caused the middleware to never detect subdomains, resulting in authentication redirects.

**Solution**: Use regular environment variables (without `NEXT_PUBLIC_` prefix) which are available at runtime:

```typescript
// BEFORE (broken - empty at runtime)
const statusPageDomain = process.env.NEXT_PUBLIC_STATUS_PAGE_DOMAIN || "";

// AFTER (fixed - runtime env var)
const statusPageDomain = process.env.STATUS_PAGE_DOMAIN || "";
```

**Key Learning**: Next.js middleware runs in Edge Runtime and can only access regular environment variables at runtime, NOT `NEXT_PUBLIC_` variables.

### 2. Traefik HostRegexp Syntax (Traefik v3)

**Problem**: The HostRegexp pattern was using v2 capture group syntax which Traefik v3 doesn't support.

**Solution**: Use Traefik v3 Go regexp syntax (without named capture groups):

```yaml
# BEFORE (v2 syntax - doesn't work in v3)
- "traefik.http.routers.status-pages.rule=HostRegexp(`{host:.+\\.supercheck\\.io}`)"

# AFTER (v3 syntax - Go regexp)
- "traefik.http.routers.status-pages.rule=HostRegexp(`[a-zA-Z0-9-]+\\.supercheck\\.io`)"
```

The pattern `[a-zA-Z0-9-]+\\.supercheck\\.io` matches UUID subdomains:
- `f134b5f9f2b048069deaf7cfb924a0b3.supercheck.io` ✓
- `c3f33bf628b14b9b816956679615335c.supercheck.io` ✓
- `demo.supercheck.io` ✓ (but main app router matches first due to priority 100)

**Note**: The warning "No domain found in rule HostRegexp" is **expected behavior** - it means Traefik will use SNI (Server Name Indication) for TLS certificate selection, which is correct for wildcard patterns.

### 3. Router Priority

**Problem**: The main app router didn't have an explicit priority, which could cause incorrect routing.

**Solution**: Set explicit priorities:
- Main app (`demo.supercheck.io`): Priority **100** (matches first)
- Status pages (`*.supercheck.io`): Priority **50** (matches after main app)

### 4. Middleware Main App Exclusion

The middleware now properly checks if the request is for the main app domain and excludes it from status page rewriting:

```typescript
if (subdomain) {
    // Use runtime env var (NOT NEXT_PUBLIC_)
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const mainAppHostname = new URL(appUrl).hostname; // "demo.supercheck.io"

    const isMainApp = mainAppHostname && hostname === mainAppHostname;

    if (!isMainApp) {
        // Rewrite to /status/[subdomain] for status pages only
        const url = request.nextUrl.clone();
        url.pathname = `/status/${subdomain}`;
        return NextResponse.rewrite(url);
    }
}
```

## Deployment Steps

### 1. Update docker-compose-secure.yml

The file has been updated with the correct Traefik v3 syntax. Key changes:

```yaml
labels:
  # Main app with high priority
  - "traefik.http.routers.app.rule=Host(`demo.supercheck.io`)"
  - "traefik.http.routers.app.priority=100"
  - "traefik.http.routers.app.entrypoints=websecure"

  # Status pages with lower priority (Traefik v3 Go regexp syntax)
  - "traefik.http.routers.status-pages.rule=HostRegexp(`[a-zA-Z0-9-]+\\.supercheck\\.io`)"
  - "traefik.http.routers.status-pages.priority=50"
  - "traefik.http.routers.status-pages.entrypoints=websecure"
```

### 2. Environment Variables

**IMPORTANT**: Middleware requires **runtime** environment variables (not `NEXT_PUBLIC_` which are build-time only).

Ensure these are set in docker-compose:

```bash
# Build-time env var (embedded in Next.js bundle for browser auth client)
NEXT_PUBLIC_APP_URL=https://demo.supercheck.io

# Runtime env vars (available to middleware at runtime)
APP_URL=https://demo.supercheck.io
STATUS_PAGE_DOMAIN=supercheck.io
```

**Why the duplication of APP_URL?**
- `NEXT_PUBLIC_APP_URL` → Used by browser-side auth client (Better Auth)
- `APP_URL` → Used by middleware at runtime (Edge Runtime can't access NEXT_PUBLIC_ vars)

### 3. Rebuild and Push Image

The middleware changes need to be in the Docker image:

```bash
# Build multi-arch image
./scripts/docker-images.sh

# This builds and pushes:
# ghcr.io/supercheck-io/supercheck/app:latest
# ghcr.io/supercheck-io/supercheck/worker:latest
```

### 4. Deploy to Dokploy

1. Update the docker-compose file in Dokploy with the corrected Traefik labels
2. Redeploy the stack
3. Verify environment variables are set correctly

```bash
# In Dokploy, redeploy the stack
docker-compose -f docker-compose-secure.yml up -d --force-recreate
```

## Verification

### Check Traefik Routing

```bash
# Check Traefik routers
docker-compose -f docker-compose-secure.yml logs traefik | grep -i router

# Verify no regex errors
docker-compose -f docker-compose-secure.yml logs traefik | grep -i error
```

### Check Middleware Environment Variables

```bash
# Exec into the app container
docker exec -it <app-container-name> env | grep NEXT_PUBLIC

# Should show:
# NEXT_PUBLIC_APP_URL=https://demo.supercheck.io
# NEXT_PUBLIC_STATUS_PAGE_DOMAIN=supercheck.io
```

### Test Status Page Access

1. Visit `https://[uuid].supercheck.io` (replace [uuid] with an actual status page UUID)
2. Should see the status page immediately WITHOUT redirect to login
3. Check browser DevTools Network tab:
   - No redirect to `/sign-in`
   - Direct response from the status page

### Test Main App Access

1. Visit `https://demo.supercheck.io`
2. Should redirect to `/sign-in` if not authenticated
3. Should show dashboard if authenticated

## Troubleshooting

### Status Page Still Redirecting to Login

**Possible Causes**:

1. **Traefik regex not matching**: Check Traefik logs for regex parsing errors
   ```bash
   docker-compose -f docker-compose-secure.yml logs traefik --tail 50
   ```

2. **Wrong Docker image**: Verify the deployed image contains the middleware changes
   ```bash
   # Check which image is running
   docker inspect <app-container> | grep Image

   # Should show the latest image with middleware changes
   ```

3. **Environment variables not set**: Verify env vars in the running container
   ```bash
   docker exec <app-container> env | grep NEXT_PUBLIC
   ```

4. **Middleware not detecting subdomain**: Check middleware logs
   ```bash
   docker-compose -f docker-compose-secure.yml logs app --tail 50 | grep subdomain
   ```

### Traefik Regex Errors

If you see `invalid or unsupported Perl syntax` errors:

- Traefik v3 uses Go regex, not Perl regex
- Use named capture groups: `{subdomain:[a-z0-9-]+}`
- Do NOT use negative lookahead: `(?!demo)` won't work

### Main App Showing Status Page

If `demo.supercheck.io` shows a status page instead of the dashboard:

- Check router priorities (main app should be 100, status pages should be 50)
- Verify `NEXT_PUBLIC_APP_URL` matches the main app hostname

## Technical Details

### Traefik v3 Routing

Traefik evaluates routers in **priority order** (highest first):

1. **Priority 100**: `Host(\`demo.supercheck.io\`)` → Main app
2. **Priority 50**: `HostRegexp(\`[a-zA-Z0-9-]+\\.supercheck\\.io\`)` → Status pages

The HostRegexp pattern `[a-zA-Z0-9-]+\\.supercheck\\.io` matches:
- One or more alphanumeric characters or hyphens (`[a-zA-Z0-9-]+`) followed by
- A literal dot and "supercheck.io" (`\\.supercheck\\.io`)

This matches UUID subdomains like `f134b5f9f2b048069deaf7cfb924a0b3.supercheck.io`

**Important Traefik v3 Notes**:
- Use Go regexp syntax (NOT v2 named capture groups like `{host:...}`)
- The warning "No domain found in rule HostRegexp" is EXPECTED - it means TLS will use SNI
- Requests ARE being routed correctly even with this warning

### Middleware Flow

```
Request to uuid.supercheck.io
  ↓
Traefik matches status-pages router (priority 50)
  ↓
Proxies to Next.js app
  ↓
Middleware extracts subdomain ("uuid")
  ↓
Checks if hostname is main app domain ("demo.supercheck.io")
  ↓
Not main app → Rewrite to /status/uuid
  ↓
Skip authentication (isPublicStatusRoute = true)
  ↓
Serve status page
```

### Security Headers

Status pages include security headers:

```typescript
response.headers.set("X-Content-Type-Options", "nosniff");
response.headers.set("X-Frame-Options", "DENY");
response.headers.set("X-XSS-Protection", "1; mode=block");
response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
```

## Summary of Changes

1. ✅ **CRITICAL FIX**: Changed middleware to use runtime env vars (`APP_URL`, `STATUS_PAGE_DOMAIN`) instead of build-time `NEXT_PUBLIC_*` vars
2. ✅ Fixed Traefik HostRegexp to use plain regex without capture groups (Traefik v3 syntax)
3. ✅ Added explicit router priorities (100 for main app, 50 for status pages)
4. ✅ Middleware checks `APP_URL` to exclude main app from subdomain rewriting
5. ✅ Added both build-time and runtime environment variables to docker-compose
6. ✅ Documented proper deployment workflow for Dokploy

## Next Steps

After deploying these changes:

1. Test main app access (`demo.supercheck.io`)
2. Test status page access (`uuid.supercheck.io`)
3. Monitor Traefik logs for any routing errors
4. Verify middleware is correctly rewriting status page URLs
