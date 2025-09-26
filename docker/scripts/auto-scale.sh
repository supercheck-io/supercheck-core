#!/bin/bash

# Supercheck Auto-Scaling Script for Paid Plans
# This script monitors queue depth and automatically scales workers

set -e

STACK_NAME=${STACK_NAME:-supercheck}
WORKER_SERVICE="${STACK_NAME}_supercheck-worker"

# Scaling configuration
MIN_WORKERS=5           # Minimum workers for basic service
MAX_WORKERS=500         # Maximum workers (adjust based on cluster size)
SCALE_UP_THRESHOLD=80   # Scale up when queue utilization > 80%
SCALE_DOWN_THRESHOLD=20 # Scale down when queue utilization < 20%
TESTS_PER_WORKER=5      # Each worker handles 5 concurrent tests

# Monitoring intervals
CHECK_INTERVAL=30       # Check every 30 seconds
SCALE_UP_COOLDOWN=120   # Wait 2 minutes before scaling up again
SCALE_DOWN_COOLDOWN=300 # Wait 5 minutes before scaling down

# Files for tracking last scaling actions
LAST_SCALE_UP_FILE="/tmp/last_scale_up"
LAST_SCALE_DOWN_FILE="/tmp/last_scale_down"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌${NC} $1"
}

# Function to get current metrics
get_metrics() {
    local current_workers=$(docker service ls --filter name="$WORKER_SERVICE" --format "{{.Replicas}}" | cut -d'/' -f2)

    # Get queue depth from Redis (requires redis-cli in a container)
    local queued_tests=0
    local running_tests=0

    # Try to get queue metrics from Redis
    if command -v redis-cli &> /dev/null; then
        # If redis-cli is available locally
        queued_tests=$(redis-cli -u $REDIS_URL llen "bull:test-queue:waiting" 2>/dev/null || echo "0")
        running_tests=$(redis-cli -u $REDIS_URL llen "bull:test-queue:active" 2>/dev/null || echo "0")
    else
        # Use Docker to run redis-cli
        local redis_container=$(docker ps --filter "name=redis" --format "{{.Names}}" | head -1)
        if [[ -n "$redis_container" ]]; then
            queued_tests=$(docker exec "$redis_container" redis-cli llen "bull:test-queue:waiting" 2>/dev/null || echo "0")
            running_tests=$(docker exec "$redis_container" redis-cli llen "bull:test-queue:active" 2>/dev/null || echo "0")
        else
            # Fallback: estimate based on service logs or external monitoring
            log_warning "Cannot connect to Redis for queue metrics, using estimation"
            # You could integrate with your monitoring system here
            queued_tests=0
            running_tests=0
        fi
    fi

    local total_tests=$((queued_tests + running_tests))
    local max_capacity=$((current_workers * TESTS_PER_WORKER))
    local utilization=0

    if [[ $max_capacity -gt 0 ]]; then
        utilization=$((total_tests * 100 / max_capacity))
    fi

    echo "$current_workers $queued_tests $running_tests $total_tests $utilization $max_capacity"
}

# Function to check if enough time has passed since last scaling
check_cooldown() {
    local action=$1
    local cooldown=$2
    local last_scale_file=$3

    if [[ -f "$last_scale_file" ]]; then
        local last_scale=$(cat "$last_scale_file")
        local current_time=$(date +%s)
        local time_diff=$((current_time - last_scale))

        if [[ $time_diff -lt $cooldown ]]; then
            local remaining=$((cooldown - time_diff))
            log "Cooldown active for $action: ${remaining}s remaining"
            return 1
        fi
    fi
    return 0
}

# Function to scale service
scale_service() {
    local new_replica_count=$1
    local action=$2

    log "Scaling $WORKER_SERVICE to $new_replica_count replicas ($action)"

    if docker service scale "$WORKER_SERVICE=$new_replica_count"; then
        log_success "Successfully scaled to $new_replica_count workers"
        echo "$(date +%s)" > "/tmp/last_scale_${action}"

        # Log scaling event for analytics
        log "Scaling event: $action to $new_replica_count workers at $(date)"

        return 0
    else
        log_error "Failed to scale service"
        return 1
    fi
}

# Function to calculate optimal worker count
calculate_optimal_workers() {
    local total_tests=$1
    local buffer_percentage=20  # 20% buffer for burst capacity

    # Calculate base requirement
    local base_workers=$((total_tests / TESTS_PER_WORKER))
    if [[ $((total_tests % TESTS_PER_WORKER)) -gt 0 ]]; then
        base_workers=$((base_workers + 1))
    fi

    # Add buffer
    local optimal_workers=$((base_workers + base_workers * buffer_percentage / 100))

    # Ensure within bounds
    if [[ $optimal_workers -lt $MIN_WORKERS ]]; then
        optimal_workers=$MIN_WORKERS
    elif [[ $optimal_workers -gt $MAX_WORKERS ]]; then
        optimal_workers=$MAX_WORKERS
    fi

    echo "$optimal_workers"
}

