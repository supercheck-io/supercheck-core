#!/bin/bash

# Multi-Cluster Deployment Script for Supercheck
# This script deploys Supercheck across multiple K3s clusters

set -e

# Configuration
APP_CLUSTER_CONFIG="configs/hetzner-k3s_cluster_config_app.yaml"
WORKER_CLUSTER_CONFIG="configs/hetzner-k3s_cluster_config_worker.yaml"
APP_CLUSTER_NAME="supercheck-app"
WORKER_CLUSTER_BASE="supercheck-worker"
WORKER_CLUSTER_COUNT=2

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

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if hetzner-k3s is installed
    if ! command -v hetzner-k3s &> /dev/null; then
        print_error "hetzner-k3s is not installed. Please install it first."
        echo "Visit: https://github.com/xetama/hetzner-k3s"
        exit 1
    fi
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install it first."
        exit 1
    fi
    
    # Check if API token is set
    if ! grep -q "YOUR_HETZNER_API_TOKEN" $APP_CLUSTER_CONFIG; then
        print_warning "API token not set in app cluster config"
    fi
    
    if ! grep -q "YOUR_HETZNER_API_TOKEN" $WORKER_CLUSTER_CONFIG; then
        print_warning "API token not set in worker cluster config"
    fi
    
    print_status "Prerequisites check completed"
}

# Create app cluster
create_app_cluster() {
    print_status "Creating app cluster..."
    
    # Create a copy of the config
    cp $APP_CLUSTER_CONFIG "${APP_CLUSTER_NAME}.yaml"
    
    # Update cluster name if needed
    sed -i "s/cluster_name: supercheck-app/cluster_name: ${APP_CLUSTER_NAME}/" "${APP_CLUSTER_NAME}.yaml"
    
    # Create the cluster
    hetzner-k3s create -c "${APP_CLUSTER_NAME}.yaml"
    
    # Set up kubectl context
    export KUBECONFIG="./kubeconfig-${APP_CLUSTER_NAME}"
    
    print_status "App cluster created successfully"
}

# Create worker clusters
create_worker_clusters() {
    print_status "Creating worker clusters..."
    
    for i in $(seq 1 $WORKER_CLUSTER_COUNT); do
        WORKER_CLUSTER_NAME="${WORKER_CLUSTER_BASE}-${i}"
        WORKER_KUBECONFIG="kubeconfig-${WORKER_CLUSTER_NAME}"
        
        print_status "Creating worker cluster: $WORKER_CLUSTER_NAME"
        
        # Create a copy of the config
        cp $WORKER_CLUSTER_CONFIG "${WORKER_CLUSTER_NAME}.yaml"
        
        # Update cluster-specific settings
        sed -i "s/cluster_name: supercheck-worker/cluster_name: ${WORKER_CLUSTER_NAME}/" "${WORKER_CLUSTER_NAME}.yaml"
        sed -i "s|kubeconfig_path: \"./kubeconfig-worker\"|kubeconfig_path: \"./${WORKER_KUBECONFIG}\"|" "${WORKER_CLUSTER_NAME}.yaml"
        
        # Update network settings to avoid conflicts
        SUBNET_OFFSET=$((10 + i))
        CLUSTER_OFFSET=$((244 + i))
        SERVICE_OFFSET=$((96 + i))
        
        sed -i "s/subnet: 10.0.0.0\\/16/subnet: 10.${SUBNET_OFFSET}.0.0\\/16/" "${WORKER_CLUSTER_NAME}.yaml"
        sed -i "s/cluster_cidr: 10.244.0.0\\/16/cluster_cidr: 10.${CLUSTER_OFFSET}.0.0\\/16/" "${WORKER_CLUSTER_NAME}.yaml"
        sed -i "s/service_cidr: 10.96.0.0\\/12/service_cidr: 10.${SERVICE_OFFSET}.0.0\\/12/" "${WORKER_CLUSTER_NAME}.yaml"
        
        # Create the cluster
        hetzner-k3s create -c "${WORKER_CLUSTER_NAME}.yaml"
        
        print_status "Worker cluster $WORKER_CLUSTER_NAME created successfully"
    done
}

# Deploy app services
deploy_app_services() {
    print_status "Deploying app services..."
    
    export KUBECONFIG="./kubeconfig-${APP_CLUSTER_NAME}"
    
    # Create namespace
    kubectl create namespace supercheck --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy app deployment
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
  namespace: supercheck
spec:
  replicas: 2
  selector:
    matchLabels:
      app: supercheck-app
  template:
    metadata:
      labels:
        app: supercheck-app
    spec:
      containers:
        - name: app
          image: ghcr.io/supercheck-io/supercheck/app:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: supercheck-config
            - secretRef:
                name: supercheck-secrets
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
EOF
    
    # Deploy app service
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: supercheck-app-service
  namespace: supercheck
spec:
  type: ClusterIP
  selector:
    app: supercheck-app
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
EOF
    
    print_status "App services deployed successfully"
}

