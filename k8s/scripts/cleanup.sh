#!/bin/bash

# Supercheck Kubernetes Cleanup Script
# Usage: ./cleanup.sh [dev|prod] [namespace]

set -e

ENVIRONMENT=${1:-dev}
NAMESPACE=${2:-supercheck}

echo "🧹 Cleaning up Supercheck from Kubernetes"
echo "Environment: $ENVIRONMENT"
echo "Namespace: $NAMESPACE"

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Invalid environment. Use 'dev' or 'prod'"
    exit 1
fi

# Confirm deletion
echo "⚠️  This will delete all Supercheck resources in the '$NAMESPACE' namespace."
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cleanup cancelled"
    exit 1
fi

# Delete the resources
echo "🗑️  Deleting Kubernetes resources..."
kustomize build ../overlays/$ENVIRONMENT | kubectl delete -f - --ignore-not-found=true

echo "📁 Deleting namespace '$NAMESPACE'..."
kubectl delete namespace $NAMESPACE --ignore-not-found=true

echo "✅ Cleanup complete!"
echo ""
echo "ℹ️  Note: Persistent volumes may still exist depending on your storage class configuration."
echo "   Check with: kubectl get pv"