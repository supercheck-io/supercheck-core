# Supercheck on K3s (Hetzner Cloud)

Deploy Supercheck on K3s using Hetzner Cloud with external services for database, Redis, and S3.

## Architecture

- **K3s Cluster**: Runs on Hetzner Cloud
- **App & Worker**: Deployed on K3s
- **External Services**: PostgreSQL, Redis, S3/MinIO (hosted elsewhere)

## Quick Start

1. **Create the cluster**:

   ```bash
   nano configs/hetzner-k3s_cluster_config.yaml
   # Add your Hetzner API token

   cd scripts
   ./create-cluster.sh
   ```

2. **Generate secrets**:

   ```bash
   ./generate-secrets.sh
   # This creates configs/supercheck-secrets.yaml
   ```

3. **Configure external services**:

   ```bash
   nano configs/supercheck.yaml
   # Update the ConfigMap with your external service URLs
   ```

4. **Deploy Supercheck**:

   ```bash
   ./deploy-supercheck.sh
   ```

5. **Access Supercheck**:
   Open the URL shown at the end (e.g., `http://supercheck.<IP>.nip.io`)

## Configuration

### External Services Setup

Update `configs/supercheck.yaml` with your external service details:

```yaml
data:
  # PostgreSQL
  DATABASE_URL: "postgresql://user:password@your-db-host:5432/supercheck"

  # Redis
  REDIS_URL: "redis://your-redis-host:6379"

  # S3/MinIO
  S3_ENDPOINT: "your-s3-host"
  S3_BUCKET: "supercheck-artifacts"
  S3_REGION: "us-east-1"
```

### Secrets Management

Generate secrets with the helper script:

```bash
./generate-secrets.sh
```

This creates a secure secret file with:

- Database password
- Redis password (if applicable)
- S3 access keys
- NextAuth secret

## Deployment Options

### Option 1: HA Cluster (Production)

- 3 master nodes across different locations
- Multiple worker nodes with autoscaling
- Use `configs/hetzner-k3s_cluster_config.yaml`

### Option 2: Simple Cluster (Testing)

- 1 master, 1 worker
- No autoscaling
- Use `configs/hetzner-k3s_cluster_config_simple.yaml`

## Files

- `configs/supercheck.yaml` - Supercheck app and worker deployment
- `configs/traefik-lb.yaml` - Load Balancer for Traefik
- `scripts/deploy-supercheck.sh` - Deployment script
- `scripts/generate-secrets.sh` - Secret generator

## Custom Domain

1. Point your domain to the Load Balancer IP
2. Edit `configs/supercheck.yaml` - update the Ingress host
3. Add TLS configuration (uncomment TLS sections)
4. Apply: `kubectl apply -f configs/supercheck.yaml`

## Monitoring

Check deployment status:

```bash
kubectl get pods -n supercheck
kubectl get services -n supercheck
kubectl logs -n supercheck -l app=supercheck-app
```

## Cleanup

```bash
cd scripts
./cleanup.sh
```

## Notes

- The app and worker are configured with appropriate resource limits
- Health checks are configured for the app
- The worker handles test execution jobs
- All sensitive data is stored in Kubernetes secrets

## Volumes

The following volumes are used for temporary storage:

### App Volumes

- `/app/public/tests` - Test files
- `/app/public/test-results` - Test results
- `/app/public/artifacts` - Temporary artifacts (before upload to S3)

### Worker Volumes

- `/app/playwright-reports` - Playwright test reports
- `/app/report` - Worker execution reports

All volumes use `emptyDir` which means:

- They are created when the pod starts
- They exist only while the pod is running
- They are deleted when the pod is removed
- Data is persisted to S3 for long-term storage

This is safe because:

- Test artifacts are uploaded to S3
- Reports are temporary during execution
- No persistent data is stored locally
