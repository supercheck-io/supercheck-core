#!/bin/bash

# Supercheck Kubernetes Deployment Script with External Services
# Usage: ./deploy-external-services.sh [environment] [ingress-type]

set -e

ENVIRONMENT=${1:-prod}
INGRESS_TYPE=${2:-traefik}  # traefik or nginx

echo "🚀 Deploying Supercheck with External Services"
echo "Environment: $ENVIRONMENT"
echo "Ingress: $INGRESS_TYPE"
echo "Services: External (Neon/PlanetScale + Redis Cloud + S3)"

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

echo "✅ Cluster connectivity verified"

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Invalid environment. Use 'dev', 'staging', or 'prod'"
    exit 1
fi

# Validate ingress type
if [[ "$INGRESS_TYPE" != "traefik" && "$INGRESS_TYPE" != "nginx" ]]; then
    echo "❌ Invalid ingress type. Use 'traefik' or 'nginx'"
    exit 1
fi

# Check external services configuration
echo "🔧 Validating external services configuration..."

# Check if secrets file exists and has required keys
if [ ! -f "../external-services/secrets.yaml" ]; then
    echo "❌ Missing secrets file: k8s/external-services/secrets.yaml"
    echo "Please create and configure your external service credentials"
    exit 1
fi

# Validate required secrets (check for placeholder values)
if grep -q "base64-encoded" ../external-services/secrets.yaml; then
    echo "⚠️  WARNING: Found placeholder values in secrets.yaml"
    echo "Please update with your actual service credentials:"
    echo "  - DATABASE_URL (Neon/PlanetScale connection string)"
    echo "  - REDIS_URL (Redis Cloud connection string)"
    echo "  - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (S3 credentials)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        exit 1
    fi
fi

echo "✅ Configuration validation complete"

# Install Traefik if specified and not already installed
if [[ "$INGRESS_TYPE" == "traefik" ]]; then
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
fi

# Create namespace if it doesn't exist
NAMESPACE="supercheck"
echo "📁 Creating namespace '$NAMESPACE'..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply the external services configuration
echo "📦 Applying Supercheck configuration with external services..."

# Create temporary kustomization for the specific environment and ingress
temp_dir=$(mktemp -d)

# Base kustomization
cat > $temp_dir/kustomization.yaml << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../external-services/

namespace: $NAMESPACE

# Environment-specific patches
patchesStrategicMerge:
  - environment-patches.yaml

# Add ingress configuration
EOF

# Add ingress resources
if [[ "$INGRESS_TYPE" == "traefik" ]]; then
    echo "  - ../ingress-controllers/traefik/traefik-ingress.yaml" >> $temp_dir/kustomization.yaml
    echo "  - ../ingress-controllers/traefik/traefik-middlewares.yaml" >> $temp_dir/kustomization.yaml
else
    echo "  - ../ingress-controllers/nginx/ingress.yaml" >> $temp_dir/kustomization.yaml
fi

# Create environment-specific patches
cat > $temp_dir/environment-patches.yaml << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: supercheck-config
  namespace: $NAMESPACE
data:
  NODE_ENV: "$ENVIRONMENT"
EOF

# Environment-specific scaling
if [[ "$ENVIRONMENT" == "dev" ]]; then
    cat >> $temp_dir/environment-patches.yaml << EOF
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
spec:
  replicas: 1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-worker
spec:
  replicas: 1
EOF
elif [[ "$ENVIRONMENT" == "staging" ]]; then
    cat >> $temp_dir/environment-patches.yaml << EOF
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
spec:
  replicas: 1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-worker
spec:
  replicas: 2
EOF
else  # production
    cat >> $temp_dir/environment-patches.yaml << EOF
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
spec:
  replicas: 2
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-worker
spec:
  replicas: 4
EOF
fi

# Apply the configuration
kustomize build $temp_dir | kubectl apply -f -
rm -rf $temp_dir

echo "⏳ Waiting for deployments to be ready..."

# Wait for deployments to be ready
deployments=(
    "$NAMESPACE/supercheck-app"
    "$NAMESPACE/supercheck-worker"
)

for deployment in "${deployments[@]}"; do
    echo "⏳ Waiting for $deployment..."
    kubectl wait --for=condition=Available deployment/$deployment --timeout=300s
done

echo "✅ All deployments are ready!"

# Test external service connectivity
echo "🔍 Testing external service connectivity..."

# Test database connection
echo "📊 Testing database connection..."
if kubectl exec -n $NAMESPACE deploy/supercheck-app -- \
    sh -c 'timeout 10 node -e "
        const { Pool } = require(\"pg\");
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query(\"SELECT 1\").then(() => console.log(\"✅ Database OK\")).catch(e => {console.error(\"❌ Database:\", e.message); process.exit(1);});
    "' 2>/dev/null; then
    echo "✅ Database connection successful"
else
    echo "⚠️  Database connection test failed (this is normal if using different DB engine)"
fi

# Test Redis connection
echo "🔴 Testing Redis connection..."
if kubectl exec -n $NAMESPACE deploy/supercheck-app -- \
    sh -c 'timeout 10 node -e "
        const Redis = require(\"ioredis\");
        const redis = new Redis(process.env.REDIS_URL);
        redis.ping().then(() => console.log(\"✅ Redis OK\")).catch(e => {console.error(\"❌ Redis:\", e.message); process.exit(1);});
    "' 2>/dev/null; then
    echo "✅ Redis connection successful"
else
    echo "⚠️  Redis connection test failed - check REDIS_URL configuration"
fi

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

if [[ "$INGRESS_TYPE" == "traefik" ]]; then
    echo ""
    echo "🔧 Traefik Dashboard:"
    echo "   kubectl port-forward -n traefik-system svc/traefik-dashboard 8080:8080"
    echo "   Then visit: http://localhost:8080"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 Access the application:"
if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo "   - Port forward: kubectl port-forward -n $NAMESPACE svc/supercheck-app-service 3000:3000"
    echo "   - Then visit: http://localhost:3000"
else
    echo "   - Configure your DNS to point to the ingress controller"
    if [[ "$INGRESS_TYPE" == "traefik" ]]; then
        echo "   - Get LoadBalancer IP: kubectl get svc traefik -n traefik-system"
    else
        echo "   - Get LoadBalancer IP: kubectl get svc ingress-nginx-controller -n ingress-nginx"
    fi
fi

echo ""
echo "🔧 Useful commands:"
echo "   - View app logs: kubectl logs -n $NAMESPACE -l app=supercheck-app -f"
echo "   - View worker logs: kubectl logs -n $NAMESPACE -l app=supercheck-worker -f"
echo "   - Scale workers: kubectl scale deployment supercheck-worker -n $NAMESPACE --replicas=8"
echo "   - Check HPA: kubectl get hpa -n $NAMESPACE"
echo "   - Delete deployment: kubectl delete namespace $NAMESPACE"

echo ""
echo "🌟 External Services Benefits:"
echo "   - ✅ Zero database/Redis maintenance"
echo "   - ✅ Automatic backups and scaling"
echo "   - ✅ Reduced Kubernetes resource usage"
echo "   - ✅ Enterprise-grade reliability"
echo "   - ✅ Cost optimization at scale"

echo ""
echo "📊 Monitor your external services:"
echo "   - Database: Check your Neon/PlanetScale dashboard"
echo "   - Redis: Check your Redis Cloud dashboard"
echo "   - Storage: Check your AWS S3/CloudFlare R2 console"