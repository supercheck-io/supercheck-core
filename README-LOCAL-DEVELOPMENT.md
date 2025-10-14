# Local Development Guide

This guide explains how to set up local development for Supercheck with subdomain routing support.

## Quick Start

### 1. Start the Local Development Stack

```bash
# Start all services with local configuration
docker-compose -f docker-compose-local.yml up -d

# Watch logs (optional)
docker-compose -f docker-compose-local.yml logs -f
```

That's it! No additional configuration needed. Modern browsers automatically resolve `*.localhost` subdomains to `127.0.0.1`.

### 2. Access the Application

```bash
# Main application
open http://localhost

# Traefik dashboard (for debugging)
open http://localhost:8080
```

### 3. Create and Test Status Pages

1. Navigate to `http://localhost` and sign in
2. Create a new status page with a custom subdomain (e.g., `demo`)
3. Access it at `http://demo.localhost`

## Configuration

### Local vs Production

| Feature               | Production                                 | Local Development                 |
| --------------------- | ------------------------------------------ | --------------------------------- |
| **Domain**            | `demo.supercheck.io` and `*.supercheck.io` | `localhost` and `*.localhost`     |
| **SSL/TLS**           | HTTPS via Cloudflare                       | HTTP only (simpler for local dev) |
| **Traefik Dashboard** | Disabled (security)                        | Enabled on port 8080              |
| **Logging**           | INFO level                                 | DEBUG level                       |
| **Worker Replicas**   | 3                                          | 1 (resource optimization)         |
| **Images**            | Pre-built from GHCR                        | Built locally from source         |
| **Environment**       | Production                                 | Development                       |

### Key Configuration

The local setup uses this Traefik router rule:

```yaml
- "traefik.http.routers.app.rule=Host(`localhost`) || HostRegexp(`{subdomain:[a-z0-9-]+}\\.localhost`)"
```

This automatically handles:

- `localhost` - Main application
- `demo.localhost` - Demo status page
- `mycompany.localhost` - Custom status page
- Any subdomain following the pattern `[a-z0-9-]+.localhost`

## How Subdomains Work Locally

**No configuration needed!** Modern browsers and operating systems automatically resolve `*.localhost` to `127.0.0.1`:

✅ **Works automatically:**

- Chrome, Firefox, Safari, Edge (all modern browsers)
- macOS, Linux, Windows 10+
- No `/etc/hosts` editing required
- No DNS server setup needed

Example:

```bash
# These all resolve to 127.0.0.1 automatically
curl http://localhost
curl http://demo.localhost
curl http://test.localhost
curl http://anything.localhost
```

## Testing Status Page Functionality

### 1. Create a Status Page

1. Navigate to `http://localhost`
2. Sign in to your account
3. Go to **Status Pages** → **Create Status Page**
4. Set subdomain to `demo` (or any name)
5. Configure components and publish

### 2. Access the Status Page

```bash
# Access via subdomain
open http://demo.localhost

# Or test with curl
curl http://demo.localhost
```

### 3. Test Different Subdomains

Create multiple status pages with different subdomains:

- `company-a.localhost`
- `service-b.localhost`
- `test123.localhost`

All will work automatically without configuration!

## Available Services

| Service           | URL                            | Purpose                       |
| ----------------- | ------------------------------ | ----------------------------- |
| Main App          | http://localhost               | Main application interface    |
| Traefik Dashboard | http://localhost:8080          | View routes and health checks |
| Status Pages      | http://`{subdomain}`.localhost | Public status pages           |
| PostgreSQL        | localhost:5432 (internal only) | Database                      |
| Redis             | localhost:6379 (internal only) | Job queue                     |
| MinIO             | localhost:9000 (internal only) | S3-compatible storage         |

## Troubleshooting

### Application Not Loading

```bash
# Check if containers are running
docker-compose -f docker-compose-local.yml ps

# Check app logs
docker-compose -f docker-compose-local.yml logs app

# Check Traefik routing
open http://localhost:8080
```

### Subdomain Not Working

```bash
# Verify subdomain resolves to 127.0.0.1
ping demo.localhost

# Check if status page exists and is published
docker-compose -f docker-compose-local.yml exec postgres psql -U postgres -d supercheck -c "SELECT subdomain, status FROM status_pages;"

# Check app middleware logs
docker-compose -f docker-compose-local.yml logs app | grep -i subdomain
```

### Traefik Dashboard Not Accessible

```bash
# Check Traefik logs
docker-compose -f docker-compose-local.yml logs traefik

# Verify Traefik is running
docker-compose -f docker-compose-local.yml ps traefik

# Should be accessible at http://localhost:8080
```

### Database Connection Issues

