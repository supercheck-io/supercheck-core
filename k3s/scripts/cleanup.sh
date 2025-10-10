#!/bin/bash

# Script to clean up the K3s cluster and deployed resources

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
    print_error "hetzner-k3s is not installed."
    exit 1
fi

# Check if kubeconfig exists
if [ ! -f "./kubeconfig" ]; then
    print_error "kubeconfig not found. No cluster to clean up."
    exit 1
fi

# Set kubeconfig
export KUBECONFIG="./kubeconfig"

print_warning "This will delete the entire K3s cluster and all resources."
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    print_status "Cleanup cancelled."
    exit 0
fi

# Get cluster name from config
CLUSTER_NAME=$(grep "cluster_name:" ../configs/hetzner-k3s_cluster_config.yaml | awk '{print $2}')

print_status "Deleting cluster: $CLUSTER_NAME"
hetzner-k3s delete --cluster-name "$CLUSTER_NAME"

# Clean up local files
print_status "Cleaning up local files..."
rm -f ./kubeconfig
rm -f ../configs/hello-world.yaml.bak

print_status "Cluster cleanup completed!"
print_warning "Note: Any load balancers created in Hetzner Cloud may need to be manually deleted through the Hetzner Cloud console."