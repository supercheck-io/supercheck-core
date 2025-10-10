#!/bin/bash

# Deploy Supercheck on K3s cluster

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed. Please install it first: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

# Check if kubeconfig exists
if [ ! -f "./kubeconfig" ]; then
    print_error "kubeconfig not found. Please run create-cluster.sh first."
    exit 1
fi

# Set kubeconfig
export KUBECONFIG="./kubeconfig"

print_status "Creating Load Balancer service for Traefik..."
kubectl apply -f ../configs/traefik-lb.yaml

print_status "Waiting for Load Balancer to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=traefik -n kube-system --timeout=300s

# Get the load balancer IP
LB_IP=$(kubectl get svc traefik-lb -n kube-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)

if [ -z "$LB_IP" ]; then
    print_status "Waiting for Load Balancer IP..."
    sleep 30
    LB_IP=$(kubectl get svc traefik-lb -n kube-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
fi

if [ -z "$LB_IP" ]; then
    print_error "Could not retrieve load balancer IP. Check with: kubectl get svc traefik-lb -n kube-system"
    exit 1
fi

print_status "Load Balancer IP: $LB_IP"

# Update supercheck.yaml with the actual IP
print_status "Updating supercheck.yaml with load balancer IP..."
sed -i.bak "s/IP_FROM_LB/$LB_IP/g" ../configs/supercheck.yaml

print_warning ""
print_warning "IMPORTANT: Before deploying, you need to:"
echo "1. Edit ../configs/supercheck.yaml"
echo "2. Update the ConfigMap with your external service URLs:"
echo "   - DATABASE_URL (PostgreSQL)"
echo "   - REDIS_URL (Redis)"
echo "   - S3_ENDPOINT (S3/MinIO)"
echo "3. Create the secret with actual values:"
echo "   - Base64 encode your passwords and keys"
echo "   - Replace the placeholder values in the Secret"
echo ""
read -p "Press Enter after updating the configuration..."

# Deploy Supercheck
print_status "Deploying Supercheck..."
kubectl apply -f ../configs/supercheck.yaml

print_status "Waiting for deployments to be ready..."
kubectl wait --for=condition=available deployment/supercheck-app -n supercheck --timeout=300s
kubectl wait --for=condition=available deployment/supercheck-worker -n supercheck --timeout=300s

print_status ""
print_status "Supercheck deployed successfully!"
print_status "Access your application at: http://supercheck.$LB_IP.nip.io"
print_status ""
print_warning "For production setup:"
echo "1. Point your custom domain to $LB_IP"
echo "2. Update the Ingress host in supercheck.yaml"
echo "3. Add TLS configuration for HTTPS"
echo "4. Apply the updated configuration"
print_status ""
print_status "Check deployment status:"
echo "kubectl get pods -n supercheck"
echo "kubectl get services -n supercheck"
echo "kubectl logs -n supercheck -l app=supercheck-app"