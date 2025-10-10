#!/bin/bash

# Simple deployment script using K3s's built-in Traefik

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

# Update hello-world.yaml with the actual IP
print_status "Updating hello-world.yaml with load balancer IP..."
sed -i.bak "s/IP_FROM_STEP_12/$LB_IP/g" ../configs/hello-world.yaml

# Deploy hello-world app
print_status "Deploying hello-world application..."
kubectl apply -f ../configs/hello-world.yaml

print_status "Waiting for hello-world deployment to be ready..."
kubectl wait --for=condition=available deployment/hello-world --timeout=300s

print_status "Application deployed successfully!"
print_status "Access your application at: http://hello-world.$LB_IP.nip.io"

print_warning "For custom domain setup:"
echo "1. Update your DNS to point yourDomain.com to $LB_IP"
echo "2. Edit hello-world.yaml to replace the host with your actual domain"
echo "3. Apply the updated configuration: kubectl apply -f ../configs/hello-world.yaml"