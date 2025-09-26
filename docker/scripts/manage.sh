#!/bin/bash

# Supercheck Docker Swarm Management Script
# Usage: ./manage.sh [command] [options]

set -e

STACK_NAME=${STACK_NAME:-supercheck}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Supercheck Docker Swarm Management Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  status              Show stack and service status"
    echo "  logs [service]      Show logs for service (app, worker, traefik)"
    echo "  scale [service] [n] Scale service to n replicas"
    echo "  restart [service]   Rolling restart of service"
    echo "  update              Update services with latest images"
    echo "  stop                Stop the stack"
    echo "  remove              Remove the stack completely"
    echo "  nodes               Show swarm node information"
    echo "  secrets             Show available secrets"
    echo "  health              Health check all services"
    echo "  backup              Backup configuration and data"
    echo "  monitor             Show real-time resource usage"
    echo ""
    echo "Environment Variables:"
    echo "  STACK_NAME          Stack name (default: supercheck)"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 logs app"
    echo "  $0 scale worker 6"
    echo "  $0 restart app"
    echo "  STACK_NAME=dev-supercheck $0 status"
}

# Function to check if swarm is active
check_swarm() {
    if ! docker info | grep -q "Swarm: active"; then
        print_error "Docker Swarm is not active"
        exit 1
    fi
}

# Function to check if stack exists
check_stack() {
    if ! docker stack ls | grep -q "$STACK_NAME"; then
        print_error "Stack '$STACK_NAME' not found"
        print_info "Available stacks:"
        docker stack ls
        exit 1
    fi
}

# Function to show status
show_status() {
    print_info "Stack Status for '$STACK_NAME'"
    echo ""

    echo "📊 Services:"
    docker stack services "$STACK_NAME"

    echo ""
    echo "📋 Tasks:"
    docker stack ps "$STACK_NAME" --no-trunc

    echo ""
    echo "🌐 Networks:"
    docker network ls --filter label=com.docker.stack.namespace="$STACK_NAME"
}

# Function to show logs
show_logs() {
    local service=$1
    local full_service_name

    case $service in
        app|supercheck-app)
            full_service_name="${STACK_NAME}_supercheck-app"
            ;;
        worker|supercheck-worker)
            full_service_name="${STACK_NAME}_supercheck-worker"
            ;;
        traefik)
            full_service_name="${STACK_NAME}_traefik"
            ;;
        *)
            print_error "Unknown service: $service"
            print_info "Available services: app, worker, traefik"
            exit 1
            ;;
    esac

    print_info "Showing logs for $full_service_name"
    docker service logs -f --tail 100 "$full_service_name"
}

# Function to scale service
scale_service() {
    local service=$1
    local replicas=$2
    local full_service_name

    if [[ -z "$service" ]] || [[ -z "$replicas" ]]; then
        print_error "Usage: $0 scale [service] [replicas]"
        exit 1
    fi

    case $service in
        app|supercheck-app)
            full_service_name="${STACK_NAME}_supercheck-app"
            ;;
        worker|supercheck-worker)
            full_service_name="${STACK_NAME}_supercheck-worker"
            ;;
        traefik)
            full_service_name="${STACK_NAME}_traefik"
            ;;
        *)
            print_error "Unknown service: $service"
            print_info "Available services: app, worker, traefik"
            exit 1
            ;;
    esac

    print_info "Scaling $full_service_name to $replicas replicas"
    docker service scale "$full_service_name=$replicas"

    print_info "Waiting for scaling to complete..."
    sleep 5
    docker service ls --filter name="$full_service_name"
}

# Function to restart service
restart_service() {
    local service=$1
    local full_service_name

    if [[ -z "$service" ]]; then
        print_error "Usage: $0 restart [service]"
        exit 1
    fi

    case $service in
        app|supercheck-app)
            full_service_name="${STACK_NAME}_supercheck-app"
            ;;
        worker|supercheck-worker)
            full_service_name="${STACK_NAME}_supercheck-worker"
            ;;
        traefik)
            full_service_name="${STACK_NAME}_traefik"
            ;;
        *)
            print_error "Unknown service: $service"
            print_info "Available services: app, worker, traefik"
            exit 1
            ;;
    esac

    print_info "Performing rolling restart of $full_service_name"
    docker service update --force "$full_service_name"

    print_info "Monitoring restart progress..."
    docker service ps "$full_service_name" --no-trunc | head -10
}

# Function to update services
update_services() {
    print_info "Updating all services with latest images"

    # Pull latest images
    print_info "Pulling latest images..."
    docker service update --image ghcr.io/supercheck-io/supercheck/app:latest "${STACK_NAME}_supercheck-app"
    docker service update --image ghcr.io/supercheck-io/supercheck/worker:latest "${STACK_NAME}_supercheck-worker"

    print_info "Update initiated. Monitor progress with:"
    print_info "docker service ps ${STACK_NAME}_supercheck-app"
    print_info "docker service ps ${STACK_NAME}_supercheck-worker"
}

# Function to show nodes
show_nodes() {
    print_info "Docker Swarm Nodes"
    docker node ls

    echo ""
    print_info "Node Resource Usage"
    docker node ps $(docker node ls -q)
}

# Function to show secrets
show_secrets() {
    print_info "Available Secrets"
    docker secret ls
}

