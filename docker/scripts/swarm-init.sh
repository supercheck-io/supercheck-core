#!/bin/bash

# Docker Swarm Initialization and Configuration Script
# This script initializes and configures a Docker Swarm cluster

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SWARM_NAME="supercheck-swarm"
BACKEND_NETWORK="supercheck-backend"
FRONTEND_NETWORK="supercheck-frontend"
MONITORING_NETWORK="supercheck-monitoring"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

# Function to get IP address
get_ip_address() {
    local interface=${1:-eth0}
    ip route get 10.0.1.1 | awk '{print $7}' || ip addr show $interface | grep "inet " | awk '{print $2}' | cut -d/ -f1
}

# Function to check if Docker is running
check_docker() {
    if ! systemctl is-active --quiet docker; then
        error "Docker is not running. Please start Docker first."
    fi
}

# Function to check if already part of a swarm
check_swarm_status() {
    local swarm_status=$(docker info 2>/dev/null | grep "Swarm:" | awk '{print $2}' || echo "inactive")
    echo "$swarm_status"
}

# Function to initialize swarm manager
init_swarm_manager() {
    local private_ip=$(get_ip_address)
    
    log "Initializing Docker Swarm on manager node..."
    log "Using IP address: $private_ip"
    
    # Initialize swarm with advanced options
    docker swarm init \
        --advertise-addr $private_ip \
        --listen-addr $private_ip:2377 \
        --default-addr-pool 10.10.0.0/16 \
        --default-addr-pool-mask-length 24 \
        --task-history-limit 5 \
        --cert-expiry 2160h0m0s \
        --dispatcher-heartbeat 5s \
        --max-decay 5s \
        --node-cert-expiry 90d0h0m0s \
        --external-ca external-ca \
        --autolock
    
    if [ $? -eq 0 ]; then
        log "Docker Swarm initialized successfully"
        return 0
    else
        error "Failed to initialize Docker Swarm"
    fi
}

# Function to join existing swarm
join_swarm() {
    local role=${1:-worker}
    local manager_ip=${2:-}
    local token=${3:-}
    
    if [ -z "$manager_ip" ] || [ -z "$token" ]; then
        error "Manager IP and token are required to join swarm"
    fi
    
    log "Joining Docker Swarm as $role..."
    
    docker swarm join \
        --token $token \
        --advertise-addr $(get_ip_address) \
        $manager_ip:2377
    
    if [ $? -eq 0 ]; then
        log "Successfully joined Docker Swarm as $role"
        return 0
    else
        error "Failed to join Docker Swarm"
    fi
}

# Function to get join tokens
get_join_tokens() {
    local manager_token=$(docker swarm join-token -q manager 2>/dev/null || echo "")
    local worker_token=$(docker swarm join-token -q worker 2>/dev/null || echo "")
    
    echo "MANAGER_TOKEN:$manager_token"
    echo "WORKER_TOKEN:$worker_token"
}

# Function to create overlay networks
create_networks() {
    log "Creating overlay networks..."
    
    # Backend network
    if ! docker network ls | grep -q $BACKEND_NETWORK; then
        docker network create \
            --driver overlay \
            --attachable \
            --subnet 10.20.0.0/24 \
            --opt encrypted \
            $BACKEND_NETWORK
        log "Created backend network: $BACKEND_NETWORK"
    else
        info "Backend network $BACKEND_NETWORK already exists"
    fi
    
    # Frontend network
    if ! docker network ls | grep -q $FRONTEND_NETWORK; then
        docker network create \
            --driver overlay \
            --attachable \
            --subnet 10.21.0.0/24 \
            --opt encrypted \
            $FRONTEND_NETWORK
        log "Created frontend network: $FRONTEND_NETWORK"
    else
        info "Frontend network $FRONTEND_NETWORK already exists"
    fi
    
    # Monitoring network
    if ! docker network ls | grep -q $MONITORING_NETWORK; then
        docker network create \
            --driver overlay \
            --attachable \
            --subnet 10.22.0.0/24 \
            --opt encrypted \
            $MONITORING_NETWORK
        log "Created monitoring network: $MONITORING_NETWORK"
    else
        info "Monitoring network $MONITORING_NETWORK already exists"
    fi
}

