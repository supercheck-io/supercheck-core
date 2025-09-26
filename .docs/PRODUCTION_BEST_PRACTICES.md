# Supercheck Production Best Practices Guide

This guide provides comprehensive best practices for deploying and managing Supercheck in production environments using Docker Swarm on Hetzner Cloud.

## 🏗️ **Infrastructure Architecture**

### **Recommended Production Topology**

```yaml
Production Setup (5+ nodes) - Using SHARED CPU (CAX) ARM Servers:
├── Manager Nodes (3)
│   ├── Primary Manager: CAX21 (4 vCPU shared, 8GB RAM) - €7.59/month
│   ├── Secondary Manager: CAX21 (4 vCPU shared, 8GB RAM) - €7.59/month
│   └── Tertiary Manager: CAX21 (4 vCPU shared, 8GB RAM) - €7.59/month
│
└── Worker Nodes (5+)
    ├── Worker 1-3: CAX31 (8 vCPU shared, 16GB RAM) - €15.59/month - Core workers
    ├── Worker 4-5: CAX21 (4 vCPU shared, 8GB RAM) - €7.59/month - Burst capacity
    └── Worker N+: CAX41 (16 vCPU shared, 32GB RAM) - €31.19/month - High-load workers

💡 Shared CPU Benefits:
✅ 68% cost savings vs dedicated (CCX)
✅ Burstable performance perfect for test spikes
✅ ARM efficiency excellent for Playwright workloads
✅ Baseline + burst model matches test automation patterns
```

### **Network Architecture**

```yaml
Network Security:
├── Private Network: 10.0.0.0/16 (Hetzner private network)
├── Public Access: Only through Traefik (ports 80/443)
├── Internal Communication: Private network only
└── SSH Access: Restricted to management IPs
```

## 🔐 **Security Best Practices**

### **1. SSH Security**

```bash
# Secure SSH configuration
cat > /etc/ssh/sshd_config.d/99-security.conf << EOF
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deployer
Port 22222
EOF

systemctl restart sshd
```

### **2. Docker Security**

```bash
# Docker daemon security configuration
cat > /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "selinux-enabled": false,
  "userns-remap": "default"
}
EOF

systemctl restart docker
```

### **3. Firewall Configuration**

```bash
# UFW firewall rules
ufw default deny incoming
ufw default allow outgoing
ufw allow 22222/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow from 10.0.0.0/16 to any port 2377 comment 'Docker Swarm Management'
ufw allow from 10.0.0.0/16 to any port 7946 comment 'Docker Swarm Communication'
ufw allow from 10.0.0.0/16 to any port 4789 comment 'Docker Overlay Network'
ufw --force enable
```

### **4. Secrets Management**

```bash
# Production secrets with rotation capability
docker secret create database_url_v2 - <<< "postgresql://user:pass@neon-host/db?sslmode=require"
docker secret create redis_url_v2 - <<< "rediss://user:pass@redis-cloud-host:port"
docker secret create auth_secret_v2 - <<< "$(openssl rand -base64 32)"

# Update services to use new secrets
docker service update --secret-rm database_url --secret-add database_url_v2 supercheck_supercheck-app
```

## 📊 **Monitoring & Observability**

### **🏆 Recommended: SigNoz Cloud (Simple, Robust, Low Cost)**

For most Supercheck deployments, SigNoz Cloud provides the optimal balance of simplicity, features, and cost-effectiveness.

#### **Why SigNoz Cloud is Perfect for Supercheck:**
```yaml
Cost Benefits:
✅ €19-49/month vs €960-2,304/month (DataDog)
✅ Usage-based pricing (€0.1 per million samples)
✅ No host-based or user-based charges
✅ No custom metrics surcharges

Technical Benefits:
✅ 15-minute setup vs 4-6 hours self-hosted
✅ OpenTelemetry native (future-proof)
✅ Zero infrastructure overhead on your servers
✅ Unified logs, metrics, traces, and alerts
✅ Docker Swarm auto-discovery
✅ Enterprise-grade (99.9% SLA, handles 10TB+/day)

Business Benefits:
✅ Real-time test execution monitoring
✅ Custom business metrics (revenue per test)
✅ Queue depth monitoring (Redis integration)
✅ Capacity planning insights
✅ Professional alerting and incident management
```

