# External Services Setup Guide for Supercheck

This guide shows how to configure Supercheck with external managed services instead of running PostgreSQL, Redis, and storage in your Kubernetes cluster.

## 🎯 Architecture Overview

```mermaid
graph TB
    Internet --> Ingress[Traefik/NGINX Ingress]
    Ingress --> App[Supercheck App Pods]
    App --> Worker[Supercheck Worker Pods]

    subgraph "External Managed Services"
        DB[(Neon DB / PlanetScale)]
        Redis[(Redis Cloud)]
        S3[(AWS S3 / R2)]
    end

    App --> DB
    Worker --> DB
    App --> Redis
    Worker --> Redis
    App --> S3
    Worker --> S3

    subgraph "Kubernetes Cluster (Simplified)"
        App
        Worker
        Ingress
    end
```

## 🚀 Benefits of External Services

### ✅ **Advantages:**
- **🔧 Zero Ops Overhead**: No database/Redis maintenance
- **📈 Better Performance**: Managed services are optimized
- **🛡️ Built-in Backups**: Automatic backup and recovery
- **⚡ Faster Scaling**: Instant capacity increases
- **💰 Cost Efficient**: Pay only for what you use
- **🌍 Global Distribution**: Multi-region availability
- **🔒 Enterprise Security**: Built-in encryption and compliance

### 📊 **Resource Savings:**
```yaml
# Before (self-hosted in K8s)
Resources:
  PostgreSQL: 1Gi RAM, 0.5 CPU, 10Gi storage
  Redis: 256Mi RAM, 0.25 CPU, 5Gi storage
  MinIO: 1Gi RAM, 0.5 CPU, 20Gi storage
  Total: ~2.3Gi RAM, 1.25 CPU, 35Gi storage

# After (external services)
Resources:
  App + Workers only: Significant cluster simplification
  Cost: Often cheaper than equivalent K8s resources
```

## 🔧 Service Configuration

### 1. **Database Setup**

#### **Option A: Neon Database (Recommended for PostgreSQL)**

```bash
# 1. Sign up at https://neon.tech/
# 2. Create a new project
# 3. Copy connection string

# Example connection string:
# postgresql://username:password@ep-example.us-east-1.aws.neon.tech/supercheck?sslmode=require
```

**Neon Configuration:**
```yaml
# In k8s/external-services/secrets.yaml
DATABASE_URL: <base64-encoded-neon-url>

# Features enabled:
# - Automatic scaling to zero
# - Branching for dev/staging
# - Built-in connection pooling
# - Point-in-time recovery
```

#### **Option B: PlanetScale (MySQL)**

```bash
# 1. Sign up at https://planetscale.com/
# 2. Create database
# 3. Create production branch
# 4. Generate connection string

# Example connection string:
# mysql://username:password@host:port/database?sslmode=require
```

**PlanetScale Configuration:**
```yaml
# In k8s/external-services/secrets.yaml
DATABASE_URL: <base64-encoded-planetscale-url>

# Features enabled:
# - Schema branching and migrations
# - Horizontal scaling
# - Non-blocking schema changes
# - Built-in analytics
```

### 2. **Redis Setup**

#### **Redis Cloud Configuration**

```bash
# 1. Sign up at https://redis.com/redis-enterprise-cloud/
# 2. Create subscription
# 3. Create database
# 4. Copy connection details

# Example connection string:
# redis://default:password@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
```

**Redis Configuration:**
```yaml
# In k8s/external-services/secrets.yaml
REDIS_URL: <base64-encoded-redis-url>

# In k8s/external-services/configmap.yaml
REDIS_CONNECTION_TIMEOUT: "5000"
REDIS_COMMAND_TIMEOUT: "5000"
REDIS_MAX_RETRIES: "3"

# Features enabled:
# - Automatic failover
# - Memory optimization
# - Built-in monitoring
# - Multi-zone replication
```

### 3. **Storage Setup**

#### **Option A: AWS S3**

```bash
# 1. Create S3 buckets
aws s3 mb s3://supercheck-job-artifacts
aws s3 mb s3://supercheck-test-artifacts

# 2. Create IAM user with S3 permissions
# 3. Generate access keys
```

