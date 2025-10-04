# External Services Setup Guide

This guide helps you deploy Supercheck using external managed services for PostgreSQL, Redis, and S3 storage instead of running them locally with Docker.

## Overview

The `docker-compose-external.yml` configuration allows you to deploy only the Supercheck app and worker services while connecting to external managed services. This is ideal for:

- **Production deployments** requiring high availability
- **Scalable infrastructure** with managed services
- **Cost optimization** using cloud-native solutions
- **Simplified operations** with managed backups and updates

## Architecture

```
┌─────────────────────────────────────────────┐
│           External Services                 │
│                                             │
│  ┌─────────────┐  ┌──────────┐  ┌────────┐ │
│  │ PostgreSQL  │  │  Redis   │  │   S3   │ │
│  │  (Managed)  │  │ (Managed)│  │(Managed)│ │
│  └──────▲──────┘  └────▲─────┘  └───▲────┘ │
│         │              │             │      │
└─────────┼──────────────┼─────────────┼──────┘
          │              │             │
          │              │             │
┌─────────┼──────────────┼─────────────┼──────┐
│         │              │             │      │
│  ┌──────▼──────┐  ┌────▼─────────────▼────┐ │
│  │     App     │  │      Workers (4x)     │ │
│  │  (Next.js)  │  │      (NestJS)         │ │
│  └─────────────┘  └───────────────────────┘ │
│                                             │
│         Supercheck Services                 │
│         (docker-compose-external.yml)       │
└─────────────────────────────────────────────┘
```

## Prerequisites

Before starting, ensure you have:

1. External PostgreSQL database (v16+ recommended)
2. External Redis instance (v7+ recommended)
3. External S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces, etc.)
4. Domain name with DNS configured
5. SSL certificate management (handled by Traefik)

## Service Provider Options

### PostgreSQL

**Recommended Providers:**

- **AWS RDS PostgreSQL** - Fully managed, highly available
- **DigitalOcean Managed Databases** - Simple, cost-effective
- **Supabase** - Developer-friendly with generous free tier
- **Neon** - Serverless PostgreSQL with branching
- **Google Cloud SQL** - Enterprise-grade managed PostgreSQL

**Minimum Requirements:**
- PostgreSQL version: 18+ (recommended for UUIDv7 support and performance improvements)
- Memory: 2GB minimum, 4GB recommended
- Storage: 20GB minimum
- Connections: 100 minimum

### Redis

**Recommended Providers:**

- **Redis Cloud (Redis Labs)** - Official managed Redis
- **AWS ElastiCache** - Highly available, scalable
- **DigitalOcean Managed Redis** - Simple pricing
- **Upstash** - Serverless Redis with per-request pricing
- **Google Cloud Memorystore** - Enterprise Redis

**Minimum Requirements:**
- Redis version: 7+
- Memory: 512MB minimum, 1GB recommended
- Max connections: 100 minimum
- Eviction policy: `allkeys-lru` recommended

### S3 Storage

**Recommended Providers:**

- **AWS S3** - Industry standard, highly reliable
- **DigitalOcean Spaces** - S3-compatible, predictable pricing
- **Cloudflare R2** - No egress fees
- **Backblaze B2** - Cost-effective alternative
- **MinIO (Self-hosted)** - Open source S3-compatible

**Minimum Requirements:**
- Two buckets: `playwright-job-artifacts`, `playwright-test-artifacts`
- Permissions: PutObject, GetObject, DeleteObject
- Lifecycle policies for artifact retention

## Step-by-Step Setup

### 1. Set Up External PostgreSQL

#### Create Database

```sql
-- Connect to your PostgreSQL instance and run:
CREATE DATABASE supercheck;
CREATE USER supercheck_user WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE supercheck TO supercheck_user;

-- Connect to supercheck database
\c supercheck

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO supercheck_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supercheck_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supercheck_user;
```

#### Configure Connection

Update `.env`:

```env
DB_HOST=your-postgres-host.example.com
DB_PORT=5432
DB_USER=supercheck_user
DB_PASSWORD=your-secure-password
DB_NAME=supercheck
DATABASE_URL=postgresql://supercheck_user:your-secure-password@your-postgres-host.example.com:5432/supercheck
```

#### Provider-Specific Examples

**AWS RDS:**
```env
DB_HOST=supercheck-db.xxxxx.us-east-1.rds.amazonaws.com
DATABASE_URL=postgresql://supercheck_user:password@supercheck-db.xxxxx.us-east-1.rds.amazonaws.com:5432/supercheck
```

