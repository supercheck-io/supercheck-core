#!/bin/bash

# Supercheck Kubernetes Deployment Script with Traefik
# Usage: ./deploy-traefik.sh [dev|prod] [namespace]

set -e

ENVIRONMENT=${1:-dev}
NAMESPACE=${2:-supercheck}

echo "🚀 Deploying Supercheck to Kubernetes with Traefik"
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

# Install Traefik if not already installed
echo "🔧 Checking Traefik installation..."
if ! kubectl get namespace traefik-system &> /dev/null; then
    echo "📦 Installing Traefik..."
    kubectl apply -f ../ingress-controllers/traefik/traefik-install.yaml

    echo "⏳ Waiting for Traefik to be ready..."
    kubectl wait --for=condition=Available deployment/traefik -n traefik-system --timeout=300s
    echo "✅ Traefik installed successfully"
else
    echo "✅ Traefik already installed"
fi

# Create namespace if it doesn't exist
echo "📁 Creating namespace '$NAMESPACE'..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply the configuration with Traefik
echo "📦 Applying Kubernetes manifests for $ENVIRONMENT environment with Traefik..."

# Create temporary kustomization with Traefik
temp_dir=$(mktemp -d)
cat > $temp_dir/kustomization.yaml << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../overlays/$ENVIRONMENT
  - ../ingress-controllers/traefik/traefik-ingress.yaml
  - ../ingress-controllers/traefik/traefik-middlewares.yaml

namespace: $NAMESPACE
EOF

kustomize build $temp_dir | kubectl apply -f -
rm -rf $temp_dir

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
echo "🔧 Traefik Dashboard:"
echo "   kubectl port-forward -n traefik-system svc/traefik-dashboard 8080:8080"
echo "   Then visit: http://localhost:8080"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 Access the application:"
if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo "   - Port forward: kubectl port-forward -n $NAMESPACE svc/supercheck-app-service 3000:3000"
    echo "   - Then visit: http://localhost:3000"
else
    echo "   - Configure your DNS to point to the Traefik LoadBalancer:"
    kubectl get svc traefik -n traefik-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
    echo ""
    echo "   - Update the ingress hosts in k8s/ingress-controllers/traefik/traefik-ingress.yaml"
fi
echo ""
echo "🔧 Useful commands:"
echo "   - View logs: kubectl logs -n $NAMESPACE -l app=supercheck-app -f"
echo "   - View worker logs: kubectl logs -n $NAMESPACE -l app=supercheck-worker -f"
echo "   - Traefik dashboard: kubectl port-forward -n traefik-system svc/traefik-dashboard 8080:8080"
echo "   - Scale workers: kubectl scale deployment supercheck-worker -n $NAMESPACE --replicas=6"
echo "   - Delete deployment: kustomize build ../ingress-controllers/traefik | kubectl delete -f -"
echo ""
echo "🌟 Traefik Features Enabled:"
echo "   - Automatic HTTPS with Let's Encrypt"
echo "   - WebSocket support for real-time updates"
echo "   - Rate limiting and security headers"
echo "   - Circuit breaker for resilience"
echo "   - Compression for better performance"