**S3 IAM Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::supercheck-job-artifacts",
        "arn:aws:s3:::supercheck-job-artifacts/*",
        "arn:aws:s3:::supercheck-test-artifacts",
        "arn:aws:s3:::supercheck-test-artifacts/*"
      ]
    }
  ]
}
```

#### **Option B: Cloudflare R2**

```bash
# 1. Sign up for Cloudflare R2
# 2. Create buckets
# 3. Generate API tokens
```

**R2 Configuration:**
```yaml
# In k8s/external-services/configmap.yaml
AWS_REGION: "auto"  # For R2
S3_ENDPOINT: "https://accountid.r2.cloudflarestorage.com"

# In k8s/external-services/secrets.yaml
AWS_ACCESS_KEY_ID: <base64-encoded-r2-access-key>
AWS_SECRET_ACCESS_KEY: <base64-encoded-r2-secret-key>
```

## 🔐 Security Configuration

### **1. Secrets Management**

Create your secrets file:

```bash
# Generate base64 encoded values
echo -n "your-database-url" | base64
echo -n "your-redis-url" | base64
echo -n "your-aws-access-key" | base64
echo -n "your-aws-secret-key" | base64
```

Update `k8s/external-services/secrets.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: supercheck-secrets
  namespace: supercheck
type: Opaque
data:
  DATABASE_URL: <your-base64-database-url>
  REDIS_URL: <your-base64-redis-url>
  AWS_ACCESS_KEY_ID: <your-base64-aws-key>
  AWS_SECRET_ACCESS_KEY: <your-base64-aws-secret>
  # ... other secrets
```

### **2. Network Security**

```yaml
# Network policies for external service access
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: supercheck-external-egress
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: supercheck
  policyTypes:
  - Egress
  egress:
  - to: []  # Allow all external traffic
    ports:
    - protocol: TCP
      port: 443  # HTTPS
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 6379  # Redis
```

## 🚀 Deployment Guide

### **1. Quick Deployment**

```bash
# 1. Update secrets with your service credentials
vim k8s/external-services/secrets.yaml

# 2. Update configuration
vim k8s/external-services/configmap.yaml

# 3. Deploy with Traefik
cd k8s/scripts
./deploy-external-services.sh prod

# 4. Or deploy with NGINX
kubectl apply -k k8s/external-services/
kubectl apply -k k8s/ingress-controllers/nginx/
```

### **2. Environment-Specific Deployment**

```yaml
# Development overlay
# k8s/external-services/overlays/dev/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../

patchesStrategicMerge:
  - dev-patches.yaml

replicas:
  - name: supercheck-worker
    count: 1
  - name: supercheck-app
    count: 1
```

## 📊 Monitoring External Services

### **1. Database Monitoring**

```yaml
# Neon monitoring
apiVersion: v1
kind: ServiceMonitor
metadata:
  name: neon-database
spec:
  endpoints:
  - port: metrics
    path: /metrics
  selector:
    matchLabels:
      app: neon-exporter
```

### **2. Redis Monitoring**

```yaml
# Redis Cloud monitoring via Prometheus
- job_name: 'redis-cloud'
  static_configs:
  - targets: ['redis-exporter:9121']
  params:
    check-keys: ['supercheck:*']
```

### **3. S3 Monitoring**

```yaml
# CloudWatch metrics for S3
- job_name: 'cloudwatch-s3'
  ec2_sd_configs:
  - region: us-east-1
    port: 9100
  relabel_configs:
  - source_labels: [__meta_ec2_tag_Service]
    target_label: service
```

## 💰 Cost Optimization

### **Database Costs:**

| Service | Free Tier | Pricing | Best For |
|---------|-----------|---------|----------|
| **Neon** | 0.5GB, 1 branch | $19/month for 10GB | PostgreSQL, dev/staging |
| **PlanetScale** | 1 database | $29/month for 10GB | MySQL, schema migrations |
| **Supabase** | 500MB | $25/month for 8GB | PostgreSQL + features |

### **Redis Costs:**

| Service | Free Tier | Pricing | Best For |
|---------|-----------|---------|----------|
| **Redis Cloud** | 30MB | $7/month for 100MB | Production workloads |
| **Upstash** | 10K commands/day | $0.2 per 100K commands | Serverless/variable load |

### **Storage Costs:**

| Service | Free Tier | Pricing | Best For |
|---------|-----------|---------|----------|
| **AWS S3** | 5GB | $0.023/GB/month | Enterprise, compliance |
| **Cloudflare R2** | 10GB | $0.015/GB/month | Cost optimization |
| **Backblaze B2** | 10GB | $0.005/GB/month | Backup, archival |

## 🔧 Production Optimization

### **1. Connection Pooling**

```yaml
# App configuration for external DB
env:
- name: DATABASE_POOL_MIN
  value: "2"
