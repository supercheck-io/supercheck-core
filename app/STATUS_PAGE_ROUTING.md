# Status Page Subdomain Routing Architecture

## Overview

This document explains the production-ready architecture for status page subdomain routing in Supercheck.

## Key Design Principles

1. **Simple & Fast Middleware**: NO database queries in middleware - keeps it edge-compatible
2. **Page-Level Lookups**: Database queries happen in page components with Next.js caching
3. **Cloudflare Routing**: Specific subdomains (www, api, cdn) are handled at Cloudflare level
4. **Single Source of Truth**: NEXT_PUBLIC_APP_URL defines the main app subdomain

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Request: https://abc123.supercheck.io/                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare (Optional)                                       │
│  - Handles specific subdomains: www, api, cdn, etc.        │
│  - Passes other subdomains to Next.js                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Next.js Middleware (src/middleware/middleware.ts)          │
│  1. Extract subdomain: "abc123"                             │
│  2. Check if it's main app? NO                              │
│  3. Rewrite to: /status/abc123                              │
│  4. Add security headers                                    │
│  5. Return response                                         │
│                                                             │
│  ⚡ FAST: Just string operations, no DB queries             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Page Component (src/app/(public)/status/[id]/page.tsx)    │
│  1. Receive param: "abc123"                                 │
│  2. Try subdomain lookup in DB                              │
│  3. If not found, try UUID lookup (backward compat)         │
│  4. If found: Show status page                              │
│  5. If not found: Show 404 (notFound())                     │
│                                                             │
│  💾 Next.js handles caching automatically                   │
└─────────────────────────────────────────────────────────────┘
```

## Environment Configuration

### Required Environment Variables

```bash
# Main app URL - defines which subdomain is the main app
NEXT_PUBLIC_APP_URL=https://app.supercheck.io

# Optional: Override base domain for status pages
STATUS_PAGE_BASE_DOMAIN=supercheck.io
```

### URL Examples

| Environment | NEXT_PUBLIC_APP_URL | Main App | Status Pages |
|-------------|---------------------|----------|--------------|
| Local Dev | http://localhost:3000 | localhost:3000 | *.localhost |
| Staging | https://staging.supercheck.io | staging.supercheck.io | *.supercheck.io (except staging) |
| Production | https://app.supercheck.io | app.supercheck.io | *.supercheck.io (except app) |

## Subdomain Routing Logic

### Middleware Decision Tree

```
Request received
    ↓
Extract subdomain from hostname
    ↓
Is subdomain = NEXT_PUBLIC_APP_URL subdomain?
    ↓
YES → Handle as main app (auth required)
    ↓
NO → Rewrite to /status/[subdomain] (no auth)
```

### Example Scenarios

1. **Status Page Request**
   - URL: `https://abc123.supercheck.io`
   - Subdomain: `abc123`
   - Main app: `app`
   - Result: Rewrite to `/status/abc123`

2. **Main App Request**
   - URL: `https://app.supercheck.io`
   - Subdomain: `app`
   - Main app: `app`
   - Result: No rewrite, handle auth

3. **Cloudflare-Routed Request** (recommended)
   - URL: `https://www.supercheck.io`
   - Cloudflare: Routes to marketing site
   - Never reaches Next.js

4. **Fallback Cloudflare Request**
   - URL: `https://api.supercheck.io` (if not routed by Cloudflare)
   - Subdomain: `api`
   - Main app: `app`
   - Result: Rewrite to `/status/api` → Shows 404

## Files Structure

### Core Files

```
app/
├── src/
│   ├── middleware/
│   │   └── middleware.ts              # Subdomain routing (NO DB queries)
│   │
│   ├── lib/
│   │   └── domain-utils.ts            # Subdomain extraction utilities
│   │
│   ├── actions/
│   │   ├── get-public-status-page.ts            # Lookup by UUID
│   │   └── get-public-status-page-by-subdomain.ts  # Lookup by subdomain
│   │
│   └── app/
│       └── (public)/
│           └── status/
│               └── [id]/
│                   ├── page.tsx       # Main status page (dual lookup)
│                   ├── not-found.tsx  # 404 page
│                   └── incidents/
│                       └── [incidentId]/
│                           └── page.tsx   # Incident detail page
```

### Key Functions

#### `extractSubdomain(hostname: string)`
Extracts subdomain from hostname following DNS specifications (1-63 characters, alphanumeric with hyphens).

#### `getMainAppSubdomain()`
Returns the subdomain from NEXT_PUBLIC_APP_URL to identify the main app.

#### `getPublicStatusPageBySubdomain(subdomain: string)`
Server action to lookup status page by subdomain (published pages only).

## Database Schema

```sql
CREATE TABLE status_pages (
  id UUID PRIMARY KEY,
  subdomain VARCHAR(36) UNIQUE NOT NULL,  -- e.g., "abc123def456"
  status VARCHAR(50) DEFAULT 'draft',      -- draft | published | archived
  -- ... other fields
);

CREATE INDEX idx_status_pages_subdomain ON status_pages(subdomain);
```

## Cloudflare Configuration (Recommended)

For production, configure Cloudflare to handle specific subdomains:

### Cloudflare Page Rules

```
# Route marketing site
www.supercheck.io/* → marketing-site.vercel.app

# Route API gateway
api.supercheck.io/* → api-gateway.example.com

# Route CDN assets
cdn.supercheck.io/* → s3-bucket.amazonaws.com

# Everything else goes to Next.js app
*.supercheck.io/* → app.supercheck.io
```

### Benefits

- **Faster Routing**: Cloudflare routes before reaching Next.js
- **Better Performance**: Reduces load on Next.js application
- **Flexibility**: Easy to add/change specific subdomain routing
- **Cost-Effective**: Offload routing to Cloudflare edge

## Performance Characteristics

### Middleware Performance

- **Operation**: String comparison + rewrite
- **Database**: None
- **Time**: <1ms
- **Edge-Compatible**: Yes
- **Scalability**: Infinite

### Page Component Performance

- **First Request**: Database query (~10-50ms)
- **Cached Request**: Next.js ISR cache (~1ms)
- **Cache Duration**: 5 minutes (configurable)
- **Cache Invalidation**: Automatic via Next.js revalidation

## Caching Strategy

### Next.js Automatic Caching

```typescript
// Page component is automatically cached by Next.js
export default async function PublicStatusPagePage({ params }) {
  const statusPage = await getStatusPageData(params.id);
  // ...
}

// Next.js caches this for 5 minutes by default
// Revalidates automatically on builds
```

### Manual Revalidation (if needed)

```typescript
import { revalidatePath } from 'next/cache';

// In your update action
await updateStatusPage(id, data);
revalidatePath(`/status/${statusPage.subdomain}`);
```

## Testing

### Local Testing

1. **Update hosts file**:
   ```bash
   # /etc/hosts (Mac/Linux) or C:\Windows\System32\drivers\etc\hosts (Windows)
   127.0.0.1 test.localhost
   127.0.0.1 demo.localhost
   ```

2. **Test URLs**:
   - Main app: `http://localhost:3000`
   - Status page: `http://test.localhost:3000`

### Production Testing

1. Create a test status page with subdomain "test123"
2. Visit: `https://test123.supercheck.io`
3. Should show status page without authentication
4. Visit: `https://invalid.supercheck.io`
5. Should show 404 error

## Security Headers

All status page responses include:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

## Error Handling

### 404 - Status Page Not Found

Shown when:
- Subdomain doesn't exist in database
- Status page is not published
- Invalid subdomain format

### 500 - Internal Server Error

Shown when:
- Database connection fails
- Unexpected error during lookup

### 503 - Service Unavailable

Shown when:
- Database timeout
- Service overload

## Best Practices

1. **Always use NEXT_PUBLIC_APP_URL**: Don't hardcode the main app subdomain
2. **Let Cloudflare handle routing**: Route specific subdomains at CDN level
3. **Keep middleware fast**: No database queries or heavy operations
4. **Use Next.js caching**: Let the framework handle caching automatically
5. **Monitor performance**: Track middleware execution time and page load times
6. **Validate subdomains**: Follow DNS specifications (1-63 chars, alphanumeric + hyphens)

## Troubleshooting

### Issue: All subdomains redirect to sign-in

**Cause**: Middleware is not detecting subdomains correctly

**Solution**: Check NEXT_PUBLIC_APP_URL is set correctly

### Issue: Status pages show 404

**Cause**: Database lookup failing or page not published

**Solution**: Check status page is published and subdomain matches

### Issue: Slow initial load

**Cause**: Database query on first request

**Solution**: This is expected. Subsequent requests use Next.js cache

## Migration from Old Architecture

If migrating from database queries in middleware:

1. ✅ Remove all DB queries from middleware
2. ✅ Add subdomain lookup action
3. ✅ Update page components to handle lookups
4. ✅ Remove caching logic from middleware
5. ✅ Test thoroughly with various subdomains
6. ✅ Monitor performance improvements

## Summary

This architecture provides:

- ✅ **Fast middleware** - No database queries
- ✅ **Edge-compatible** - Works with Vercel Edge, Cloudflare Workers
- ✅ **Automatic caching** - Next.js handles it
- ✅ **Simple maintenance** - Clean separation of concerns
- ✅ **Production-ready** - Follows Next.js best practices
- ✅ **Scalable** - Handles high traffic efficiently

---

**Last Updated**: 2025-10-18
**Version**: 1.0
**Status**: Production Ready ✅
