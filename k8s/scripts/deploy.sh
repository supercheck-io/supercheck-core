#!/bin/bash

# Supercheck Kubernetes Deployment Script
# Usage: ./deploy.sh [dev|prod] [namespace]

set -e

ENVIRONMENT=${1:-dev}
NAMESPACE=${2:-supercheck}

echo "🚀 Deploying Supercheck to Kubernetes"
echo "Environment: $ENVIRONMENT"
echo "Namespace: $NAMESPACE"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if kustomize is available
if ! command -v kustomize &> /dev/null; then
    echo "❌ kustomize is not installed or not in PATH"
    echo "Install kustomize: https://kubectl.docs.kubernetes.io/installation/kustomize/"
    exit 1
fi

# Check cluster connectivity
echo "🔍 Checking cluster connectivity..."
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Unable to connect to Kubernetes cluster"
    echo "Please check your kubeconfig and cluster connectivity"
    exit 1
fi

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Invalid environment. Use 'dev' or 'prod'"
    exit 1
fi

echo "✅ Cluster connectivity verified"

# Create namespace if it doesn't exist
echo "📁 Creating namespace '$NAMESPACE'..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply the configuration
echo "📦 Applying Kubernetes manifests for $ENVIRONMENT environment..."
kustomize build ../overlays/$ENVIRONMENT | kubectl apply -f -

echo "⏳ Waiting for deployments to be ready..."

# Wait for deployments to be ready
deployments=(
    "$NAMESPACE/postgres"
    "$NAMESPACE/redis"
    "$NAMESPACE/minio"
    "$NAMESPACE/supercheck-app"
    "$NAMESPACE/supercheck-worker"
)

for deployment in "${deployments[@]}"; do
    echo "⏳ Waiting for $deployment..."
    kubectl wait --for=condition=Available deployment/$deployment --timeout=300s
done

echo "✅ All deployments are ready!"

# Display service information
echo ""
echo "🌐 Service Information:"
kubectl get services -n $NAMESPACE

echo ""
echo "🔗 Ingress Information:"
kubectl get ingress -n $NAMESPACE

echo ""
echo "📊 Pod Status:"
kubectl get pods -n $NAMESPACE

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 Access the application:"
if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo "   - Port forward: kubectl port-forward -n $NAMESPACE svc/supercheck-app-service 3000:3000"
    echo "   - Then visit: http://localhost:3000"
else
    echo "   - Configure your DNS to point to the ingress controller"
    echo "   - Update the ingress host in k8s/base/ingress.yaml"
fi
echo ""
echo "🔧 Useful commands:"
echo "   - View logs: kubectl logs -n $NAMESPACE -l app=supercheck-app -f"
echo "   - View worker logs: kubectl logs -n $NAMESPACE -l app=supercheck-worker -f"
echo "   - Scale workers: kubectl scale deployment supercheck-worker -n $NAMESPACE --replicas=6"
echo "   - Delete deployment: kubectl delete -k ../overlays/$ENVIRONMENT"