- name: DATABASE_POOL_MAX
  value: "10"
- name: DATABASE_POOL_TIMEOUT
  value: "30000"
```

### **2. Caching Strategy**

```yaml
# Redis configuration for optimal performance
env:
- name: REDIS_POOL_SIZE
  value: "5"
- name: REDIS_CONNECTION_TIMEOUT
  value: "5000"
- name: CACHE_TTL
  value: "3600"  # 1 hour
```

### **3. S3 Optimization**

```yaml
# S3 upload optimization
env:
- name: S3_MULTIPART_THRESHOLD
  value: "10485760"  # 10MB
- name: S3_MULTIPART_CHUNKSIZE
  value: "5242880"   # 5MB
- name: S3_PRESIGNED_URL_EXPIRY
  value: "3600"      # 1 hour
```

## 🚨 Troubleshooting

### **Common Issues:**

#### **1. Database Connection Issues**
```bash
# Test database connectivity
kubectl exec -it deploy/supercheck-app -- \
  node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query('SELECT NOW()', (err, res) => {
      console.log(err ? err : res.rows[0]);
      pool.end();
    });
  "
```

#### **2. Redis Connection Issues**
```bash
# Test Redis connectivity
kubectl exec -it deploy/supercheck-app -- \
  node -e "
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    redis.ping().then(console.log).catch(console.error);
  "
```

#### **3. S3 Connection Issues**
```bash
# Test S3 connectivity
kubectl exec -it deploy/supercheck-app -- \
  aws s3 ls s3://supercheck-job-artifacts --region us-east-1
```

### **Performance Issues:**

```bash
# Check resource usage
kubectl top pods -n supercheck

# Check external service latency
kubectl exec -it deploy/supercheck-app -- \
  curl -w "@curl-format.txt" -o /dev/null -s "https://your-database-endpoint.com"
```

## 🔄 Migration from Self-Hosted

### **1. Data Migration**

```bash
# Export from self-hosted PostgreSQL
kubectl exec -it deploy/postgres -- \
  pg_dump -U postgres supercheck > backup.sql

# Import to Neon/PlanetScale
psql $DATABASE_URL < backup.sql
```

### **2. Redis Data Migration**

```bash
# Export Redis data
kubectl exec -it deploy/redis -- \
  redis-cli --rdb /tmp/dump.rdb

# Import to Redis Cloud
redis-cli -h your-redis-endpoint.com -p 12345 -a password \
  --pipe < dump.rdb
```

### **3. S3 Data Migration**

```bash
# Sync MinIO to S3
mc alias set local http://minio-service:9000 minioadmin minioadmin
mc alias set s3 https://s3.amazonaws.com your-key your-secret
mc mirror local/playwright-job-artifacts s3/supercheck-job-artifacts
```

## 📋 Checklist

Before deploying with external services:

- [ ] **Database**: Created and connection string obtained
- [ ] **Redis**: Instance created and connection string obtained
- [ ] **S3**: Buckets created and IAM credentials configured
- [ ] **Secrets**: All connection strings base64 encoded and added to secrets.yaml
- [ ] **Configuration**: Service endpoints updated in configmap.yaml
- [ ] **Network**: Firewall rules allow outbound connections
- [ ] **Monitoring**: External service monitoring configured
- [ ] **Backup**: Backup strategies configured for external services
- [ ] **Testing**: Connection tests passed from within cluster

## 🎯 Next Steps

1. **Choose your services** based on requirements and budget
2. **Set up external services** following the guides above
3. **Update configurations** with your service credentials
4. **Deploy Supercheck** using the external services configuration
5. **Monitor and optimize** based on usage patterns

---

This external services approach will significantly simplify your Kubernetes deployment while providing enterprise-grade reliability and performance! 🚀