#### **SigNoz Setup for Docker Swarm:**
```yaml
# docker-swarm/stacks/monitoring-signoz.yml
version: '3.8'
services:
  signoz-collector:
    image: signoz/signoz-otel-collector:0.88.17
    environment:
      - SIGNOZ_ACCESS_TOKEN_FILE=/run/secrets/signoz_token
      - SIGNOZ_ENDPOINT=https://ingest.{region}.signoz.cloud:443
      - OTEL_RESOURCE_ATTRIBUTES=service.name=supercheck,service.version=1.0.0
    secrets:
      - signoz_token
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /var/lib/docker/:/host/var/lib/docker:ro
    networks:
      - supercheck-network
    deploy:
      mode: global
      resources:
        limits:
          cpus: '0.2'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M

secrets:
  signoz_token:
    external: true

networks:
  supercheck-network:
    external: true
```

#### **Deployment Commands:**
```bash
# 1. Create SigNoz secret
echo "your-signoz-access-token" | docker secret create signoz_token -

# 2. Deploy monitoring
docker stack deploy -c stacks/monitoring-signoz.yml monitoring

# 3. Verify deployment
docker service ls | grep signoz
docker service logs monitoring_signoz-collector
```

#### **Custom Supercheck Metrics Setup:**
```javascript
// Add to your Next.js app (app/src/lib/telemetry.ts)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { metrics } from '@opentelemetry/api';

const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'https://ingest.{region}.signoz.cloud/v1/metrics',
      headers: {
        'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN,
      },
    }),
  }),
});

sdk.start();

// Business metrics
const meter = metrics.getMeter('supercheck-business');
export const testExecutions = meter.createCounter('test_executions_total');
export const concurrentTests = meter.createUpDownCounter('concurrent_tests');
export const testDuration = meter.createHistogram('test_duration_seconds');
export const queueDepth = meter.createUpDownCounter('queue_depth');

// Usage in your application
testExecutions.add(1, {
  user_plan: 'pro',
  test_type: 'playwright',
  success: 'true'
});
```

#### **SigNoz Dashboards You Get:**
```yaml
Out-of-the-Box Dashboards:
├── Infrastructure Overview
│   ├── CPU, Memory, Disk usage per node
│   ├── Docker container metrics
│   ├── Network I/O and latency
│   └── Docker Swarm service health
│
├── Application Performance
│   ├── API response times
│   ├── Error rates and patterns
│   ├── Database query performance
│   └── External service dependencies
│
├── Custom Business Metrics
│   ├── Test execution rates
│   ├── Concurrent test counts
│   ├── Queue depths and processing times
│   ├── Revenue per test calculations
│   └── User activity patterns
│
└── Alerts and Incidents
    ├── Service down notifications
    ├── Queue backup warnings
    ├── Resource exhaustion alerts
    └── SLA breach notifications
```

---

### **Alternative: Self-Hosted Prometheus + Grafana**

*Only recommended if you need maximum customization or have specific compliance requirements.*

#### **1. Prometheus Configuration**

```yaml
# docker-swarm/monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'docker-swarm-nodes'
    static_configs:
      - targets: ['10.0.0.10:9100', '10.0.0.11:9100', '10.0.0.12:9100']
    scrape_interval: 5s
    metrics_path: '/metrics'

  - job_name: 'docker-swarm-services'
    dockerswarm_sd_configs:
      - host: unix:///var/run/docker.sock
        role: tasks
    relabel_configs:
      - source_labels: [__meta_dockerswarm_task_desired_state]
        regex: running
        action: keep

  - job_name: 'supercheck-app'
    static_configs:
      - targets: ['supercheck-app:3000']
    metrics_path: '/api/metrics'
    scrape_interval: 10s

  - job_name: 'supercheck-worker'
    static_configs:
      - targets: ['supercheck-worker:3001']
    metrics_path: '/metrics'
    scrape_interval: 10s

alertmanager:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

### **2. Alert Rules**

```yaml
# docker-swarm/monitoring/alert_rules.yml
groups:
  - name: supercheck_alerts
    rules:
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.8
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 80% for more than 2 minutes"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "Service has been down for more than 1 minute"

      - alert: HighTestQueueSize
        expr: redis_queue_length{queue="test-queue"} > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Test queue is backing up"
          description: "Queue has more than 100 pending tests"

      - alert: WorkerNodeDown
        expr: count(up{job="docker-swarm-nodes"} == 1) < 5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Worker node is down"
          description: "Less than 5 worker nodes are available"
