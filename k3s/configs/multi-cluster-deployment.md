# Multi-Cluster Deployment Guide for Supercheck

This guide explains how to deploy Supercheck across multiple K3s clusters for better scalability, isolation, and resource optimization.

## Architecture Overview

The multi-cluster architecture separates Supercheck into specialized clusters:

1. **App Cluster** (`supercheck-app`): Runs the web UI, API, and job scheduling
2. **Worker Clusters** (`supercheck-worker-1`, `supercheck-worker-2`, etc.): Run test execution workloads
3. **Optional**: Separate clusters for monitoring, databases, or other specialized services

## Benefits of Multi-Cluster Architecture

### 1. **Resource Isolation**

- Worker service CPU spikes don't affect the web UI
- Memory leaks in test execution don't impact API performance
- Independent scaling of different components

### 2. **Better Resource Utilization**

- App cluster optimized for web workloads (balanced CPU/memory)
- Worker clusters optimized for CPU-intensive test execution
- Cost-effective instance selection for each workload type

### 3. **Improved Scalability**

- Scale worker clusters independently based on test execution demand
- Add/remove worker clusters without affecting the app service
- Geographic distribution of worker clusters

### 4. **Enhanced Security**

- Network isolation between clusters
- Separate access controls for different components
- Reduced blast radius if one cluster is compromised

### 5. **Easier Maintenance**

- Update worker clusters without affecting the app service
- Independent backup/restore strategies
- Cluster-specific monitoring and alerting

## Prerequisites

1. **Hetzner Cloud Account** with sufficient quota
2. **Domain Name** for the app service
3. **External Services**:
   - PostgreSQL database (shared across clusters)
   - Redis for job queues (shared across clusters)
   - S3-compatible storage for artifacts (shared across clusters)
4. **Network Connectivity** between clusters (VPN or VPC peering)

## Deployment Steps

### 1. Create the App Cluster

```bash
# Create app cluster
cd k3s/configs
cp hetzner-k3s_cluster_config_app.yaml my-app-cluster.yaml

# Edit the configuration with your API token
nano my-app-cluster.yaml

# Create the cluster
hetzner-k3s create -c my-app-cluster.yaml

# Set up kubectl context
export KUBECONFIG=./kubeconfig-app
```

### 2. Deploy App Services

```bash
# Create namespace
kubectl create namespace supercheck

# Deploy app services only
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: supercheck-config
  namespace: supercheck
data:
  # Database configuration (external)
  DATABASE_URL: "postgresql://user:password@your-external-db-host:5432/supercheck"
  DB_HOST: "your-external-db-host"
  DB_PORT: "5432"
  DB_USER: "your-db-user"
  DB_NAME: "supercheck"

  # Redis configuration (external)
  REDIS_HOST: "your-external-redis-host"
  REDIS_PORT: "6379"
  REDIS_URL: "redis://:password@your-external-redis-host:6379"

  # App configuration
  NEXT_PUBLIC_APP_URL: "https://supercheck.yourdomain.com"
  BETTER_AUTH_URL: "https://supercheck.yourdomain.com"
  BETTER_AUTH_SECRET: "your-super-secret-auth-key-change-this-in-production"
  NODE_ENV: "production"

  # Worker configuration (reduced for app cluster)
  RUNNING_CAPACITY: "2"
  QUEUED_CAPACITY: "50"
  MAX_CONCURRENT_EXECUTIONS: "1"

  # Other configuration...
EOF

# Create secrets
kubectl create secret generic supercheck-secrets \
  --from-literal=DB_PASSWORD=your-db-password \
  --from-literal=REDIS_PASSWORD=your-redis-password \
  --from-literal=AWS_ACCESS_KEY_ID=your-access-key \
  --from-literal=AWS_SECRET_ACCESS_KEY=your-secret-key \
  -n supercheck

# Deploy app deployment
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
  namespace: supercheck
spec:
  replicas: 2
  selector:
    matchLabels:
      app: supercheck-app
  template:
    metadata:
      labels:
        app: supercheck-app
    spec:
      containers:
        - name: app
          image: ghcr.io/supercheck-io/supercheck/app:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: supercheck-config
            - secretRef:
                name: supercheck-secrets
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
EOF

# Deploy app service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: supercheck-app-service
  namespace: supercheck
spec:
  type: ClusterIP
  selector:
    app: supercheck-app
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
EOF

# Deploy ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: supercheck-ingress
  namespace: supercheck
  annotations:
    kubernetes.io/ingress.class: traefik
spec:
  ingressClassName: traefik
  rules:
    - host: supercheck.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: supercheck-app-service
                port:
                  number: 3000
EOF
```

### 3. Create Worker Clusters

```bash
# Create first worker cluster
cp hetzner-k3s_cluster_config_worker.yaml my-worker-cluster-1.yaml

# Edit with unique settings
nano my-worker-cluster-1.yaml
# Change cluster_name to supercheck-worker-1
# Change kubeconfig_path to ./kubeconfig-worker-1
# Update private network subnet to 10.2.0.0/16
# Update cluster_cidr to 10.246.0.0/16
# Update service_cidr to 10.98.0.0/12

# Create the cluster
hetzner-k3s create -c my-worker-cluster-1.yaml

# Create additional worker clusters as needed
# Repeat with different subnets and names
```

### 4. Deploy Worker Services

