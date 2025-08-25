# Docker Compose Files Comparison

## Overview
The project has two Docker Compose files for different deployment scenarios:

1. **`docker-compose.yml`** - Development/HTTP deployment without reverse proxy
2. **`docker-compose-secure.yml`** - Production HTTPS deployment with Traefik

## Key Differences

### 🌐 **Network & URLs**

#### HTTPS Version (`docker-compose-secure.yml`)
```env
NEXT_PUBLIC_APP_URL: https://${DOMAIN:-supercheck.meditationblue.com}
BETTER_AUTH_URL: https://${DOMAIN:-supercheck.meditationblue.com}
```
- Uses Traefik reverse proxy with SSL certificates
- Domain-based routing with HTTPS
- Let's Encrypt automatic SSL certificates

#### HTTP Version (`docker-compose.yml`)
```env
NEXT_PUBLIC_APP_URL: http://localhost:3000
BETTER_AUTH_URL: http://localhost:3000
```
- Direct port exposure (3000:3000)
- HTTP-only for development/testing
- No reverse proxy

### 🚀 **Services Comparison**

| Service | HTTPS Version | HTTP Version |
|---------|---------------|--------------|
| **Traefik** | ✅ Included with SSL | ❌ Not included |
| **App** | Behind Traefik proxy | Direct port 3000 |
| **Worker** | 2 replicas | 2 replicas |
| **PostgreSQL** | Internal network only | Port 5432 exposed |
| **Redis** | Internal network only | Internal network only |
| **MinIO** | Ports 9000, 9001 exposed | Ports 9000, 9001 exposed |

### 🔧 **Environment Variables**

Both files now have **identical environment variables** in the `x-common-env` section:

```env
# ✅ Synchronized Variables (both files)
PLAYWRIGHT_HEADLESS: true
PLAYWRIGHT_RETRIES: 2
ENABLE_FIREFOX: false
ENABLE_WEBKIT: false
ENABLE_MOBILE: false
ENABLE_JSON_REPORTER: false
PLAYGROUND_CLEANUP_ENABLED: true
CREDENTIAL_ENCRYPTION_KEY: ${CREDENTIAL_ENCRYPTION_KEY:-...}
VARIABLES_ENCRYPTION_KEY: ${VARIABLES_ENCRYPTION_KEY:-...}
# ... and all other variables
```

### 📊 **Resource Allocation**

Both files have identical resource limits:

```yaml
# App Service
limits:
  cpus: '1.0'
  memory: 2G
reservations:
  cpus: '0.5'
  memory: 1G

# Worker Service  
limits:
  cpus: '2.0'
  memory: 4G
reservations:
  cpus: '1.0'
  memory: 2G
```

## 🎯 **When to Use Each**

### Use `docker-compose-secure.yml` (HTTPS) when:
- **Production deployment**
- Need SSL certificates
- Domain-based routing
- Security is critical
- Public internet access

### Use `docker-compose.yml` when:
- **Development/testing**
- Local development
- Internal network deployment  
- No SSL required
- Quick setup needed

## 🔄 **Deployment Commands**

### HTTPS Deployment
```bash
# Production with HTTPS
docker-compose -f docker-compose-secure.yml up -d

# With custom domain
DOMAIN=yourdomain.com docker-compose -f docker-compose-secure.yml up -d
```

### HTTP Deployment
```bash
# Development/HTTP
docker-compose up -d

# View logs
docker-compose logs -f
```

## 🔐 **Security Considerations**

### HTTPS Version (More Secure)
- ✅ SSL encryption
- ✅ No exposed database ports
- ✅ Traefik security headers
- ✅ Domain validation

### HTTP Version (Development Only)
- ⚠️ No SSL encryption
- ⚠️ PostgreSQL port exposed (5432)
- ⚠️ HTTP-only authentication
- ⚠️ Suitable for development only

## 🔧 **Configuration Maintenance**

### To keep both files synchronized:

1. **Update common environment variables** in both `x-common-env` sections
2. **Keep resource limits identical** unless specific needs differ
3. **Maintain same Docker image tags** for consistency
4. **Test both configurations** when making changes

### Environment Variable Sync Script
```bash
#!/bin/bash
# Check if both docker-compose files have same env vars
diff <(grep -A 100 "x-common-env:" docker-compose-secure.yml | grep -E "^  [A-Z_]") \
     <(grep -A 100 "x-common-env:" docker-compose.yml | grep -E "^  [A-Z_]")
```

## 📝 **Migration Between Environments**

### From HTTP to HTTPS:
1. Update DNS to point to your server
2. Set environment variables (DOMAIN, email for SSL)
3. Switch to main docker-compose.yml
4. Traefik will automatically get SSL certificates

### From HTTPS to HTTP (for testing):
1. Use docker-compose.yml
2. Update any hardcoded HTTPS URLs in your app
3. Access via localhost:3000

## ✅ **Recent Updates Applied to Both Files**

- ✅ **Playwright optimization** variables added
- ✅ **Playground cleanup** configuration added  
- ✅ **Security variables** (encryption keys) added
- ✅ **RBAC settings** synchronized
- ✅ **Resource management** variables removed (monitor-only)
- ✅ **Node.js optimization** flags added to worker

Both Docker Compose files are now fully synchronized with the latest environment variable configuration!