**Supabase:**
```env
DB_HOST=db.xxxxxxxxxxxx.supabase.co
DB_PORT=5432
DATABASE_URL=postgresql://postgres:password@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

**Neon:**
```env
DB_HOST=ep-xxxx-xxxx.us-east-2.aws.neon.tech
DATABASE_URL=postgresql://user:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/supercheck
```

### 2. Set Up External Redis

#### Configure Redis Instance

For Redis Cloud/ElastiCache/Upstash:

1. Enable password authentication (REQUIRED)
2. Set maxmemory policy to `allkeys-lru`
3. Configure maxmemory to at least 512MB
4. Disable persistence (for performance)
5. Enable TLS/SSL for production

#### Update Configuration

Update `.env`:

```env
REDIS_HOST=your-redis-host.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_URL=redis://:your-redis-password@your-redis-host.example.com:6379
```

#### Provider-Specific Examples

**Redis Cloud:**
```env
REDIS_HOST=redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_URL=redis://:password@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
```

**Upstash (with TLS):**
```env
REDIS_HOST=usxx-xxxxx.upstash.io
REDIS_PORT=6379
REDIS_URL=rediss://:password@usxx-xxxxx.upstash.io:6379
```

**AWS ElastiCache:**
```env
REDIS_HOST=supercheck-redis.xxxxx.use1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_URL=redis://:password@supercheck-redis.xxxxx.use1.cache.amazonaws.com:6379
```

### 3. Set Up External S3 Storage

#### Create Buckets

Create two buckets:
- `playwright-job-artifacts` (or your preferred name)
- `playwright-test-artifacts` (or your preferred name)

#### Configure IAM/Access Policy

**AWS S3 IAM Policy Example:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::playwright-job-artifacts/*",
        "arn:aws:s3:::playwright-test-artifacts/*",
        "arn:aws:s3:::playwright-job-artifacts",
        "arn:aws:s3:::playwright-test-artifacts"
      ]
    }
  ]
}
```

#### Update Configuration

Update `.env`:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_ENDPOINT=https://s3.amazonaws.com  # Or your provider endpoint
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_TEST_BUCKET_NAME=playwright-test-artifacts
S3_FORCE_PATH_STYLE=false  # false for AWS, true for others
```

#### Provider-Specific Examples

**AWS S3:**
```env
AWS_REGION=us-east-1
S3_ENDPOINT=  # Leave empty or use https://s3.amazonaws.com
S3_FORCE_PATH_STYLE=false
```

**DigitalOcean Spaces:**
```env
AWS_REGION=nyc3
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_FORCE_PATH_STYLE=true
```

**Cloudflare R2:**
```env
AWS_REGION=auto
S3_ENDPOINT=https://xxxxxxxxxxxxx.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=true
```

**Backblaze B2:**
```env
AWS_REGION=us-west-000
S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
S3_FORCE_PATH_STYLE=true
```

### 4. Configure Environment Variables

Copy the external services example file:

```bash
cp .env.external.example .env
```

Edit `.env` with your external service credentials. See `.env.external.example` for all required variables.

**Critical Variables to Set:**
- All database connection strings
- Redis connection details
- S3/storage credentials
- BETTER_AUTH_SECRET (generate with: `openssl rand -hex 32`)
- CREDENTIAL_ENCRYPTION_KEY (generate with: `openssl rand -hex 32`)
- VARIABLES_ENCRYPTION_KEY (generate with: `openssl rand -hex 32`)
- SMTP credentials for notifications
- APP_DOMAIN and ACME_EMAIL for SSL certificates

### 5. Deploy Services

Deploy using docker-compose-external.yml:

```bash
# Start services
docker-compose -f docker-compose-external.yml up -d

# View logs
docker-compose -f docker-compose-external.yml logs -f

# Check service health
docker-compose -f docker-compose-external.yml ps

# Scale workers if needed
docker-compose -f docker-compose-external.yml up -d --scale worker=6
```

### 6. Verify Deployment

1. **Database Migration**: Check app logs for successful migration
   ```bash
   docker-compose -f docker-compose-external.yml logs app | grep -i migration
   ```

2. **Redis Connection**: Check worker logs for queue connection
   ```bash
   docker-compose -f docker-compose-external.yml logs worker | grep -i redis
   ```

3. **S3 Connection**: Check that buckets are accessible
   ```bash
   docker-compose -f docker-compose-external.yml logs app | grep -i s3
   ```

4. **HTTPS Setup**: Wait for Let's Encrypt certificate (1-2 minutes)
   ```bash
   docker-compose -f docker-compose-external.yml logs traefik | grep -i certificate
   ```

5. **Access Application**: Visit https://your-domain.com

## Monitoring and Maintenance

### Health Checks

Monitor external services:

```bash
# PostgreSQL
psql $DATABASE_URL -c "SELECT version();"

# Redis
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping

# S3 (using AWS CLI)
aws s3 ls s3://$S3_JOB_BUCKET_NAME --endpoint-url $S3_ENDPOINT
```

### Backup Strategy

1. **PostgreSQL**: Enable automated backups (provider-specific)
2. **Redis**: Configure AOF or RDB snapshots if persistence needed
3. **S3**: Enable versioning and lifecycle policies

### Scaling

Scale worker instances based on load:

```bash
# Scale to 8 workers
docker-compose -f docker-compose-external.yml up -d --scale worker=8

# Scale to 2 workers (reduce load)
docker-compose -f docker-compose-external.yml up -d --scale worker=2
```

## Cost Optimization Tips

1. **PostgreSQL**:
   - Use connection pooling (PgBouncer)
   - Right-size instance based on usage
   - Enable autoscaling if available
   - Consider serverless options (Neon, Supabase)

2. **Redis**:
   - Use eviction policies to manage memory
   - Consider serverless Redis (Upstash) for variable workloads
   - Disable persistence if not needed

3. **S3**:
   - Set up lifecycle policies to delete old artifacts
   - Use intelligent tiering for infrequently accessed data
   - Consider providers with no egress fees (Cloudflare R2)
   - Enable compression for stored artifacts

## Troubleshooting

### Connection Issues

**Database connection failed:**
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check firewall rules
# Ensure app IP is whitelisted in database security settings
```

**Redis connection timeout:**
```bash
# Test connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping

# Check if password is required
# Verify REDIS_URL format matches provider requirements
```

**S3 access denied:**
```bash
# Test credentials
aws s3 ls s3://$S3_JOB_BUCKET_NAME --endpoint-url $S3_ENDPOINT

# Verify IAM policy includes required permissions
# Check bucket CORS settings if browser access needed
```

### Performance Issues

**Slow database queries:**
- Enable connection pooling
- Add database indexes (check migration files)
- Monitor query performance with provider tools
- Consider read replicas for high read workloads

**Redis memory issues:**
- Monitor memory usage with `INFO memory`
- Adjust maxmemory and eviction policy
- Consider upgrading instance size

**S3 upload/download slow:**
- Check network latency to S3 endpoint
- Consider using same region for app and S3
- Enable multipart uploads for large files

## Security Best Practices

1. **Network Security**:
   - Enable SSL/TLS for all connections
   - Use VPC/private networks where possible
   - Restrict access with firewall rules
   - Use jump hosts for database access

2. **Credentials Management**:
   - Rotate credentials regularly
   - Use IAM roles instead of access keys (AWS)
   - Store secrets in environment variables or secret managers
   - Never commit credentials to version control

3. **Access Control**:
   - Follow principle of least privilege
   - Create dedicated service accounts
   - Enable audit logging
   - Monitor for suspicious activity

4. **Encryption**:
   - Enable encryption at rest (all providers)
   - Enable encryption in transit (TLS/SSL)
   - Use encrypted backups
   - Rotate encryption keys periodically

## Migration from Local to External Services

To migrate from local docker-compose to external services:

1. **Backup Local Data**:
   ```bash
   # Backup PostgreSQL
   docker-compose exec postgres pg_dump -U postgres supercheck > backup.sql

   # Backup Redis (if needed)
   docker-compose exec redis redis-cli --rdb /data/dump.rdb
   ```

2. **Restore to External Services**:
   ```bash
   # Restore PostgreSQL
   psql $DATABASE_URL < backup.sql

   # Migrate S3 data (if any)
   aws s3 sync ./local-artifacts s3://$S3_JOB_BUCKET_NAME
   ```

3. **Update Configuration**:
   ```bash
   cp .env.external.example .env
   # Edit .env with external service credentials
   ```

4. **Deploy**:
   ```bash
   docker-compose -f docker-compose-external.yml up -d
   ```

## Support

For issues or questions:

- Check logs: `docker-compose -f docker-compose-external.yml logs`
- Review [SECURITY.md](./SECURITY.md) for security configuration
- Consult provider documentation for service-specific issues
- Open an issue on GitHub for application-related problems
