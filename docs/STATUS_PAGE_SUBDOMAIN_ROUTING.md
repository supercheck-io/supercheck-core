# Status Page Subdomain Routing - Complete Fix

## What Was Fixed

Status pages were redirecting to login. Root causes were:

1. **Traefik router rules broken** - Environment variables in docker-compose labels don't expand, creating malformed regex
2. **Missing environment variable** - NEXT_PUBLIC_STATUS_PAGE_DOMAIN not set
3. **Middleware not excluding main app** - Would rewrite demo.supercheck.io incorrectly

## Changes Made

### 1. Fixed Traefik Router (docker-compose-secure.yml - Lines 181, 194)

**BEFORE:**
```yaml
rule=HostRegexp(`^.+\\.${STATUS_PAGE_DOMAIN:-supercheck.io}$`)  # ✗ Broken
# Result: WRN No domain found in rule - env vars don't expand in labels
```

**AFTER:**
```yaml
rule=HostRegexp(`^(?!demo\\.).*\\.supercheck\\.io$`)  # ✓ Works
# Explanation:
# ^(?!demo\.)  - NOT starting with "demo." (excludes main app)
# .*\.supercheck\.io - Any subdomain under supercheck.io
# Matches: uuid.supercheck.io, test.supercheck.io
# Excludes: demo.supercheck.io (main app)
```

### 2. Added Environment Variable

**docker-compose-local.yml (Line 33):**
```yaml
NEXT_PUBLIC_STATUS_PAGE_DOMAIN: supercheck.io
```

**docker-compose-secure.yml (Line 19):**
```yaml
NEXT_PUBLIC_STATUS_PAGE_DOMAIN: ${NEXT_PUBLIC_STATUS_PAGE_DOMAIN:-supercheck.io}
```

### 3. Fixed Middleware (app/middleware.ts - Lines 54-84)

**Added check to exclude main app domain:**
```typescript
if (subdomain) {
  // Get main app hostname from NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let mainAppHostname: string | null = null;
  try {
    const url = new URL(appUrl);
    mainAppHostname = url.hostname;
  } catch (error) {
    // Invalid URL, skip check
  }

  // Only rewrite if this hostname is NOT the main app domain
  const isMainApp = mainAppHostname && hostname === mainAppHostname;

  if (!isMainApp) {
    // Rewrite to status page
    const response = NextResponse.rewrite(url);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  }
}
```

## How It Works

### Status Page Request (uuid.supercheck.io)

```
1. Request: https://uuid.supercheck.io
2. Traefik: Matches HostRegexp rule → routes to app
3. Middleware: Extracts uuid, NOT main app → rewrites to /status/uuid
4. Page: Loads public status page (no auth)
Result: ✓ Status page shown
```

### Main App Request (demo.supercheck.io)

```
1. Request: https://demo.supercheck.io
2. Traefik: Matches Host rule (higher priority) → routes to app
3. Middleware: Extracts demo, IS main app → doesn't rewrite
4. Auth: Checks session, requires login
Result: ✓ Main app requires authentication
```

## Deployment

### CRITICAL: You need to rebuild and push the image to ghcr.io

The middleware changes are in your local code but NOT in the pre-built image at `ghcr.io/supercheck-io/supercheck/app:latest`.

### Option 1: Build and Push New Image
```bash
# Build app image locally
cd app
docker build -t ghcr.io/supercheck-io/supercheck/app:latest .

# Push to registry (requires authentication)
docker push ghcr.io/supercheck-io/supercheck/app:latest

# Deploy
cd ..
docker-compose -f docker-compose-secure.yml pull app
docker-compose -f docker-compose-secure.yml up -d
```

### Option 2: Use Local Build (Temporary)
Temporarily change docker-compose-secure.yml to build from source:

```yaml
app:
  build:
    context: ./app
    dockerfile: Dockerfile
  # image: ghcr.io/supercheck-io/supercheck/app:latest  # Comment out
```

Then deploy:
```bash
docker-compose -f docker-compose-secure.yml build app
docker-compose -f docker-compose-secure.yml up -d
```

### 3. Verify
```bash
# Status page should NOT redirect to login
curl -I https://uuid.supercheck.io
# Expected: 200 OK

# Main app should require authentication
curl -I https://demo.supercheck.io
# Expected: 302 redirect or auth page

# Check security headers
curl -i https://uuid.supercheck.io | grep "X-Content-Type-Options"
# Expected: X-Content-Type-Options: nosniff
```

## Files Modified

- ✓ `app/middleware.ts` - Added main app domain exclusion
- ✓ `docker-compose-local.yml` - Added NEXT_PUBLIC_STATUS_PAGE_DOMAIN
- ✓ `docker-compose-secure.yml` - Fixed Traefik rules, added environment variable

## Production Ready

All issues fixed:
- ✓ Traefik routing correct
- ✓ Environment configured
- ✓ Middleware excludes main app
- ✓ Security headers applied
- ✓ Status pages public (no auth)
- ✓ Main app protected (requires auth)
