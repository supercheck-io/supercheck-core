# Database Connection Pooling Guide

## Overview

Supercheck uses [postgres-js](https://github.com/porsager/postgres) with Drizzle ORM for database connectivity. Proper connection pooling is **critical** for application performance, stability, and resource management.

## Table of Contents

- [Why Connection Pooling Matters](#why-connection-pooling-matters)
- [Default Configuration](#default-configuration)
- [Configuration Options](#configuration-options)
- [Provider-Specific Best Practices](#provider-specific-best-practices)
- [Troubleshooting](#troubleshooting)
- [Monitoring](#monitoring)

---

## Why Connection Pooling Matters

### The Problem Without Pooling

Without proper connection pooling, each database query creates a new connection, leading to:

- **Performance degradation**: Connection creation is expensive (typically 20-50ms)
- **Resource exhaustion**: Databases have connection limits (usually 100-200)
- **Application crashes**: "Too many connections" errors
- **Increased latency**: Constant connection handshakes

### The Solution: Connection Pooling

Connection pooling maintains a pool of reusable database connections:

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   App/API   │ ───▶ │ Connection   │ ───▶ │  PostgreSQL  │
│  Requests   │      │    Pool      │      │   Database   │
└─────────────┘      └──────────────┘      └──────────────┘
                     │ Conn 1       │
                     │ Conn 2       │
                     │ ...          │
                     │ Conn N       │
                     └──────────────┘
```

**Benefits:**
- ✅ Reuses existing connections (microsecond latency)
- ✅ Limits concurrent connections (prevents database overload)
- ✅ Automatically handles connection lifecycle
- ✅ Recovers from connection failures

---

## Default Configuration

### Current Implementation

Supercheck has been configured with sensible defaults that work for most deployments:

```typescript
// app/src/utils/db.ts and worker services
const client = postgres(connectionString, {
  max: 10,              // Maximum 10 connections per service
  idle_timeout: 30,     // Close idle connections after 30 seconds
  connect_timeout: 10,  // Timeout for new connections after 10 seconds
  max_lifetime: 1800,   // Recycle connections after 30 minutes
});
```

### Environment Variables

Override defaults via environment variables:

```bash
DB_POOL_MAX=10           # Maximum connections (default: 10)
DB_IDLE_TIMEOUT=30       # Idle timeout in seconds (default: 30)
DB_CONNECT_TIMEOUT=10    # Connection timeout in seconds (default: 10)
DB_MAX_LIFETIME=1800     # Connection lifetime in seconds (default: 1800 = 30 min)
```

---

## Configuration Options

### Pool Size (`max`)

**What it controls**: Maximum number of concurrent database connections.

**Recommendations by environment:**

| Environment | Services | Recommended `max` | Reasoning |
|------------|----------|-------------------|-----------|
| **Development** | 1 app + 1 worker | `10` (default) | Sufficient for local testing |
| **Staging** | 2 apps + 2 workers | `15` | Moderate traffic simulation |
| **Production (Small)** | 2 apps + 2 workers | `15-20` | Up to 1000 req/min |
| **Production (Medium)** | 4 apps + 4 workers | `20-25` | 1000-10000 req/min |
| **Production (Large)** | 10+ apps + 10+ workers | `10-15` per instance | High scale, more instances |

**Calculation Formula:**

```
Total DB Connections = (App Instances × App Pool Size) + (Worker Instances × Worker Pool Size)

Must satisfy: Total DB Connections < PostgreSQL max_connections
```

**Example:**
- 2 app instances with `DB_POOL_MAX=20` = 40 connections
- 2 worker instances with `DB_POOL_MAX=20` = 40 connections
- **Total**: 80 connections (safe for PostgreSQL default of 100)

### Idle Timeout (`idle_timeout`)

**What it controls**: How long idle connections remain in the pool before being closed.

**Recommendations:**

| Scenario | Value | Reasoning |
|----------|-------|-----------|
| **High Traffic** | `30-60s` | Keep connections warm for frequent use |
| **Low Traffic** | `10-20s` | Free up database resources quickly |
| **Serverless** | `5-10s` | Minimize connection retention |

**Trade-offs:**
- **Lower values**: Better resource cleanup, more connection churn
- **Higher values**: Better performance, more idle connections

### Connection Timeout (`connect_timeout`)

**What it controls**: Maximum time to wait when establishing a new connection.

**Recommendations:**

| Network Latency | Value | Use Case |
|----------------|-------|----------|
| **Local/Same Region** | `10s` (default) | Low latency networks |
| **Cross-Region** | `15-20s` | Higher latency networks |
| **Unstable Networks** | `20-30s` | Retry tolerance |

### Max Lifetime (`max_lifetime`)

**What it controls**: Maximum age of a connection before it's recycled.

**Recommendations:**

| Scenario | Value | Reasoning |
|----------|-------|-----------|
| **Default** | `1800s` (30 min) | Balanced approach |
| **Load Balanced DB** | `300-600s` (5-10 min) | Distribute connections across replicas |
| **Single DB Instance** | `3600s` (1 hour) | Reduce connection churn |

**Why recycle connections?**
- Prevents stale connections
- Distributes load across database replicas
- Recovers from network issues
- Clears potential memory leaks in long-lived connections

---

## Provider-Specific Best Practices

### Self-Hosted PostgreSQL

**Configuration:**

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30
DB_MAX_LIFETIME=1800
```

**PostgreSQL Settings:**

```sql
-- /etc/postgresql/postgresql.conf
max_connections = 100         # Default, increase if needed
shared_buffers = 256MB        # 25% of RAM
effective_cache_size = 1GB    # 50-75% of RAM
```

**Monitoring:**

```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- Check connection limits
SHOW max_connections;

-- Monitor connection pool usage
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;
```

---

### Neon (Serverless PostgreSQL)

**Special Considerations:**
- ⚠️ **Connection pooling is ESSENTIAL** (serverless cold starts)
- ✅ Neon provides built-in connection pooling via PgBouncer
- ✅ Use pooled connection string for application connections

**Configuration:**

```bash
# Use the POOLED connection string from Neon dashboard
DATABASE_URL=postgresql://user:pass@ep-xxx.pooler.neon.tech/dbname?sslmode=require

# Conservative pool settings for serverless
DB_POOL_MAX=5-10          # Lower per instance (Neon handles pooling)
DB_IDLE_TIMEOUT=10        # Aggressive cleanup
DB_MAX_LIFETIME=300       # Recycle frequently
```

**Connection String Types:**

| Type | Format | Use Case |
|------|--------|----------|
| **Pooled** (Recommended) | `ep-xxx.pooler.neon.tech` | Application connections |
| **Direct** | `ep-xxx.neon.tech` | Migrations, admin tasks |

**Best Practices:**
- ✅ Always use **pooled** connection for app/worker
- ✅ Use **direct** connection only for migrations
- ✅ Enable SSL: `?sslmode=require`
- ✅ Set lower `DB_POOL_MAX` (5-10) - Neon's pooler handles the rest
- ⚠️ Monitor Neon's connection limits in dashboard

**Example Configuration:**

```bash
# For app and worker
DATABASE_URL=postgresql://user:pass@ep-cool-mouse-123456.us-east-2.pooler.neon.tech/supercheck?sslmode=require
DB_POOL_MAX=7
DB_IDLE_TIMEOUT=10
DB_CONNECT_TIMEOUT=15
DB_MAX_LIFETIME=300

# For migrations (use direct connection)
MIGRATION_DATABASE_URL=postgresql://user:pass@ep-cool-mouse-123456.us-east-2.neon.tech/supercheck?sslmode=require
```

---

### Supabase

**Special Considerations:**
- ✅ Supabase provides connection pooling via Supavisor (PgBouncer)
- ✅ Different connection modes available
- ⚠️ Free tier has connection limits (~100 connections)

**Configuration:**

```bash
# Use connection pooling port (6543) instead of direct port (5432)
DATABASE_URL=postgresql://postgres.xxx:[password]@db.xxx.supabase.co:6543/postgres

# Moderate pool settings
DB_POOL_MAX=10-15
DB_IDLE_TIMEOUT=30
DB_CONNECT_TIMEOUT=10
DB_MAX_LIFETIME=600
```

**Connection Modes:**

| Mode | Port | URL Parameter | Use Case |
|------|------|---------------|----------|
| **Session** | 5432 | None | Long-lived connections, migrations |
| **Transaction** | 6543 | `?pgbouncer=true` | Most app queries (recommended) |

**Best Practices:**
- ✅ Use **Transaction mode** (port 6543) for app/worker
- ✅ Use **Session mode** (port 5432) for migrations
- ✅ Monitor connection usage in Supabase dashboard
- ⚠️ Upgrade plan if hitting connection limits

**Example Configuration:**

```bash
# For app and worker (transaction pooling)
DATABASE_URL=postgresql://postgres.refxyz:[PASSWORD]@db.refxyz.supabase.co:6543/postgres?pgbouncer=true
DB_POOL_MAX=12
DB_IDLE_TIMEOUT=20
DB_MAX_LIFETIME=600

# For migrations (session mode)
MIGRATION_DATABASE_URL=postgresql://postgres.refxyz:[PASSWORD]@db.refxyz.supabase.co:5432/postgres
```

---

### PlanetScale

**Important:** PlanetScale is a **MySQL-compatible** database, not PostgreSQL.

**Migration Required:**
- ❌ Supercheck currently uses PostgreSQL with Drizzle ORM
- ❌ PlanetScale uses MySQL 8.0 (Vitess)
- ⚠️ **Not compatible without significant code changes**

**If migrating to PlanetScale:**

1. **Switch to MySQL driver:**
```typescript
// Replace postgres-js with mysql2
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createPool({
  host: 'xxx.planetscale.com',
  username: 'xxx',
  password: 'xxx',
  database: 'xxx',
  ssl: { rejectUnauthorized: true },
  connectionLimit: 10,
});

const db = drizzle(connection);
```

2. **Update schema for MySQL compatibility:**
- Change `uuid` to `varchar(36)` or `char(36)`
- Replace `timestamp with time zone` with `timestamp`
- Update JSONB fields to JSON

**Recommendation:** Stick with PostgreSQL-based providers (Neon, Supabase, Railway) for seamless compatibility.

---

### Railway PostgreSQL

**Special Considerations:**
- ✅ Standard PostgreSQL instance (no special pooling)
- ✅ Direct connection with standard postgres-js pooling
- ✅ Good for small-medium deployments

**Configuration:**

```bash
# Railway provides DATABASE_URL automatically
DATABASE_URL=postgresql://postgres:xxx@containers.railway.app:5432/railway

# Standard pool settings
DB_POOL_MAX=15
DB_IDLE_TIMEOUT=30
DB_CONNECT_TIMEOUT=10
DB_MAX_LIFETIME=1800
```

**Best Practices:**
- ✅ Use Railway's internal network for lower latency
- ✅ Monitor connection usage in Railway metrics
- ✅ Consider upgrading plan for higher connection limits

---

### Vercel Postgres (Powered by Neon)

**Configuration:**

Same as [Neon](#neon-serverless-postgresql) - Vercel Postgres is Neon under the hood.

```bash
# Vercel provides these automatically
POSTGRES_URL=postgresql://user:pass@ep-xxx.pooler.vercel-storage.com/vercel?sslmode=require
POSTGRES_URL_NON_POOLING=postgresql://user:pass@ep-xxx.vercel-storage.com/vercel?sslmode=require

# Use pooling URL for app/worker
DATABASE_URL=${POSTGRES_URL}
DB_POOL_MAX=7
DB_IDLE_TIMEOUT=10
DB_MAX_LIFETIME=300
```

---

### AWS RDS PostgreSQL

**Special Considerations:**
- ✅ Enterprise-grade PostgreSQL
- ✅ Use RDS Proxy for connection pooling (recommended for production)
- ⚠️ Direct connections work but RDS Proxy is better at scale

**Without RDS Proxy (Direct):**

```bash
DATABASE_URL=postgresql://user:pass@mydb.xxx.rds.amazonaws.com:5432/supercheck
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30
DB_MAX_LIFETIME=1800
```

**With RDS Proxy (Recommended):**

```bash
# Use RDS Proxy endpoint
DATABASE_URL=postgresql://user:pass@my-proxy.proxy-xxx.rds.amazonaws.com:5432/supercheck

# Aggressive pooling (RDS Proxy handles connection pooling)
DB_POOL_MAX=5-10
DB_IDLE_TIMEOUT=10
DB_MAX_LIFETIME=300
```

**RDS Configuration:**

```sql
-- Increase max_connections on RDS instance
-- In RDS Parameter Group:
max_connections = 200  -- Depends on instance size (formula: LEAST({DBInstanceClassMemory/9531392}, 5000))
```

**Best Practices:**
- ✅ Use RDS Proxy for production workloads
- ✅ Enable SSL: `?sslmode=require`
- ✅ Use VPC peering for lower latency
- ✅ Monitor with CloudWatch metrics

---

### Google Cloud SQL (PostgreSQL)

**Configuration:**

```bash
# For Cloud Run or external connections
DATABASE_URL=postgresql://user:pass@/supercheck?host=/cloudsql/project:region:instance

# Standard pool settings
DB_POOL_MAX=15
DB_IDLE_TIMEOUT=30
DB_MAX_LIFETIME=1800
```

**With Cloud SQL Proxy:**

```bash
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/supercheck
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30
```

**Best Practices:**
- ✅ Use Cloud SQL Proxy for secure connections
- ✅ Enable connection limits in Cloud SQL instance settings
- ✅ Use private IP when possible

---

### Azure Database for PostgreSQL

**Configuration:**

```bash
DATABASE_URL=postgresql://user@server:pass@server.postgres.database.azure.com:5432/supercheck?sslmode=require
DB_POOL_MAX=15
DB_IDLE_TIMEOUT=30
DB_MAX_LIFETIME=1800
```

**Best Practices:**
- ✅ Always use SSL (`sslmode=require`)
- ✅ Use VNet integration for private connections
- ✅ Monitor with Azure Monitor

---

## Troubleshooting

### "Too Many Connections" Error

**Symptoms:**
```
Error: sorry, too many clients already
Error: remaining connection slots are reserved for non-replication superuser connections
```

**Diagnosis:**

```sql
-- Check current connections
SELECT count(*) as current_connections FROM pg_stat_activity;
SELECT * FROM pg_stat_activity WHERE state = 'active';

-- Check max connections
SHOW max_connections;
```

**Solutions:**

1. **Reduce pool size per instance:**
   ```bash
   DB_POOL_MAX=5  # Lower value
   ```

2. **Increase PostgreSQL max_connections:**
   ```sql
   ALTER SYSTEM SET max_connections = 200;
   -- Restart PostgreSQL
   ```

3. **Use connection pooler (PgBouncer):**
   - Deploy PgBouncer between app and database
   - Reduces database connections by multiplexing

4. **Scale horizontally:**
   - Add read replicas
   - Distribute read queries

---

### Connection Timeout Errors

**Symptoms:**
```
Error: Connection timeout
Error: connect ETIMEDOUT
```

**Solutions:**

1. **Increase connect timeout:**
   ```bash
   DB_CONNECT_TIMEOUT=20
   ```

2. **Check network connectivity:**
   ```bash
   # Test connection
   psql "postgresql://user:pass@host:5432/db"

   # Check firewall rules
   telnet host 5432
   ```

3. **Enable SSL if required:**
   ```bash
   DATABASE_URL=postgresql://...?sslmode=require
   ```

---

### Slow Query Performance

**Diagnosis:**

```sql
-- Find slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- Check for connection pool exhaustion
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
```

**Solutions:**

1. **Increase pool size:**
   ```bash
   DB_POOL_MAX=20
   ```

2. **Optimize queries:**
   - Add indexes
   - Use EXPLAIN ANALYZE
   - Review slow query logs

3. **Enable query logging in development:**
   ```typescript
   // app/src/utils/db.ts
   export const db = drizzle(client, {
     schema,
     logger: true  // Enable in development
   });
   ```

---

### Connection Leaks

**Symptoms:**
- Connections remain idle
- Pool exhaustion over time
- Application slowdown

**Diagnosis:**

```sql
-- Check idle connections
SELECT * FROM pg_stat_activity WHERE state = 'idle';
```

**Solutions:**

1. **Reduce idle timeout:**
   ```bash
   DB_IDLE_TIMEOUT=15
   ```

2. **Enable connection recycling:**
   ```bash
   DB_MAX_LIFETIME=600
   ```

3. **Review code for unclosed transactions:**
   ```typescript
   // ❌ BAD: Transaction not closed
   await db.transaction(async (tx) => {
     // ... do work
     // Missing commit/rollback
   });

   // ✅ GOOD: Transaction auto-closed
   await db.transaction(async (tx) => {
     await tx.insert(...);
     // Drizzle auto-commits
   });
   ```

---

## Monitoring

### Key Metrics to Track

1. **Connection Pool Usage:**
   - Active connections
   - Idle connections
   - Wait time for connections

2. **Database Performance:**
   - Query latency
   - Connection establishment time
   - Query throughput

3. **Error Rates:**
   - Connection timeouts
   - Connection refused errors
   - Transaction rollbacks

### Monitoring Tools

**PostgreSQL:**

```sql
-- Connection stats
SELECT * FROM pg_stat_database;

-- Active queries
SELECT * FROM pg_stat_activity;

-- Connection age
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  backend_start,
  state,
  now() - backend_start AS connection_age
FROM pg_stat_activity
ORDER BY connection_age DESC;
```

**Application Logs:**

```typescript
// Add connection pool monitoring
client.on('connect', () => {
  console.log('[DB] Connection established');
});

client.on('error', (err) => {
  console.error('[DB] Connection error:', err);
});
```

**Recommended Tools:**
- **pgAdmin** - PostgreSQL GUI
- **DataDog** - Application monitoring
- **New Relic** - APM with database insights
- **pg_stat_statements** - PostgreSQL extension for query analytics

---

## Quick Reference

### Environment Variables

```bash
# Connection pooling configuration
DB_POOL_MAX=10              # Max connections
DB_IDLE_TIMEOUT=30          # Idle timeout (seconds)
DB_CONNECT_TIMEOUT=10       # Connection timeout (seconds)
DB_MAX_LIFETIME=1800        # Connection lifetime (seconds)
```

### Default Values by Provider

| Provider | Recommended `DB_POOL_MAX` | Notes |
|----------|---------------------------|-------|
| **Self-Hosted** | 15-20 | Adjust based on `max_connections` |
| **Neon** | 5-10 | Use pooled connection string |
| **Supabase** | 10-15 | Use port 6543 (transaction mode) |
| **Railway** | 15 | Standard PostgreSQL |
| **Vercel Postgres** | 7 | Same as Neon |
| **AWS RDS** | 20 (direct), 5-10 (with RDS Proxy) | Use RDS Proxy in production |
| **Google Cloud SQL** | 15 | Use Cloud SQL Proxy |
| **Azure Database** | 15 | Requires SSL |

---

## Additional Resources

- [postgres-js Documentation](https://github.com/porsager/postgres)
- [Drizzle ORM](https://orm.drizzle.team/)
- [PostgreSQL Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PgBouncer](https://www.pgbouncer.org/) - External connection pooler
- [Neon Connection Pooling](https://neon.tech/docs/connect/connection-pooling)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

---

## Need Help?

If you encounter issues with database connections:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review your provider's documentation
3. Monitor connection metrics
4. Open an issue on [GitHub](https://github.com/supercheck-io/supercheck/issues)
