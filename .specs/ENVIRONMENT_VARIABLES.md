# Environment Variables Reference

## Overview

This document provides a comprehensive reference for all environment variables used in the Supercheck application.

## Docker Compose Variables

### Core Database & Infrastructure

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supercheck
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=supercheck

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=supersecure-redis-password-change-this
REDIS_URL=redis://:supersecure-redis-password-change-this@redis:6379

# AWS S3 / MinIO Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://minio:9000
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_TEST_BUCKET_NAME=playwright-test-artifacts
S3_FORCE_PATH_STYLE=true
S3_OPERATION_TIMEOUT=10000
S3_MAX_RETRIES=3
```

### Application Configuration

```env
# App Settings
NEXT_PUBLIC_APP_URL=https://supercheck.meditationblue.com
NODE_ENV=production
RUNNING_CAPACITY=5          # Max concurrent test executions
QUEUED_CAPACITY=50          # Max queued jobs
TEST_EXECUTION_TIMEOUT_MS=900000    # 15 minutes
JOB_EXECUTION_TIMEOUT_MS=900000     # 15 minutes
TRACE_RECOVERY_INTERVAL_MS=300000   # 5 minutes
```

### Playwright Configuration ⭐ (New Optimized Settings)

```env
# Core Playwright Settings
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_RETRIES=2

# Browser Support (disabled by default for performance)
ENABLE_FIREFOX=false
ENABLE_WEBKIT=false
ENABLE_MOBILE=false

# Advanced Settings
ENABLE_JSON_REPORTER=false
```

### Playground Cleanup ⭐ (Added)

```env
# Playground Cleanup Configuration
PLAYGROUND_CLEANUP_ENABLED=true
PLAYGROUND_CLEANUP_CRON="0 */12 * * *"  # Every 12 hours
PLAYGROUND_CLEANUP_MAX_AGE_HOURS=24
```

### Resource Management (Monitor-specific - Optional)

These variables are only used for HTTP monitoring tasks, not Playwright test execution.
They have sensible defaults and can be omitted:

```env
# Monitor Resource Limits (Optional - defaults provided)
# MAX_CONCURRENT_CONNECTIONS=100
# MAX_MEMORY_USAGE_MB=512
# MAX_CPU_USAGE_PERCENT=80
# MAX_EXECUTION_TIME_MS=300000    # 5 minutes
# MAX_RESPONSE_SIZE_MB=10
# CONNECTION_TIMEOUT_MS=30000     # 30 seconds
# IDLE_TIMEOUT_MS=60000           # 1 minute
```

### Security Configuration ⭐ (Added)

```env
# Security Configuration
CREDENTIAL_ENCRYPTION_KEY=your-credential-encryption-key-change-this-in-production
VARIABLES_ENCRYPTION_KEY=your-64-character-encryption-key-for-variable-secrets-change-this-in-prod
```

### Authentication & Authorization

```env
# Better Auth Configuration
BETTER_AUTH_SECRET=your-super-secret-key-change-this-in-production
BETTER_AUTH_URL=https://supercheck.meditationblue.com

# Admin Configuration
SUPER_ADMIN_USER_IDS=4512347a-2ae6-413d-9cdc-91c22551ceb1,2b013c80-4fb4-4e9f-a3d1-48142e684dee
SUPER_ADMIN_EMAILS=admin@example.com

# RBAC Settings
MAX_ORGANIZATIONS_PER_USER=5
MAX_PROJECTS_PER_ORG=10
DEFAULT_PROJECT_NAME="Default Project"
ENABLE_PROJECT_LEVEL_RBAC=true
ALLOW_CROSS_PROJECT_ACCESS=false
STRICT_ORGANIZATION_ISOLATION=true
```

### Notification System

```env
# Notification Limits
MAX_JOB_NOTIFICATION_CHANNELS=10
MAX_MONITOR_NOTIFICATION_CHANNELS=10
NEXT_PUBLIC_MAX_JOB_NOTIFICATION_CHANNELS=10
NEXT_PUBLIC_MAX_MONITOR_NOTIFICATION_CHANNELS=10

