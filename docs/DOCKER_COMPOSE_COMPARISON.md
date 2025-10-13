# Docker Compose Files Comparison

## Overview

The project has **three** Docker Compose configurations for different deployment scenarios:

1. **`docker-compose.yml`** - Development/Local deployment with all services
2. **`docker-compose-secure.yml`** - Production deployment with HTTPS and all services
3. **`docker-compose-external.yml`** - Production deployment with external managed services (NEW)

## Quick Comparison

| Feature              | docker-compose.yml  | docker-compose-secure.yml | docker-compose-external.yml        |
| -------------------- | ------------------- | ------------------------- | ---------------------------------- |
| **Use Case**         | Development/Testing | Production (Self-hosted)  | Production (Cloud-native)          |
| **HTTPS/SSL**        | ❌ No               | ✅ Yes (Let's Encrypt)    | ✅ Yes (Let's Encrypt)             |
| **PostgreSQL**       | ✅ Included         | ✅ Included               | ❌ External (RDS, Supabase, etc.)  |
| **Redis**            | ✅ Included         | ✅ Included               | ❌ External (Redis Cloud, etc.)    |
| **S3/MinIO**         | ✅ Included (MinIO) | ✅ Included (MinIO)       | ❌ External (AWS S3, Spaces, etc.) |
| **Traefik**          | ❌ No               | ✅ Yes                    | ✅ Yes                             |
| **Port Exposure**    | 3000 (direct)       | 80, 443 (Traefik)         | 80, 443 (Traefik)                  |
| **Minimum RAM**      | 8GB                 | 8GB                       | 4GB                                |
| **Setup Complexity** | Low                 | Medium                    | High                               |
| **Scalability**      | Low                 | Medium                    | High                               |
| **Maintenance**      | High                | High                      | Low (managed)                      |

## Configuration Details

### 1. docker-compose.yml (Development)

**Services Included:**

- App (Next.js)
- Worker (NestJS) - 4 replicas
- PostgreSQL 16.2
- Redis 8
- MinIO

**URLs:**

- App: `http://localhost:3000`
- No HTTPS

**Environment:**

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
```

**Use When:**

- ✅ Local development
- ✅ Testing
- ✅ Quick setup
- ✅ Self-hosted single-server deployment
- ❌ Not for public production

**Pros:**

- Quick setup
- All services included
- Simple configuration
- No external dependencies

**Cons:**

- No HTTPS
- Limited scalability
- All services on one server
- Manual backups needed

---

### 2. docker-compose-secure.yml (Production - Self-hosted)

**Services Included:**

- Traefik (Reverse Proxy)
- App (Next.js)
- Worker (NestJS) - 4 replicas
- PostgreSQL 16.2
- Redis 8
- MinIO

**URLs:**

- App: `https://${APP_DOMAIN}`
- Auto SSL: Let's Encrypt

**Environment:**

```env
NEXT_PUBLIC_APP_URL=https://demo.supercheck.io
BETTER_AUTH_URL=https://demo.supercheck.io
APP_DOMAIN=demo.supercheck.io
ACME_EMAIL=hello@supercheck.io
```

**Use When:**

- ✅ Production deployment
- ✅ Dedicated server
- ✅ Need HTTPS
- ✅ Self-managed infrastructure
- ✅ Cost-effective production

**Pros:**

- Automatic HTTPS
- Production-ready
- All services included
- HTTP to HTTPS redirect
- Cost-effective

**Cons:**

- Single server limit
- Manual scaling
- Manual backups
- Higher server requirements

---

### 3. docker-compose-external.yml (Production - Cloud-native) 🆕

**Services Included:**

- Traefik (Reverse Proxy)
- App (Next.js)
- Worker (NestJS) - 4 replicas

**External Services Required:**

- PostgreSQL (AWS RDS, Supabase, Neon, DigitalOcean, etc.)
- Redis (Redis Cloud, ElastiCache, Upstash, etc.)
- S3 Storage (AWS S3, DigitalOcean Spaces, Cloudflare R2, etc.)

**URLs:**

- App: `https://${APP_DOMAIN}`
- Auto SSL: Let's Encrypt

**Environment:**

```env
# All external service endpoints must be provided
DATABASE_URL=postgresql://user:pass@external-host:5432/db
REDIS_URL=redis://:password@external-host:6379
S3_ENDPOINT=https://external-s3-endpoint.com
APP_DOMAIN=app.example.com
ACME_EMAIL=admin@example.com
```

**Use When:**

- ✅ Production with managed services
- ✅ Multi-region deployment
- ✅ High availability required
- ✅ Prefer cloud-native architecture
- ✅ Want to scale independently

