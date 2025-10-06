# K3s Performance Optimization Guide

This guide provides performance optimization recommendations for Supercheck deployments on Hetzner K3s clusters.

## Node Performance

### Instance Type Selection

Choose appropriate instance types based on workload:

```yaml
# For application nodes
worker_node_pools:
  - name: app-workers
    instance_type: cpx31 # 4 vCPU, 8 GB RAM
    # Recommended for Supercheck app and worker pods

  - name: compute-intensive
    instance_type: cpx41 # 8 vCPU, 16 GB RAM
    # Recommended for heavy test execution workloads

  - name: memory-optimized
    instance_type: cpx51 # 8 vCPU, 32 GB RAM
    # Recommended for database and caching workloads
```

### Resource Allocation

Properly configure resource requests and limits:

```yaml
# App deployment with optimized resources
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
spec:
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/supercheck-io/supercheck/app:latest
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          # Add quality of service class
          # Burstable: requests < limits
          # Guaranteed: requests == limits
```

### Node Tuning

Optimize node settings:

```yaml
# Additional post-k3s commands for performance
additional_post_k3s_commands:
  - apt update
  - apt upgrade -y
  - apt autoremove -y
  # Optimize kernel parameters
  - sysctl -w vm.swappiness=10
  - sysctl -w vm.dirty_ratio=15
  - sysctl -w vm.dirty_background_ratio=5
  - sysctl -w net.core.rmem_max=134217728
  - sysctl -w net.core.wmem_max=134217728
```

## Container Performance

### Image Optimization

Use optimized container images:

```yaml
# Multi-stage build for smaller images
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Container Runtime Settings

Optimize container runtime:

```yaml
spec:
  containers:
    - name: app
      image: ghcr.io/supercheck-io/supercheck/app:latest
      # Optimize Node.js memory usage
      env:
        - name: NODE_OPTIONS
          value: "--max-old-space-size=1024 --expose-gc"
        # Optimize thread pool for I/O operations
        - name: UV_THREADPOOL_SIZE
          value: "4"
```

## Storage Performance

### Storage Class Selection

Choose appropriate storage classes:

```yaml
# High-performance storage for databases
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  storageClassName: hcloud-volumes-ssd  # Use SSD for better performance
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi

# Standard storage for logs and artifacts
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: logs-pvc
spec:
  storageClassName: hcloud-volumes  # Standard volume
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
```

### Database Optimization

Optimize PostgreSQL performance:

```yaml
# PostgreSQL configuration for performance
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
data:
  postgresql.conf: |
    # Memory settings
    shared_buffers = 256MB
    effective_cache_size = 1GB
    work_mem = 4MB
    maintenance_work_mem = 64MB

    # Connection settings
    max_connections = 100

    # Checkpoint settings
    checkpoint_completion_target = 0.9
    wal_buffers = 16MB

    # Query optimization
    random_page_cost = 1.1
    effective_io_concurrency = 200
```

## Network Performance

### CNI Selection

Choose the right CNI for your cluster size:

```yaml
# For small clusters (< 20 nodes)
networking:
  cni:
    mode: flannel  # Simple and lightweight

# For medium to large clusters (20+ nodes)
networking:
  cni:
    mode: cilium  # Better performance and features
```

### Network Policies

Optimize network policies for performance:

```yaml
# Use efficient network policies
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: supercheck-network-policy
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: supercheck
      # Allow specific ports only
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to: []
      # Allow specific egress traffic
      ports:
        - protocol: TCP
          port: 443
        - protocol: TCP
          port: 80
```

## Application Performance

### Caching Strategy

Implement effective caching:

```yaml
# Redis configuration for performance
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
data:
  redis.conf: |
    # Memory optimization
    maxmemory 512mb
    maxmemory-policy allkeys-lru

    # Persistence settings
    save 900 1
    save 300 10
    save 60 10000

    # Network optimization
    tcp-keepalive 300
    timeout 0
```

### Connection Pooling

Optimize database connections:

```yaml
# Connection pool configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  # Database connection pool
  DB_POOL_MIN: "2"
  DB_POOL_MAX: "10"
  DB_POOL_IDLE_TIMEOUT: "30000"

  # Redis connection pool
  REDIS_POOL_MIN: "2"
  REDIS_POOL_MAX: "5"
  REDIS_POOL_ACQUIRE_TIMEOUT_MILLIS: "3000"
```

## Autoscaling Performance

### Horizontal Pod Autoscaler

Configure HPA for optimal performance:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: supercheck-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: supercheck-app
  minReplicas: 2
  maxReplicas: 10
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
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

### Cluster Autoscaler

Configure cluster autoscaler for Hetzner:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
spec:
  template:
    spec:
      containers:
        - image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.21.0
          name: cluster-autoscaler
          command:
            - ./cluster-autoscaler
            - --cloud-provider=hetzner
            - --hetzner-token=$(HCLOUD_TOKEN)
            - --nodes=2:10:cpx21:nbg1
            - --nodes=1:5:cpx31:fsn1
            - --balance-similar-node-groups
            - --skip-nodes-with-local-storage=false
```

## Monitoring Performance

### Metrics Collection

Collect performance metrics:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
    - job_name: 'kubernetes-pods'
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
```

### Performance Dashboards

Create performance dashboards:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards
data:
  supercheck-performance.json: |
    {
      "dashboard": {
        "title": "Supercheck Performance",
        "panels": [
          {
            "title": "CPU Usage",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(container_cpu_usage_seconds_total[5m])"
              }
            ]
          },
          {
            "title": "Memory Usage",
            "type": "graph",
            "targets": [
              {
                "expr": "container_memory_usage_bytes"
              }
            ]
          }
        ]
      }
    }
```

## Optimization Checklist

### Pre-Deployment

- [ ] Choose appropriate instance types
- [ ] Configure resource requests and limits
- [ ] Set up proper storage classes
- [ ] Configure network policies
- [ ] Enable embedded registry mirror

### Post-Deployment

- [ ] Monitor resource utilization
- [ ] Configure autoscaling
- [ ] Set up performance dashboards
- [ ] Optimize database queries
- [ ] Implement caching strategies

### Ongoing

- [ ] Regular performance reviews
- [ ] Update to latest K3s versions
- [ ] Optimize based on metrics
- [ ] Scale resources as needed
- [ ] Monitor and tune autoscaling

## Troubleshooting Performance Issues

### Common Issues

1. **High CPU Usage**

   - Check for resource limits
   - Optimize application code
   - Scale horizontally

2. **Memory Leaks**

   - Monitor memory usage trends
   - Restart affected pods
   - Investigate application code

3. **Slow Network**

   - Check CNI configuration
   - Optimize network policies
   - Consider faster instance types

4. **Storage Bottlenecks**
   - Monitor I/O metrics
   - Use SSD storage
   - Optimize database queries

### Performance Testing

```bash
# Load testing with k6
k6 run --vus 10 --duration 30s script.js

# Database performance testing
pgbench -i testdb
pgbench -c 10 -j 2 -t 1000 testdb

# Network performance testing
iperf3 -c target-server -p 5001 -t 30
```

## Benchmarking

### Key Metrics to Track

- Pod startup time
- API response latency
- Database query performance
- Network throughput
- Storage I/O operations

### Performance Targets

- Pod startup time: < 30 seconds
- API response time: < 200ms (95th percentile)
- Database query time: < 100ms (average)
- Network latency: < 10ms (in-cluster)
- Storage IOPS: > 3000 (for SSD)
