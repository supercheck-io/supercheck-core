# K3s Configuration for Supercheck

This directory contains a simple, robust K3s configuration for deploying Supercheck on Hetzner Cloud.

## Configuration Files

### 1. `hetzner-k3s_cluster_config_simple.yaml`

A minimal, cost-effective configuration for development and small production deployments.

**Features:**

- Single master and worker node
- Private network enabled for security
- Flannel CNI for simplicity
- Cost-optimized instance types (cpx11)
- Basic security settings

### 2. `supercheck.yaml`

Single-file Kubernetes manifest containing all resources for deploying Supercheck services on the cluster.

**Includes:**

- Namespace configuration
- ConfigMap for environment variables
- Secret management
- App and Worker deployments
- Service and Ingress configuration

### 3. `manifests/` directory

Individual Kubernetes manifest files for traditional deployment approach.

**Includes:**

- `namespace.yaml` - Namespace configuration
- `configmap.yaml` - Environment variables
- `secrets.yaml` - Sensitive data
- `app-deployment.yaml` - App deployment
- `worker-deployment.yaml` - Worker deployment
- `app-service.yaml` - Service configuration
- `ingress.yaml` - Ingress configuration

## Quick Start

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

### Deployment Steps

1. **Create the cluster**:

   ```bash
   cd k3s/configs
   cp hetzner-k3s_cluster_config_simple.yaml my-cluster.yaml
   # Edit my-cluster.yaml with your API token
   hetzner-k3s create -c my-cluster.yaml
   ```

2. **Set up kubectl**:

   ```bash
   export KUBECONFIG=./kubeconfig
   ```

3. **Deploy Supercheck** - Choose one of the following options:

   **Option A: Single File Deployment (Simple)**

   ```bash
   # Update supercheck.yaml with your configuration
   kubectl apply -f supercheck.yaml
   ```

   **Option B: Separate Files Deployment (Traditional)**

   ```bash
   # Update manifests/configmap.yaml and manifests/secrets.yaml with your configuration
   cd manifests
   kubectl apply -f namespace.yaml
   kubectl apply -f configmap.yaml
   kubectl apply -f secrets.yaml
   kubectl apply -f app-deployment.yaml
   kubectl apply -f worker-deployment.yaml
   kubectl apply -f app-service.yaml
   kubectl apply -f ingress.yaml
   # Or apply all at once: kubectl apply -f .
   ```

4. **Check deployment status**:
   ```bash
   kubectl get pods -n supercheck
   kubectl get services -n supercheck
   kubectl get ingress -n supercheck
   ```

## Configuration

### Environment Variables

**Option A: Single File**
Update the `supercheck.yaml` file with your specific configuration.

**Option B: Separate Files**
Update the `manifests/configmap.yaml` file with your specific configuration.

```yaml
data:
  # Database configuration (external)
  DATABASE_URL: "postgresql://user:password@your-external-db-host:5432/supercheck"
  DB_HOST: "your-external-db-host"

  # Redis configuration (external)
  REDIS_HOST: "your-external-redis-host"

  # Application URL
  NEXT_PUBLIC_APP_URL: "https://supercheck.yourdomain.com"

  # Performance settings
  RUNNING_CAPACITY: "5"
  QUEUED_CAPACITY: "100"
```

### Secrets

**Option A: Single File**
Update the `supercheck.yaml` secrets section with base64-encoded values.

**Option B: Separate Files**
Update the `manifests/secrets.yaml` file with base64-encoded values, or create secrets dynamically:

```bash
kubectl create secret generic supercheck-secrets \
  --from-literal=DB_PASSWORD=your-db-password \
  --from-literal=REDIS_PASSWORD=your-redis-password \
  --from-literal=AWS_ACCESS_KEY_ID=your-access-key \
  --from-literal=AWS_SECRET_ACCESS_KEY=your-secret-key \
  -n supercheck
```

## External Services

This configuration expects external services to be running:

- **PostgreSQL**: Database for persistent data
- **Redis**: Job queue and caching
- **S3/MinIO**: Storage for test artifacts

## Scaling

To scale your deployment:

1. **Scale the cluster** (edit your cluster config):

   ```yaml
   worker_node_pools:
     - name: default
       instance_type: cpx21 # Larger instance
       instance_count: 3 # More nodes
   ```

2. **Scale the application** (edit supercheck.yaml):
   ```yaml
   spec:
     replicas: 3 # More app replicas
   ```

## Monitoring

Check cluster health:

```bash
kubectl get nodes
kubectl get pods -A
kubectl top nodes
kubectl top pods -n supercheck
```

## Cleanup

To remove the cluster:

```bash
hetzner-k3s delete -c my-cluster.yaml
```

## Security Notes

- The cluster uses a private network for internal communication
- API access is restricted to the private network
- SSH access uses ed25519 keys for better security
- Deletion protection is enabled to prevent accidental deletion

## Troubleshooting

### Common Issues

1. **Cluster creation fails**

   - Check API token permissions
   - Verify SSH key configuration
   - Check instance availability in selected location

2. **Pods not starting**

   - Check resource requests/limits
   - Verify image pull secrets
   - Check network policies

3. **Performance issues**
   - Monitor resource utilization
   - Consider upgrading instance types
   - Review external service connectivity

### Getting Help

1. Check the [Hetzner-k3s documentation](https://github.com/xetama/hetzner-k3s)
2. Review Kubernetes logs:
   ```bash
   kubectl logs -n supercheck deployment/supercheck-app
   kubectl logs -n supercheck deployment/supercheck-worker
   ```

## Best Practices

1. **Security**

   - Regularly rotate API tokens and secrets
   - Use strong passwords for external services
   - Enable audit logging

2. **Performance**

   - Right-size instances based on workload
   - Monitor resource utilization
   - Use appropriate storage for your workload

3. **Reliability**
   - Set up monitoring and alerting
   - Implement backup strategies for external services
   - Test disaster recovery procedures

## Support

For issues related to:

- **Hetzner-k3s**: [GitHub Issues](https://github.com/xetama/hetzner-k3s/issues)
- **Supercheck**: [Supercheck Documentation](../../README.md)
- **Kubernetes**: [Kubernetes Documentation](https://kubernetes.io/docs/)