# Main monitoring loop
monitor_and_scale() {
    log "Starting auto-scaling monitor for $WORKER_SERVICE"
    log "Configuration:"
    log "  - Min workers: $MIN_WORKERS"
    log "  - Max workers: $MAX_WORKERS"
    log "  - Tests per worker: $TESTS_PER_WORKER"
    log "  - Scale up threshold: $SCALE_UP_THRESHOLD%"
    log "  - Scale down threshold: $SCALE_DOWN_THRESHOLD%"

    while true; do
        # Check if Docker Swarm is accessible
        if ! docker node ls &>/dev/null; then
            log_error "Cannot access Docker Swarm. Retrying in $CHECK_INTERVAL seconds..."
            sleep $CHECK_INTERVAL
            continue
        fi

        # Check if service exists
        if ! docker service inspect "$WORKER_SERVICE" &>/dev/null; then
            log_error "Service $WORKER_SERVICE not found. Retrying in $CHECK_INTERVAL seconds..."
            sleep $CHECK_INTERVAL
            continue
        fi

        # Get current metrics
        read current_workers queued_tests running_tests total_tests utilization max_capacity <<< $(get_metrics)

        # Log current status
        log "Current status:"
        log "  - Workers: $current_workers"
        log "  - Queued tests: $queued_tests"
        log "  - Running tests: $running_tests"
        log "  - Total tests: $total_tests"
        log "  - Capacity: $total_tests/$max_capacity (${utilization}%)"

        # Determine scaling action
        if [[ $utilization -ge $SCALE_UP_THRESHOLD ]] && [[ $current_workers -lt $MAX_WORKERS ]]; then
            if check_cooldown "up" $SCALE_UP_COOLDOWN $LAST_SCALE_UP_FILE; then
                # Calculate optimal worker count
                optimal_workers=$(calculate_optimal_workers $total_tests)
                if [[ $optimal_workers -gt $current_workers ]]; then
                    log_warning "High utilization detected: ${utilization}%"
                    scale_service "$optimal_workers" "up"
                fi
            fi
        elif [[ $utilization -le $SCALE_DOWN_THRESHOLD ]] && [[ $current_workers -gt $MIN_WORKERS ]]; then
            if check_cooldown "down" $SCALE_DOWN_COOLDOWN $LAST_SCALE_DOWN_FILE; then
                # Scale down more conservatively
                optimal_workers=$(calculate_optimal_workers $total_tests)
                if [[ $optimal_workers -lt $current_workers ]]; then
                    log_warning "Low utilization detected: ${utilization}%"
                    scale_service "$optimal_workers" "down"
                fi
            fi
        else
            log "Utilization at ${utilization}% - no scaling needed"
        fi

        sleep $CHECK_INTERVAL
    done
}

# Function to show current status
show_status() {
    read current_workers queued_tests running_tests total_tests utilization max_capacity <<< $(get_metrics)

    echo "=== Supercheck Auto-Scaling Status ==="
    echo "Service: $WORKER_SERVICE"
    echo "Workers: $current_workers"
    echo "Queued Tests: $queued_tests"
    echo "Running Tests: $running_tests"
    echo "Total Tests: $total_tests"
    echo "Capacity Utilization: ${utilization}%"
    echo "Max Capacity: $max_capacity concurrent tests"
    echo ""
    echo "Scaling Configuration:"
    echo "  - Min Workers: $MIN_WORKERS"
    echo "  - Max Workers: $MAX_WORKERS"
    echo "  - Tests per Worker: $TESTS_PER_WORKER"
    echo "  - Scale Up Threshold: $SCALE_UP_THRESHOLD%"
    echo "  - Scale Down Threshold: $SCALE_DOWN_THRESHOLD%"
}

# Function to manual scale
manual_scale() {
    local target_workers=$1

    if [[ -z "$target_workers" ]] || ! [[ "$target_workers" =~ ^[0-9]+$ ]]; then
        log_error "Please provide a valid number of workers"
        exit 1
    fi

    if [[ $target_workers -lt $MIN_WORKERS ]] || [[ $target_workers -gt $MAX_WORKERS ]]; then
        log_error "Worker count must be between $MIN_WORKERS and $MAX_WORKERS"
        exit 1
    fi

    scale_service "$target_workers" "manual"
}

# Show usage
show_usage() {
    echo "Supercheck Auto-Scaling Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  monitor         Start auto-scaling monitor (default)"
    echo "  status          Show current scaling status"
    echo "  scale [n]       Manually scale to n workers"
    echo "  help            Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  STACK_NAME      Swarm stack name (default: supercheck)"
    echo "  REDIS_URL       Redis connection URL for queue monitoring"
    echo ""
    echo "Examples:"
    echo "  $0 monitor              # Start auto-scaling"
    echo "  $0 status               # Show current status"
    echo "  $0 scale 20             # Scale to 20 workers"
    echo "  STACK_NAME=prod $0 monitor  # Monitor 'prod' stack"
}

# Main script logic
case "${1:-monitor}" in
    monitor)
        monitor_and_scale
        ;;
    status)
        show_status
        ;;
    scale)
        manual_scale "$2"
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        log_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac