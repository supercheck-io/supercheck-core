# Docker Security Best Practices for Supercheck

This document outlines security best practices for deploying Supercheck using Docker Compose, including proper secret management and environment variable configuration.

## Overview

Both `docker-compose.yml` and `docker-compose-secure.yml` have been updated to use environment variables for all sensitive data, following Docker security best practices.

## Quick Start

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Generate secure secrets:**
   ```bash
   # Generate auth secret
   openssl rand -hex 32

   # Generate encryption keys
   openssl rand -hex 32
   ```

3. **Update .env file with your secrets**

4. **Start services:**
   ```bash
   # Development
   docker-compose up -d

   # Production with SSL
   docker-compose -f docker-compose-secure.yml up -d
   ```

## Environment Variables

### Security Requirements

All environment variables now use the `${VARIABLE:-default}` syntax, which:
- Uses the environment variable if set
- Falls back to a default value if not set
- Allows complete customization without modifying Docker Compose files

### Critical Security Variables

These **MUST** be changed in production:

```env
# Authentication & Encryption
BETTER_AUTH_SECRET=your-super-secret-key-change-this-in-production
SECRET_ENCRYPTION_KEY=your-64-character-secret-encryption-key

# Database
POSTGRES_PASSWORD=your-secure-database-password

# Redis
REDIS_PASSWORD=your-secure-redis-password

# SMTP
SMTP_PASSWORD=your-smtp-password-or-api-key

# MinIO/S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
MINIO_ROOT_PASSWORD=your-minio-password
```

## Security Best Practices

### 1. Secret Generation

**Generate cryptographically secure secrets:**
```bash
# For 32-byte secrets (recommended for most use cases)
openssl rand -hex 32

# For longer secrets
openssl rand -hex 64

# Alternative using /dev/urandom
head -c 32 /dev/urandom | base64
```

### 2. Environment File Security

**Protect your .env file:**
```bash
# Set restrictive permissions
chmod 600 .env

# Add to .gitignore to prevent accidental commits
echo ".env" >> .gitignore
```

**Use environment-specific files:**
```bash
.env.development
.env.staging
.env.production
```

### 3. Docker Compose Security Features

**Network Isolation:**
- All services use a custom bridge network (`supercheck-network`)
- No services expose ports unnecessarily
- Database and Redis are not directly accessible from outside

**Resource Limits:**
- CPU and memory limits prevent resource exhaustion
- Process limits (`pids`) prevent fork bombs
- File descriptor limits prevent file exhaustion

**Health Checks:**
- All services have proper health checks
- Dependencies wait for healthy services before starting
- Automatic restart on failure with backoff

### 4. Service-Specific Security

#### PostgreSQL
```yaml
environment:
  - POSTGRES_USER=${POSTGRES_USER:-postgres}
  - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
  - POSTGRES_DB=${POSTGRES_DB:-supercheck}
  - POSTGRES_INITDB_ARGS=--data-checksums  # Enable data checksums
```

**Additional recommendations:**
- Use SSL connections in production
- Limit database user privileges
- Regular backups with encryption

#### Redis
```yaml
environment:
  - REDIS_PASSWORD=${REDIS_PASSWORD:-supersecure-redis-password-change-this}
command: sh -c "redis-server --requirepass \"${REDIS_PASSWORD}\" --protected-mode yes"
```

**Additional recommendations:**
- Disable dangerous commands (`FLUSHDB`, `FLUSHALL`, `CONFIG`)
- Use Redis ACLs for fine-grained access control
- Enable keyspace notifications only if needed

#### MinIO
```yaml
environment:
  - MINIO_ROOT_USER=${MINIO_ROOT_USER:-minioadmin}
  - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-minioadmin}
```

**Additional recommendations:**
- Use IAM policies for access control
- Enable bucket versioning
- Configure bucket encryption
- Regular audit of access logs

### 5. Production Deployment

#### docker-compose-secure.yml Features

**SSL/TLS with Let's Encrypt:**
- Automatic SSL certificate generation
- HTTPS redirect
- Secure headers

**Configuration:**
```env
DOMAIN=your-domain.com
LETSENCRYPT_EMAIL=your-email@domain.com
```

**Traefik Security:**
- Dashboard disabled
- Automatic HTTPS redirect
- Let's Encrypt integration
- Access logs enabled

### 6. Monitoring and Auditing

**Log Management:**
```bash
# View service logs
docker-compose logs -f app
docker-compose logs -f worker

# Monitor resource usage
docker stats
```

**Security Monitoring:**
- Monitor failed authentication attempts
- Track resource usage patterns
- Audit environment variable access
- Regular security scans of containers

### 7. Backup and Recovery

**Environment Variables Backup:**
```bash
# Backup current environment (remove secrets first!)
cp .env .env.backup

# Store secrets separately in secure vault
# Never backup secrets in plain text
```

**Database Backup:**
```bash
# PostgreSQL backup
docker-compose exec postgres pg_dump -U postgres supercheck > backup.sql

# Encrypted backup
docker-compose exec postgres pg_dump -U postgres supercheck | gpg --cipher-algo AES256 --compress-algo 1 --symmetric --output backup.sql.gpg
```

## Security Checklist

### Pre-Production
- [ ] All default passwords changed
- [ ] Secrets generated with cryptographically secure methods
- [ ] Environment variables properly configured
- [ ] .env file permissions set to 600
- [ ] .env added to .gitignore
- [ ] SSL certificates configured (for production)
- [ ] Network isolation verified
- [ ] Resource limits configured

### Post-Deployment
- [ ] Health checks passing
- [ ] Logs monitored for errors
- [ ] Access patterns audited
- [ ] Backup procedures tested
- [ ] Incident response plan ready
- [ ] Regular security updates scheduled

### Ongoing Maintenance
- [ ] Regular secret rotation
- [ ] Monitor for security advisories
- [ ] Update base images regularly
- [ ] Audit access logs monthly
- [ ] Test backup/recovery procedures quarterly

## Common Security Mistakes to Avoid

1. **Using default secrets in production**
2. **Committing .env files to version control**
3. **Exposing unnecessary ports**
4. **Running containers as root**
5. **Not setting resource limits**
6. **Ignoring health checks**
7. **Not monitoring logs**
8. **Using outdated base images**
9. **Mixing development and production configurations**
10. **Not having a disaster recovery plan**

## Emergency Procedures

### Secret Compromise
1. Immediately rotate affected secrets
2. Update environment variables
3. Restart affected services
4. Audit access logs
5. Notify stakeholders

### Container Compromise
1. Stop affected containers
2. Preserve logs for analysis
3. Update to latest secure images
4. Review and strengthen security measures
5. Document incident and lessons learned

## Additional Resources

- [Docker Security Documentation](https://docs.docker.com/engine/security/)
- [Docker Compose Security Best Practices](https://docs.docker.com/compose/production/)
- [OWASP Container Security](https://owasp.org/www-project-container-security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

For questions or security concerns, please refer to the main [SECURITY.md](./SECURITY.md) file or contact the security team.