# Function to configure node labels
configure_node_labels() {
    local node_name=$(hostname)
    local node_id=$(docker node ls --filter name=$node_name --format "{{.ID}}" | head -1)
    
    if [ -z "$node_id" ]; then
        error "Could not find node ID for $node_name"
    fi
    
    log "Configuring labels for node: $node_name"
    
    # Add default labels
    docker node update --label-add environment=production $node_id
    docker node update --label-add region=eu-central $node_id
    docker node update --label-add provider=hetzner $node_id
    
    # Add role-specific labels
    if docker node inspect $node_id --format "{{.Spec.Role}}" | grep -q "manager"; then
        docker node update --label-add role=manager $node_id
        docker node update --label-add control-plane=true $node_id
    else
        docker node update --label-add role=worker $node_id
        docker node update --label-add workload=true $node_id
    fi
    
    # Add availability zone (simulated)
    docker node update --label-add zone=eu-central-1a $node_id
    
    log "Node labels configured successfully"
}

# Function to configure node availability
configure_node_availability() {
    local node_name=$(hostname)
    local node_id=$(docker node ls --filter name=$node_name --format "{{.ID}}" | head -1)
    
    if [ -z "$node_id" ]; then
        error "Could not find node ID for $node_name"
    fi
    
    log "Configuring node availability for: $node_name"
    
    # Set node availability to active
    docker node update --availability active $node_id
    
    log "Node availability configured successfully"
}

# Function to display swarm status
display_swarm_status() {
    log "Docker Swarm Status:"
    echo "=================================="
    docker info | grep -A 10 "Swarm:"
    echo ""
    
    log "Nodes in the cluster:"
    echo "=================================="
    docker node ls
    echo ""
    
    log "Networks in the cluster:"
    echo "=================================="
    docker network ls | grep overlay
    echo ""
}

# Function to generate join commands
generate_join_commands() {
    local private_ip=$(get_ip_address)
    local tokens=$(get_join_tokens)
    local manager_token=$(echo "$tokens" | grep "MANAGER_TOKEN:" | cut -d: -f2)
    local worker_token=$(echo "$tokens" | grep "WORKER_TOKEN:" | cut -d: -f2)
    
    log "Join Commands:"
    echo "=================================="
    echo ""
    echo "To add a MANAGER node:"
    echo "docker swarm join \\"
    echo "  --token $manager_token \\"
    echo "  $private_ip:2377"
    echo ""
    echo "To add a WORKER node:"
    echo "docker swarm join \\"
    echo "  --token $worker_token \\"
    echo "  $private_ip:2377"
    echo ""
}

# Function to setup monitoring on manager
setup_monitoring() {
    log "Setting up basic monitoring..."
    
    # Create monitoring directories
    mkdir -p /opt/docker/monitoring/{prometheus,grafana,alertmanager}
    
    # Create basic Prometheus configuration
    cat > /opt/docker/monitoring/prometheus/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'docker-swarm-nodes'
    static_configs:
      - targets: ['localhost:9323']
    
  - job_name: 'docker-swarm-tasks'
    dockerswarm_sd_configs:
      - host: unix:///var/run/docker.sock
        role: tasks
        refresh_interval: 30s

  - job_name: 'docker-swarm-services'
    dockerswarm_sd_configs:
      - host: unix:///var/run/docker.sock
        role: services
        refresh_interval: 30s

rule_files:
  - "alert_rules.yml"
EOF
    
    # Create basic alert rules
    cat > /opt/docker/monitoring/prometheus/alert_rules.yml << EOF
groups:
  - name: swarm_alerts
    rules:
      - alert: NodeDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Node {{ $labels.instance }} is down"
          description: "Node {{ $labels.instance }} has been down for more than 1 minute."
      
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 85% on {{ $labels.instance }}."
EOF
    
    log "Basic monitoring configuration created"
}

