# Local Development Setup - Status Pages

## Quick Start

```bash
# Start Docker services
docker-compose -f docker-compose-local.yml up -d

# Wait ~2 minutes for services to be healthy
docker-compose -f docker-compose-local.yml ps

# Open browser
open http://localhost:3000
```

## Access Points

### Main Application
- **URL**: http://localhost:3000
- **Auth**: Required (redirects to /sign-in)
- **Purpose**: Dashboard, create status pages, manage system

### Status Pages
- **URL**: http://localhost:3000/status/{subdomain}
- **Auth**: Not required (public)
- **Examples**:
  - http://localhost:3000/status/test123
  - http://localhost:3000/status/57930b7b15c14880a0bb9a3e79d6b2c3

## Architecture

### Middleware (`/app/middleware.ts`)

**Development (localhost:3000)**:
- All requests pass through
- Auth checks for main routes
- Public `/status/*` routes skip auth
- No subdomain rewriting (not needed)

**Production** (subdomain routing):
- Detects subdomains (e.g., `abc123.supercheck.io`)
- Rewrites to `/status/abc123`
- Adds security headers
- Cloudflare handles specific subdomains (www, api, etc.)

### Key Features

✅ **No database queries in middleware** - Follows Next.js best practices
✅ **Better Auth integration** - Session checking via `getCookieCache()`
✅ **Public status pages** - No authentication required
✅ **API key validation** - Format checked in middleware, details in handlers
✅ **Security headers** - Added to all responses
✅ **Production-ready** - Ready for subdomain routing deployment

## Database & Services

**Running Services**:
- **App**: Next.js on port 3000
- **Database**: PostgreSQL
- **Cache**: Redis
- **Storage**: MinIO (S3-compatible)
- **Worker**: NestJS for test execution

**Volumes**:
- `postgres-data`: Database persistence
- `redis-data`: Cache persistence
- `minio-data`: S3 storage
- `worker-*`: Playwright reports

## Testing Locally

### Test Main App Authentication
```bash
# Should redirect to /sign-in
curl -I http://localhost:3000

# Should work after sign-in
curl -I http://localhost:3000/sign-in
```

### Test Status Page Access
```bash
# Should work without auth (200 or 404)
curl -I http://localhost:3000/status/test123

# With real UUID from database
curl http://localhost:3000/status/57930b7b15c14880a0bb9a3e79d6b2c3
```

### View Logs
```bash
# App logs
docker-compose -f docker-compose-local.yml logs -f app

# Worker logs
docker-compose -f docker-compose-local.yml logs -f worker

# Database logs
docker-compose -f docker-compose-local.yml logs -f postgres
```

## Stop & Cleanup

```bash
# Stop all services
docker-compose -f docker-compose-local.yml down

# Stop and remove all volumes (reset database)
docker-compose -f docker-compose-local.yml down -v
```

## Environment Variables

Key settings in `docker-compose-local.yml`:

- `NEXT_PUBLIC_APP_URL=http://localhost:3000` - Main app URL
- `BETTER_AUTH_URL=http://localhost:3000` - Auth endpoint
- `NODE_ENV=development` - Development mode
- `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supercheck` - DB connection

## Production Deployment

For production with subdomain routing:

1. **Update NEXT_PUBLIC_APP_URL** to production domain (e.g., `https://app.supercheck.io`)
2. **Configure Cloudflare** for specific subdomain routing
3. **Deploy middleware** unchanged - automatically handles subdomain rewriting
4. **Set up SSL/TLS** for HTTPS

The middleware automatically detects and rewrites subdomain requests to `/status/{subdomain}` pages.

## Troubleshooting

**Port 3000 already in use?**
```bash
# Find process using port 3000
lsof -i :3000

# Change port in docker-compose-local.yml
ports:
  - "3001:3000"  # Change to 3001 or another free port
```

**Database errors?**
```bash
# Reset database
docker-compose -f docker-compose-local.yml down -v
docker-compose -f docker-compose-local.yml up -d
```

**Services won't start?**
```bash
# Check logs
docker-compose -f docker-compose-local.yml logs

# Force rebuild
docker-compose -f docker-compose-local.yml up -d --build
```

## Notes

- No Traefik needed for local development (removed for simplicity)
- No DNS configuration required (direct localhost:3000 access)
- Status pages accessible via `/status/{subdomain}` path
- Middleware supports both localhost and production subdomain routing
