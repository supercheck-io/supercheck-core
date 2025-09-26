#!/bin/bash

# Supercheck Port Forward Script for Local Development
# Usage: ./port-forward.sh [namespace]

NAMESPACE=${1:-supercheck}

echo "🔗 Setting up port forwarding for Supercheck services"
echo "Namespace: $NAMESPACE"

# Function to start port forwarding in background
start_port_forward() {
    local service=$1
    local port=$2
    local target_port=$3

    echo "🔌 Port forwarding $service: localhost:$port -> $target_port"
    kubectl port-forward -n $NAMESPACE svc/$service $port:$target_port &
    local pid=$!
    echo $pid > /tmp/pf-$service.pid
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Kill existing port forwards
echo "🧹 Cleaning up existing port forwards..."
pkill -f "kubectl port-forward" || true
rm -f /tmp/pf-*.pid

# Start port forwarding for all services
start_port_forward "supercheck-app-service" 3000 3000
start_port_forward "postgres-service" 5432 5432
start_port_forward "redis-service" 6379 6379
start_port_forward "minio-service" 9000 9000
start_port_forward "minio-service" 9001 9001

echo ""
echo "✅ Port forwarding active! Access services at:"
echo "   🌐 Supercheck App: http://localhost:3000"
echo "   🗄️  PostgreSQL: localhost:5432"
echo "   🔴 Redis: localhost:6379"
echo "   📦 MinIO API: http://localhost:9000"
echo "   🖥️  MinIO Console: http://localhost:9001"
echo ""
echo "Press Ctrl+C to stop all port forwards"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🧹 Stopping port forwards..."
    pkill -f "kubectl port-forward"
    rm -f /tmp/pf-*.pid
    echo "✅ Cleanup complete"
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Wait for user to press Ctrl+C
while true; do
    sleep 1
done