# Function to health check
health_check() {
    print_info "Performing health checks for $STACK_NAME"

    local services=(
        "${STACK_NAME}_supercheck-app"
        "${STACK_NAME}_supercheck-worker"
    )

    # Check if traefik exists
    if docker service ls | grep -q "${STACK_NAME}_traefik"; then
        services+=("${STACK_NAME}_traefik")
    fi

    for service in "${services[@]}"; do
        local replicas=$(docker service ls --filter name="$service" --format "{{.Replicas}}")
        if [[ "$replicas" == *"/"* ]]; then
            local running=$(echo $replicas | cut -d'/' -f1)
            local desired=$(echo $replicas | cut -d'/' -f2)

            if [[ "$running" == "$desired" ]] && [[ "$running" != "0" ]]; then
                print_status "$service: $replicas (Healthy)"
            else
                print_warning "$service: $replicas (Unhealthy)"
                print_info "Task status:"
                docker service ps "$service" --no-trunc | head -5
            fi
        else
            print_warning "$service: Unknown status"
        fi
    done

    # Test external service connectivity if possible
    echo ""
    print_info "Testing application endpoints..."

    # Try to get service endpoint
    local app_port=$(docker service inspect "${STACK_NAME}_supercheck-app" --format '{{range .Endpoint.Ports}}{{.PublishedPort}}{{end}}' 2>/dev/null || echo "")

    if [[ -n "$app_port" ]] && [[ "$app_port" != "0" ]]; then
        if curl -sf "http://localhost:$app_port/api/health" >/dev/null 2>&1; then
            print_status "Application health endpoint responding"
        else
            print_warning "Application health endpoint not responding"
        fi
    else
        print_info "No published port found for health check"
    fi
}

# Function to backup
backup_config() {
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    print_info "Creating backup in $backup_dir"

    # Backup stack configuration
    docker stack ps "$STACK_NAME" --format "table {{.ID}}\t{{.Name}}\t{{.Image}}\t{{.Node}}\t{{.DesiredState}}\t{{.CurrentState}}" > "$backup_dir/stack-status.txt"
    docker stack services "$STACK_NAME" --format "table {{.ID}}\t{{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Image}}" > "$backup_dir/services.txt"

    # Backup secrets list (not the actual secrets)
    docker secret ls > "$backup_dir/secrets-list.txt"

    # Backup network configuration
    docker network ls --filter label=com.docker.stack.namespace="$STACK_NAME" > "$backup_dir/networks.txt"

    # Backup service logs (last 1000 lines)
    for service in app worker traefik; do
        service_name="${STACK_NAME}_supercheck-$service"
        if docker service ls | grep -q "$service_name"; then
            docker service logs --tail 1000 "$service_name" > "$backup_dir/$service-logs.txt" 2>&1 || true
        fi
    done

    print_status "Backup completed in $backup_dir"
    print_info "Backup contents:"
    ls -la "$backup_dir/"
}

# Function to monitor resources
monitor_resources() {
    print_info "Real-time resource monitoring for $STACK_NAME"
    print_info "Press Ctrl+C to exit"
    echo ""

    # Start monitoring
    while true; do
        clear
        echo "=== Supercheck Docker Swarm Monitoring ==="
        echo "Stack: $STACK_NAME | Time: $(date)"
        echo ""

        echo "📊 Service Status:"
        docker stack services "$STACK_NAME" 2>/dev/null || echo "Stack not found"

        echo ""
        echo "🖥️  Node Resources:"
        docker system df

        echo ""
        echo "📈 Service Resource Usage:"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" $(docker ps --filter label=com.docker.stack.namespace="$STACK_NAME" -q 2>/dev/null) 2>/dev/null || echo "No containers found"

        sleep 5
    done
}

# Function to stop stack
stop_stack() {
    print_warning "Stopping stack '$STACK_NAME'"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker stack rm "$STACK_NAME"
        print_status "Stack '$STACK_NAME' removal initiated"
        print_info "Services are shutting down gracefully..."
    else
        print_info "Stack stop cancelled"
    fi
}

# Function to remove stack
remove_stack() {
    print_error "This will completely remove stack '$STACK_NAME' and all its data"
    print_warning "External services (database, Redis, S3) will NOT be affected"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker stack rm "$STACK_NAME"
        print_status "Stack '$STACK_NAME' removal initiated"

        # Wait for complete removal
        print_info "Waiting for complete removal..."
        while docker stack ls | grep -q "$STACK_NAME"; do
            sleep 2
        done

        print_status "Stack '$STACK_NAME' completely removed"

        # Optionally clean up networks
        read -p "Also remove associated networks? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker network ls --filter label=com.docker.stack.namespace="$STACK_NAME" -q | xargs -r docker network rm || true
            print_status "Associated networks removed"
        fi
    else
        print_info "Stack removal cancelled"
    fi
}

# Main script logic
if [[ $# -eq 0 ]]; then
    show_usage
    exit 0
fi

# Check Docker Swarm
check_swarm

case $1 in
    status)
        check_stack
        show_status
        ;;
    logs)
        check_stack
        show_logs "$2"
        ;;
    scale)
        check_stack
        scale_service "$2" "$3"
        ;;
    restart)
        check_stack
        restart_service "$2"
        ;;
    update)
        check_stack
        update_services
        ;;
    nodes)
        show_nodes
        ;;
    secrets)
        show_secrets
        ;;
    health)
        check_stack
        health_check
        ;;
    backup)
        check_stack
        backup_config
        ;;
    monitor)
        check_stack
        monitor_resources
        ;;
    stop)
        check_stack
        stop_stack
        ;;
    remove)
        check_stack
        remove_stack
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac