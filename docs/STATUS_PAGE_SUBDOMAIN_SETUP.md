# Status Page Subdomain Setup Guide

This guide explains how to configure wildcard subdomain routing for status pages in production.

## Overview

Status pages are accessible via unique subdomains (e.g., `abc123def.supercheck.io`). This guide covers the DNS and infrastructure setup required for subdomain routing.

## DNS Configuration

### Cloudflare (Recommended)

1. **Add Wildcard DNS Record**
   ```
   Type: CNAME
   Name: *
   Content: supercheck.io (or your server IP)
   Proxy status: Proxied (orange cloud)
   TTL: Auto
   ```

2. **SSL/TLS Configuration**
   - Navigate to SSL/TLS > Edge Certificates
   - Ensure "Universal SSL" is enabled
   - Cloudflare automatically provides wildcard SSL certificates (`*.supercheck.io`)

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

## Application Configuration

### Environment Variables

Ensure the following environment variables are set:

```env
# Database connection (required for subdomain lookup)
DATABASE_URL=postgresql://user:password@host:5432/database

# Application URL (base domain)
NEXT_PUBLIC_APP_URL=https://app.supercheck.io
```

### Middleware

The subdomain routing middleware is automatically configured in `/src/middleware/middleware.ts`.

**How it works:**
1. Extracts subdomain from hostname
2. Checks if subdomain is reserved
3. Looks up status page by subdomain in database
4. Rewrites request to `/status-pages/[id]/public` route
5. Returns 404 for non-existent or unpublished pages

## Deployment

### Docker / Docker Swarm

No special configuration needed. The middleware handles all routing.

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

### Status Page Shows 404

**Possible causes:**
1. Status page is not published (status = "draft")
2. Subdomain doesn't exist in database
3. DNS not propagated yet (wait 5-10 minutes)

**Solutions:**
- Click "Publish" button in status page dashboard
- Verify subdomain in database: `SELECT subdomain, status FROM status_pages;`
- Check DNS propagation: https://www.whatsmydns.net

### SSL Certificate Errors

**Cloudflare:**
- Ensure "Proxied" (orange cloud) is enabled
- Check SSL/TLS mode is "Full" or "Full (strict)"

**Self-hosted:**
- Verify wildcard certificate is installed
- Check certificate includes `*.supercheck.io`
- Restart web server after installing certificate

### Reserved Subdomain Conflict

If a user tries to create a status page with a reserved subdomain, the system will generate a new UUID subdomain automatically.

Reserved subdomains return to normal routing (e.g., `app.supercheck.io` → application dashboard).

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