```

### **3. Grafana Dashboards**

Key metrics to monitor:

```yaml
Essential Dashboards:
├── System Metrics
│   ├── CPU usage per node
│   ├── Memory usage per node
│   ├── Disk I/O and usage
│   └── Network traffic
│
├── Docker Swarm Metrics
│   ├── Service replicas vs desired
│   ├── Container restarts
│   ├── Service update status
│   └── Node availability
│
├── Application Metrics
│   ├── Test execution rate
│   ├── Queue depths (waiting, active, completed)
│   ├── Test success/failure rates
│   ├── Response times
│   └── Error rates
│
└── Business Metrics
    ├── Active users
    ├── Tests per user
    ├── Resource utilization
    └── Cost per test
```

## ⚡ **Performance Optimization**

### **1. Resource Allocation**

```yaml
# Optimized resource allocation for different workloads
Production Resource Strategy:
├── App Service (3 replicas)
│   ├── CPU: 1-2 cores reserved, 2-3 cores limit
│   ├── Memory: 2GB reserved, 4GB limit
│   └── Placement: Spread across manager nodes
│
├── Worker Service (dynamic 5-50 replicas)
│   ├── CPU: 1 core reserved, 2 cores limit
│   ├── Memory: 1GB reserved, 2GB limit
│   └── Placement: Worker nodes only
│
└── Infrastructure Services
    ├── Traefik: 0.5 CPU, 512MB memory
    ├── SigNoz Collector: 0.1-0.2 CPU, 128-256MB memory (global mode)
    └── Monitoring: Zero overhead (cloud-hosted SigNoz)
```

### **2. Docker Swarm Optimization**

```bash
# Optimize Docker Swarm for production workloads
cat > /etc/docker/daemon.json << EOF
{
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5,
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "experimental": true,
  "metrics-addr": "0.0.0.0:9323",
  "default-ulimits": {
    "nofile": {
      "Hard": 65536,
      "Name": "nofile",
      "Soft": 65536
    }
  }
}
EOF
```

### **3. System-Level Optimizations**

```bash
# Kernel parameter tuning for high-concurrency workloads
cat > /etc/sysctl.d/99-supercheck.conf << EOF
# Network optimizations
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 12582912 16777216
net.ipv4.tcp_wmem = 4096 12582912 16777216
net.ipv4.tcp_congestion_control = bbr

# File descriptor limits
fs.file-max = 2097152
fs.nr_open = 1048576

# Process limits
kernel.pid_max = 4194304
kernel.threads-max = 4194304

# Memory overcommit
vm.overcommit_memory = 1
vm.max_map_count = 262144
EOF

sysctl -p /etc/sysctl.d/99-supercheck.conf
```

## 🔄 **Backup & Recovery**

### **1. Configuration Backup**

```bash
#!/bin/bash
# backup-configs.sh - Backup Docker Swarm configurations

BACKUP_DIR="/backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup Docker secrets
docker secret ls --format "table {{.Name}}" | tail -n +2 > "$BACKUP_DIR/secrets.list"

# Backup Docker configs
docker config ls --format "table {{.Name}}" | tail -n +2 > "$BACKUP_DIR/configs.list"

# Backup service configurations
docker service ls --format "table {{.Name}}" | tail -n +2 | while read service; do
    docker service inspect "$service" > "$BACKUP_DIR/service_${service}.json"
done

# Backup stack files
cp -r /opt/supercheck/docker-swarm "$BACKUP_DIR/"

# Create archive
tar -czf "/backup/supercheck_config_$(date +%Y%m%d_%H%M%S).tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"
```

### **2. Database Backup (External)**

```bash
#!/bin/bash
# backup-external-db.sh - Backup external database

# For Neon/PlanetScale - use their backup features
# This script creates application-level backups

BACKUP_DIR="/backup/db/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Export application data (not database structure)
docker exec -i $(docker ps -q -f name=supercheck-app) node -e "
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const fs = require('fs');

const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql);