```bash
# Check postgres is healthy
docker-compose -f docker-compose-local.yml ps postgres

# Test database connection
docker-compose -f docker-compose-local.yml exec postgres psql -U postgres -d supercheck -c "SELECT 1;"
```

### Worker Not Processing Jobs

```bash
# Check worker logs
docker-compose -f docker-compose-local.yml logs worker

# Check Redis connection
docker-compose -f docker-compose-local.yml exec redis redis-cli -a supersecure-redis-password-change-this ping
```

## Development Workflow

### Daily Development

```bash
# Start services
docker-compose -f docker-compose-local.yml up -d

# Watch logs (optional)
docker-compose -f docker-compose-local.yml logs -f app worker

# Make code changes (app will rebuild automatically)

# Stop services when done
docker-compose -f docker-compose-local.yml down
```

### Rebuilding After Code Changes

The local setup uses `build:` instead of `image:`, so it builds from source:

```bash
# Rebuild and restart services
docker-compose -f docker-compose-local.yml up -d --build

# Or rebuild specific service
docker-compose -f docker-compose-local.yml build app
docker-compose -f docker-compose-local.yml up -d app
```

### Database Access

```bash
# Access PostgreSQL
docker-compose -f docker-compose-local.yml exec postgres psql -U postgres -d supercheck

# Run migrations manually (if needed)
docker-compose -f docker-compose-local.yml exec app npm run db:migrate

# Reset database (WARNING: Deletes all data)
docker-compose -f docker-compose-local.yml down -v
docker-compose -f docker-compose-local.yml up -d
```

### Viewing Logs

```bash
# All services
docker-compose -f docker-compose-local.yml logs -f

# Specific service
docker-compose -f docker-compose-local.yml logs -f app
docker-compose -f docker-compose-local.yml logs -f worker
docker-compose -f docker-compose-local.yml logs -f traefik

# Last N lines
docker-compose -f docker-compose-local.yml logs --tail 100 app
```

## Cleanup

```bash
# Stop services (keeps data)
docker-compose -f docker-compose-local.yml down

# Stop and remove volumes (deletes all data)
docker-compose -f docker-compose-local.yml down -v

# Remove dangling images
docker image prune -f
```

### Reverting Hosts File

If you previously modified your `/etc/hosts` file for local development and want to revert it:

```bash
# Run the revert script
./scripts/revert-hosts.sh
```

This will:

- Remove all Supercheck local development entries from `/etc/hosts`
- Create a backup at `/etc/hosts.backup`
- Restore your hosts file to its original state

**Note**: Modern browsers don't require hosts file modification for `*.localhost` subdomains, so this script is only needed if you manually modified your hosts file.

## Environment Variables

The local setup uses environment variables from:

1. `docker-compose-local.yml` (defaults)
2. `.env.local` file (optional overrides)

Create `.env.local` to override defaults:

```bash
# Example .env.local
OPENAI_API_KEY=sk-your-actual-key
SMTP_HOST=smtp.gmail.com
SMTP_PASSWORD=your-gmail-app-password
```

## Security Notes

- **HTTP Only**: Local development uses HTTP (not HTTPS) for simplicity
- **Open Dashboard**: Traefik dashboard is accessible without authentication
- **Default Secrets**: Default passwords/secrets are fine for local development
- **No Firewall**: Services are accessible from localhost only
- **Development Mode**: `NODE_ENV=development` enables additional logging

## Differences from Production

| Aspect            | Local Development  | Production                 |
| ----------------- | ------------------ | -------------------------- |
| Builds            | Built from source  | Pre-built images from GHCR |
| SSL               | HTTP only          | HTTPS via Cloudflare       |
| Secrets           | Hardcoded defaults | Environment variables      |
| Traefik Dashboard | Enabled            | Disabled                   |
| Logging           | DEBUG level        | INFO level                 |
| Workers           | 1 replica          | 3 replicas                 |
| Data Persistence  | Docker volumes     | Persistent storage         |

## Next Steps

Once local development is working:

1. Test creating and configuring status pages
2. Verify subdomain routing works correctly
3. Test job execution and monitoring features
4. Make your code changes
5. Test thoroughly locally before deploying
6. Deploy to production using `docker-compose-secure.yml`

## Optional: Legacy Subdomain Scripts

The `scripts/setup-localhost-subdomains.sh` script is **no longer needed** for modern browsers. It was created for older systems that didn't automatically resolve `*.localhost`.

You can safely ignore these scripts:

- `scripts/setup-localhost-subdomains.sh` (legacy)
- `scripts/cleanup-localhost-subdomains.sh` (legacy)

They're kept for reference but aren't required for local development.
