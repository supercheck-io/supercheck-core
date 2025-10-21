# Dokploy Authentication Troubleshooting Guide

This guide helps diagnose and fix sign-in issues (502 errors) when deploying Supercheck on Dokploy.

## 🔍 Root Cause

The sign-in 502 error can be caused by multiple issues:

### 1. Better Auth Production Configuration

Better Auth requires explicit production configuration for:

- `baseURL`: The base URL of your application
- `trustedOrigins`: List of allowed origins for security

### 2. Cloudflare SSL Mode (CRITICAL)

**Using "Flexible" SSL mode in Cloudflare breaks authentication!**

- **Flexible SSL**: Creates HTTPS connection between user and Cloudflare, but HTTP between Cloudflare and your server
- **Full SSL**: Required for authentication to work properly
- **Full (Strict) SSL**: Recommended - creates end-to-end encrypted connection

When using Flexible SSL, authentication cookies and secure headers get corrupted because the connection between Cloudflare and your server is unencrypted, even though the browser thinks it's secure.

Previously, the auth configuration was minimal and worked locally but failed in production environments like Dokploy where these values must be explicitly set.

## 🔍 Quick Diagnosis

Run the diagnostic script to identify the specific issue:

```bash
# In Dokploy container terminal
docker-compose exec app npm run diagnose:auth
```

Or run it directly:

```bash
docker-compose exec app node ./scripts/diagnose-auth.js
```

## 🚨 Common Issues and Fixes

### 1. Missing Environment Variables

**Symptoms:** 502 error on sign-in, authentication fails

**Check:** Run the diagnostic script to see which variables are missing

**Fix:** Set these environment variables in Dokploy:

```bash
# Required for authentication
BETTER_AUTH_SECRET=your-32-character-hex-secret-here
BETTER_AUTH_URL=https://your-app-domain.dokploy.app
NEXT_PUBLIC_APP_URL=https://your-app-domain.dokploy.app

# Database connection
DATABASE_URL=postgresql://user:password@host:port/supercheck
DB_HOST=your-db-host
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=supercheck
```

**Generate BETTER_AUTH_SECRET:**

```bash
openssl rand -hex 32
```

### 2. Cloudflare SSL Mode Issue (Most Common)

**Symptoms:** 502 error on sign-in, authentication redirects fail, cookies not working

**Root Cause:** Using "Flexible" SSL mode in Cloudflare

### SSL Mode Options

1. **Flexible (Not Recommended for Authentication)**

   - Cloudflare handles SSL → User, HTTP → Your Server
   - Breaks secure cookies and authentication headers
   - Causes 502 errors with authentication systems
   - Only use for static sites, not for applications with login

2. **Full (Recommended for Self-Signed Certificates)**

   - Cloudflare handles SSL → User, SSL → Your Server
   - Works with self-signed certificates
   - Use with `docker-compose-secure.yml` (auto-generates cert)
   - Good balance of security and simplicity

3. **Full (Strict) (Most Secure)**

   - Cloudflare handles SSL → User, SSL → Your Server with valid cert
   - Requires valid SSL certificate on your server
   - Use with `docker-compose-secure.yml` and valid cert
   - Best security but more complex setup

### Quick Fix for Your Current Issue

1. **Use the updated secure configuration:**

   ```bash
   docker-compose -f docker-compose-secure.yml up -d
   ```

2. **Set Cloudflare SSL mode to "Full":**

   - Go to Cloudflare Dashboard → SSL/TLS → Overview
   - Select **Full** (not Full Strict)

3. **Update your environment variables:**
   ```bash
   NEXT_PUBLIC_APP_URL=https://demo.supercheck.io
   BETTER_AUTH_URL=https://demo.supercheck.io
   ```

### Why This Works

The updated `docker-compose-secure.yml` file:

- Automatically generates a self-signed certificate on startup
- Works with ALL Cloudflare SSL modes (Flexible, Full, Full Strict)
- Handles HTTPS properly for authentication
- No additional configuration needed

### Troubleshooting SSL Issues

| Symptom                        | Likely Cause                           | Solution                                 |
| ------------------------------ | -------------------------------------- | ---------------------------------------- |
| 502 errors on login            | Cloudflare SSL mode is Flexible        | Change to Full or Full (Strict)          |
| Page not loading with Full SSL | No HTTPS on origin server              | Use docker-compose-secure.yml            |
| Certificate errors             | Invalid certificate with Full (Strict) | Use Full mode instead, or get valid cert |
| Mixed content warnings         | HTTP resources on HTTPS page           | Ensure all resources use HTTPS           |

### 3. Database Tables Not Created

**Symptoms:** 502 error, authentication tables missing

**Check:** Diagnostic script will show missing tables

**Fix:** Ensure migrations run during deployment:

```bash
# In Dokploy, add this to your app's startup command:
npm run db:migrate:prod && npm start
```

Or use the built-in script (recommended):

