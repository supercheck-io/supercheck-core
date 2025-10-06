# K3s Configuration Files for Supercheck

This directory contains K3s configuration files for deploying Supercheck on Hetzner Cloud, updated with the latest Hetzner-k3s best practices and recommendations.

## Configuration Files

### Single-Cluster Deployments

#### 1. `hetzner-k3s_cluster_config_simple.yaml`

- **Purpose**: Small development/testing clusters (1-5 nodes)
- **Features**:
  - Single master and worker node
  - Private network enabled
  - Flannel CNI
  - Basic security settings
  - Cost-optimized instance types (cpx11)

#### 2. `hetzner-k3s_cluster_config.yaml`

- **Purpose**: Medium production clusters (5-50 nodes)
- **Features**:
  - 3 master nodes for high availability
  - Multiple worker node pools with autoscaling
  - Private network enabled
  - Flannel CNI
  - Embedded registry mirror for performance
  - Enhanced security settings

#### 3. `hetzner-k3s_cluster_config_large.yaml`

- **Purpose**: Large production clusters (50+ nodes)
- **Features**:
  - 3 master nodes distributed across locations
  - Multiple specialized worker pools
  - Custom firewall with IP query server
  - Cilium CNI for better scalability
  - Public network with encryption
  - External datastore support

### Multi-Cluster Deployments (Recommended for Production)

#### 4. `hetzner-k3s_cluster_config_app.yaml`

- **Purpose**: Dedicated cluster for Supercheck app services
- **Features**:
  - Optimized for web workloads
  - Balanced CPU/memory configuration
  - Lower resource requirements
  - High availability setup

#### 5. `hetzner-k3s_cluster_config_worker.yaml`

- **Purpose**: Dedicated cluster for worker services (test execution)
- **Features**:
  - Optimized for CPU-intensive workloads
  - Higher resource limits
  - Playwright dependencies pre-installed
  - Autoscaling for variable workloads

## Key Improvements Made

### Security Enhancements

1. **SSH Configuration**

   - Updated to use ed25519 keys instead of RSA
   - Added support for SSH agents
   - Proper key path configurations

2. **Network Security**

   - Private network enabled for small/medium clusters
   - API access restricted to private networks
   - Custom firewall configuration for large clusters

3. **Protection Settings**
   - Enabled deletion protection
   - Load balancer for Kubernetes API
   - Proper network segmentation

### Performance Optimizations

1. **Instance Selection**

   - Appropriate instance types for different workloads
   - Location-based distribution for high availability

2. **Autoscaling Configuration**

   - Proper min/max instances for each node pool
   - Conservative scaling for stability

3. **Embedded Registry Mirror**
   - Enabled for medium and large clusters
   - Reduces external registry calls
   - Improves pod startup times

### Infrastructure Improvements

1. **CNI Configuration**

   - Flannel for small/medium clusters (simplicity)
   - Cilium for large clusters (scalability)
   - Encryption settings based on network type

2. **Cluster CIDR Settings**

   - Optimized CIDR ranges for better scaling
   - Proper DNS configuration

3. **Datastore Configuration**
   - etcd for HA setups
   - External datastore support for very large clusters

## Documentation Files

### 1. `security-guide.md`

Comprehensive security configuration guide covering:

- Network security best practices
- RBAC configuration
- Secret management
- Container security
- Monitoring and logging
- Certificate management
- Backup and recovery
- Security updates
- Access control
- Incident response

### 2. `performance-optimization.md`

Performance optimization guide including:

- Node performance tuning
- Container optimization
- Storage performance
- Network optimization
- Application performance
- Autoscaling configuration
- Monitoring and metrics
- Troubleshooting guide
- Benchmarking recommendations

### 3. `ip-query-server-setup.md`

Detailed setup guide for large clusters:

- IP query server implementation
- Docker Compose configuration
- SSL termination with Caddy
- High availability setup
- Security considerations
- Troubleshooting guide

### 4. `multi-cluster-deployment.md`

Comprehensive guide for multi-cluster deployments:

- Architecture overview and benefits
- Step-by-step deployment instructions
- Cross-cluster communication setup
- Scaling and monitoring strategies
- Cost optimization tips
- Troubleshooting multi-cluster issues

## Usage Instructions

### Prerequisites

1. Install hetzner-k3s:

   ```bash
   curl -sSfL https://raw.githubusercontent.com/xetama/hetzner-k3s/main/install.sh | bash -s -- -b /usr/local/bin
   ```