```bash
# For each worker cluster
export KUBECONFIG=./kubeconfig-worker-1

# Create namespace
kubectl create namespace supercheck

# Apply the same configmap and secrets from app cluster
# (Copy from app cluster or create shared configuration)

# Deploy worker service only
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-worker
  namespace: supercheck
spec:
  replicas: 5  # Higher replica count for worker cluster
  selector:
    matchLabels:
      app: supercheck-worker
  template:
    metadata:
      labels:
        app: supercheck-worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/supercheck-io/supercheck/worker:latest
          env:
            - name: NODE_OPTIONS
              value: "--max-old-space-size=2048 --expose-gc --experimental-worker"
            - name: UV_THREADPOOL_SIZE
              value: "8"  # Higher for worker clusters
          envFrom:
            - configMapRef:
                name: supercheck-config
            - secretRef:
                name: supercheck-secrets
          resources:
            requests:
              memory: "2Gi"
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
EOF
```

### 5. Configure Cross-Cluster Communication

#### Option A: VPN Connection

```bash
# Install WireGuard on all clusters
# Create a mesh network between clusters
# Update Redis and database connections to use VPN IPs
```

#### Option B: Hetzner Private Network

```bash
# Create a shared private network
# Add all clusters to the same private network
# Update service discovery to use private network IPs
```

#### Option C: Public Endpoints with Security

```bash
# Expose Redis and database with TLS
# Use authentication and IP whitelisting
# Configure worker clusters to connect securely
```

## Scaling the Architecture

### Adding Worker Clusters

1. Create a new worker cluster configuration
2. Deploy the cluster
3. Configure network connectivity
4. Deploy worker services
5. Update job queue configuration to distribute jobs

### Geographic Distribution

```yaml
# Example: Worker cluster in different location
worker_node_pools:
  - name: test-executors-us
    instance_type: cpx31
    location: ash # Hillsboro, USA
    autoscaling:
      enabled: true
      min_instances: 2
      max_instances: 5
```

### Autoscaling Worker Clusters

```yaml
# Configure cluster autoscaler for each worker cluster
worker_node_pools:
  - name: test-executors
    instance_type: cpx31
    autoscaling:
      enabled: true
      min_instances: 3
      max_instances: 20 # Higher limit for scaling
```

## Monitoring Multi-Cluster Setup

### Centralized Monitoring

```yaml
# Deploy Prometheus in app cluster
# Configure it to scrape metrics from all worker clusters
# Use federation for multi-cluster monitoring
```

### Logging

```yaml
# Centralized logging with Loki
# Configure fluent-bit in each cluster
# Forward logs to central Loki instance
```

### Health Checks

```bash
# Monitor cluster health
kubectl get nodes --context=app-cluster
kubectl get nodes --context=worker-cluster-1

# Monitor service health
kubectl get pods -n supercheck --context=app-cluster
kubectl get pods -n supercheck --context=worker-cluster-1
```

## Cost Optimization

### Right-Sizing Clusters

1. **App Cluster**: Smaller instances, balanced CPU/memory
2. **Worker Clusters**: Larger CPU instances based on workload
3. **Autoscaling**: Pay for what you use
4. **Spot Instances**: Use for non-critical worker clusters

### Resource Sharing

1. **Database**: Single instance shared across clusters
2. **Redis**: Shared job queue
3. **Storage**: Shared S3 bucket
4. **Monitoring**: Centralized monitoring stack

## Disaster Recovery

### Backup Strategy

1. **App Cluster**: Backup configurations and deployments
2. **Worker Clusters**: Immutable, can be recreated
3. **Database**: Regular backups
4. **Redis**: Persistence enabled

### Recovery Procedures

1. **App Cluster Failure**: Restore from backup, recreate worker connections
2. **Worker Cluster Failure**: Recreate cluster, reconnect to shared services
3. **Network Failure**: Failover to alternative connectivity

## Troubleshooting

### Common Issues

1. **Cross-Cluster Connectivity**

   - Check network configuration
   - Verify firewall rules
   - Test DNS resolution

2. **Job Distribution**

   - Check Redis connectivity
   - Verify queue configuration
   - Monitor job processing

3. **Resource Contention**
   - Monitor cluster resources
   - Check autoscaling configuration
   - Verify resource limits

### Debug Commands

```bash
# Check connectivity between clusters
kubectl exec -it -n supercheck deployment/supercheck-app -- nc -zv redis-host 6379

# Check job queue status
kubectl exec -it -n supercheck deployment/supercheck-app -- redis-cli -h redis-host info

# Monitor worker logs
kubectl logs -n supercheck -l app=supercheck-worker --context=worker-cluster-1
```

## Best Practices

1. **Use GitOps** for managing multi-cluster configurations
2. **Implement proper CI/CD** for each cluster type
3. **Monitor cross-cluster latency** for performance optimization
4. **Use network policies** for security between clusters
5. **Implement proper secret management** across clusters
6. **Regular disaster recovery testing**
7. **Document cluster topology** and dependencies
8. **Use consistent naming conventions** across clusters

## Migration from Single Cluster

1. **Assess current resource usage**
2. **Plan cluster separation strategy**
3. **Create app cluster first**
4. **Migrate app services**
5. **Create worker clusters**
6. **Migrate worker services**
7. **Update DNS and load balancers**
8. **Decommission old cluster**
