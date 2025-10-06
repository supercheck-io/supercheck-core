#!/bin/bash

# Script to create a K3s cluster on Hetzner Cloud using hetzner-k3s

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

# Check if hetzner-k3s is installed
if ! command -v hetzner-k3s &> /dev/null; then
    print_error "hetzner-k3s is not installed. Please install it first: https://github.com/vitobotta/hetzner-k3s#installation"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed. Please install it first: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
    print_error "Helm is not installed. Please install it first: https://helm.sh/docs/intro/install/"
    exit 1
fi

# Check if config file exists
CONFIG_FILE="../configs/hetzner-k3s_cluster_config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Check if Hetzner token is set
if grep -q "YOUR_HETZNER_API_TOKEN" "$CONFIG_FILE"; then
    print_error "Please update the Hetzner API token in $CONFIG_FILE"
    exit 1
fi

print_status "Creating K3s cluster with Hetzner..."
hetzner-k3s create --config "$CONFIG_FILE"

print_status "Cluster created successfully!"
print_status "Setting up kubeconfig..."
export KUBECONFIG="./kubeconfig"

print_status "Verifying cluster connection..."
kubectl cluster-info

print_status "Node status:"
kubectl get nodes -o wide

print_status "Cluster creation completed!"
print_warning "Don't forget to update your domain DNS to point to the load balancer IP once ingress-nginx is installed."