# Function to create backup script
create_backup_script() {
    log "Creating backup script..."
    
    cat > /usr/local/bin/swarm-backup.sh << 'EOF'
#!/bin/bash

# Docker Swarm backup script
set -euo pipefail

BACKUP_DIR="/opt/docker/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/swarm_backup_$DATE.tar.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup Docker configurations
echo "Creating Docker backup..."

# Backup swarm configuration
docker config ls > $BACKUP_DIR/configs_$DATE.txt
docker secret ls > $BACKUP_DIR/secrets_$DATE.txt
docker service ls > $BACKUP_DIR/services_$DATE.txt
docker network ls > $BACKUP_DIR/networks_$DATE.txt
docker node ls > $BACKUP_DIR/nodes_$DATE.txt

# Create tarball
tar -czf $BACKUP_FILE \
    /etc/docker/daemon.json \
    /etc/systemd/system/docker.service.d/ \
    $BACKUP_DIR/*_$DATE.txt \
    /opt/docker/configs/ \
    2>/dev/null || true

# Clean up temporary files
rm -f $BACKUP_DIR/*_$DATE.txt

# Keep only last 7 backups
find $BACKUP_DIR -name "swarm_backup_*.tar.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE"
EOF

    chmod +x /usr/local/bin/swarm-backup.sh
    
    # Add to cron
    (crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/swarm-backup.sh >> /var/log/swarm-backup.log 2>&1") | crontab -
    
    log "Backup script created and scheduled"
}

# Main execution
main() {
    local action=${1:-init}
    local role=${2:-worker}
    local manager_ip=${3:-}
    local token=${4:-}
    
    log "Starting Docker Swarm setup..."
    log "Action: $action"
    
    # Check Docker
    check_docker
    
    # Check current swarm status
    local current_status=$(check_swarm_status)
    log "Current swarm status: $current_status"
    
    case $action in
        "init")
            if [ "$current_status" = "active" ]; then
                warning "Node is already part of a swarm"
                display_swarm_status
                exit 0
            fi
            
            init_swarm_manager
            create_networks
            configure_node_labels
            configure_node_availability
            setup_monitoring
            create_backup_script
            display_swarm_status
            generate_join_commands
            ;;
            
        "join")
            if [ "$current_status" = "active" ]; then
                warning "Node is already part of a swarm"
                display_swarm_status
                exit 0
            fi
            
            join_swarm $role $manager_ip $token
            configure_node_labels
            configure_node_availability
            display_swarm_status
            ;;
            
        "status")
            display_swarm_status
            ;;
            
        "tokens")
            get_join_tokens
            generate_join_commands
            ;;
            
        "networks")
            create_networks
            ;;
            
        "labels")
            configure_node_labels
            ;;
            
        *)
            echo "Usage: $0 {init|join|status|tokens|networks|labels} [role] [manager_ip] [token]"
            echo ""
            echo "Actions:"
            echo "  init     - Initialize new swarm (manager only)"
            echo "  join     - Join existing swarm"
            echo "  status   - Display swarm status"
            echo "  tokens   - Display join tokens and commands"
            echo "  networks - Create overlay networks"
            echo "  labels   - Configure node labels"
            echo ""
            echo "Examples:"
            echo "  $0 init                    # Initialize new swarm"
            echo "  $0 join worker 10.0.1.1 TOKEN  # Join as worker"
            echo "  $0 join manager 10.0.1.1 TOKEN # Join as manager"
            exit 1
            ;;
    esac
    
    log "Docker Swarm setup completed successfully!"
}

# Execute main function
main "$@"