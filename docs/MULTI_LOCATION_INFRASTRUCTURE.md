# Multi-Location Monitoring Infrastructure Guide

**For Docker Swarm Deployment on Hetzner Servers**

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture Options](#architecture-options)
3. [Option 1: Simulated Multi-Location (Current Implementation)](#option-1-simulated-multi-location-current-implementation)
4. [Option 2: True Distributed Multi-Location](#option-2-true-distributed-multi-location)
5. [Hetzner Server Setup](#hetzner-server-setup)
6. [Docker Swarm Configuration](#docker-swarm-configuration)
7. [Deployment Steps](#deployment-steps)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Scaling Considerations](#scaling-considerations)
10. [Security Best Practices](#security-best-practices)

---

## Overview

Supercheck's multi-location monitoring system can be deployed in two modes:
1. **Simulated Multi-Location**: Single-region deployment with simulated geographic delays (current implementation)
2. **True Distributed Multi-Location**: Workers deployed across actual geographic regions (future enhancement)

This guide covers both approaches for Docker Swarm deployment on Hetzner servers.

---

## Architecture Options

### Current State (Simulated)
```
┌─────────────────────────────────────────────┐
│         Hetzner Server (Single Region)       │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   App    │  │  Worker  │  │ Database │  │
│  │ (Next.js)│  │ (NestJS) │  │(Postgres)│  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  Worker simulates 6 locations internally     │
│  (us-east, us-west, eu-west, eu-central,    │
│   asia-pacific, south-america)              │
└─────────────────────────────────────────────┘
```

### Future State (True Distributed)
```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  US East    │   │  EU West    │   │ Asia Pacific│
│  (Hetzner)  │   │  (Hetzner)  │   │  (Hetzner)  │
│             │   │             │   │             │
│  Worker Pod │   │  Worker Pod │   │  Worker Pod │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Central Manager    │
              │   (Main App + DB)    │
              │     Redis Cluster    │
              └─────────────────────┘
```

---

## Option 1: Simulated Multi-Location (Current Implementation)

### Advantages
- ✅ Simple deployment (single server or cluster)
- ✅ Lower infrastructure costs
- ✅ Easier maintenance
- ✅ Full feature set available immediately
- ✅ No network latency between components

### Requirements
- **Server:** 1-3 Hetzner servers (for high availability)
- **Location:** Any single Hetzner data center
- **Minimum Specs (per server):**
  - 4 vCPU
  - 8 GB RAM
  - 80 GB SSD
  - Good network connectivity

### Docker Swarm Stack (docker-compose.yml)

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: supercheck
      POSTGRES_USER: supercheck
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U supercheck"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - supercheck

  # Redis for job queues
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: '1'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - supercheck

  # MinIO for artifact storage
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: '1'
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - supercheck

  # App Service (Next.js)
  app:
    image: ghcr.io/supercheck-io/supercheck/app:latest
    environment:
      DATABASE_URL: postgresql://supercheck:${DB_PASSWORD}@postgres:5432/supercheck
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NEXT_PUBLIC_APP_URL: https://${DOMAIN}
      AWS_ACCESS_KEY_ID: ${MINIO_ROOT_USER}
      AWS_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      AWS_ENDPOINT: http://minio:9000
      AWS_REGION: us-east-1
      S3_BUCKET_NAME: supercheck-reports
      # Multi-location configuration
      ALLOW_INTERNAL_TARGETS: "false"
    depends_on:
      - postgres
      - redis
      - minio
    deploy:
      replicas: 2  # For high availability
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - supercheck
      - traefik_public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.app.entrypoints=websecure"
      - "traefik.http.routers.app.tls.certresolver=letsencrypt"
      - "traefik.http.services.app.loadbalancer.server.port=3000"

  # Worker Service (NestJS) - Handles multi-location monitoring
  worker:
    image: ghcr.io/supercheck-io/supercheck/worker:latest
    environment:
      DATABASE_URL: postgresql://supercheck:${DB_PASSWORD}@postgres:5432/supercheck
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      AWS_ACCESS_KEY_ID: ${MINIO_ROOT_USER}
      AWS_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      AWS_ENDPOINT: http://minio:9000
      AWS_REGION: us-east-1
      S3_BUCKET_NAME: supercheck-reports
      RUNNING_CAPACITY: 10
      QUEUED_CAPACITY: 100
      TEST_EXECUTION_TIMEOUT_MS: 300000
      # Multi-location configuration
      ALLOW_INTERNAL_TARGETS: "false"
    depends_on:
      - postgres
      - redis
      - minio
    deploy:
      replicas: 3  # Scale based on monitoring load
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - supercheck

networks:
  supercheck:
    driver: overlay
    attachable: true
  traefik_public:
    external: true

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  minio_data:
    driver: local
```

### Environment Variables (.env)

```bash
# Domain Configuration
DOMAIN=supercheck.yourdomain.com

# Database
DB_PASSWORD=<strong-random-password>

# Redis
REDIS_PASSWORD=<strong-random-password>

# MinIO
MINIO_ROOT_USER=supercheck-admin
MINIO_ROOT_PASSWORD=<strong-random-password>

# Application Secrets
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>
BETTER_AUTH_URL=https://supercheck.yourdomain.com

# Email Configuration (optional)
RESEND_API_KEY=<your-resend-api-key>
EMAIL_FROM=noreply@yourdomain.com

# AI Fix Feature (optional)
AI_FIX_ENABLED=true
AI_PROVIDER=openai
AI_MODEL=gpt-4
OPENAI_API_KEY=<your-openai-api-key>
```

### Deployment Commands

```bash
# 1. Initialize Docker Swarm
docker swarm init

# 2. Create necessary networks
docker network create --driver overlay traefik_public

# 3. Deploy Traefik (reverse proxy)
docker stack deploy -c traefik-stack.yml traefik

# 4. Deploy Supercheck
docker stack deploy -c docker-compose.yml supercheck

# 5. Check deployment status
docker stack services supercheck

# 6. View logs
docker service logs -f supercheck_worker
docker service logs -f supercheck_app

# 7. Scale workers based on load
docker service scale supercheck_worker=5
```

### How Multi-Location Works (Simulated Mode)

1. **User Configuration**: User enables multi-location monitoring and selects locations (e.g., US East, EU West, Asia Pacific)

2. **Job Scheduling**: BullMQ scheduler creates a single job for the monitor

3. **Worker Processing**:
   ```typescript
   // Worker receives job
   const monitor = getMonitor(jobData.monitorId);
   const locations = monitor.config.locationConfig.locations; // ['us-east', 'eu-west', 'asia-pacific']

   // Execute from all locations in parallel
   const results = await Promise.all(
     locations.map(location => executeMonitor(jobData, location))
   );

   // Each execution adds simulated delay based on location
   // us-east: +50ms, eu-west: +100ms, asia-pacific: +150ms
   ```

4. **Result Aggregation**:
   ```typescript
   // Calculate overall status
   const upCount = results.filter(r => r.isUp).length;
   const threshold = monitor.config.locationConfig.threshold; // e.g., 80%
   const upPercentage = (upCount / results.length) * 100;

   const overallStatus = upPercentage >= threshold ? 'up' : 'down';
   ```

5. **Storage**: Each location's result is stored separately in `monitor_results` table

6. **Display**: UI shows per-location status, response times, and aggregated status

### Performance Tuning

```yaml
# Adjust worker replicas based on monitoring load
# Rule of thumb: 1 worker per 50 monitors with 5-minute intervals

# For 500 monitors:
worker:
  deploy:
    replicas: 10

# For 1000 monitors:
worker:
  deploy:
    replicas: 20

# Monitor worker CPU/Memory usage:
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

---

## Option 2: True Distributed Multi-Location

### Overview
Deploy worker pods in actual geographic regions to get real latency measurements and detect region-specific outages.

### Requirements
- **Servers:** 1 manager + 3-6 workers across different Hetzner locations
- **Locations:**
  - Manager: Falkenstein (Germany) or Nuremberg
  - Worker 1: Falkenstein (eu-central)
  - Worker 2: Helsinki (eu-north)
  - Worker 3: Ashburn (us-east)
  - Worker 4: Hillsboro (us-west) - if available
  - Worker 5: Singapore (asia-pacific) - if available

**Note:** Hetzner's data center availability varies. Check current locations at https://www.hetzner.com/data-centers

### Architecture

```
┌──────────────────────────────────────────────────────┐
│           Central Manager (Germany)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │   App    │  │ Postgres │  │  Redis   │           │
│  │ (Next.js)│  │          │  │ (Cluster)│           │
│  └──────────┘  └──────────┘  └──────────┘           │
│           Assigns jobs with location tags             │
└───────────────────────┬──────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼────────┐
│  Worker      │ │  Worker     │ │  Worker      │
│  (US East)   │ │  (EU West)  │ │ (Asia Pac)   │
│  Tag: us-east│ │Tag: eu-west │ │Tag: asia-pac │
└──────────────┘ └─────────────┘ └──────────────┘
```

### Worker Location Tagging

Tag each worker node with its geographic location:

```bash
# On manager node, label worker nodes
docker node update --label-add location=us-east worker-us-1
docker node update --label-add location=eu-west worker-eu-1
docker node update --label-add location=asia-pacific worker-asia-1
```

### Modified docker-compose.yml for Distributed Setup

```yaml
version: '3.8'

services:
  # ... (postgres, redis, minio, app remain on manager)

  # Worker for US East
  worker_us_east:
    image: ghcr.io/supercheck-io/supercheck/worker:latest
    environment:
      <<: *worker-common-env
      WORKER_LOCATION: us-east
      WORKER_QUEUE_NAME: monitor-execution-us-east
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.labels.location == us-east
      resources:
        limits:
          cpus: '2'
          memory: 4G
    networks:
      - supercheck

  # Worker for EU West
  worker_eu_west:
    image: ghcr.io/supercheck-io/supercheck/worker:latest
    environment:
      <<: *worker-common-env
      WORKER_LOCATION: eu-west
      WORKER_QUEUE_NAME: monitor-execution-eu-west
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.labels.location == eu-west
      resources:
        limits:
          cpus: '2'
          memory: 4G
    networks:
      - supercheck

  # Worker for Asia Pacific
  worker_asia_pacific:
    image: ghcr.io/supercheck-io/supercheck/worker:latest
    environment:
      <<: *worker-common-env
      WORKER_LOCATION: asia-pacific
      WORKER_QUEUE_NAME: monitor-execution-asia-pacific
    deploy:
      replicas: 2
      placement:
        constraints:
          - node.labels.location == asia-pacific
      resources:
        limits:
          cpus: '2'
          memory: 4G
    networks:
      - supercheck

x-worker-common-env: &worker-common-env
  DATABASE_URL: postgresql://supercheck:${DB_PASSWORD}@postgres:5432/supercheck
  REDIS_HOST: redis
  REDIS_PORT: 6379
  REDIS_PASSWORD: ${REDIS_PASSWORD}
  RUNNING_CAPACITY: 10
  QUEUED_CAPACITY: 100
```

### Code Modifications Needed

To support true distributed multi-location, you would need to modify the worker service:

**1. Update MonitorProcessor to use location-specific queues:**

```typescript
// worker/src/monitor/monitor.processor.ts
@Processor(process.env.WORKER_QUEUE_NAME || MONITOR_EXECUTION_QUEUE)
export class MonitorProcessor extends WorkerHost {
  private readonly location: MonitoringLocation;

  constructor(private readonly monitorService: MonitorService) {
    super();
    this.location = (process.env.WORKER_LOCATION as MonitoringLocation) || MONITORING_LOCATIONS.US_EAST;
  }

  async process(job: Job<MonitorJobDataDto>): Promise<MonitorExecutionResult> {
    // Execute only for this worker's location
    return this.monitorService.executeMonitor(job.data, this.location);
  }
}
```

**2. Update MonitorService to create location-specific jobs:**

```typescript
// worker/src/monitor/monitor.service.ts
async executeMonitorWithLocations(jobData: MonitorJobDataDto): Promise<void> {
  const monitor = await this.getMonitor(jobData.monitorId);
  const locations = this.locationService.getEffectiveLocations(monitor.config);

  // Add job to each location-specific queue
  for (const location of locations) {
    const queueName = `monitor-execution-${location}`;
    await this.queue.add(queueName, jobData);
  }
}
```

**3. Update job scheduler to distribute to location queues:**

```typescript
// app/src/lib/monitor-scheduler.ts
export async function scheduleMonitor(params: {
  monitorId: string;
  locations: MonitoringLocation[];
}) {
  for (const location of params.locations) {
    const queueName = `monitor-execution-${location}`;
    await queue.add(queueName, jobData, {
      repeat: { pattern: cronPattern },
      jobId: `${params.monitorId}-${location}`,
    });
  }
}
```

### Network Configuration

For distributed deployment, ensure proper network connectivity:

```bash
# 1. Open ports on manager node
ufw allow 2377/tcp   # Swarm management
ufw allow 7946/tcp   # Node communication
ufw allow 7946/udp   # Node communication
ufw allow 4789/udp   # Overlay network

# 2. Join worker nodes to swarm
# On each worker node:
docker swarm join --token <worker-token> <manager-ip>:2377

# 3. Create overlay network for cross-region communication
docker network create \
  --driver overlay \
  --subnet 10.10.0.0/16 \
  --attachable \
  supercheck

# 4. Verify connectivity
docker exec <container-id> ping postgres
```

### Cost Estimation (Hetzner)

**Simulated Mode (Single Region):**
- 1x CX31 (4 vCPU, 8GB RAM): €12.90/month
- **Total**: ~€13/month

**Distributed Mode (Multi-Region):**
- 1x Manager (CX31): €12.90/month
- 3x Workers (CX21, 2 vCPU, 4GB RAM): 3 × €7.05 = €21.15/month
- **Total**: ~€34/month

---

## Hetzner Server Setup

### 1. Provision Servers

```bash
# Using Hetzner Cloud CLI (hcloud)
hcloud server create \
  --name supercheck-manager \
  --type cx31 \
  --image ubuntu-22.04 \
  --ssh-key <your-ssh-key> \
  --location fsn1  # Falkenstein, Germany

# For distributed setup, create workers in different locations:
hcloud server create --name worker-us --type cx21 --image ubuntu-22.04 --location ash  # Ashburn, US
hcloud server create --name worker-eu --type cx21 --image ubuntu-22.04 --location hel  # Helsinki
hcloud server create --name worker-asia --type cx21 --image ubuntu-22.04 --location sin  # Singapore (if available)
```

### 2. Initial Server Configuration

```bash
# Run on each server
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Enable Docker
systemctl enable docker
systemctl start docker

# Install Docker Compose
apt install docker-compose-plugin -y

# Configure firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2377/tcp
ufw allow 7946/tcp
ufw allow 7946/udp
ufw allow 4789/udp
ufw enable
```

---

## Docker Swarm Configuration

### Initialize Swarm (on manager)

```bash
docker swarm init --advertise-addr <manager-ip>

# Save the join tokens
docker swarm join-token worker
docker swarm join-token manager
```

### Join Workers

```bash
# On each worker node, run the command from join-token output:
docker swarm join --token <worker-token> <manager-ip>:2377
```

### Verify Cluster

```bash
docker node ls
# Should show all nodes with their availability and status
```

---

## Deployment Steps

### 1. Prepare Configuration Files

Create directory structure on manager:
```bash
mkdir -p /opt/supercheck
cd /opt/supercheck

# Create .env file
nano .env
# (paste environment variables)

# Create docker-compose.yml
nano docker-compose.yml
# (paste stack configuration)
```

### 2. Deploy Traefik (Reverse Proxy)

```yaml
# traefik-stack.yml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.swarmMode=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_letsencrypt:/letsencrypt
    deploy:
      placement:
        constraints:
          - node.role == manager
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.dashboard.rule=Host(`traefik.yourdomain.com`)"
        - "traefik.http.routers.dashboard.service=api@internal"
        - "traefik.http.routers.dashboard.entrypoints=websecure"
        - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
    networks:
      - traefik_public

networks:
  traefik_public:
    driver: overlay
    attachable: true

volumes:
  traefik_letsencrypt:
```

Deploy:
```bash
docker stack deploy -c traefik-stack.yml traefik
```

### 3. Deploy Supercheck

```bash
docker stack deploy -c docker-compose.yml supercheck
```

### 4. Initialize Database

```bash
# Run migrations
docker exec -it $(docker ps -q -f name=supercheck_app) npm run db:migrate

# Create super admin
docker exec -it $(docker ps -q -f name=supercheck_app) npm run setup:admin admin@yourdomain.com
```

### 5. Verify Deployment

```bash
# Check all services are running
docker stack services supercheck

# Check individual service logs
docker service logs supercheck_app
docker service logs supercheck_worker
docker service logs supercheck_postgres

# Check health
curl https://supercheck.yourdomain.com/api/health
```

---

## Monitoring and Maintenance

### Service Monitoring

```bash
# Real-time stats
docker stats

# Service status
docker stack ps supercheck

# View recent logs
docker service logs --tail 100 -f supercheck_worker

# Inspect service
docker service inspect --pretty supercheck_worker
```

### Database Backups

```bash
# Create backup script
cat > /opt/supercheck/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/supercheck/backups
mkdir -p $BACKUP_DIR

docker exec $(docker ps -q -f name=supercheck_postgres) \
  pg_dump -U supercheck supercheck | \
  gzip > $BACKUP_DIR/supercheck_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "supercheck_*.sql.gz" -mtime +30 -delete
EOF

chmod +x /opt/supercheck/backup.sh

# Add to cron (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/supercheck/backup.sh") | crontab -
```

### Log Rotation

```yaml
# Add to docker-compose.yml for each service
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Updates and Rolling Deployments

```bash
# Update app service
docker service update \
  --image ghcr.io/supercheck-io/supercheck/app:latest \
  --update-parallelism 1 \
  --update-delay 30s \
  supercheck_app

# Update worker service
docker service update \
  --image ghcr.io/supercheck-io/supercheck/worker:latest \
  --update-parallelism 1 \
  --update-delay 30s \
  supercheck_worker

# Rollback if needed
docker service rollback supercheck_app
```

---

## Scaling Considerations

### Horizontal Scaling

```bash
# Scale workers based on load
docker service scale supercheck_worker=5

# Scale app for high availability
docker service scale supercheck_app=3

# Auto-scaling based on CPU (requires custom monitoring)
# Monitor CPU usage:
docker stats --no-stream | grep worker

# If CPU > 80%, scale up:
docker service scale supercheck_worker=$(($(docker service ls -q -f name=supercheck_worker | wc -l) + 2))
```

### Vertical Scaling

Update resource limits in docker-compose.yml:

```yaml
worker:
  deploy:
    resources:
      limits:
        cpus: '4'      # Increased from 2
        memory: 8G     # Increased from 4G
      reservations:
        cpus: '2'
        memory: 4G
```

Redeploy:
```bash
docker stack deploy -c docker-compose.yml supercheck
```

### Database Scaling

For high load, consider PostgreSQL replication:

```yaml
# Add read replica
postgres_replica:
  image: postgres:18-alpine
  environment:
    POSTGRES_PRIMARY_HOST: postgres
    POSTGRES_REPLICATION_MODE: slave
  depends_on:
    - postgres
```

---

## Security Best Practices

### 1. Secrets Management

Use Docker secrets instead of environment variables:

```bash
# Create secrets
echo "strong-db-password" | docker secret create db_password -
echo "strong-redis-password" | docker secret create redis_password -

# Update docker-compose.yml
services:
  postgres:
    secrets:
      - db_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    external: true
  redis_password:
    external: true
```

### 2. Network Isolation

```yaml
# Separate networks for different tiers
networks:
  frontend:
    driver: overlay
  backend:
    driver: overlay
    internal: true  # No external access

services:
  app:
    networks:
      - frontend
      - backend
  worker:
    networks:
      - backend
  postgres:
    networks:
      - backend
```

### 3. Firewall Rules

```bash
# Restrict access to manager node
ufw allow from <trusted-ip> to any port 22
ufw allow 80/tcp
ufw allow 443/tcp

# Worker-to-manager communication only
ufw allow from <worker-1-ip> to any port 2377
ufw allow from <worker-2-ip> to any port 2377
```

### 4. TLS Certificates

Traefik handles Let's Encrypt automatically, but ensure:
- DNS records point to manager IP
- Ports 80/443 are accessible
- Valid email for certificate notifications

### 5. Regular Updates

```bash
# Update Docker
apt update && apt upgrade docker-ce

# Update images
docker service update --image ghcr.io/supercheck-io/supercheck/app:latest supercheck_app
docker service update --image ghcr.io/supercheck-io/supercheck/worker:latest supercheck_worker
```

---

## Troubleshooting

### Common Issues

**1. Services won't start:**
```bash
# Check logs
docker service logs supercheck_app

# Check service status
docker service ps supercheck_app --no-trunc

# Verify network
docker network inspect supercheck
```

**2. Database connection errors:**
```bash
# Test connectivity
docker exec -it $(docker ps -q -f name=supercheck_app) sh
nc -zv postgres 5432

# Check database logs
docker service logs supercheck_postgres
```

**3. Worker not processing jobs:**
```bash
# Check Redis connection
docker exec -it $(docker ps -q -f name=supercheck_worker) sh
redis-cli -h redis -a $REDIS_PASSWORD ping

# Check queue status
docker exec -it $(docker ps -q -f name=supercheck_app) sh
npx bull-monitor
```

**4. High memory usage:**
```bash
# Check per-service memory
docker stats --no-stream

# Adjust limits in docker-compose.yml
# Restart services
docker service update --force supercheck_worker
```

---

## Summary

### Quick Start (Simulated Mode)

1. Provision Hetzner server (CX31 or larger)
2. Install Docker and initialize Swarm
3. Deploy Traefik for SSL
4. Deploy Supercheck stack
5. Run database migrations
6. Create super admin user
7. Configure monitors with multi-location enabled

**Total time**: ~30 minutes
**Monthly cost**: €13-20

### Enterprise Setup (Distributed Mode)

1. Provision manager + 3-6 workers across regions
2. Initialize Swarm and join workers
3. Label nodes with location tags
4. Deploy location-specific worker services
5. Configure cross-region networking
6. Implement location-aware job distribution

**Total time**: ~2-3 hours
**Monthly cost**: €35-75 depending on regions

### Next Steps

1. Set up monitoring (Prometheus + Grafana)
2. Configure alerting for infrastructure issues
3. Implement automated backups
4. Set up CI/CD for automatic deployments
5. Plan capacity based on monitoring load

---

**For questions or issues, refer to:**
- Supercheck documentation: `/docs`
- Docker Swarm docs: https://docs.docker.com/engine/swarm/
- Hetzner Cloud docs: https://docs.hetzner.com/cloud/

---

**Last Updated**: 2025-10-23
**Version**: 1.0
**Target**: Docker Swarm on Hetzner Cloud