# Email Configuration
SMTP_ENABLED=true
RESEND_ENABLED=true

# SMTP Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
SMTP_SECURE=false
SMTP_FROM_EMAIL=your-email@gmail.com

# Resend Configuration
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### Monitoring

```env
# Monitor Configuration
RECENT_MONITOR_RESULTS_LIMIT=1000
```

## Environment-Specific Overrides

### Development (.env files)

```env
# Development overrides
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
PLAYWRIGHT_HEADLESS=false      # Show browser during development
ENABLE_FIREFOX=true            # Enable additional browsers for testing
```

### Production (.env.production)

```env
# Production settings
NODE_ENV=production
PLAYWRIGHT_HEADLESS=true
ENABLE_FIREFOX=false
ENABLE_WEBKIT=false
ENABLE_MOBILE=false
```

## Variable Categories

### 🔴 Critical Security Variables

**Must be changed in production:**

- `REDIS_PASSWORD`
- `BETTER_AUTH_SECRET`
- `VARIABLES_ENCRYPTION_KEY`
- `CREDENTIAL_ENCRYPTION_KEY`
- `SMTP_PASSWORD`
- `RESEND_API_KEY`

### 🟡 Configuration Variables

**Should be customized per environment:**

- `NEXT_PUBLIC_APP_URL`
- `SUPER_ADMIN_USER_IDS`
- `SUPER_ADMIN_EMAILS`
- `RUNNING_CAPACITY`
- `QUEUED_CAPACITY`

### 🟢 Optional Optimization Variables

**Can be tuned for performance:**

- `PLAYWRIGHT_RETRIES`
- Monitor resource limits (only for HTTP monitoring, not test execution)

## Variable Validation

### Required Variables

These variables must be set for the application to function:

- `DATABASE_URL`
- `REDIS_URL` or (`REDIS_HOST` + `REDIS_PORT`)
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`

### Optional with Defaults

These variables have sensible defaults but can be customized:

- `RUNNING_CAPACITY` (default: 5)
- `QUEUED_CAPACITY` (default: 50)
- `PLAYWRIGHT_RETRIES` (default: 2)

## Common Issues & Solutions

### 1. Memory Issues

If experiencing high memory usage:

```env
ENABLE_FIREFOX=false          # Disable additional browsers
ENABLE_WEBKIT=false
ENABLE_MOBILE=false
```

### 2. Performance Issues

For better performance:

```env
RUNNING_CAPACITY=3            # Reduce concurrent executions
PLAYWRIGHT_HEADLESS=true      # Ensure headless mode
```

### 3. Storage Issues

For storage optimization:

```env
PLAYGROUND_CLEANUP_ENABLED=true
PLAYGROUND_CLEANUP_CRON="0 */6 * * *"  # Clean every 6 hours
PLAYGROUND_CLEANUP_MAX_AGE_HOURS=12     # Shorter retention
```

## Migration from Previous Configuration

### Deprecated Variables

The following variables are no longer used:

- `PLAYWRIGHT_WORKERS` → Now auto-calculated based on environment
- `NOTIFICATION_JWT_SECRET` → No longer needed

### New Required Variables

Add these to your environment:

```env
PLAYGROUND_CLEANUP_ENABLED=true
CREDENTIAL_ENCRYPTION_KEY=your-key-here
```

## Validation Script

You can validate your environment configuration:

```bash
# Check required variables
docker-compose config --quiet && echo "✅ Configuration valid" || echo "❌ Configuration invalid"

# Check variable interpolation
docker-compose config | grep -E "(REDIS_PASSWORD|BETTER_AUTH_SECRET)" | grep -v "your-"
```

## Best Practices

1. **Use environment-specific .env files**
2. **Never commit secrets to version control**
3. **Use strong, unique passwords for production**
4. **Regularly rotate encryption keys**
5. **Monitor resource usage and adjust limits accordingly**
6. **Test configuration changes in staging first**