// Export critical data for disaster recovery
(async () => {
  const tests = await db.select().from(test);
  const jobs = await db.select().from(job);
  const monitors = await db.select().from(monitor);

  fs.writeFileSync('/tmp/tests_backup.json', JSON.stringify(tests, null, 2));
  fs.writeFileSync('/tmp/jobs_backup.json', JSON.stringify(jobs, null, 2));
  fs.writeFileSync('/tmp/monitors_backup.json', JSON.stringify(monitors, null, 2));

  process.exit(0);
})();
" && \
docker cp $(docker ps -q -f name=supercheck-app):/tmp/tests_backup.json "$BACKUP_DIR/" && \
docker cp $(docker ps -q -f name=supercheck-app):/tmp/jobs_backup.json "$BACKUP_DIR/" && \
docker cp $(docker ps -q -f name=supercheck-app):/tmp/monitors_backup.json "$BACKUP_DIR/"
```

### **3. Disaster Recovery Plan**

```yaml
Recovery Procedures:
├── Level 1: Service Restart (RTO: 1 minute)
│   └── docker service update --force supercheck_supercheck-app
│
├── Level 2: Node Recovery (RTO: 5 minutes)
│   ├── Remove failed node: docker node rm NODE_ID
│   ├── Add new node: ./scripts/add-worker.sh
│   └── Rebalance services: docker service update --force SERVICE
│
├── Level 3: Cluster Recovery (RTO: 15 minutes)
│   ├── Rebuild cluster from backup
│   ├── Restore configurations
│   └── Verify external services connectivity
│
└── Level 4: Complete Disaster (RTO: 30 minutes)
    ├── Deploy new Hetzner infrastructure
    ├── Restore from configuration backups
    ├── Restore application data
    └── Update DNS and external service connections
```

## 📈 **Scaling Strategies**

### **1. Horizontal Scaling**

```bash
# Intelligent scaling based on metrics
#!/bin/bash
# intelligent-scale.sh

CURRENT_LOAD=$(docker exec $(docker ps -q -f name=redis) redis-cli llen "bull:test-queue:waiting")
CURRENT_WORKERS=$(docker service ls --filter name=supercheck_supercheck-worker --format "{{.Replicas}}" | cut -d'/' -f2)

if [ "$CURRENT_LOAD" -gt 50 ] && [ "$CURRENT_WORKERS" -lt 30 ]; then
    NEW_REPLICAS=$((CURRENT_WORKERS + 5))
    echo "Scaling up to $NEW_REPLICAS workers (queue: $CURRENT_LOAD)"
    docker service scale supercheck_supercheck-worker=$NEW_REPLICAS
elif [ "$CURRENT_LOAD" -lt 10 ] && [ "$CURRENT_WORKERS" -gt 5 ]; then
    NEW_REPLICAS=$((CURRENT_WORKERS - 2))
    echo "Scaling down to $NEW_REPLICAS workers (queue: $CURRENT_LOAD)"
    docker service scale supercheck_supercheck-worker=$NEW_REPLICAS
fi
```

### **2. Vertical Scaling (Node Upgrades)**

```bash
# Graceful node upgrade process
#!/bin/bash
# upgrade-node.sh

NODE_ID=$1
NEW_SERVER_TYPE=${2:-"cax31"}

echo "Upgrading node $NODE_ID to $NEW_SERVER_TYPE"

# 1. Drain node safely
docker node update --availability drain "$NODE_ID"
sleep 60  # Allow services to migrate

# 2. Create new server
hcloud server create \
    --type "$NEW_SERVER_TYPE" \
    --image ubuntu-22.04 \
    --ssh-key supercheck-key \
    --network supercheck-private \
    --name "supercheck-worker-upgraded-$(date +%s)"

# 3. Add to swarm (manual join token required)
echo "Get join token: docker swarm join-token worker"
echo "SSH to new server and join swarm"
echo "Then remove old node: docker node rm $NODE_ID"
```

## 🚀 **Deployment Strategies**

### **1. Blue-Green Deployment**

```yaml
# Blue-Green deployment stack
version: '3.8'
services:
  supercheck-app-green:
    image: ghcr.io/supercheck-io/supercheck/app:${NEW_VERSION}
    environment:
      - DEPLOYMENT_SLOT=green
    deploy:
      replicas: 3
      labels:
        - "traefik.enable=false"  # Initially disabled
    # ... other configuration

  supercheck-app-blue:
    image: ghcr.io/supercheck-io/supercheck/app:${CURRENT_VERSION}
    environment:
      - DEPLOYMENT_SLOT=blue
    deploy:
      replicas: 3
      labels:
        - "traefik.enable=true"  # Currently active
    # ... other configuration
```

### **2. Rolling Updates**

```bash
# Safe rolling update process
#!/bin/bash
# rolling-update.sh

NEW_IMAGE="ghcr.io/supercheck-io/supercheck/app:$1"
SERVICE="supercheck_supercheck-app"

echo "Starting rolling update to $NEW_IMAGE"

