# Logging Configuration Guide

This document explains how to control logging verbosity in Supercheck.

## Overview

Supercheck's logging behavior is controlled by the `NODE_ENV` environment variable:

- **`NODE_ENV=development`** - Verbose logging (SQL queries, DEBUG logs, etc.)
- **`NODE_ENV=production`** - Clean logging (errors, warnings, and important logs only)

## What Gets Logged

### Development Mode (`NODE_ENV=development`)
- ✅ All SQL queries from Drizzle ORM
- ✅ DEBUG logs from NestJS worker
- ✅ VERBOSE logs from all services
- ✅ Monitor execution details
- ✅ Resource manager metrics
- ✅ SSL certificate checks

### Production Mode (`NODE_ENV=production`)
- ❌ No SQL query logs
- ❌ No DEBUG logs
- ❌ No VERBOSE logs
- ✅ Error logs
- ✅ Warning logs
- ✅ Important operational logs
- ✅ Monitor status changes
- ✅ Job execution results

## How to Enable Production Logging

### Option 1: Using .env File

Edit your `.env` file:

```bash
# Change from development to production
NODE_ENV=production
```

Then restart your services:

```bash
docker-compose restart app worker
# OR if running locally:
npm run dev  # in both app/ and worker/ directories
```

### Option 2: Docker Compose Override

The `docker-compose.yml` already defaults to production. To ensure it's used:

```bash
# Remove NODE_ENV from .env or set it to production
NODE_ENV=production

# Restart services
docker-compose down
docker-compose up -d
```

### Option 3: Environment Variable

Set it directly when starting services:

```bash
# For Docker
NODE_ENV=production docker-compose up -d

# For local development
NODE_ENV=production npm run dev
```

## Files Modified for Logging Control

1. **[app/src/utils/db.ts](../app/src/utils/db.ts)**
   - Disables Drizzle SQL query logging in production

2. **[worker/src/main.ts](../worker/src/main.ts)**
   - Configures NestJS log levels based on NODE_ENV

3. **Environment Files**
   - [.env.example](../.env.example)
   - [app/.env.example](../app/.env.example)
   - [worker/.env.example](../worker/.env.example)

## Verifying Logging Configuration

After changing NODE_ENV and restarting:

### Development Mode Indicators:
```
Query: select "id" from "users"...
[DEBUG] Operation completed in 10ms
[VERBOSE] Processing request...
```

### Production Mode Indicators:
```
✅ Monitor scheduler initialized successfully
 GET /api/monitors 200 in 329ms
[ERROR] Failed to connect to database
```

## Troubleshooting

### "I changed NODE_ENV but still seeing SQL queries"

1. **Verify the environment variable is set:**
   ```bash
   docker-compose exec app env | grep NODE_ENV
   docker-compose exec worker env | grep NODE_ENV
   ```

2. **Check your .env file:**
   ```bash
   cat .env | grep NODE_ENV
   ```

3. **Restart services completely:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### "Logs are too quiet in production"

Production mode still logs:
- All errors and warnings
- API request summaries
- Service initialization messages
- Monitor status changes
- Job execution results

If you need more details temporarily, switch back to development mode.

## Recommendation

**For Production Deployments:**
- Always use `NODE_ENV=production`
- This significantly reduces log volume
- Improves performance (no overhead from SQL logging)
- Cleaner log files for monitoring

**For Development:**
- Use `NODE_ENV=development`
- Helpful for debugging
- See exactly what queries are running
- Understand service behavior

## Related Documentation

- [SECURITY.md](../SECURITY.md) - Security best practices
- [MONITOR_CLEANUP_TESTING_GUIDE.md](./MONITOR_CLEANUP_TESTING_GUIDE.md) - Monitoring configuration
- [Docker Compose](../docker-compose.yml) - Service configuration