# Deploy worker services
deploy_worker_services() {
    print_status "Deploying worker services..."
    
    for i in $(seq 1 $WORKER_CLUSTER_COUNT); do
        WORKER_CLUSTER_NAME="${WORKER_CLUSTER_BASE}-${i}"
        
        print_status "Deploying worker services to cluster: $WORKER_CLUSTER_NAME"
        
        export KUBECONFIG="./kubeconfig-${WORKER_CLUSTER_NAME}"
        
        # Create namespace
        kubectl create namespace supercheck --dry-run=client -o yaml | kubectl apply -f -
        
        # Deploy worker deployment
        cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-worker
  namespace: supercheck
spec:
  replicas: 5
  selector:
    matchLabels:
      app: supercheck-worker
  template:
    metadata:
      labels:
        app: supercheck-worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/supercheck-io/supercheck/worker:latest
          env:
            - name: NODE_OPTIONS
              value: "--max-old-space-size=2048 --expose-gc --experimental-worker"
            - name: UV_THREADPOOL_SIZE
              value: "8"
          envFrom:
            - configMapRef:
                name: supercheck-config
            - secretRef:
                name: supercheck-secrets
          resources:
            requests:
              memory: "2Gi"
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
EOF
        
        print_status "Worker services deployed to $WORKER_CLUSTER_NAME"
    done
}

# Setup monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."
    
    export KUBECONFIG="./kubeconfig-${APP_CLUSTER_NAME}"
    
    # Deploy basic monitoring
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: monitoring-config
  namespace: supercheck
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
      - job_name: 'supercheck-app'
        static_configs:
          - targets: ['supercheck-app-service:3000']
EOF
    
    print_status "Monitoring setup completed"
}

# Generate deployment summary
generate_summary() {
    print_status "Generating deployment summary..."
    
    cat <<EOF

=== Multi-Cluster Deployment Summary ===

App Cluster:
- Name: $APP_CLUSTER_NAME
- Kubeconfig: ./kubeconfig-${APP_CLUSTER_NAME}
- Services: Web UI, API, Job Scheduling

Worker Clusters:
EOF
    
    for i in $(seq 1 $WORKER_CLUSTER_COUNT); do
        WORKER_CLUSTER_NAME="${WORKER_CLUSTER_BASE}-${i}"
        echo "- Name: $WORKER_CLUSTER_NAME"
        echo "  Kubeconfig: ./kubeconfig-${WORKER_CLUSTER_NAME}"
        echo "  Services: Test Execution"
    done
    
    cat <<EOF

Next Steps:
1. Configure your external services (PostgreSQL, Redis, S3)
2. Create ConfigMaps and Secrets in each cluster
3. Set up cross-cluster networking
4. Configure DNS and load balancers
5. Set up monitoring and alerting

To access clusters:
export KUBECONFIG=./kubeconfig-${APP_CLUSTER_NAME}  # For app cluster
export KUBECONFIG=./kubeconfig-${WORKER_CLUSTER_BASE}-1  # For worker cluster 1

To check status:
kubectl get nodes -A
kubectl get pods -n supercheck

EOF
}

# Cleanup function
cleanup() {
    print_status "Cleaning up temporary files..."
    rm -f "${APP_CLUSTER_NAME}.yaml"
    for i in $(seq 1 $WORKER_CLUSTER_COUNT); do
        rm -f "${WORKER_CLUSTER_BASE}-${i}.yaml"
    done
}

# Main execution
main() {
    print_status "Starting multi-cluster deployment..."
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Check prerequisites
    check_prerequisites
    
    # Create clusters
    create_app_cluster
    create_worker_clusters
    
    # Deploy services
    deploy_app_services
    deploy_worker_services
    
    # Setup monitoring
    setup_monitoring
    
    # Generate summary
    generate_summary
    
    print_status "Multi-cluster deployment completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    "app-only")
        print_status "Deploying app cluster only..."
        check_prerequisites
        create_app_cluster
        deploy_app_services
        setup_monitoring
        ;;
    "worker-only")
        print_status "Deploying worker clusters only..."
        check_prerequisites
        create_worker_clusters
        deploy_worker_services
        ;;
    "cleanup")
        print_warning "Cleaning up all clusters..."
        for i in $(seq 1 $WORKER_CLUSTER_COUNT); do
            WORKER_CLUSTER_NAME="${WORKER_CLUSTER_BASE}-${i}"
            print_status "Deleting cluster: $WORKER_CLUSTER_NAME"
            hetzner-k3s delete -c "${WORKER_CLUSTER_NAME}.yaml" || true
        done
        print_status "Deleting cluster: $APP_CLUSTER_NAME"
        hetzner-k3s delete -c "${APP_CLUSTER_NAME}.yaml" || true
        cleanup
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [app-only|worker-only|cleanup|help]"
        echo "  app-only    - Deploy only the app cluster"
        echo "  worker-only - Deploy only worker clusters"
        echo "  cleanup     - Delete all clusters"
        echo "  help        - Show this help message"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac