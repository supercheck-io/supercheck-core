# Status Page Subdomain Setup Guide

This guide explains how to configure wildcard subdomain routing for status pages in production using Cloudflare and Traefik.

## Overview

Status pages are accessible via unique subdomains (e.g., `abc123def.supercheck.io`). The system uses:

- **Cloudflare DNS**: Provides wildcard DNS resolution for all subdomains
- **Cloudflare Proxy**: Handles SSL/TLS termination and DDoS protection
- **Traefik**: Reverse proxy that routes requests to the Next.js app
- **Next.js Middleware**: Looks up subdomain → status page mapping and rewrites URLs

## DNS Configuration

### Cloudflare DNS Records (Required)

You need **TWO** DNS records in Cloudflare:

#### 1. Main Domain (A Record)
```
Type: A
Name: demo (or your subdomain)
Content: YOUR_SERVER_IP (e.g., 91.98.19.170)
Proxy status: Proxied (orange cloud) ✅
TTL: Auto
```

#### 2. Wildcard Subdomain (CNAME Record)
```
Type: CNAME
Name: *
Content: demo.supercheck.io (your FULL main domain, NOT apex)
Proxy status: Proxied (orange cloud) ✅
TTL: Auto
```

**IMPORTANT**: The wildcard CNAME must point to your **full application domain** (e.g., `demo.supercheck.io`), not the apex domain (`supercheck.io`).

**Example - INCORRECT:**
```
A       demo        91.98.19.170        Proxied     Auto
CNAME   *           supercheck.io       Proxied     Auto  ❌ WRONG
```

**Example - CORRECT:**
```
A       demo        91.98.19.170        Proxied     Auto
CNAME   *           demo.supercheck.io  Proxied     Auto  ✅ CORRECT
```

### Cloudflare SSL/TLS Settings

1. Navigate to **SSL/TLS** → **Overview**
2. Set SSL/TLS encryption mode to: **Full** (or **Full (strict)** if you have valid certificates)
3. Cloudflare automatically provides wildcard SSL certificates (`*.supercheck.io`)
4. No need for Let's Encrypt when using Cloudflare proxy

3. **Reserved Subdomains**

   The following subdomains are reserved and will not route to status pages:
   - `www` - Main website
   - `app` - Application dashboard
   - `api` - API endpoints
   - `admin` - Administration
   - `status` - Reserved for status dashboard
   - `cdn` - CDN assets
   - `mail` - Email services
   - `staging` - Staging environment
   - `dev` - Development environment

### Alternative DNS Providers

For non-Cloudflare providers, you'll need:

1. **Wildcard A Record**
   ```
   Type: A
   Name: *
   Value: Your server IP address
   TTL: 3600
   ```

2. **SSL Certificate**
   - Obtain a wildcard SSL certificate for `*.supercheck.io`
   - Can use Let's Encrypt with certbot:
     ```bash
     certbot certonly --manual --preferred-challenges dns -d "*.supercheck.io"
     ```

## Docker Compose Configuration

### Traefik Configuration (Updated)

The `docker-compose-secure.yml` has been optimized for Cloudflare + Traefik:

**Key Changes:**
1. ✅ **Removed Let's Encrypt**: Cloudflare handles SSL, no need for Let's Encrypt certificate resolution
2. ✅ **Increased Timeouts**: Set to 60-90 seconds to handle database queries
3. ✅ **Cloudflare IP Trust**: Added trusted IP ranges for proper client IP forwarding
4. ✅ **Improved Routing**: Better regex for subdomain matching
5. ✅ **Health Checks**: Added load balancer health checks

**Traefik Labels:**
```yaml
labels:
  - "traefik.enable=true"
  # Wildcard subdomain routing for HTTPS
  - "traefik.http.routers.app.rule=Host(`${APP_DOMAIN}`) || HostRegexp(`^[a-zA-Z0-9-]+\\.${APP_DOMAIN}$$`)"
  - "traefik.http.routers.app.entrypoints=websecure"
  - "traefik.http.routers.app.tls=true"
  # HTTP to HTTPS redirect
  - "traefik.http.routers.app-http.rule=Host(`${APP_DOMAIN}`) || HostRegexp(`^[a-zA-Z0-9-]+\\.${APP_DOMAIN}$$`)"
  - "traefik.http.routers.app-http.middlewares=app-https-redirect"
  - "traefik.http.middlewares.app-https-redirect.redirectscheme.scheme=https"
  # Service configuration
  - "traefik.http.services.app.loadbalancer.server.port=3000"
  - "traefik.http.services.app.loadbalancer.healthCheck.path=/api/health"
```

### Environment Variables

Required in `docker-compose-secure.yml`:

```env
# Main application domain
APP_DOMAIN=demo.supercheck.io

# Application URL (must match APP_DOMAIN)
NEXT_PUBLIC_APP_URL=https://demo.supercheck.io

# Better Auth URL (must match APP_DOMAIN)
BETTER_AUTH_URL=https://demo.supercheck.io

# Database connection (required for subdomain lookup)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supercheck
```

## Middleware Optimizations

The middleware has been optimized with caching and timeout handling:

**Key Features:**
1. ✅ **In-Memory Cache**: Subdomain lookups cached for 5 minutes
2. ✅ **Query Timeout**: Database queries timeout after 5 seconds
3. ✅ **Error Handling**: Returns 503 on database errors (not 500)
4. ✅ **Negative Caching**: Caches "not found" results to prevent repeated queries

**How it works:**
1. Extracts subdomain from hostname
2. Checks cache first (5 minute TTL)
3. If not cached, queries database with 5s timeout
4. Checks if subdomain is reserved
5. Looks up status page by subdomain in database
6. Rewrites request to `/status-pages/[id]/public` route
7. Returns 404 for non-existent or unpublished pages
8. Returns 503 on database timeout/errors

## Deployment

### Docker Compose Deployment

1. **Update Configuration Files** (already done):
   - `docker-compose-secure.yml` - Traefik configuration
   - `app/src/middleware/middleware.ts` - Caching and timeout handling

2. **Configure Cloudflare DNS**:
   ```
   A       demo        YOUR_SERVER_IP      Proxied     Auto
   CNAME   *           demo.supercheck.io  Proxied     Auto
   ```

3. **Deploy Services**:
   ```bash
   # Stop existing services
   docker-compose -f docker-compose-secure.yml down

   # Pull latest images (if using pre-built images)
   docker-compose -f docker-compose-secure.yml pull

   # Start services
   docker-compose -f docker-compose-secure.yml up -d

   # Check logs
   docker-compose -f docker-compose-secure.yml logs -f traefik
   docker-compose -f docker-compose-secure.yml logs -f app
   ```

4. **Verify Deployment**:
   ```bash
   # Check all services are running
   docker-compose -f docker-compose-secure.yml ps

   # Test main domain
   curl -I https://demo.supercheck.io

   # Test wildcard DNS
   curl -I https://abc123.demo.supercheck.io
   ```

### Nginx Reverse Proxy

If using Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name *.supercheck.io;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Apache Reverse Proxy

```apache
<VirtualHost *:80>
    ServerName supercheck.io
    ServerAlias *.supercheck.io

    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

## Testing

### Local Testing

Subdomain routing doesn't work on localhost. Use the preview route instead:
```
http://localhost:3000/status-pages/[id]/public
```

### Production Testing

1. **Create a status page** in the dashboard
2. **Add components** and incidents
3. **Publish the status page** using the "Publish" button
4. **Access via subdomain**:
   ```
   https://[subdomain].supercheck.io
   ```

### DNS Verification

Check if wildcard DNS is configured:
```bash
nslookup test123.supercheck.io
nslookup another456.supercheck.io
```

Both should resolve to your server IP or Cloudflare proxy.

## Troubleshooting

### Error: Connection Timeout (522)

**Symptoms**: Cloudflare shows "Connection timed out" error

**Causes**:
1. Server is not running or not accessible
2. Firewall blocking ports 80 and 443
3. Traefik not routing requests correctly
4. Database query timeout in middleware

**Solutions**:
```bash
# 1. Check if services are running
docker-compose -f docker-compose-secure.yml ps

# 2. Check if ports are open
sudo netstat -tuln | grep -E ':(80|443)'

# 3. Check firewall rules
sudo ufw status

# 4. Check Traefik logs
docker-compose -f docker-compose-secure.yml logs -f traefik

# 5. Check app logs for database issues
docker-compose -f docker-compose-secure.yml logs -f app | grep -E "subdomain|database|timeout"

# 6. Test database connection
docker-compose -f docker-compose-secure.yml exec app node -e "require('@/utils/db').db"

# 7. Restart services
docker-compose -f docker-compose-secure.yml restart traefik app
```

### Error: 404 Not Found

**Symptoms**: Status page subdomain shows 404

**Causes**:
1. Status page is not published (status = "draft")
2. Subdomain doesn't exist in database
3. DNS not propagated yet
4. Wildcard CNAME pointing to wrong domain

**Solutions**:
```bash
# 1. Verify status page is published
docker-compose -f docker-compose-secure.yml exec postgres psql -U postgres -d supercheck -c "SELECT subdomain, status FROM status_pages WHERE subdomain = 'abc123';"

# 2. Check DNS propagation
nslookup abc123.demo.supercheck.io

# 3. Verify wildcard CNAME is correct
nslookup random123.demo.supercheck.io
# Should resolve to your server IP through Cloudflare

# 4. Check middleware logs
docker-compose -f docker-compose-secure.yml logs -f app | grep "subdomain routing"

# 5. Test direct rewrite URL
curl https://demo.supercheck.io/status-pages/YOUR_STATUS_PAGE_ID/public
```

### Error: Database Query Timeout

**Symptoms**: Middleware returns 503 error, logs show "Database query timeout"

**Causes**:
1. Database is slow or overloaded
2. Missing index on `subdomain` column
3. Network issues between app and database

**Solutions**:
```bash
# 1. Check database performance
docker-compose -f docker-compose-secure.yml exec postgres psql -U postgres -d supercheck -c "EXPLAIN ANALYZE SELECT id, status FROM status_pages WHERE subdomain = 'abc123' LIMIT 1;"

# 2. Create index if missing
docker-compose -f docker-compose-secure.yml exec postgres psql -U postgres -d supercheck -c "CREATE INDEX IF NOT EXISTS idx_status_pages_subdomain ON status_pages(subdomain);"

# 3. Check database logs
docker-compose -f docker-compose-secure.yml logs -f postgres | grep -E "ERROR|FATAL|slow"

# 4. Restart database
docker-compose -f docker-compose-secure.yml restart postgres

# 5. Clear middleware cache (restart app)
docker-compose -f docker-compose-secure.yml restart app
```

### Error: Subdomain Cache Issues

**Symptoms**: Updated status page doesn't reflect immediately

**Causes**:
1. Middleware cache is stale (5 minute TTL)
2. Cloudflare cache is stale

**Solutions**:
```bash
# 1. Clear middleware cache (restart app)
docker-compose -f docker-compose-secure.yml restart app

# 2. Purge Cloudflare cache
# Go to Cloudflare Dashboard → Caching → Purge Cache
# Select "Custom Purge" and enter: https://abc123.demo.supercheck.io/*

# 3. Wait 5 minutes for cache to expire naturally
```

### Error: SSL Certificate Errors

**Cloudflare:**
- Ensure "Proxied" (orange cloud) is enabled for both records
- Check SSL/TLS mode is "Full" or "Full (strict)"
- Verify SSL certificate is active in SSL/TLS → Edge Certificates

**Self-hosted:**
- Verify wildcard certificate is installed
- Check certificate includes `*.supercheck.io`
- Restart web server after installing certificate

### Error: Reserved Subdomain Conflict

If a user tries to create a status page with a reserved subdomain, the system will generate a new UUID subdomain automatically.

Reserved subdomains return to normal routing (e.g., `app.supercheck.io` → application dashboard).

### Common Cloudflare Issues

#### Issue: Wildcard CNAME pointing to apex domain

**Incorrect:**
```
CNAME   *   supercheck.io
```

**Correct:**
```
CNAME   *   demo.supercheck.io
```

**Fix**: Update the wildcard CNAME to point to your full application domain.

#### Issue: SSL/TLS mode is "Flexible"

**Symptom**: Redirect loop or SSL errors

**Fix**: Change SSL/TLS mode to "Full" or "Full (strict)" in Cloudflare Dashboard.

## Security Considerations

1. **Published Pages Only**: Only pages with `status = "published"` are publicly accessible
2. **Database Lookup**: Every subdomain request queries the database (consider caching for high traffic)
3. **Rate Limiting**: Consider implementing rate limiting for public status pages
4. **DDoS Protection**: Use Cloudflare's DDoS protection if available

## Monitoring

### Logs

Check middleware logs for subdomain routing:
```bash
# Docker
docker logs supercheck-app | grep "subdomain routing"

# Traditional
tail -f /var/log/supercheck/app.log | grep "subdomain"
```

### Performance

Monitor database query performance for subdomain lookups:
```sql
-- Check subdomain lookup performance
EXPLAIN ANALYZE
SELECT id, status
FROM status_pages
WHERE subdomain = 'abc123def'
LIMIT 1;
```

Ensure index exists:
```sql
CREATE INDEX IF NOT EXISTS idx_status_pages_subdomain
ON status_pages(subdomain);
```

## Advanced Configuration

### Custom Domains (Future)

For custom domains (e.g., `status.company.com`), users need to:

1. Add CNAME record pointing to their subdomain:
   ```
   Type: CNAME
   Name: status
   Value: abc123def.supercheck.io
   ```

2. Verify ownership in the dashboard
3. System updates `custom_domain` field in database

### CDN Integration

For improved performance, configure CDN caching:

**Cloudflare Page Rules:**
```
URL: *.supercheck.io/*
Cache Level: Standard
Browser Cache TTL: 4 hours
Edge Cache TTL: 1 hour
```

**Caching Strategy:**
- Cache static assets (CSS, JS, images)
- Cache HTML for 5 minutes (allow quick incident updates)
- Bypass cache for authenticated requests

## Support

For issues with subdomain routing:

1. Check documentation: `/docs/`
2. Review middleware logs
3. Verify DNS configuration
4. Test with curl:
   ```bash
   curl -H "Host: abc123.supercheck.io" http://localhost:3000
   ```

## Summary

✅ **Prerequisites:**
- Wildcard DNS record (`*.supercheck.io`)
- SSL certificate (Cloudflare provides automatically)
- Database connection configured

✅ **Configuration:**
- Middleware automatically handles routing
- No additional setup needed in application code

✅ **Publishing:**
1. Create status page
2. Add components and incidents
3. Click "Publish" button
4. Access at `[subdomain].supercheck.io`

That's it! Subdomain routing is now fully configured. 🚀
