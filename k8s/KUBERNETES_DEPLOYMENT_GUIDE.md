# Kubernetes Deployment Guide for Supercheck

This guide provides comprehensive instructions for deploying Supercheck to Kubernetes with production-ready configurations, security best practices, and operational procedures.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Environments](#deployment-environments)
- [Security Considerations](#security-considerations)
- [Monitoring and Observability](#monitoring-and-observability)
- [Scaling and Performance](#scaling-and-performance)
- [Troubleshooting](#troubleshooting)
- [Migration from Docker Compose](#migration-from-docker-compose)

## 🏗️ Architecture Overview

The Kubernetes deployment maintains the same distributed architecture as the Docker Compose setup while adding cloud-native benefits:

> **💡 Ingress Controller Choice**: This guide supports both **Traefik** (recommended) and **NGINX Ingress**. See [Traefik vs NGINX Comparison](./TRAEFIK_VS_NGINX_COMPARISON.md) for detailed analysis. **We recommend Traefik** for its superior container integration and built-in observability.

### Components

```mermaid
graph TB
    Internet --> Ingress[NGINX Ingress Controller]
    Ingress --> App[Supercheck App<br/>Next.js Frontend]
    App --> Worker[Supercheck Worker<br/>NestJS Service]
    App --> DB[(PostgreSQL)]
    Worker --> DB
    App --> Redis[(Redis<br/>Job Queue)]
    Worker --> Redis
    App --> MinIO[(MinIO<br/>S3 Storage)]
    Worker --> MinIO
```

### Services

- **Supercheck App** (Next.js): Web frontend, API routes, database migrations, job scheduling
- **Supercheck Worker** (NestJS): Parallel Playwright test execution, monitoring jobs
- **PostgreSQL**: Primary database with automatic migrations
- **Redis**: Job queue management with BullMQ
- **MinIO**: S3-compatible storage for test artifacts and reports
- **NGINX Ingress**: External traffic routing and SSL termination

### Key Kubernetes Features

- **High Availability**: Multi-replica deployments with proper anti-affinity
- **Auto-scaling**: Horizontal Pod Autoscaling based on CPU/memory metrics
- **Security**: RBAC, Network Policies, Pod Security Standards
- **Observability**: Health checks, metrics, distributed tracing
- **GitOps Ready**: Kustomize-based configuration management

## 🔧 Prerequisites

### Required Tools

```bash
# kubectl (Kubernetes CLI)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# kustomize (Configuration management)
curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash

# helm (Package manager - optional)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Cluster Requirements

- **Kubernetes Version**: 1.24+ (recommended 1.28+)
- **Node Resources**: Minimum 4 CPU cores, 8GB RAM per node
- **Storage**: Persistent volumes with RWO support (gp2, gp3, etc.)
- **Ingress Controller**: NGINX Ingress Controller installed
- **Certificate Management**: cert-manager for TLS (recommended)

### Storage Classes

Verify available storage classes:

```bash
kubectl get storageclass
```

Update `storageClassName` in PVC files if needed:

- `k8s/base/postgres-pvc.yaml`
- `k8s/base/redis-pvc.yaml`
- `k8s/base/minio-pvc.yaml`

## 🚀 Quick Start

### 1. Clone and Navigate

```bash
git clone <repository-url>
cd supercheck-core/k8s
```

### 2. Configure Secrets

**⚠️ Security Critical**: Update all default passwords and secrets before production deployment.

```bash
# Generate secure secrets
openssl rand -base64 32  # For auth secrets
openssl rand -base64 64  # For encryption keys

# Update secrets in k8s/base/secrets.yaml
# All values must be base64 encoded
echo -n "your-secret-here" | base64
```

### 3. Update Configuration

Edit `k8s/base/configmap.yaml`:

```yaml
# Update these values for your environment
NEXT_PUBLIC_APP_URL: "https://your-domain.com"
BETTER_AUTH_URL: "https://your-domain.com"
SMTP_HOST: "your-smtp-host"
SMTP_FROM_EMAIL: "noreply@your-domain.com"
# Super admin access is now managed through the database
# Use the setup script after deployment to configure super admin users
```

Edit `k8s/base/ingress.yaml`:

```yaml
# Update host entries
- host: supercheck.your-domain.com
  # ...
- host: minio.your-domain.com # Optional MinIO console
```

### 4. Deploy

Choose your preferred ingress controller:

**Option A: Traefik (Recommended)**

```bash
# Development deployment with Traefik
cd scripts
./deploy-traefik.sh dev

# Production deployment with Traefik
./deploy-traefik.sh prod
```

**Option B: NGINX Ingress**

```bash
# Development deployment with NGINX
cd scripts
./deploy.sh dev

# Production deployment with NGINX
./deploy.sh prod
```

### 5. Access the Application

For development:

```bash
# Port forward to access locally
./port-forward.sh

# Visit http://localhost:3000
```

For production:

- Configure DNS to point to your ingress controller
- Access via your configured domain

## ⚙️ Configuration

### Environment-Specific Configurations

#### Development Environment

- **Location**: `k8s/overlays/dev/`
- **Features**: Lower resource limits, browser debugging enabled, fewer replicas
- **Use Case**: Local development, testing

#### Production Environment

- **Location**: `k8s/overlays/prod/`
- **Features**: High availability, optimized resources, security hardening
- **Use Case**: Production workloads

### Customization

Create custom overlays for different environments:

```bash
# Create staging environment
mkdir -p k8s/overlays/staging
cp -r k8s/overlays/prod/* k8s/overlays/staging/

# Modify staging-specific settings
vim k8s/overlays/staging/kustomization.yaml
```

### Configuration Management

The deployment uses Kustomize for configuration management:

```yaml
# Base configuration
k8s/base/              # Common resources
├── namespace.yaml     # Namespace definition
├── configmap.yaml     # Environment variables
├── secrets.yaml       # Sensitive data
├── *-deployment.yaml  # Service deployments
├── *-pvc.yaml         # Storage claims
├── services.yaml      # Service definitions
└── ingress.yaml       # External access

# Environment overlays
k8s/overlays/
├── dev/               # Development patches
└── prod/              # Production patches
```

## 🔒 Security Considerations

### Secrets Management

1. **Never commit secrets**: Use external secret management
2. **Rotate regularly**: Implement secret rotation policies
3. **Use Kubernetes secrets**: Leverage native secret management

```yaml
# Example external secret integration
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
```

### Network Security

```yaml
# Network Policy example
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: supercheck-network-policy
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: supercheck
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
```

### Pod Security

```yaml
# Pod Security Standard
apiVersion: v1
kind: Namespace
metadata:
  name: supercheck
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### RBAC Configuration

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: supercheck
  name: supercheck-role
rules:
  - apiGroups: [""]
    resources: ["secrets", "configmaps"]
    verbs: ["get", "list"]
```

## 📊 Monitoring and Observability

### Health Checks

Each service includes comprehensive health checks:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 120
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Metrics Collection

Install Prometheus and Grafana for monitoring:

```bash
# Add Prometheus Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

### Log Aggregation

Configure log forwarding to your preferred system:

```yaml
# Fluent Bit configuration example
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         1
        Log_Level     info

    [INPUT]
        Name              tail
        Path              /var/log/containers/*supercheck*.log
        Parser            docker
        Tag               kube.*
```

## 📈 Scaling and Performance

### Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: supercheck-worker-hpa
  namespace: supercheck
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: supercheck-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Vertical Pod Autoscaling

```bash
# Install VPA (if not available)
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vpa-release.yaml
```

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: supercheck-app-vpa
  namespace: supercheck
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: supercheck-app
  updatePolicy:
    updateMode: "Auto"
```

### Performance Optimization

#### Database Optimization

```yaml
# PostgreSQL performance settings
env:
  - name: POSTGRES_CONFIG
    value: |
      shared_buffers = 256MB
      effective_cache_size = 1GB
      max_connections = 100
      work_mem = 4MB
```

#### Redis Optimization

```yaml
# Redis memory management
command:
  - redis-server
  - --maxmemory
  - 512mb
  - --maxmemory-policy
  - noeviction
```

#### Worker Scaling Strategy

```yaml
# Optimize worker replicas based on queue depth
- type: Object
  object:
    metric:
      name: bullmq_queue_waiting
    target:
      type: AverageValue
      averageValue: "10"
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Pods Stuck in Pending State

```bash
# Check node resources
kubectl describe nodes

# Check PVC binding
kubectl get pv,pvc -n supercheck

# Check events
kubectl get events -n supercheck --sort-by='.lastTimestamp'
```

#### 2. Database Connection Issues

```bash
# Check PostgreSQL logs
kubectl logs -n supercheck -l app=postgres -f

# Test database connectivity
kubectl exec -it -n supercheck deploy/supercheck-app -- \
  psql postgresql://postgres:password@postgres-service:5432/supercheck
```

#### 3. Redis Connection Issues

```bash
# Check Redis logs
kubectl logs -n supercheck -l app=redis -f

# Test Redis connectivity
kubectl exec -it -n supercheck deploy/redis -- \
  redis-cli -a your-password ping
```

#### 4. Worker Scaling Issues

```bash
# Check worker logs
kubectl logs -n supercheck -l app=supercheck-worker -f

# Check HPA status
kubectl get hpa -n supercheck

# Manual scaling
kubectl scale deployment supercheck-worker -n supercheck --replicas=6
```

### Debugging Commands

```bash
# Get all resources
kubectl get all -n supercheck

# Describe problematic pod
kubectl describe pod <pod-name> -n supercheck

# Execute into running container
kubectl exec -it -n supercheck <pod-name> -- /bin/bash

# Port forward for debugging
kubectl port-forward -n supercheck svc/supercheck-app-service 3000:3000

# View resource usage
kubectl top pods -n supercheck
kubectl top nodes
```

### Log Analysis

```bash
# Stream all application logs
kubectl logs -n supercheck -l app.kubernetes.io/name=supercheck -f

# Filter worker logs for errors
kubectl logs -n supercheck -l app=supercheck-worker | grep ERROR

# Get recent events
kubectl get events -n supercheck --sort-by='.lastTimestamp' | tail -20
```

## 🔄 Migration from Docker Compose

### 1. Data Migration

#### PostgreSQL Data

```bash
# Export from Docker Compose
docker-compose exec postgres pg_dump -U postgres supercheck > backup.sql

# Import to Kubernetes
kubectl exec -i -n supercheck deploy/postgres -- \
  psql -U postgres -d supercheck < backup.sql
```

#### MinIO Data

```bash
# Use MinIO client (mc) for data sync
mc alias set compose http://localhost:9000 minioadmin minioadmin
mc alias set k8s http://minio.your-domain.com minioadmin minioadmin
mc mirror compose/playwright-job-artifacts k8s/playwright-job-artifacts
mc mirror compose/playwright-test-artifacts k8s/playwright-test-artifacts
```

### 2. Configuration Migration

The Kubernetes configuration maintains compatibility with Docker Compose environment variables:

```yaml
# Docker Compose -> Kubernetes mapping
REDIS_URL: redis://:password@redis:6379
# becomes
REDIS_URL: redis://:password@redis-service:6379

DATABASE_URL: postgresql://postgres:password@postgres:5432/supercheck
# becomes
DATABASE_URL: postgresql://postgres:password@postgres-service:5432/supercheck
```

### 3. Volume Migration

```bash
# Copy volume data from Docker to Kubernetes PVCs
docker cp container:/path/to/data ./temp-data
kubectl cp ./temp-data supercheck/pod:/path/to/mount
```

## 🔄 GitOps Integration

### ArgoCD Example

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: supercheck-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/supercheck-core
    targetRevision: main
    path: k8s/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: supercheck
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### Flux Example

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1beta2
kind: Kustomization
metadata:
  name: supercheck-prod
  namespace: flux-system
spec:
  interval: 10m
  path: ./k8s/overlays/prod
  prune: true
  sourceRef:
    kind: GitRepository
    name: supercheck-core
  targetNamespace: supercheck
```

## 📝 Operations Runbook

### Daily Operations

```bash
# Check cluster health
kubectl get nodes
kubectl get pods -n supercheck

# Monitor resource usage
kubectl top nodes
kubectl top pods -n supercheck

# Check for any alerts
kubectl get events -n supercheck --field-selector type=Warning
```

### Backup Procedures

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
kubectl exec -n supercheck deploy/postgres -- \
  pg_dump -U postgres supercheck | \
  gzip > "backup_${DATE}.sql.gz"

# Backup MinIO data
mc mirror k8s/playwright-job-artifacts "backup/${DATE}/job-artifacts"
mc mirror k8s/playwright-test-artifacts "backup/${DATE}/test-artifacts"
```

### Disaster Recovery

```bash
# Restore from backup
gunzip -c backup_20240101_120000.sql.gz | \
kubectl exec -i -n supercheck deploy/postgres -- \
  psql -U postgres -d supercheck
```

## 🤝 Contributing

When contributing Kubernetes configurations:

1. Test changes in development environment first
2. Ensure security best practices are followed
3. Update documentation for any new features
4. Validate with `kubeval` or similar tools

```bash
# Validate Kubernetes manifests
kubeval k8s/base/*.yaml
kubeval k8s/overlays/*/kustomization.yaml
```

## 📞 Support

For Kubernetes-specific issues:

1. Check the troubleshooting section above
2. Review Kubernetes events and logs
3. Consult the main [README.md](../README.md) for application-specific guidance
4. Open an issue with cluster information and relevant logs

## 🔗 Additional Resources

- [Kubernetes Official Documentation](https://kubernetes.io/docs/)
- [Kustomize Documentation](https://kustomize.io/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Prometheus Operator](https://prometheus-operator.dev/)

---

**Note**: This deployment has been tested on various Kubernetes distributions including EKS, GKE, AKS, and self-managed clusters. For production use, ensure you follow your organization's security and compliance requirements.