2. Generate SSH keys (if not already exists):

   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   ```

3. Get your Hetzner Cloud API token from the Hetzner Cloud Console

### Deploying a Cluster

1. **Simple Cluster (Development)**:

   ```bash
   cd k3s/configs
   cp hetzner-k3s_cluster_config_simple.yaml my-cluster.yaml
   # Edit my-cluster.yaml with your API token
   hetzner-k3s create -c my-cluster.yaml
   ```

2. **Medium Cluster (Production)**:

   ```bash
   cd k3s/configs
   cp hetzner-k3s_cluster_config.yaml my-cluster.yaml
   # Edit my-cluster.yaml with your API token
   hetzner-k3s create -c my-cluster.yaml
   ```

3. **Large Cluster (Enterprise)**:

   ```bash
   cd k3s/configs
   cp hetzner-k3s_cluster_config_large.yaml my-cluster.yaml
   # Edit my-cluster.yaml with your API token
   # Set up IP query server first (see ip-query-server-setup.md)
   hetzner-k3s create -c my-cluster.yaml
   ```

4. **Multi-Cluster Deployment (Recommended for Production)**:

```bash
cd k3s/scripts
./deploy-multi-cluster.sh
```

For more details, see [multi-cluster-deployment.md](multi-cluster-deployment.md)

### Deploying Supercheck

After creating the cluster:

1. **Install Traefik (if not already installed)**:

   ```bash
   kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v2.9/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml
   kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v2.9/docs/content/reference/dynamic-configuration/kubernetes-crd-rbac.yml
   ```

2. **Deploy Supercheck**:

   ```bash
   cd k3s
   kubectl apply -f configs/supercheck.yaml
   ```

3. **Check Deployment Status**:
   ```bash
   kubectl get pods -n supercheck
   kubectl get services -n supercheck
   kubectl get ingress -n supercheck
   ```

## Configuration Customization

### Environment Variables

Update the `supercheck.yaml` file with your specific configuration:

```yaml
data:
  # Database configuration
  DATABASE_URL: "postgresql://user:password@your-external-db-host:5432/supercheck"

  # Redis configuration
  REDIS_HOST: "your-external-redis-host"

  # Application URL
  NEXT_PUBLIC_APP_URL: "https://supercheck.yourdomain.com"

  # Performance settings
  RUNNING_CAPACITY: "5"
  QUEUED_CAPACITY: "100"
```

### Secrets

Create secrets for sensitive data:

```bash
kubectl create secret generic supercheck-secrets \
  --from-literal=DB_PASSWORD=your-db-password \
  --from-literal=REDIS_PASSWORD=your-redis-password \
  --from-literal=AWS_ACCESS_KEY_ID=your-access-key \
  --from-literal=AWS_SECRET_ACCESS_KEY=your-secret-key \
  -n supercheck
```

## Monitoring and Maintenance

### Health Checks

Check cluster health:

```bash
kubectl get nodes
kubectl get pods -A
kubectl top nodes
kubectl top pods -n supercheck
```

### Updates

Update K3s version:

```bash
# Edit your cluster configuration
k3s_version: v1.32.1+k3s1

# Apply update
hetzner-k3s update -c my-cluster.yaml
```

### Scaling

Scale worker nodes:

```bash
# Edit your cluster configuration
worker_node_pools:
  - name: workers
    instance_count: 5  # Increase from current value

# Apply changes
hetzner-k3s update -c my-cluster.yaml
```

## Troubleshooting

### Common Issues

1. **Cluster Creation Fails**

   - Check API token permissions
   - Verify SSH key configuration
   - Check instance availability in selected locations

2. **Pods Not Starting**

   - Check resource requests/limits
   - Verify image pull secrets
   - Check network policies

3. **Performance Issues**
   - Monitor resource utilization
   - Check autoscaling configuration
   - Review storage performance

### Getting Help

1. Check the [Hetzner-k3s documentation](https://github.com/xetama/hetzner-k3s)
2. Review the security and performance guides in this directory
3. Check Kubernetes logs:
   ```bash
   kubectl logs -n supercheck deployment/supercheck-app
   kubectl logs -n supercheck deployment/supercheck-worker
   ```

## Best Practices

1. **Security**

   - Regularly rotate API tokens and secrets
   - Use private networks when possible
   - Implement proper RBAC
   - Enable audit logging

2. **Performance**

   - Right-size instances based on workload
   - Enable autoscaling for variable workloads
   - Use embedded registry mirror
   - Monitor resource utilization

3. **Reliability**

   - Use multiple master nodes for production
   - Distribute nodes across locations
   - Implement proper backup strategies
   - Set up monitoring and alerting

4. **Cost Optimization**
   - Use appropriate instance types
   - Enable autoscaling to pay for what you use
   - Clean up unused resources
   - Monitor usage patterns

## Migration Guide

### From Previous Configuration

If you're migrating from an older configuration:

1. Backup your current cluster configuration
2. Create a new cluster with the updated configuration
3. Migrate applications using the supercheck.yaml file
4. Update DNS records to point to the new cluster
5. Decommission the old cluster

### Configuration Differences

The updated configurations include:

- Enhanced security settings
- Performance optimizations
- Better autoscaling configuration
- Improved network settings
- Additional monitoring capabilities

## Multi-Cluster Architecture

For production deployments, we recommend using the multi-cluster architecture:

### Benefits

1. **Resource Isolation**: Worker service CPU spikes don't affect the web UI
2. **Better Resource Utilization**: Optimize instance types for different workloads
3. **Improved Scalability**: Scale worker clusters independently
4. **Enhanced Security**: Network isolation between clusters
5. **Easier Maintenance**: Update worker clusters without affecting the app service

### Quick Start

```bash
# Deploy multi-cluster setup
cd k3s/scripts
./deploy-multi-cluster.sh

# Deploy only app cluster
./deploy-multi-cluster.sh app-only

# Deploy only worker clusters
./deploy-multi-cluster.sh worker-only

# Clean up all clusters
./deploy-multi-cluster.sh cleanup
```

### Architecture

- **App Cluster**: Runs web UI, API, and job scheduling
- **Worker Clusters**: Run test execution workloads (can have multiple)
- **Shared Services**: PostgreSQL, Redis, and S3 storage

For detailed instructions, see [multi-cluster-deployment.md](multi-cluster-deployment.md)

## Support

For issues related to:

- **Hetzner-k3s**: [GitHub Issues](https://github.com/xetama/hetzner-k3s/issues)
- **Supercheck**: [Supercheck Documentation](../README.md)
- **Kubernetes**: [Kubernetes Documentation](https://kubernetes.io/docs/)