# Update with careful rollout
docker service update \
    --image "$NEW_IMAGE" \
    --update-parallelism 1 \
    --update-delay 30s \
    --update-monitor 60s \
    --update-failure-action rollback \
    --rollback-parallelism 1 \
    --rollback-delay 10s \
    --rollback-monitor 30s \
    "$SERVICE"

# Monitor update progress
while true; do
    STATUS=$(docker service ps "$SERVICE" --filter "desired-state=running" --format "{{.CurrentState}}")
    echo "Update status: $STATUS"

    if echo "$STATUS" | grep -q "Running"; then
        echo "Update completed successfully"
        break
    elif echo "$STATUS" | grep -q "Failed"; then
        echo "Update failed, rollback initiated"
        break
    fi

    sleep 10
done
```

## 💰 **Cost Optimization**

### **1. Resource Right-Sizing**

```yaml
Cost Optimization Strategy - SHARED CPU (CAX) ARM Servers:
├── Production (€100.72/month) - vs €168.92/month with dedicated
│   ├── 3x CAX21 managers (shared): €22.77/month
│   ├── 3x CAX31 workers (shared): €46.77/month
│   ├── 2x CAX21 burst workers (shared): €15.18/month
│   ├── Network & backup: €10/month
│   └── Annual Savings vs Dedicated: €818/year (68% savings!)
│
├── Development (€30.95/month)
│   ├── 1x CAX21 manager (shared): €7.59/month
│   ├── 2x CAX21 workers (shared): €15.18/month
│   ├── Network: €5/month
│   └── vs Dedicated: €52/month (40% savings)
│
└── Testing (€15.98/month)
    ├── 1x CAX11 all-in-one (shared): €3.79/month
    ├── 1x CAX21 worker (shared): €7.59/month
    ├── Network: €2.60/month
    └── Perfect for CI/CD pipelines
```

### **2. Automated Cost Control**

```bash
#!/bin/bash
# cost-control.sh - Automated cost optimization

# Scale down during off-hours
HOUR=$(date +%H)
if [ "$HOUR" -ge 22 ] || [ "$HOUR" -le 6 ]; then
    echo "Off-hours scaling down"
    docker service scale supercheck_supercheck-worker=2

    # Shutdown non-essential services
    docker service scale supercheck_grafana=0
else
    echo "Business hours scaling up"
    docker service scale supercheck_supercheck-worker=5
    docker service scale supercheck_grafana=1
fi

# Remove old images to save storage
docker image prune -af --filter "until=24h"
docker system prune -f --volumes
```

## 🛡️ **Security Compliance**

### **1. Security Scanning**

```bash
#!/bin/bash
# security-scan.sh - Automated security scanning

# Scan Docker images
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image ghcr.io/supercheck-io/supercheck/app:latest

# Check for configuration issues
docker run --rm -v "$PWD":/app -w /app \
    hadolint/hadolint:latest hadolint docker-swarm/Dockerfile.*

# Network security scan
nmap -sT -O localhost
```

### **2. Compliance Checklist**

```yaml
Security Compliance:
├── Authentication & Authorization
│   ├── ✓ Multi-factor authentication enabled
│   ├── ✓ Role-based access control implemented
│   ├── ✓ API keys with proper scoping
│   └── ✓ Session management with timeout
│
├── Data Protection
│   ├── ✓ Encryption at rest (database)
│   ├── ✓ Encryption in transit (TLS 1.3)
│   ├── ✓ Secrets management (Docker secrets)
│   └── ✓ Data backup with encryption
│
├── Network Security
│   ├── ✓ Private network for internal communication
│   ├── ✓ Firewall rules properly configured
│   ├── ✓ DDoS protection (Cloudflare/Hetzner)
│   └── ✓ Regular security updates
│
└── Monitoring & Auditing
    ├── ✓ Access logs maintained
    ├── ✓ Security event monitoring
    ├── ✓ Vulnerability scanning
    └── ✓ Incident response plan
```

## 📋 **Operational Runbook**

### **Daily Operations**

```bash
#!/bin/bash
# daily-health-check.sh

echo "=== Daily Supercheck Health Check ==="

# Check service health
docker stack services supercheck | grep -v "1/1\|2/2\|3/3" && echo "⚠️ Service scaling issues"

# Check resource usage
docker stats --no-stream | awk 'NR>1 && $3+0 > 80 {print "⚠️ High CPU:", $1, $3}'
docker stats --no-stream | awk 'NR>1 && $4+0 > 80 {print "⚠️ High Memory:", $1, $4}'

