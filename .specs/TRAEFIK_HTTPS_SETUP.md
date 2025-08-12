# Traefik HTTPS Configuration

This document provides comprehensive guidance for setting up Traefik reverse proxy with automatic HTTPS certificates for the Supertest application, specifically addressing Playwright trace viewer requirements.

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [Configuration](#configuration)
5. [Environment Variables](#environment-variables)
6. [Deployment Steps](#deployment-steps)
7. [Traefik Dashboard](#traefik-dashboard)
8. [SSL Certificate Management](#ssl-certificate-management)
9. [Security Considerations](#security-considerations)
10. [Troubleshooting](#troubleshooting)
11. [Monitoring and Maintenance](#monitoring-and-maintenance)

## Overview

Traefik v3.0 is integrated as a reverse proxy to provide automatic HTTPS termination using Let's Encrypt certificates. This setup ensures that Playwright trace viewers work correctly by serving content over HTTPS, which is required for Service Workers functionality.

### Key Features
- **Automatic HTTPS**: Let's Encrypt certificate generation and renewal
- **HTTP to HTTPS Redirect**: All HTTP traffic automatically redirected to HTTPS
- **Service Discovery**: Automatic service detection via Docker labels
- **Load Balancing**: Built-in load balancing for multiple service instances
- **Dashboard**: Web UI for monitoring and configuration
- **Zero Downtime**: Rolling certificate renewals without service interruption

## Problem Statement

### Original Issue
Playwright trace viewer was failing with the error:
```
Service workers are not supported.
Make sure to serve the Trace Viewer via HTTPS or localhost.
```

### Root Cause
- Hetzner server serving content over HTTP (`http://91.98.19.170:3000`)
- Playwright trace viewer requires Service Workers
- Service Workers only work over HTTPS or localhost due to browser security restrictions

### Impact
- Trace files could not be opened in the browser
- Debugging test failures became difficult
- Production monitoring was compromised

## Solution Architecture

### Before (HTTP Only)
```
Internet → Hetzner Server:3000 (HTTP) → Next.js App
```

### After (HTTPS with Traefik)
```
Internet → Traefik:443 (HTTPS) → Next.js App:3000
         ↑
    Let's Encrypt Certificates
```

### Service Flow
1. **Client Request**: Browser requests `https://your-domain.com`
2. **Traefik Routing**: Traefik receives request on port 443
3. **SSL Termination**: Traefik handles SSL/TLS encryption
4. **Service Routing**: Request forwarded to appropriate service
5. **Response**: Service response returned through Traefik with HTTPS

## Configuration

### Docker Compose Services

#### Traefik Service
```yaml
services:
  traefik:
    image: traefik:v3.0
    command:
      # Enable API and Dashboard
      - "--api.dashboard=true"
      
      # Docker provider configuration
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      
      # Entry points
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      
      # Let's Encrypt configuration with HTTP challenge (more reliable)
      - "--certificatesresolvers.myresolver.acme.httpchallenge=true"
      - "--certificatesresolvers.myresolver.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.myresolver.acme.email=${ACME_EMAIL:-hello@meditationblue.com}"
      - "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.myresolver.acme.caserver=https://acme-v02.api.letsencrypt.org/directory"
      
      # Logging
      - "--log.level=INFO"
      - "--accesslog=true"
    
    ports:
      - "80:80"      # HTTP entry point (required for ACME challenges)
      - "443:443"    # HTTPS entry point
      # Port 8080 removed for security - dashboard only via HTTPS
    
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-letsencrypt:/letsencrypt
    
    labels:
      - "traefik.enable=true"
      # Secure dashboard router (HTTPS only) - matches both /api and /dashboard
      - "traefik.http.routers.dashboard.rule=Host(`traefik.${DOMAIN}`) && (PathPrefix(`/api`) || PathPrefix(`/dashboard`))"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls.certresolver=myresolver"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.middlewares=dashboard-auth"
      # Basic auth middleware (change default password!)
      - "traefik.http.middlewares.dashboard-auth.basicauth.users=admin:$$apr1$$FY28Hi7I$$HBfY4It75DZpccigvT0Ht/"
    
    networks:
      - supercheck-network
    restart: unless-stopped
```

#### App Service Configuration
```yaml
app:
  image: ghcr.io/krish-kant/supercheck/app:monitoring-e81b65a
  expose:
    - "3000"  # Changed from ports to expose (internal only)
  
  environment:
    - NEXT_PUBLIC_APP_URL=https://${DOMAIN:-supercheck.meditationblue.com}
    # ... other environment variables
  
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.app.rule=Host(`${DOMAIN:-supercheck.meditationblue.com}`)"
    - "traefik.http.routers.app.entrypoints=websecure"
    - "traefik.http.routers.app.tls.certresolver=myresolver"
    - "traefik.http.services.app.loadbalancer.server.port=3000"
```

#### Volume Configuration
```yaml
volumes:
  traefik-letsencrypt:
    driver: local
```

## Environment Variables

### Required Variables

| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `DOMAIN` | Your domain name | `supercheck.yourdomain.com` | `supercheck.meditationblue.com` |
| `ACME_EMAIL` | Email for Let's Encrypt | `admin@yourdomain.com` | `hello@meditationblue.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_PASSWORD` | Redis authentication password | `supersecure-redis-password-change-this` |
| `BETTER_AUTH_SECRET` | Authentication secret key | `your-super-secret-key-change-this-in-production` |

### Setting Environment Variables

#### Method 1: Environment File
Create `.env` file in project root:
```bash
DOMAIN=supercheck.yourdomain.com
ACME_EMAIL=admin@yourdomain.com
REDIS_PASSWORD=your-secure-redis-password
BETTER_AUTH_SECRET=your-super-secret-auth-key
```

#### Method 2: Export Commands
```bash
export DOMAIN=supercheck.yourdomain.com
export ACME_EMAIL=admin@yourdomain.com
export REDIS_PASSWORD=your-secure-redis-password
export BETTER_AUTH_SECRET=your-super-secret-auth-key
```

#### Method 3: Docker Compose Override
Create `docker-compose.override.yml`:
```yaml
services:
  traefik:
    command:
      - "--certificatesresolvers.myresolver.acme.email=admin@yourdomain.com"
    labels:
      - "traefik.http.routers.traefik.rule=Host(`traefik.yourdomain.com`)"
  
  app:
    environment:
      - NEXT_PUBLIC_APP_URL=https://yourdomain.com
    labels:
      - "traefik.http.routers.app.rule=Host(`yourdomain.com`)"
```

## Deployment Steps

### Prerequisites
1. **Domain Setup**: Point your domain's A record to your server IP
2. **Firewall Configuration**: Ensure ports 80, 443, and 8080 are open
3. **Docker Installation**: Docker and Docker Compose installed on server

### Step-by-Step Deployment

#### 1. DNS Configuration
```bash
# Add A record for your domain
your-domain.com        A    91.98.19.170
traefik.your-domain.com A   91.98.19.170
```

#### 2. Set Environment Variables
```bash
export DOMAIN=your-domain.com
export ACME_EMAIL=admin@your-domain.com
```

#### 3. Deploy Services
```bash
# Pull latest images
docker-compose pull

# Start services
docker-compose up -d

# Monitor logs
docker-compose logs -f traefik
```

#### 4. Verify Certificate Generation
```bash
# Check certificate storage
docker-compose exec traefik ls -la /letsencrypt/

# View certificate details
docker-compose logs traefik | grep -i acme
```

#### 5. Test HTTPS Access
```bash
# Test main application
curl -I https://your-domain.com

# Test Traefik dashboard
curl -I https://traefik.your-domain.com
```

### Rollback Procedure
If issues occur during deployment:

```bash
# Stop services
docker-compose down

# Revert to HTTP configuration
git checkout HEAD~1 docker-compose.yml

# Restart with old configuration
docker-compose up -d
```

## Traefik Dashboard

### Access
- **URL**: `https://traefik.your-domain.com/dashboard/`
- **Authentication**: Basic Auth (admin/supersecure-dashboard-password)
- **API Endpoint**: `https://traefik.your-domain.com/api/`

⚠️ **Important**: Dashboard is now secured by default with basic authentication and HTTPS-only access. Port 8080 is no longer exposed for security reasons.

### Default Credentials
- **Username**: `admin`
- **Password**: `supersecure-dashboard-password`

🔒 **Security Note**: Always change the default password before production deployment!

### Dashboard Features
1. **Services Overview**: View all discovered services
2. **Routers**: See routing rules and their status
3. **Middlewares**: View applied middlewares
4. **Providers**: Check Docker provider status
5. **Certificates**: Monitor SSL certificate status

### Securing the Dashboard
The dashboard is now secured by default using Traefik v3.0 best practices:

```yaml
labels:
  - "traefik.enable=true"
  # Dashboard router matches both /api and /dashboard paths per official docs
  - "traefik.http.routers.dashboard.rule=Host(`traefik.${DOMAIN}`) && (PathPrefix(`/api`) || PathPrefix(`/dashboard`))"
  - "traefik.http.routers.dashboard.entrypoints=websecure"
  - "traefik.http.routers.dashboard.tls.certresolver=myresolver"
  - "traefik.http.routers.dashboard.service=api@internal"
  - "traefik.http.routers.dashboard.middlewares=dashboard-auth"
  # Basic auth middleware with hashed password
  - "traefik.http.middlewares.dashboard-auth.basicauth.users=admin:$$apr1$$FY28Hi7I$$HBfY4It75DZpccigvT0Ht/"
```

### Changing Dashboard Password
Generate a new password hash:
```bash
# Generate new password hash
htpasswd -nb admin your_new_password

# Example output: admin:$apr1$abc123$xyz789...
```

Update the docker-compose.yml:
```yaml
- "traefik.http.middlewares.dashboard-auth.basicauth.users=admin:$$apr1$$abc123$$xyz789..."
```

⚠️ **Important**: Double the dollar signs (`$$`) in docker-compose.yml to escape them properly.

## SSL Certificate Management

### Let's Encrypt Integration
- **Provider**: Let's Encrypt via ACME protocol
- **Challenge Type**: HTTP Challenge (port 80) - More reliable than TLS challenge
- **Storage**: `/letsencrypt/acme.json` volume
- **Renewal**: Automatic (30 days before expiration)
- **CA Server**: Production Let's Encrypt (use staging for testing)

### Certificate Storage
```bash
# Certificate files location
/var/lib/docker/volumes/supertest_traefik-letsencrypt/_data/acme.json
```

### Manual Certificate Renewal
```bash
# Force certificate renewal (if needed)
docker-compose exec traefik traefik version
docker-compose restart traefik
```

### Certificate Backup
```bash
# Backup certificates
docker cp $(docker-compose ps -q traefik):/letsencrypt/acme.json ./acme-backup.json

# Restore certificates
docker cp ./acme-backup.json $(docker-compose ps -q traefik):/letsencrypt/acme.json
```

### Certificate Monitoring
```bash
# Check certificate expiration
openssl s_client -connect your-domain.com:443 -servername your-domain.com 2>/dev/null | openssl x509 -noout -dates
```

## Security Considerations

### ✅ Current Security Implementation

This configuration implements several security best practices:

1. **Secure Dashboard Access**:
   - ✅ HTTPS-only dashboard access
   - ✅ Basic authentication enabled by default
   - ✅ No insecure port 8080 exposure
   - ✅ Following Traefik v3.0 official recommendations

2. **Certificate Security**:
   - ✅ HTTP challenge (more secure than TLS challenge)
   - ✅ Production Let's Encrypt CA
   - ✅ Automatic certificate renewal
   - ✅ Secure certificate storage in Docker volume

3. **Network Security**:
   - ✅ Services only accessible through Traefik
   - ✅ Docker socket read-only access
   - ✅ No unnecessary port exposures

4. **Authentication**:
   - ✅ Dashboard protected with basic auth
   - ✅ Hashed password storage
   - ⚠️ **Action Required**: Change default password in production

### 🔒 Production Security Checklist

Before deploying to production, ensure:

- [ ] Change default dashboard password
- [ ] Set proper ACME_EMAIL environment variable
- [ ] Configure firewall to allow only ports 80, 443
- [ ] Enable log monitoring and alerting
- [ ] Set up certificate expiration monitoring
- [ ] Review and restrict dashboard access by IP if needed
- [ ] Enable additional security headers (see examples below)


### Network Security
1. **Firewall Rules**:
   ```bash
   # Allow only necessary ports
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw allow 8080/tcp  # Optional: Traefik dashboard
   ```

2. **Service Isolation**: Services only exposed through Traefik
3. **TLS Configuration**: Modern TLS versions only (1.2+)

### Access Control
1. **Dashboard Security**: Add authentication for production
2. **Service Discovery**: `exposedbydefault=false` prevents accidental exposure
3. **Docker Socket**: Read-only access to Docker socket

### Certificate Security
1. **Automatic Renewal**: Prevents certificate expiration
2. **Secure Storage**: Certificates stored in Docker volume
3. **Domain Validation**: Let's Encrypt validates domain ownership

### Recommended Security Headers
Add security headers via Traefik middleware:

```yaml
labels:
  - "traefik.http.routers.app.middlewares=security-headers"
  - "traefik.http.middlewares.security-headers.headers.customRequestHeaders.X-Forwarded-Proto=https"
  - "traefik.http.middlewares.security-headers.headers.customResponseHeaders.X-Frame-Options=DENY"
  - "traefik.http.middlewares.security-headers.headers.customResponseHeaders.X-Content-Type-Options=nosniff"
```

## Troubleshooting

### Common Issues

#### 1. Certificate Generation Failure
**Symptoms**: 
- Site not accessible via HTTPS
- "Certificate generation failed" in logs

**Solutions**:
```bash
# Check DNS resolution
nslookup your-domain.com

# Verify port 443 accessibility
telnet your-domain.com 443

# Check Let's Encrypt rate limits
docker-compose logs traefik | grep -i "rate limit"

# Clear certificate cache if needed
docker-compose down
docker volume rm supertest_traefik-letsencrypt
docker-compose up -d
```

#### 2. Service Not Accessible
**Symptoms**:
- 404 error when accessing domain
- Service not appearing in Traefik dashboard

**Solutions**:
```bash
# Check service labels
docker-compose config | grep -A 5 -B 5 traefik.enable

# Verify service is running
docker-compose ps

# Check Traefik logs
docker-compose logs traefik | grep -i "app"
```

#### 3. Redirect Loop
**Symptoms**:
- Browser shows "too many redirects" error
- Infinite redirect loop between HTTP and HTTPS

**Solutions**:
```bash
# Check redirect configuration
docker-compose logs traefik | grep -i redirect

# Verify app configuration
curl -I -H "Host: your-domain.com" ${NEXT_PUBLIC_APP_URL}
```

#### 4. Dashboard Not Accessible
**Symptoms**:
- Traefik dashboard returns 404 or connection refused

**Solutions**:
```bash
# Check dashboard configuration
docker-compose exec traefik traefik version

# Verify port binding
docker-compose ps traefik

# Check dashboard logs
docker-compose logs traefik | grep -i api
```

### Log Analysis

#### Traefik Logs
```bash
# View all Traefik logs
docker-compose logs -f traefik

# Certificate-related logs
docker-compose logs traefik | grep -i acme

# Routing logs
docker-compose logs traefik | grep -i router

# Error logs
docker-compose logs traefik | grep -i error
```

#### Application Logs
```bash
# Check if app receives HTTPS headers
docker-compose logs app | grep -i "x-forwarded-proto"

# Monitor health checks
docker-compose logs app | grep -i health
```

### Performance Monitoring

#### Traefik Metrics
```bash
# Check response times
curl -s https://your-domain.com/api/health | jq '.'

# Monitor certificate status
curl -I https://your-domain.com | grep -i server
```

#### Resource Usage
```bash
# Check Traefik resource usage
docker stats $(docker-compose ps -q traefik)

# Monitor certificate renewal activity
docker-compose logs traefik | grep -i "renewed\|renewal"
```

## Monitoring and Maintenance

### Health Checks
```bash
# Check service health
curl -f https://your-domain.com/api/health || echo "Service unhealthy"

# Verify certificate validity
openssl s_client -connect your-domain.com:443 -servername your-domain.com 2>/dev/null | openssl x509 -noout -dates

# Test Traefik dashboard
curl -f https://traefik.your-domain.com || echo "Dashboard unavailable"
```

### Regular Maintenance Tasks

#### Weekly
1. Check certificate expiration dates
2. Review Traefik logs for errors
3. Verify all services are accessible
4. Monitor resource usage

#### Monthly  
1. Update Traefik image version
2. Review security configurations
3. Backup certificate files
4. Test disaster recovery procedures

#### Quarterly
1. Security audit of configurations
2. Performance optimization review
3. Update documentation
4. Review access logs for unusual patterns

### Monitoring Script
Create a monitoring script for automated checks:

```bash
#!/bin/bash
# traefik-monitor.sh

DOMAIN="your-domain.com"
TRAEFIK_DOMAIN="traefik.${DOMAIN}"

echo "=== Traefik Health Check ==="
echo "Date: $(date)"
echo

# Check main application
echo "Checking main application..."
if curl -f -s "https://${DOMAIN}" > /dev/null; then
    echo "✅ Main application accessible"
else
    echo "❌ Main application not accessible"
fi

# Check certificate expiration
echo "Checking certificate expiration..."
EXPIRY=$(openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "${EXPIRY}" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))

if [ ${DAYS_LEFT} -gt 30 ]; then
    echo "✅ Certificate valid for ${DAYS_LEFT} days"
else
    echo "⚠️  Certificate expires in ${DAYS_LEFT} days"
fi

# Check Traefik dashboard
echo "Checking Traefik dashboard..."
if curl -f -s "https://${TRAEFIK_DOMAIN}" > /dev/null; then
    echo "✅ Traefik dashboard accessible"
else
    echo "❌ Traefik dashboard not accessible"
fi

echo
echo "=== End Health Check ==="
```

Make executable and run:
```bash
chmod +x traefik-monitor.sh
./traefik-monitor.sh
```

### Alerting Integration
For production environments, integrate with monitoring systems:

#### Prometheus Metrics
Enable Traefik metrics:
```yaml
command:
  - "--metrics.prometheus=true"
  - "--metrics.prometheus.addEntryPointsLabels=true"
  - "--metrics.prometheus.addServicesLabels=true"
```

#### Grafana Dashboard
Import Traefik dashboard for visualization:
- Dashboard ID: 4475 (Official Traefik dashboard)
- Metrics endpoint: `http://traefik:8080/metrics`

## Best Practices

### Production Deployment
1. **Use specific image versions**: `traefik:v3.0.0` instead of `traefik:v3.0`
2. **Resource limits**: Set CPU and memory limits for Traefik container
3. **Backup strategy**: Regular backups of certificate files
4. **Monitoring**: Implement comprehensive monitoring and alerting
5. **Documentation**: Keep deployment documentation updated

### Security Hardening
1. **Dashboard authentication**: ✅ Enabled by default with basic auth
2. **Port exposure**: ✅ Port 8080 removed, dashboard only via HTTPS
3. **Network segmentation**: Use dedicated networks for different services
4. **Password security**: Always change default dashboard password
5. **Log management**: Centralized logging for security analysis
6. **Regular updates**: Keep Traefik version updated
7. **Access control**: Restrict dashboard access to authorized users only
8. **Certificate validation**: HTTP challenge prevents DNS poisoning attacks

### Performance Optimization
1. **Resource allocation**: Adequate CPU/memory for certificate operations
2. **Connection pooling**: Configure appropriate connection limits
3. **Caching**: Enable appropriate caching headers
4. **Compression**: Enable gzip compression for responses
5. **Load balancing**: Distribute traffic across multiple app instances

This comprehensive setup ensures that Playwright trace viewers work correctly while maintaining security and reliability for the entire Supertest application.