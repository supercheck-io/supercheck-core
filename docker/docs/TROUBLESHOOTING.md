# Docker Swarm Troubleshooting Guide

This guide provides comprehensive troubleshooting procedures for common issues encountered when running Supercheck on Docker Swarm.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Service Problems](#service-problems)
4. [Network Issues](#network-issues)
5. [Storage Problems](#storage-problems)
6. [Performance Issues](#performance-issues)
7. [Security Issues](#security-issues)
8. [Recovery Procedures](#recovery-procedures)
9. [Debug Tools](#debug-tools)

## Quick Diagnostics

### 1. System Health Check

```bash
#!/bin/bash
# docker/scripts/health-check.sh

echo "=== Docker Swarm Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Check Docker daemon
echo "1. Docker Daemon Status:"
systemctl is-active docker || echo "ERROR: Docker daemon is not running"
docker --version
echo ""

# Check Swarm status
echo "2. Docker Swarm Status:"
docker info | grep -A 10 "Swarm:" || echo "ERROR: Not part of a Swarm"
echo ""

# Check node status
echo "3. Node Status:"
docker node ls
echo ""

# Check service status
echo "4. Service Status:"
docker service ls
echo ""

# Check network status
echo "5. Network Status:"
docker network ls | grep overlay
echo ""

# Check resource usage
echo "6. Resource Usage:"
echo "Memory: $(free -h | awk '/^Mem:/ {print $3 "/" $2 " (" int($3/$2 * 100) "%)"}')"
echo "Disk: $(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 ")"}')"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo ""

# Check container status
echo "7. Container Status:"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Check recent errors
echo "8. Recent Errors:"
journalctl -u docker --since "1 hour ago" | grep -i error | tail -5 || echo "No recent errors"
echo ""
```

### 2. Service Health Check

```bash
#!/bin/bash
# docker/scripts/service-health-check.sh

echo "=== Service Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Check each service
services=("supercheck_postgres" "supercheck_redis" "supercheck_minio" "supercheck_app" "supercheck_worker" "supercheck_nginx")

for service in "${services[@]}"; do
    echo "Checking $service:"

    # Check if service exists
    if ! docker service ls | grep -q $service; then
        echo "  ERROR: Service $service not found"
        continue
    fi

    # Check service replicas
    replicas=$(docker service ls --filter name=$service --format "{{.Replicas}}")
    echo "  Replicas: $replicas"

    # Check service tasks
    tasks=$(docker service ps $service --format "table {{.Name}}\t{{.CurrentState}}\t{{.Error}}")
    echo "  Tasks:"
    echo "$tasks" | sed 's/^/    /'

    # Check service logs for errors
    errors=$(docker service logs $service --since 1h 2>&1 | grep -i error | wc -l)
    echo "  Errors in last hour: $errors"

    echo ""
done
```

## Common Issues

### 1. Docker Daemon Issues

#### Problem: Docker daemon fails to start

**Symptoms:**

- `systemctl start docker` fails
- `docker` command returns "Cannot connect to the Docker daemon"

**Solutions:**

```bash
# Check Docker daemon status
systemctl status docker

# Check Docker daemon logs
journalctl -u docker -f

# Check for configuration errors
dockerd --debug

# Common fixes:
# 1. Fix permissions
chown root:root /var/run/docker.sock
chmod 660 /var/run/docker.sock

# 2. Check disk space
df -h /

# 3. Check memory
free -h

# 4. Reset Docker daemon
systemctl stop docker
rm -rf /var/lib/docker/*
systemctl start docker
```

#### Problem: High Docker daemon memory usage

**Symptoms:**

- System runs out of memory
- Docker daemon OOM kills

**Solutions:**

```bash
# Check Docker memory usage
docker system df

# Clean up unused resources
docker system prune -a -f

# Configure Docker daemon limits
cat > /etc/docker/daemon.json << EOF
{
  "storage-driver": "overlay2",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  },
  "default-ulimits": {
    "memlock": {
      "Name": "memlock",
      "Hard": -1,
      "Soft": -1
    }
  }
}
EOF

systemctl restart docker
```

### 2. Docker Swarm Issues

#### Problem: Nodes cannot join Swarm

**Symptoms:**

- `docker swarm join` fails with timeout
- Nodes show as "Down" in `docker node ls`

**Solutions:**

```bash
# Check network connectivity
ping <manager-ip>
telnet <manager-ip> 2377

# Check firewall rules
ufw status verbose
iptables -L -n

# Check Docker daemon ports
netstat -tlnp | grep -E "(2376|2377|7946|4789)"

# Debug join process
docker swarm join --token <token> <manager-ip>:2377 --debug

# Common fixes:
# 1. Open required ports
ufw allow 2376/tcp
ufw allow 2377/tcp
ufw allow 7946/tcp
ufw allow 7946/udp
ufw allow 4789/udp

# 2. Check DNS resolution
nslookup <manager-hostname>

# 3. Reset Swarm and reinitialize
docker swarm leave --force
docker swarm init --advertise-addr <private-ip>
```

#### Problem: Manager nodes lose quorum

**Symptoms:**

- `docker node ls` shows "no healthy manager in cluster"
- Cannot manage Swarm

**Solutions:**

```bash
# Check manager status
docker node ls

# Check which managers are healthy
docker node inspect $(docker node ls --filter role=manager -q) --format "{{.ID}} {{.Status.State}} {{.ManagerStatus.Reachability}}"

# Force remove unavailable managers
docker node rm --force <unavailable-manager-id>

# Add new manager if needed
docker swarm join-token manager
docker swarm join --token <token> <manager-ip>:2377

# Emergency: Reset Swarm (last resort)
docker swarm leave --force
docker swarm init --force-new-cluster --advertise-addr <private-ip>
```

## Service Problems

### 1. PostgreSQL Issues

#### Problem: PostgreSQL fails to start

**Symptoms:**

- Database service shows "rejected" or "failed"
- Connection refused errors

**Solutions:**

```bash
# Check PostgreSQL logs
docker service logs supercheck_postgres

# Check database files
docker exec $(docker ps -q -f name=postgres) ls -la /var/lib/postgresql/data

# Check permissions
docker exec $(docker ps -q -f name=postgres) ls -la /var/lib/postgresql/data

# Common fixes:
# 1. Fix data directory permissions
docker exec $(docker ps -q -f name=postgres) chown -R postgres:postgres /var/lib/postgresql/data

# 2. Check disk space
docker exec $(docker ps -q -f name=postgres) df -h

# 3. Initialize database manually
docker exec $(docker ps -q -f name=postgres) sudo -u postgres initdb -D /var/lib/postgresql/data

# 4. Reset database (WARNING: data loss)
docker service rm supercheck_postgres
docker volume rm supercheck_postgres_data
docker stack deploy -c docker/stacks/supercheck.yml supercheck
```

#### Problem: Database connection errors

**Symptoms:**

- Application cannot connect to database
- "Connection refused" or "timeout" errors

**Solutions:**

```bash
# Check network connectivity
docker exec $(docker ps -q -f name=app) ping postgres
docker exec $(docker ps -q -f name=app) telnet postgres 5432

# Check database status
docker exec $(docker ps -q -f name=postgres) pg_isready

# Check connection limits
docker exec $(docker ps -q -f name=postgres) psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT count(*) FROM pg_stat_activity;"

# Common fixes:
# 1. Check environment variables
docker service inspect supercheck_postgres --format "{{.Spec.TaskTemplate.ContainerSpec.Env}}"

# 2. Check network configuration
docker network inspect supercheck-backend

# 3. Restart database service
docker service update --force supercheck_postgres
```

### 2. Redis Issues

#### Problem: Redis fails to start

**Symptoms:**

- Redis service shows "rejected" or "failed"
- Memory errors in logs

**Solutions:**

```bash
# Check Redis logs
docker service logs supercheck_redis

# Check Redis configuration
docker exec $(docker ps -q -f name=redis) redis-cli CONFIG GET "*"

# Check memory usage
docker exec $(docker ps -q -f name=redis) redis-cli INFO memory

# Common fixes:
# 1. Check memory limits
docker service inspect supercheck_redis --format "{{.Spec.TaskTemplate.Resources.Limits}}"

# 2. Fix Redis configuration
echo "maxmemory 512mb" > redis.conf
echo "maxmemory-policy allkeys-lru" >> redis.conf

# 3. Clear Redis data (WARNING: data loss)
docker exec $(docker ps -q -f name=redis) redis-cli FLUSHALL
```

### 3. Application Issues

#### Problem: Application containers keep restarting

**Symptoms:**

- Service shows "replicated 0/1" or similar
- Containers in "restarting" state

**Solutions:**

```bash
# Check application logs
docker service logs supercheck_app
docker service logs supercheck_worker

# Check container exit codes
docker service ps supercheck_app --format "table {{.Name}}\t{{.CurrentState}}\t{{.Error}}"

# Debug container startup
docker run --rm -it ghcr.io/supercheck-io/supercheck/app:latest /bin/bash

# Common fixes:
# 1. Check environment variables
docker service inspect supercheck_app --format "{{.Spec.TaskTemplate.ContainerSpec.Env}}"

# 2. Check resource limits
docker service inspect supercheck_app --format "{{.Spec.TaskTemplate.Resources}}"

# 3. Check database connectivity
docker exec $(docker ps -q -f name=app) telnet postgres 5432

# 4. Update service with debug mode
docker service update --env-add DEBUG=true supercheck_app
```

## Network Issues

### 1. Overlay Network Problems

#### Problem: Services cannot communicate

**Symptoms:**

- Connection timeouts between services
- "Network not found" errors

**Solutions:**

```bash
# Check network status
docker network ls
docker network inspect supercheck-backend

# Check network endpoints
docker network inspect supercheck-backend --format "{{json .Containers}}"

# Test connectivity between containers
docker exec $(docker ps -q -f name=app) ping postgres
docker exec $(docker ps -q -f name=postgres) ping app

# Common fixes:
# 1. Recreate overlay network
docker network rm supercheck-backend
docker network create --driver overlay --attachable supercheck-backend

# 2. Update service networks
docker service update --network-add supercheck-backend supercheck_app

# 3. Check DNS resolution
docker exec $(docker ps -q -f name=app) nslookup postgres
```

### 2. Load Balancer Issues

#### Problem: Nginx reverse proxy not working

**Symptoms:**

- Cannot access application via HTTP/HTTPS
- 502 Bad Gateway errors

**Solutions:**

```bash
# Check Nginx logs
docker service logs supercheck_nginx

# Check Nginx configuration
docker exec $(docker ps -q -f name=nginx) nginx -t

# Check upstream servers
docker exec $(docker ps -q -f name=nginx) curl -I http://app:3000

# Common fixes:
# 1. Update Nginx configuration
docker service update --force supercheck_nginx

# 2. Check service discovery
docker exec $(docker ps -q -f name=nginx) nslookup app

# 3. Verify port exposure
docker service inspect supercheck_app --format "{{.Spec.EndpointSpec.Ports}}"
```

## Storage Problems

### 1. Volume Issues

#### Problem: Data not persisting

**Symptoms:**

- Data lost after container restart
- Volume mounting errors

**Solutions:**

```bash
# Check volume status
docker volume ls
docker volume inspect supercheck_postgres_data

# Check volume mount points
docker inspect $(docker ps -q -f name=postgres) --format "{{json .Mounts}}"

# Common fixes:
# 1. Recreate volume with correct permissions
docker volume rm supercheck_postgres_data
docker volume create supercheck_postgres_data
docker run --rm -v supercheck_postgres_data:/data busybox chown -R 999:999 /data

# 2. Update service with correct volume
docker service update --mount-add type=volume,source=supercheck_postgres_data,target=/var/lib/postgresql/data supercheck_postgres
```

### 2. MinIO Issues

#### Problem: MinIO storage not accessible

**Symptoms:**

- Cannot upload/download files
- "Bucket not found" errors

**Solutions:**

```bash
# Check MinIO logs
docker service logs supercheck_minio

# Check MinIO status
docker exec $(docker ps -q -f name=minio) curl -I http://localhost:9000/minio/health/live

# Check bucket configuration
docker exec $(docker ps -q -f name=minio) mc ls local/

# Common fixes:
# 1. Reset MinIO access keys
docker exec $(docker ps -q -f name=minio) mc admin user add local ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD}

# 2. Recreate buckets
docker exec $(docker ps -q -f name=minio) mc mb local/supercheck-artifacts

# 3. Check volume permissions
docker exec $(docker ps -q -f name=minio) ls -la /data
```

## Performance Issues

### 1. High Memory Usage

#### Problem: Services consuming excessive memory

**Symptoms:**

- System runs out of memory
- OOM killer events

**Solutions:**

```bash
# Check memory usage by service
docker stats --no-stream

# Check memory usage by container
docker exec $(docker ps -q -f name=postgres) ps aux --sort=-%mem | head -10

# Common fixes:
# 1. Set memory limits
docker service update --limit-memory 2G supercheck_app

# 2. Optimize application configuration
docker service update --env-add NODE_OPTIONS="--max-old-space-size=2048" supercheck_app

# 3. Enable swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### 2. High CPU Usage

#### Problem: Services consuming excessive CPU

**Symptoms:**

- High system load
- Slow response times

**Solutions:**

```bash
# Check CPU usage by service
docker stats --no-stream

# Check CPU usage by process
docker exec $(docker ps -q -f name=app) top

# Common fixes:
# 1. Set CPU limits
docker service update --limit-cpu 1.0 supercheck_app

# 2. Scale services
docker service scale supercheck_app=3
docker service scale supercheck_worker=5

# 3. Optimize database queries
docker exec $(docker ps -q -f name=postgres) psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

## Security Issues

### 1. Authentication Problems

#### Problem: Cannot authenticate with services

**Symptoms:**

- 401 Unauthorized errors
- Login failures

**Solutions:**

```bash
# Check authentication logs
docker service logs supercheck_app | grep -i auth

# Check environment variables
docker service inspect supercheck_app --format "{{.Spec.TaskTemplate.ContainerSpec.Env}}"

# Common fixes:
# 1. Reset authentication secrets
echo "new_secret" | docker secret create nextauth_secret -

# 2. Update service with new secrets
docker service update --secret-add nextauth_secret supercheck_app

# 3. Check SSL certificates
docker exec $(docker ps -q -f name=nginx) openssl x509 -in /etc/nginx/ssl/cert.pem -text -noout
```

### 2. Permission Issues

#### Problem: Services cannot access resources

**Symptoms:**

- Permission denied errors
- File access issues

**Solutions:**

```bash
# Check file permissions
docker exec $(docker ps -q -f name=app) ls -la /app

# Check user context
docker exec $(docker ps -q -f name=app) id

# Common fixes:
# 1. Fix file permissions
docker exec $(docker ps -q -f name=app) chown -R node:node /app

# 2. Run as correct user
docker service update --user node supercheck_app

# 3. Check volume permissions
docker run --rm -v supercheck_postgres_data:/data busybox ls -la /data
```

## Recovery Procedures

### 1. Service Recovery

```bash
#!/bin/bash
# docker/scripts/recover-service.sh

SERVICE_NAME=$1

echo "Recovering service: $SERVICE_NAME"

# Check service status
docker service ls | grep $SERVICE_NAME

# Get current replicas
REPLICAS=$(docker service ls --filter name=$SERVICE_NAME --format "{{.Replicas}}")

# Scale down
echo "Scaling down service..."
docker service scale $SERVICE_NAME=0

# Wait for scale down
sleep 30

# Scale up
echo "Scaling up service..."
CURRENT_REPLICAS=$(echo $REPLICAS | cut -d'/' -f1)
docker service scale $SERVICE_NAME=$CURRENT_REPLICAS

# Wait for scale up
sleep 60

# Check service status
docker service ps $SERVICE_NAME
```

### 2. Network Recovery

```bash
#!/bin/bash
# docker/scripts/recover-network.sh

NETWORK_NAME=$1

echo "Recovering network: $NETWORK_NAME"

# Check network status
docker network ls | grep $NETWORK_NAME

# Remove and recreate network
echo "Recreating network..."
docker network rm $NETWORK_NAME
docker network create --driver overlay --attachable $NETWORK_NAME

# Update services to use new network
echo "Updating services..."
for service in $(docker service ls --format "{{.Name}}"); do
    if docker service inspect $service --format "{{json .Spec.TaskTemplate.Networks}}" | grep -q $NETWORK_NAME; then
        echo "Updating $service..."
        docker service update --network-rm $NETWORK_NAME $service
        docker service update --network-add $NETWORK_NAME $service
    fi
done
```

### 3. Full System Recovery

```bash
#!/bin/bash
# docker/scripts/full-recovery.sh

echo "Starting full system recovery..."

# Stop all services
echo "Stopping all services..."
docker stack rm supercheck
docker stack rm monitoring

# Wait for cleanup
sleep 60

# Clean up resources
echo "Cleaning up resources..."
docker system prune -a -f
docker volume prune -f
docker network prune -f

# Restart Docker daemon
echo "Restarting Docker daemon..."
systemctl restart docker
sleep 30

# Redeploy stacks
echo "Redeploying stacks..."
docker stack deploy -c docker/stacks/supercheck.yml supercheck
docker stack deploy -c docker/stacks/monitoring.yml monitoring

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 120

# Check system status
echo "Checking system status..."
docker service ls
docker node ls

echo "Full system recovery completed"
```

## Debug Tools

### 1. Container Debug

```bash
#!/bin/bash
# docker/scripts/debug-container.sh

CONTAINER_NAME=$1

echo "Debugging container: $CONTAINER_NAME"

# Get container ID
CONTAINER_ID=$(docker ps -q -f name=$CONTAINER_NAME)

if [ -z "$CONTAINER_ID" ]; then
    echo "Container $CONTAINER_NAME not found"
    exit 1
fi

# Container information
echo "=== Container Information ==="
docker inspect $CONTAINER_ID --format "{{json .State}}"
echo ""

# Container processes
echo "=== Container Processes ==="
docker exec $CONTAINER_ID ps aux
echo ""

# Container network configuration
echo "=== Network Configuration ==="
docker exec $CONTAINER_ID ip addr show
echo ""

# Container mounts
echo "=== Mounts ==="
docker inspect $CONTAINER_ID --format "{{json .Mounts}}"
echo ""

# Container environment variables
echo "=== Environment Variables ==="
docker inspect $CONTAINER_ID --format "{{json .Config.Env}}"
echo ""

# Container logs (last 50 lines)
echo "=== Recent Logs ==="
docker logs --tail 50 $CONTAINER_ID
echo ""

# Interactive shell
echo "Starting interactive shell..."
docker exec -it $CONTAINER_ID /bin/bash
```

### 2. Service Debug

```bash
#!/bin/bash
# docker/scripts/debug-service.sh

SERVICE_NAME=$1

echo "Debugging service: $SERVICE_NAME"

# Service information
echo "=== Service Information ==="
docker service inspect $SERVICE_NAME --format "{{json .Spec}}"
echo ""

# Service tasks
echo "=== Service Tasks ==="
docker service ps $SERVICE_NAME
echo ""

# Service logs
echo "=== Service Logs ==="
docker service logs --tail 50 $SERVICE_NAME
echo ""

# Service constraints
echo "=== Service Constraints ==="
docker service inspect $SERVICE_NAME --format "{{json .Spec.TaskTemplate.Placement.Constraints}}"
echo ""

# Service resources
echo "=== Service Resources ==="
docker service inspect $SERVICE_NAME --format "{{json .Spec.TaskTemplate.Resources}}"
echo ""

# Service networks
echo "=== Service Networks ==="
docker service inspect $SERVICE_NAME --format "{{json .Spec.TaskTemplate.Networks}}"
echo ""
```

### 3. Network Debug

```bash
#!/bin/bash
# docker/scripts/debug-network.sh

NETWORK_NAME=$1

echo "Debugging network: $NETWORK_NAME"

# Network information
echo "=== Network Information ==="
docker network inspect $NETWORK_NAME
echo ""

# Network containers
echo "=== Network Containers ==="
docker network inspect $NETWORK_NAME --format "{{json .Containers}}"
echo ""

# Test connectivity between containers
echo "=== Connectivity Test ==="
for container in $(docker ps --format "{{.Names}}"); do
    if docker network inspect $NETWORK_NAME --format "{{json .Containers}}" | grep -q $container; then
        echo "Testing from $container:"
        docker exec $container ping -c 1 google.com || echo "  Failed to ping internet"
        docker exec $container nslookup google.com || echo "  Failed DNS resolution"
    fi
done
echo ""
```

This comprehensive troubleshooting guide should help you diagnose and resolve most issues encountered when running Supercheck on Docker Swarm. Remember to always check logs first and use the debug tools to gather information before making changes.