# Check disk space
df -h | awk '$5+0 > 80 {print "⚠️ High disk usage:", $0}'

# Check external services
curl -f -s https://your-app-url/api/health || echo "⚠️ App health check failed"

# Check test queue status
QUEUE_SIZE=$(docker exec $(docker ps -q -f name=redis) redis-cli llen "bull:test-queue:waiting")
echo "📊 Current queue size: $QUEUE_SIZE"

if [ "$QUEUE_SIZE" -gt 50 ]; then
    echo "⚠️ Queue backing up, consider scaling workers"
fi
```

### **Weekly Maintenance**

```bash
#!/bin/bash
# weekly-maintenance.sh

echo "=== Weekly Supercheck Maintenance ==="

# Update system packages (one node at a time)
# Rotate logs
# Check certificate expiry
# Review security alerts
# Performance analysis
# Backup verification
```

## 📞 **Support & Troubleshooting**

### **Common Issues & Solutions**

```yaml
Issue Resolution Guide:
├── Service Won't Start
│   ├── Check logs: docker service logs SERVICE_NAME
│   ├── Verify secrets: docker secret ls
│   ├── Check constraints: docker service inspect SERVICE_NAME
│   └── Restart service: docker service update --force SERVICE_NAME
│
├── High Memory Usage
│   ├── Check worker scaling: docker service scale supercheck_supercheck-worker=N
│   ├── Review memory limits in stack files
│   ├── Restart workers: docker service update --force supercheck_supercheck-worker
│   └── Add more worker nodes
│
├── External Service Connection Issues
│   ├── Test connectivity: docker exec -it CONTAINER ping EXTERNAL_HOST
│   ├── Verify credentials in secrets
│   ├── Check security groups/firewall
│   └── Review service URLs and ports
│
└── SSL/TLS Issues
    ├── Check certificate expiry: openssl x509 -in cert.pem -dates
    ├── Verify Traefik configuration
    ├── Check Let's Encrypt rate limits
    └── Restart Traefik: docker service update --force supercheck_traefik
```

## 🎯 **Performance Benchmarks**

### **Expected Performance Metrics**

```yaml
Production Performance Targets:
├── Response Times
│   ├── API endpoints: <200ms (95th percentile)
│   ├── Test execution start: <5 seconds
│   ├── Page load time: <2 seconds
│   └── Worker scaling: <30 seconds
│
├── Throughput
│   ├── Concurrent tests: 100+ (with 20 workers)
│   ├── API requests: 1000+ requests/minute
│   ├── Test completion rate: 95%+ success
│   └── Queue processing: <1 minute wait time
│
├── Availability
│   ├── Uptime: 99.9% (8.7 hours downtime/year)
│   ├── Service recovery: <1 minute
│   ├── Planned maintenance: <15 minutes/month
│   └── Disaster recovery: <30 minutes
│
└── Resource Utilization
    ├── CPU usage: 60-80% average
    ├── Memory usage: 70-85% average
    ├── Disk I/O: <70% utilization
    └── Network bandwidth: <50% utilization
```

---

## 🎉 **Summary**

This production best practices guide provides comprehensive guidance for operating Supercheck at scale using Docker Swarm on Hetzner Cloud ARM servers. The key principles are:

1. **Security First**: Implement defense-in-depth with SSH hardening, network segmentation, and secrets management
2. **Cloud-Native Monitoring**: Enterprise-grade observability with SigNoz Cloud (€19-49/month vs €960+/month traditional solutions)
3. **Automate Operations**: Scripted deployments, scaling, backups, and maintenance procedures
4. **Cost Optimization**: ARM servers provide 50%+ savings while maintaining performance
5. **Disaster Recovery**: Robust backup and recovery procedures with defined RTOs
6. **Performance Optimization**: Right-sized resources with intelligent scaling

Following these practices ensures Supercheck runs reliably, securely, and cost-effectively in production while maintaining the operational simplicity that makes Docker Swarm ideal for test automation platforms.

**Total estimated monthly cost for production setup: €125-145/month** (including €19-49/month for SigNoz Cloud monitoring) - delivering enterprise-grade test automation platform with 99.9% uptime and support for 100+ concurrent tests.

**Cost comparison**: Traditional monitoring solutions like DataDog would cost €960-2,304/month additional, making SigNoz Cloud **90%+ cheaper** while providing superior Docker Swarm integration and zero infrastructure overhead.