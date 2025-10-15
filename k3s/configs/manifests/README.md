# Kubernetes Manifests for Supercheck

This directory contains individual Kubernetes manifest files for deploying Supercheck. This is the traditional approach where each resource is in its own file.

## Files Overview

- `namespace.yaml` - Creates the supercheck namespace
- `configmap.yaml` - Environment variables configuration
- `secrets.yaml` - Sensitive data (passwords, keys, etc.)
- `app-deployment.yaml` - Supercheck app deployment
- `worker-deployment.yaml` - Supercheck worker deployment
- `app-service.yaml` - Service for the app
- `ingress.yaml` - Ingress configuration for external access

## Deployment Order

Apply the files in this order:

```bash
# 1. Create namespace
kubectl apply -f namespace.yaml

# 2. Create configuration
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml

# 3. Deploy applications
kubectl apply -f app-deployment.yaml
kubectl apply -f worker-deployment.yaml

# 4. Create service and ingress
kubectl apply -f app-service.yaml
kubectl apply -f ingress.yaml
```

## Or Apply All at Once

```bash
kubectl apply -f .
```

## Alternative: Single File Approach

If you prefer a single file approach, use `../supercheck.yaml` which contains all resources in one file.

```bash
kubectl apply -f ../supercheck.yaml
```
