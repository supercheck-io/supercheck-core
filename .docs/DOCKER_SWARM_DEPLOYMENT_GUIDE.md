# Docker Swarm Deployment Guide for Supercheck

This comprehensive guide shows how to deploy Supercheck using Docker Swarm with external managed services for simplified operations and maximum reliability.

## 📋 Table of Contents

- [Overview](#overview)
- [Docker Swarm vs Kubernetes Comparison](#docker-swarm-vs-kubernetes-comparison)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Management](#management)
- [Monitoring](#monitoring)
- [Security](#security)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)
- [Production Best Practices](#production-best-practices)

## 🎯 Overview

Docker Swarm provides a **simpler alternative to Kubernetes** for Supercheck deployment while maintaining production-grade features like:

- **Native Docker integration** - No additional orchestration complexity
- **Built-in load balancing** - Automatic service discovery and routing
- **Rolling updates** - Zero-downtime deployments
- **Secret management** - Secure credential handling
- **Auto-healing** - Automatic container restart and rescheduling
- **External services** - Database, Redis, and S3 managed externally

## ⚖️ Docker Swarm vs Kubernetes Comparison

### **For Supercheck Use Case:**

| Aspect | **Docker Swarm** ⭐ | **Kubernetes** |
|--------|-------------------|----------------|
| **Setup Complexity** | Simple (`docker swarm init`) | Complex (many components) |
| **Learning Curve** | Gentle (Docker knowledge) | Steep (K8s-specific concepts) |
| **Operational Overhead** | Low | High |
| **External Services Integration** | Excellent | Good |
| **Small Team Suitability** | Perfect | Overkill |
| **Resource Requirements** | Minimal | Higher |
| **Production Ready** | Yes | Yes |
| **Community/Ecosystem** | Smaller but focused | Large |

### **🏆 Why Docker Swarm Wins for Supercheck:**

#### **✅ Simplicity Benefits:**
```yaml
Docker Swarm Advantages:
- Single command setup: docker swarm init
- Familiar Docker concepts and commands
- Built-in service discovery and load balancing
- Native Docker Compose file compatibility
- Zero additional tools needed
```

#### **✅ Perfect for Test Automation:**
```yaml
Supercheck-Specific Benefits:
- Quick deployment cycles for test environments
- Easy scaling of worker nodes during heavy testing
- Simple rollback capabilities for failed deployments
- Native integration with Docker-based CI/CD
- Ideal for small-to-medium development teams
```

#### **✅ Cost Efficiency:**
```yaml
Resource Savings vs Kubernetes:
- No etcd cluster overhead
- No complex networking setup (CNI)
- No ingress controller complexity
- Lower memory footprint per node
- Simpler monitoring requirements
```

## 🔧 Prerequisites

### **System Requirements**

#### **Manager Node (minimum 1):**
```yaml
CPU: 2+ cores
RAM: 4GB+
Storage: 20GB+ SSD
Network: Static IP recommended
OS: Ubuntu 20.04+ / CentOS 8+ / Docker Desktop
```

#### **Worker Nodes (optional, for scaling):**
```yaml
CPU: 2+ cores
RAM: 4GB+
Storage: 10GB+ SSD
Network: Able to communicate with manager
OS: Same as manager
```

### **Software Requirements**

```bash
# Install Docker Engine
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker info
```

### **External Services Setup**

Before deploying, set up your external managed services:

1. **Database**: Neon PostgreSQL or PlanetScale
2. **Redis**: Redis Cloud
3. **Storage**: AWS S3 or Cloudflare R2

See [External Services Setup Guide](./EXTERNAL_SERVICES_SETUP_GUIDE.md) for detailed instructions.

## 🏗️ Architecture

### **Simplified Architecture with External Services:**

```mermaid
graph TB
    Internet --> LB[Load Balancer / Traefik]
    LB --> App[Supercheck App<br/>2+ replicas]
    App --> Worker[Supercheck Workers<br/>4+ replicas]

    subgraph "Docker Swarm Cluster"
        Manager[Manager Node<br/>- Orchestration<br/>- Scheduling]
        Worker1[Worker Node 1<br/>- App containers<br/>- Worker containers]
        Worker2[Worker Node 2<br/>- Worker containers]

        Manager -.-> Worker1
        Manager -.-> Worker2
    end

    subgraph "External Managed Services"
        DB[(Neon DB<br/>PostgreSQL)]
        Redis[(Redis Cloud<br/>Job Queue)]
        S3[(S3/R2<br/>Artifacts)]
    end

    App --> DB
    Worker --> DB
    App --> Redis
    Worker --> Redis
    App --> S3
    Worker --> S3
```

### **Service Communication:**
```yaml
Internal Services:
- supercheck-app → supercheck-worker (HTTP)
- traefik → supercheck-app (Load balancing)

External Services:
- All services → Neon DB (PostgreSQL)
- All services → Redis Cloud (Job queue)
- All services → S3/R2 (File storage)

Networks:
- supercheck-network: Overlay network for services
- monitoring-network: Optional monitoring stack
```

## ⚙️ Configuration

### **Docker Swarm Setup Files:**

```
docker-swarm/
├── stacks/
│   ├── supercheck-external-services.yml    # Production stack
│   └── supercheck-dev.yml                  # Development stack
├── configs/
│   └── secrets-template.sh                 # Secrets setup template
├── scripts/
│   ├── deploy.sh                          # Deployment automation
│   └── manage.sh                          # Management utilities
└── monitoring/
    ├── prometheus-stack.yml               # Monitoring stack
    └── setup-monitoring.sh               # Monitoring setup
```

### **External Services Configuration:**

#### **1. Database (Neon/PlanetScale):**
```bash
# Example connection strings:
# Neon: postgresql://user:pass@ep-example.neon.com/supercheck?sslmode=require
# PlanetScale: postgresql://user:pass@host.psdb.cloud/supercheck?sslmode=require
DATABASE_URL="your-database-connection-string"
```

#### **2. Redis Cloud:**
```bash
# Example: redis://default:password@redis-host:port
REDIS_URL="your-redis-connection-string"
```

#### **3. AWS S3 or Cloudflare R2:**
```bash
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
S3_JOB_BUCKET_NAME="supercheck-job-artifacts"
S3_TEST_BUCKET_NAME="supercheck-test-artifacts"
```

## 🚀 Quick Start

### **1. Initialize Docker Swarm**

```bash
# On manager node
docker swarm init

# On worker nodes (if using multiple nodes)
docker swarm join --token SWMTKN-xxx manager-ip:2377
```

### **2. Setup Secrets**

```bash
cd docker-swarm

# Copy and configure secrets
cp configs/secrets-template.sh configs/secrets.sh

# Edit with your actual service credentials
vim configs/secrets.sh

# Run secrets setup
chmod +x configs/secrets.sh
./configs/secrets.sh
```

### **3. Deploy Supercheck**

```bash
# Production deployment
cd scripts
./deploy.sh prod

# Development deployment
./deploy.sh dev
```

### **4. Verify Deployment**

```bash
# Check stack status
docker stack services supercheck

# Check service logs
docker service logs -f supercheck_supercheck-app

# Access application
curl http://localhost:3000/api/health
```

## 🔧 Management

### **Using the Management Script**

The `manage.sh` script provides comprehensive management capabilities:

```bash
cd docker-swarm/scripts

# View status
./manage.sh status

# View logs
./manage.sh logs app
./manage.sh logs worker

# Scale services
./manage.sh scale worker 6

# Rolling restart
./manage.sh restart app

# Health check
./manage.sh health

# Real-time monitoring
./manage.sh monitor
```

### **Manual Docker Commands**

```bash
# Service management
docker service ls
docker service ps supercheck_supercheck-app
docker service logs -f supercheck_supercheck-worker

# Scaling
docker service scale supercheck_supercheck-worker=6

# Updates
docker service update --image ghcr.io/supercheck-io/supercheck/app:latest supercheck_supercheck-app

# Stack management
docker stack ls
docker stack ps supercheck
docker stack rm supercheck
```

## 📊 Monitoring

### **Built-in Monitoring Stack**

Deploy Prometheus, Grafana, and AlertManager for comprehensive monitoring:

```bash
cd docker-swarm/monitoring

# Setup and deploy monitoring
./setup-monitoring.sh

# Access monitoring services
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3100 (admin/admin123)
# AlertManager: http://localhost:9093
```

### **Key Metrics Monitored:**

- **System Metrics**: CPU, Memory, Disk, Network
- **Container Metrics**: Resource usage, restart frequency
- **Application Metrics**: Response times, error rates
- **Service Health**: Uptime, availability
- **External Services**: Connection status, latency

### **Custom Alerts:**

```yaml
Preconfigured Alerts:
- High CPU/Memory usage (>80%/85%)
- Service downtime (>1 minute)
- High disk usage (>85%)
- Frequent container restarts (>5/hour)
- External service connectivity issues
```

## 🔒 Security

### **Docker Swarm Security Features:**

#### **1. Secrets Management:**
```bash
# Create secrets securely
echo "password" | docker secret create db_password -

# Use in services
services:
  app:
    secrets:
      - db_password
    environment:
      - DATABASE_PASSWORD_FILE=/run/secrets/db_password
```

#### **2. Network Security:**
```yaml
# Encrypted overlay networks
networks:
  supercheck-network:
    driver: overlay
    encrypted: true  # Enables IPSec encryption
```

#### **3. Node Security:**
```bash
# TLS mutual authentication (automatic)
# Certificate rotation (automatic)
# Role-based access (manager vs worker)

# View certificates
docker swarm ca
```

### **Production Security Checklist:**

- [ ] **Update default passwords** in secrets
- [ ] **Enable firewall** on all nodes
- [ ] **Use TLS certificates** for external access
- [ ] **Regular security updates** for Docker Engine
- [ ] **Monitor access logs** for suspicious activity
- [ ] **Backup secrets** securely
- [ ] **Rotate credentials** regularly
- [ ] **Use non-root containers** where possible

## 📈 Scaling

### **Horizontal Scaling:**

```bash
# Scale workers based on test load
docker service scale supercheck_supercheck-worker=8

# Scale app for high availability
docker service scale supercheck_supercheck-app=3

# Add more nodes to cluster
docker swarm join-token worker  # Get join token
# Run join command on new nodes
```

### **Vertical Scaling:**

```bash
# Update resource limits
docker service update \
  --limit-cpu 2 \
  --limit-memory 4GB \
  --reserve-cpu 1 \
  --reserve-memory 2GB \
  supercheck_supercheck-worker
```

### **Auto-scaling Strategy:**

```bash
# Monitor metrics and scale based on:
# - CPU usage >70% for 5 minutes → Scale up
# - Queue depth >50 jobs → Scale up workers
# - CPU usage <30% for 10 minutes → Scale down
# - Queue depth <5 jobs → Scale down workers

# Example scaling script (run via cron)
#!/bin/bash
CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" | sed 's/%//')
if (( $(echo "$CPU_USAGE > 70" | bc -l) )); then
    docker service scale supercheck_supercheck-worker=6
fi
```

## 🔧 Troubleshooting

### **Common Issues:**

#### **1. Services Not Starting**
```bash
# Check service status
docker service ps supercheck_supercheck-app

# Check logs for errors
docker service logs supercheck_supercheck-app

# Check node capacity
docker node ls
docker system df
```

#### **2. External Service Connectivity**
```bash
# Test database connection
docker exec -it $(docker ps -q --filter "label=com.docker.swarm.service.name=supercheck_supercheck-app") \
  node -e "const { Pool } = require('pg'); const pool = new Pool({connectionString: process.env.DATABASE_URL}); pool.query('SELECT 1').then(console.log).catch(console.error);"

# Test Redis connection
docker exec -it $(docker ps -q --filter "label=com.docker.swarm.service.name=supercheck_supercheck-app") \
  node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL); redis.ping().then(console.log).catch(console.error);"
```

#### **3. Network Issues**
```bash
# Check network connectivity
docker network ls
docker network inspect supercheck-network

# Test inter-service communication
docker exec -it container_id curl http://service_name:port/health
```

#### **4. Resource Issues**
```bash
# Check resource usage
docker stats

# Check disk usage
docker system df
docker system prune -f  # Clean up unused resources

# Check memory usage by service
docker service ls --format "table {{.Name}}\\t{{.Replicas}}\\t{{.Image}}"
```

### **Debug Commands:**

```bash
# Service debugging
docker service ps --no-trunc supercheck_supercheck-app
docker service logs --details supercheck_supercheck-app

# Container debugging
docker exec -it container_id /bin/bash
docker inspect container_id

# Network debugging
docker network inspect network_name
docker exec -it container_id netstat -tlnp
```

## 🏭 Production Best Practices

### **1. High Availability Setup:**

```bash
# Minimum 3 manager nodes (odd number)
docker node promote worker1
docker node promote worker2

# Spread critical services across nodes
services:
  supercheck-app:
    deploy:
      placement:
        constraints:
          - node.role == worker
        preferences:
          - spread: node.labels.zone
```

### **2. Backup Strategy:**

```bash
#!/bin/bash
# Backup script for Docker Swarm

# Backup swarm state (run on manager)
docker swarm ca > swarm-ca-backup.pem

# Backup service configurations
docker service ls --format "{{.Name}}" | xargs -I {} docker service inspect {} > services-backup.json

# Backup secrets (names only, not values)
docker secret ls > secrets-backup.txt

# Backup volumes (if using local volumes)
docker volume ls > volumes-backup.txt
```

### **3. Update Strategy:**

```yaml
# Rolling updates configuration
deploy:
  update_config:
    parallelism: 1        # Update 1 container at a time
    delay: 10s            # Wait between updates
    failure_action: rollback
    monitor: 30s          # Monitor for 30s before next update
  rollback_config:
    parallelism: 1
    delay: 5s
    failure_action: pause
```

### **4. Resource Management:**

```yaml
# Production resource limits
resources:
  limits:
    cpus: '2.0'
    memory: 4G
  reservations:
    cpus: '1.0'
    memory: 2G
```

### **5. Health Checks:**

```yaml
# Comprehensive health checks
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

### **6. Logging Configuration:**

```yaml
# Production logging
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
    labels: "service,environment,version"
```

## 🔄 Migration Strategies

### **From Docker Compose:**

```bash
# 1. Stop Docker Compose services
docker-compose down

# 2. Initialize Docker Swarm
docker swarm init

# 3. Deploy using Swarm stack
docker stack deploy -c supercheck-external-services.yml supercheck
```

### **From Kubernetes:**

```bash
# 1. Export application data from K8s
kubectl get configmaps,secrets -o yaml > k8s-config-backup.yaml

# 2. Transform to Docker Swarm format
# (Manual process - map K8s resources to Swarm equivalents)

# 3. Set up external services (already done)
# 4. Deploy to Swarm
```

### **To Kubernetes (Future Migration):**

```bash
# Docker Swarm configurations can be converted to K8s
# External services remain unchanged
# Use Kompose for automatic conversion assistance
kompose convert -f supercheck-external-services.yml
```

## 📋 Comparison Summary

## **🏆 Final Recommendation: Docker Swarm for Supercheck**

### **When to Choose Docker Swarm:**
✅ **Supercheck fits perfectly here:**
- Small to medium development teams (1-10 developers)
- Focus on simplicity and quick deployments
- Existing Docker expertise
- Cost-conscious operations
- Test automation workloads with variable scaling needs
- External services for database, Redis, storage

### **When to Consider Kubernetes:**
- Large enterprise deployments (100+ services)
- Complex multi-team environments
- Advanced networking requirements
- Extensive third-party integrations needed
- Dedicated DevOps team available

### **For Supercheck Specifically:**

| Factor | Docker Swarm Advantage |
|--------|----------------------|
| **Team Size** | Perfect for small teams |
| **Complexity** | Simple, Docker-native |
| **External Services** | Excellent integration |
| **Test Automation** | Ideal for variable workloads |
| **Cost** | Lower operational overhead |
| **Speed** | Faster deployments and scaling |
| **Learning Curve** | Minimal if you know Docker |

## 🎯 Next Steps

1. **Start with Single Node**: Deploy on single server initially
2. **Add External Services**: Set up Neon DB, Redis Cloud, S3/R2
3. **Deploy Development**: Use dev stack for testing
4. **Add Monitoring**: Deploy Prometheus/Grafana stack
5. **Scale Horizontally**: Add worker nodes as needed
6. **Production Hardening**: Implement security best practices

Docker Swarm provides the **perfect balance of simplicity and functionality** for Supercheck, allowing you to focus on your testing platform rather than orchestration complexity! 🚀

---

*This guide provides everything needed to run Supercheck in production with Docker Swarm. The combination of Swarm's simplicity with external managed services delivers enterprise reliability with startup agility.*