**Pros:**

- Minimal Docker footprint (4GB RAM vs 8GB)
- Managed backups (provider-handled)
- Better scalability
- Independent service scaling
- Lower maintenance
- Built-in redundancy

**Cons:**

- Requires external service setup
- Monthly service costs
- More complex configuration
- Provider lock-in risk

**Setup Files:**

- Configuration: `.env.external.example`
- Guide: `EXTERNAL_SERVICES_SETUP.md`

---

## Environment Variables

### Common Variables (All Configurations)

All three configurations share these core variables:

```env
# Security (REQUIRED)
BETTER_AUTH_SECRET=your-super-secret-key-change-this-in-production
CREDENTIAL_ENCRYPTION_KEY=your-credential-encryption-key-change-this-in-production
VARIABLES_ENCRYPTION_KEY=your-64-character-encryption-key-for-variable-secrets-change-this-in-prod

# App Config
NEXT_PUBLIC_APP_URL=<varies by config>
BETTER_AUTH_URL=<varies by config>
NODE_ENV=production
RUNNING_CAPACITY=6
QUEUED_CAPACITY=50
TEST_EXECUTION_TIMEOUT_MS=120000
JOB_EXECUTION_TIMEOUT_MS=900000

# Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_RETRIES=1
PLAYWRIGHT_TRACE=on
PLAYWRIGHT_SCREENSHOT=on
PLAYWRIGHT_VIDEO=on
ENABLE_FIREFOX=false
ENABLE_WEBKIT=false
ENABLE_MOBILE=false

# Data Lifecycle Management
MONITOR_CLEANUP_ENABLED=true
MONITOR_CLEANUP_CRON="0 2 * * *"
MONITOR_RETENTION_DAYS=30
JOB_RUNS_CLEANUP_ENABLED=false
PLAYGROUND_CLEANUP_ENABLED=true

# Email/SMTP
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=your-smtp-password-change-this-in-production
SMTP_FROM_EMAIL=notification@example.com

# AI Fix
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=your-openai-api-key-here
AI_TIMEOUT_MS=90000
AI_MAX_RETRIES=2
AI_TEMPERATURE=0.1

# Admin
# Super admin access is now managed through the database
# Use `npm run setup:admin admin@yourcompany.com` to configure super admin users
MAX_PROJECTS_PER_ORG=10
DEFAULT_PROJECT_NAME="Default Project"
```

### Configuration-Specific Variables

#### docker-compose.yml Only

```env
# No additional variables required
# All services use defaults
```

#### docker-compose-secure.yml Only

```env
# Traefik/HTTPS
APP_DOMAIN=demo.supercheck.io
ACME_EMAIL=hello@supercheck.io
```

#### docker-compose-external.yml Only

```env
# External Database (REQUIRED)
DATABASE_URL=postgresql://user:pass@host:5432/db
DB_HOST=external-postgres-host
DB_PORT=5432
DB_USER=db-user
DB_PASSWORD=db-password
DB_NAME=supercheck

# External Redis (REQUIRED)
REDIS_HOST=external-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=redis-password
REDIS_URL=redis://:password@host:6379

# External S3 (REQUIRED)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=access-key
AWS_SECRET_ACCESS_KEY=secret-key
S3_ENDPOINT=https://s3-endpoint
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_TEST_BUCKET_NAME=playwright-test-artifacts
S3_FORCE_PATH_STYLE=true

# Traefik/HTTPS (REQUIRED)
APP_DOMAIN=app.example.com
ACME_EMAIL=admin@example.com
```

## Resource Requirements

### docker-compose.yml

- **CPU:** 4 cores minimum
- **RAM:** 8-10GB
- **Storage:** 50GB
- **Services:** 5 containers + 4 worker replicas

### docker-compose-secure.yml

- **CPU:** 4 cores minimum
- **RAM:** 8-11GB
- **Storage:** 50GB
- **Services:** 6 containers + 4 worker replicas (includes Traefik)

### docker-compose-external.yml

- **CPU:** 2-3 cores minimum
- **RAM:** 4-8GB
- **Storage:** 20GB (app only)
- **Services:** 2 containers + 4 worker replicas
- **External:** PostgreSQL, Redis, S3 (managed separately)

## Deployment Commands

### Development (docker-compose.yml)

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Production Self-hosted (docker-compose-secure.yml)

```bash
# Start with HTTPS
docker-compose -f docker-compose-secure.yml up -d

# Check SSL certificate
docker-compose -f docker-compose-secure.yml logs traefik | grep certificate

# Stop
docker-compose -f docker-compose-secure.yml down
```