```bash
# The Dockerfile already uses start.sh which handles migrations
# Just make sure environment variables are correct
```

### 4. Database Connection Issues

**Symptoms:** 502 error, connection timeout

**Check:**

- Verify database is accessible from Dokploy
- Check connection string format
- Ensure database allows external connections

**Fix:**

```bash
# Test connection from Dokploy container
docker-compose exec app node -e "
const postgres = require('postgres');
const client = postgres(process.env.DATABASE_URL);
client\`SELECT 1\`.then(() => console.log('✅ DB connected')).catch(console.error);
"
```

### 5. External Database Configuration

**When using external services (Neon, Supabase, etc.):**

**Required Settings:**

```bash
# For Neon (example)
DATABASE_URL=postgresql://username:password@ep-example.us-east-1.aws.neon.tech/supercheck?sslmode=require

# For Supabase (example)
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
```

**Common Issues:**

- Missing `?sslmode=require` for external databases
- Firewall blocking connections
- Incorrect credentials
- Pool connection limits

## 🔧 Step-by-Step Fix Process

### Step 1: Check Cloudflare SSL Mode (Most Likely Issue)

1. Go to Cloudflare Dashboard
2. Select your domain
3. Go to SSL/TLS → Overview
4. **If set to "Flexible", change to "Full (Strict)"**
5. Wait 2-3 minutes for propagation
6. Test sign-in again

This fixes 80% of authentication issues on Dokploy!

### Step 2: Run Diagnostic (If SSL is already Full)

```bash
docker-compose exec app npm run diagnose:auth
```

### Step 3: Fix Environment Variables

Based on diagnostic output, update environment variables in Dokploy:

1. Go to your Dokploy project
2. Click "Environment Variables"
3. Add/update missing variables
4. Redeploy the application

### Step 3: Verify Database

```bash
# Check if database is accessible
docker-compose exec app npm run diagnose:auth

# If tables are missing, manually run migrations
docker-compose exec app npm run db:migrate:prod
```

### Step 4: Test Authentication

1. Try signing in with a test account
2. Check browser network tab for specific errors
3. Check Dokploy logs for runtime errors

## 📋 Complete Environment Variable Checklist

Copy this checklist and ensure all variables are set in Dokploy:

```bash
# === AUTHENTICATION (REQUIRED) ===
BETTER_AUTH_SECRET=your-32-character-hex-secret-here
BETTER_AUTH_URL=https://your-app-domain.dokploy.app
NEXT_PUBLIC_APP_URL=https://your-app-domain.dokploy.app

# === DATABASE (REQUIRED) ===
DATABASE_URL=postgresql://user:password@host:port/supercheck?sslmode=require
DB_HOST=your-db-host
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=supercheck

# === REDIS (REQUIRED) ===
REDIS_URL=redis://:password@host:port
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# === S3/STORAGE (REQUIRED) ===
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=https://s3.amazonaws.com
S3_JOB_BUCKET_NAME=supercheck-job-artifacts
S3_TEST_BUCKET_NAME=supercheck-test-artifacts

# === EMAIL (REQUIRED) ===
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=your-smtp-password
SMTP_SECURE=false
SMTP_FROM_EMAIL=notifications@your-domain.com

# === SECURITY (REQUIRED) ===
SECRET_ENCRYPTION_KEY=your-64-character-hex-key

# === APP CONFIGURATION ===
NODE_ENV=production
MAX_PROJECTS_PER_ORG=10
DEFAULT_PROJECT_NAME="Default Project"
```

## 🚀 Deployment Verification

After making changes, verify the deployment:

```bash
# 1. Check container health
docker-compose ps

# 2. Check logs
docker-compose logs app

# 3. Run diagnostics
docker-compose exec app npm run diagnose:auth

# 4. Test authentication endpoint
curl -X GET https://your-app-domain.dokploy.app/api/auth/session
```

## 🆘 Still Having Issues?

### Check These Specific Areas:

1. **Dokploy Logs:**

   - Application logs
   - Build logs
   - Deployment logs

2. **Network Connectivity:**

   - Database accessibility from Dokploy
   - Redis connectivity
   - S3/MinIO connectivity

3. **Browser Console:**

   - JavaScript errors
   - Network request failures
   - CORS issues

4. **External Services:**
   - Database status
   - Redis status
   - Email service configuration

### Get Help:

1. Run the diagnostic script and share the output
2. Check Dokploy container logs
3. Verify all environment variables are set correctly
4. Test database connectivity manually

## 📚 Additional Resources

- [Super Admin Setup Guide](./SUPER_ADMIN_SETUP.md)
- [External Services Setup Guide](./EXTERNAL_SERVICES_SETUP.md)
- [Security Best Practices](./SECURITY.md)
- [Dokploy Evaluation Guide](./DOKPLOY_EVALUATION_GUIDE.md)

---

**Last Updated:** October 2025
**Target Environment:** Dokploy with External Services
**Status:** Production-Ready ✅
