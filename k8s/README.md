# Kubernetes Deployment for SuperTest

This directory contains Kubernetes manifests to deploy the SuperTest application in a scalable, cloud-native architecture.

## Architecture

The deployment consists of the following components:

- **Frontend**: Next.js application serving the UI
- **Worker**: NestJS service for test execution
- **Redis**: Queue system for job processing
- **PostgreSQL**: Database for application state and metadata
- **MinIO**: S3-compatible storage for test artifacts and reports

## Directory Structure

``` bash
kubernetes/
├── base/               # Base Kubernetes manifests
│   ├── deployments
│   ├── services
│   ├── ingress
│   └── stateful components
├── overlays/           # Environment-specific customizations
│   ├── dev/            # Development environment
│   └── prod/           # Production environment
└── Dockerfile.*        # Dockerfiles for building container images
```

## Prerequisites

- Kubernetes cluster (v1.22+)
- kubectl
- kustomize
- Docker

## Building Images

Build the frontend and worker images:

```bash
# Build frontend image
docker build -t supertest-frontend:latest -f kubernetes/Dockerfile.frontend .

# Build worker image
docker build -t supertest-worker:latest -f kubernetes/Dockerfile.worker .
```

For production, tag and push to your container registry:

```bash
# Tag images
docker tag supertest-frontend:latest your-registry.com/supertest-frontend:latest
docker tag supertest-worker:latest your-registry.com/supertest-worker:latest

# Push images
docker push your-registry.com/supertest-frontend:latest
docker push your-registry.com/supertest-worker:latest
```

## Deployment

### Development Environment

```bash
# Deploy all components
kubectl apply -k kubernetes/overlays/dev/

# View deployed resources
kubectl get all -n supertest-dev
```

### Production Environment

Before deploying to production, update the secrets in `kubernetes/overlays/prod/kustomization.yaml` or use a secure secrets management solution.

```bash
# Deploy all components
kubectl apply -k kubernetes/overlays/prod/

# View deployed resources
kubectl get all -n supertest
```

## Accessing the Application

### Development

```bash
# Port forward the frontend service to access locally
kubectl port-forward -n supertest-dev svc/dev-frontend 3000:80

# Access the application at http://localhost:3000
```

### Production

The application will be available through the Ingress resource. Configure DNS to point to your Ingress controller's external IP or use the assigned load balancer IP/hostname.

## Monitoring

Monitor the application using:

```bash
# View pod status
kubectl get pods -n supertest

# View logs for frontend
kubectl logs -n supertest deploy/frontend

# View logs for worker
kubectl logs -n supertest deploy/worker

# Monitor HPA
kubectl get hpa -n supertest
```

## Scaling

The application uses Horizontal Pod Autoscalers (HPA) for automatic scaling:

- Frontend scales based on CPU utilization
- Worker scales based on CPU utilization

You can manually scale if needed:

```bash
# Scale frontend
kubectl scale deploy/frontend -n supertest --replicas=5

# Scale worker
kubectl scale deploy/worker -n supertest --replicas=10
```

## Cleanup

### Dev

```bash
kubectl delete -k kubernetes/overlays/dev/
```

### Prod

```bash
kubectl delete -k kubernetes/overlays/prod/
```