### Production Cloud-native (docker-compose-external.yml)

```bash
# Setup environment
cp .env.external.example .env
# Edit .env with external service credentials

# Start
docker-compose -f docker-compose-external.yml up -d

# Scale workers
docker-compose -f docker-compose-external.yml up -d --scale worker=8

# Stop
docker-compose -f docker-compose-external.yml down
```

## Migration Paths

### From docker-compose.yml → docker-compose-secure.yml

1. Set domain environment variables:

   ```bash
   echo "APP_DOMAIN=your-domain.com" >> .env
   echo "ACME_EMAIL=your-email@example.com" >> .env
   ```

2. Update DNS to point to your server

3. Switch:
   ```bash
   docker-compose down
   docker-compose -f docker-compose-secure.yml up -d
   ```

### From docker-compose-secure.yml → docker-compose-external.yml

1. Set up external services (see `EXTERNAL_SERVICES_SETUP.md`)

2. Backup data:

   ```bash
   docker-compose -f docker-compose-secure.yml exec postgres pg_dump -U postgres supercheck > backup.sql
   ```

3. Configure external services:

   ```bash
   cp .env.external.example .env
   # Edit with external credentials
   ```

4. Restore to external PostgreSQL:

   ```bash
   psql $DATABASE_URL < backup.sql
   ```

5. Deploy:
   ```bash
   docker-compose -f docker-compose-secure.yml down
   docker-compose -f docker-compose-external.yml up -d
   ```

## Security Considerations

### docker-compose.yml

- ⚠️ No HTTPS (use reverse proxy or VPN)
- ⚠️ PostgreSQL port exposed (5432)
- ✅ Isolated network
- ⚠️ Development use only

### docker-compose-secure.yml

- ✅ Automatic HTTPS with Let's Encrypt
- ✅ HTTP to HTTPS redirect
- ✅ No exposed database ports
- ✅ Production-ready security
- ✅ Traefik security headers

### docker-compose-external.yml

- ✅ Automatic HTTPS with Let's Encrypt
- ✅ Leverages managed service security
- ✅ Encryption in transit (TLS/SSL)
- ✅ Encryption at rest (provider-managed)
- ✅ Best security practices
- ✅ No database/Redis ports exposed

## Cost Comparison

### docker-compose.yml / docker-compose-secure.yml

- **Server Cost:** $20-80/month (Hetzner, DigitalOcean, etc.)
- **Storage:** Included in server
- **Backups:** Manual or DIY
- **SSL:** Free (Let's Encrypt)
- **Total:** $20-80/month

### docker-compose-external.yml

- **Server Cost:** $10-30/month (smaller server)
- **PostgreSQL:** $15-50/month (managed)
- **Redis:** $10-30/month (managed)
- **S3 Storage:** $5-20/month (1TB)
- **Backups:** Included (managed)
- **SSL:** Free (Let's Encrypt)
- **Total:** $40-130/month

**Trade-off:** Higher cost, but better scalability, availability, and lower maintenance.

## Choosing the Right Configuration

### Use `docker-compose.yml` when:

- ✅ Developing locally
- ✅ Testing features
- ✅ Single-server deployment
- ✅ Internal/private network
- ✅ Budget-constrained

### Use `docker-compose-secure.yml` when:

- ✅ Production deployment needed
- ✅ Have dedicated server
- ✅ Want HTTPS
- ✅ Self-managed infrastructure OK
- ✅ Cost-effective solution

### Use `docker-compose-external.yml` when:

- ✅ Need high availability
- ✅ Want managed services
- ✅ Require scalability
- ✅ Prefer cloud-native
- ✅ Want minimal maintenance
- ✅ Multi-region deployment

## Support Files

- `.env.example` - Default configuration for docker-compose.yml
- `.env.external.example` - Configuration for docker-compose-external.yml
- `EXTERNAL_SERVICES_SETUP.md` - Detailed guide for external services setup
- `SECURITY.md` - Security best practices for all configurations

## Recent Updates (All Files Synchronized)

✅ **All three Docker Compose files now include:**

- Data lifecycle management (monitor cleanup, job runs cleanup, playground cleanup)
- AI Fix feature configuration with advanced settings (timeout, retries, temperature)
- Complete Playwright configuration
- Browser support flags (Firefox, WebKit, Mobile)
- Enhanced security variables (credential encryption)
- RBAC admin settings
- Consistent environment variables across all configurations

All Docker Compose configurations are fully synchronized with the latest features!
