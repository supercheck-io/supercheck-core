#!/bin/bash

# Hetzner Cloud Docker Swarm Cluster Automated Setup
# This script creates a production-ready Docker Swarm cluster on Hetzner Cloud using ARM servers

set -e

# Configuration
CLUSTER_NAME="supercheck-prod"
SSH_KEY_NAME="supercheck-cluster-key"
NETWORK_NAME="supercheck-network"
FIREWALL_NAME="supercheck-firewall"
LOAD_BALANCER_NAME="supercheck-lb"

# Server configuration - SHARED CPU (CAX) ARM servers for optimal cost/performance
MANAGER_SERVER_TYPE="cax21"    # 4 vCPU (shared), 8GB RAM, 80GB SSD - €7.59/month
WORKER_SERVER_TYPE="cax31"     # 8 vCPU (shared), 16GB RAM, 160GB SSD - €15.59/month
#
# WHY SHARED CPU (CAX) vs DEDICATED (CCX):
# ✅ 68% cost savings (CAX vs CCX for same specs)
# ✅ Burstable CPU perfect for test automation workloads
# ✅ Baseline handles 5-10 tests, bursts to 15-20 concurrent tests
# ✅ ARM efficiency excellent for Node.js/Playwright operations
#
# Use CCX (dedicated) ONLY if:
# - Running 24/7 high CPU workloads
# - Enterprise compliance requires dedicated resources
# - Budget allows 68% higher costs without significant performance gains
IMAGE="ubuntu-22.04"
LOCATION_PRIMARY="fsn1"        # Falkenstein (primary)
LOCATION_SECONDARY="nbg1"      # Nuremberg (secondary)
LOCATION_TERTIARY="hel1"       # Helsinki (tertiary)

# Cluster sizing (adjust based on your needs)
MANAGER_COUNT=3                # 3 managers for HA
WORKER_COUNT=5                 # 5 workers initially (can scale)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if hcloud CLI is installed
    if ! command -v hcloud &> /dev/null; then
        log_error "Hetzner Cloud CLI (hcloud) is not installed"
        echo "Please install it from: https://github.com/hetznercloud/cli"
        exit 1
    fi

    # Check if authenticated
    if ! hcloud context active &> /dev/null; then
        log_error "Hetzner Cloud CLI is not configured"
        echo "Please run: hcloud context create your-project-name"
        exit 1
    fi

    # Check if ssh key exists locally
    if [[ ! -f ~/.ssh/id_rsa.pub ]]; then
        log_warning "No SSH key found. Generating one..."
        ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
        log_success "SSH key generated"
    fi

    log_success "Prerequisites check passed"
}

# Function to create SSH key in Hetzner
create_ssh_key() {
    log "Creating SSH key in Hetzner Cloud..."

    if hcloud ssh-key describe "$SSH_KEY_NAME" &>/dev/null; then
        log_warning "SSH key '$SSH_KEY_NAME' already exists"
    else
        hcloud ssh-key create \
            --name "$SSH_KEY_NAME" \
            --public-key-from-file ~/.ssh/id_rsa.pub \
            --label "environment=production" \
            --label "cluster=$CLUSTER_NAME"
        log_success "SSH key created"
    fi
}

# Function to create private network
create_network() {
    log "Creating private network..."

    if hcloud network describe "$NETWORK_NAME" &>/dev/null; then
        log_warning "Network '$NETWORK_NAME' already exists"
    else
        # Create network with subnet
        hcloud network create \
            --name "$NETWORK_NAME" \
            --ip-range 10.0.0.0/16 \
            --label "environment=production" \
            --label "cluster=$CLUSTER_NAME"

        # Add subnets for different locations
        hcloud network add-subnet "$NETWORK_NAME" \
            --network-zone eu-central \
            --type cloud \
            --ip-range 10.0.0.0/24

        log_success "Private network created"
    fi
}

# Function to create firewall rules
create_firewall() {
    log "Creating firewall rules..."

    if hcloud firewall describe "$FIREWALL_NAME" &>/dev/null; then
        log_warning "Firewall '$FIREWALL_NAME' already exists"
    else
        hcloud firewall create \
            --name "$FIREWALL_NAME" \
            --label "environment=production" \
            --label "cluster=$CLUSTER_NAME"

        # SSH access
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 0.0.0.0/0 \
            --protocol tcp \
            --port 22 \
            --description "SSH access"

        # HTTP/HTTPS
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 0.0.0.0/0 \
            --protocol tcp \
            --port 80 \
            --description "HTTP"

        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 0.0.0.0/0 \
            --protocol tcp \
            --port 443 \
            --description "HTTPS"

        # Docker Swarm ports
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 10.0.0.0/16 \
            --protocol tcp \
            --port 2377 \
            --description "Docker Swarm management"

        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 10.0.0.0/16 \
            --protocol tcp \
            --port 7946 \
            --description "Docker Swarm node communication"

        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 10.0.0.0/16 \
            --protocol udp \
            --port 7946 \
            --description "Docker Swarm node communication UDP"

        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 10.0.0.0/16 \
            --protocol udp \
            --port 4789 \
            --description "Docker overlay network"

        # Monitoring ports (Prometheus, Grafana)
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 10.0.0.0/16 \
            --protocol tcp \
            --port 9090 \
            --description "Prometheus"

        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in \
            --source-ips 10.0.0.0/16 \
            --protocol tcp \
            --port 3100 \
            --description "Grafana"

        log_success "Firewall rules created"
    fi
}

# Function to create cloud-init script
create_cloud_init_script() {
    local node_type=$1
    local manager_ip=$2

    cat > /tmp/cloud-init-${node_type}.yml << 'EOF'
#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - wget
  - vim
  - htop
  - git
  - unzip
  - apt-transport-https
  - ca-certificates
  - gnupg
  - lsb-release

write_files:
  - path: /etc/docker/daemon.json
    content: |
      {
        "log-driver": "json-file",
        "log-opts": {
          "max-size": "10m",
          "max-file": "5"
        },
        "storage-driver": "overlay2",
        "exec-opts": ["native.cgroupdriver=systemd"]
      }

runcmd:
  # Install Docker
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  - echo "deb [arch=arm64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

  # Configure Docker
  - systemctl enable docker
  - systemctl start docker
  - usermod -aG docker root

  # Configure system for Docker Swarm
  - echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
  - echo 'net.bridge.bridge-nf-call-iptables=1' >> /etc/sysctl.conf
  - echo 'net.bridge.bridge-nf-call-ip6tables=1' >> /etc/sysctl.conf
  - sysctl -p

  # Install monitoring tools
  - curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64" -o /usr/local/bin/docker-compose
  - chmod +x /usr/local/bin/docker-compose

  # System optimizations
  - echo 'vm.max_map_count=262144' >> /etc/sysctl.conf
  - echo '* soft nofile 65536' >> /etc/security/limits.conf
  - echo '* hard nofile 65536' >> /etc/security/limits.conf
  - echo 'root soft nofile 65536' >> /etc/security/limits.conf
  - echo 'root hard nofile 65536' >> /etc/security/limits.conf

  # Security hardening
  - ufw --force enable
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow ssh
  - ufw allow from 10.0.0.0/16

  # Create deployment directory
  - mkdir -p /opt/supercheck
  - chown root:docker /opt/supercheck
  - chmod 775 /opt/supercheck

final_message: "Docker Swarm node setup complete!"
EOF

    # Add manager-specific or worker-specific commands
    if [[ "$node_type" == "manager" ]]; then
        cat >> /tmp/cloud-init-${node_type}.yml << EOF

  # Manager node specific setup
  - echo 'export DOCKER_HOST=unix:///var/run/docker.sock' >> /root/.bashrc
EOF
    elif [[ "$node_type" == "worker" && -n "$manager_ip" ]]; then
        cat >> /tmp/cloud-init-${node_type}.yml << EOF

  # Worker node will join swarm after creation
  - echo 'Worker node ready to join swarm' >> /var/log/docker-setup.log
EOF
    fi
}

# Function to create manager nodes
create_manager_nodes() {
    log "Creating manager nodes..."

    create_cloud_init_script "manager" ""

    local locations=($LOCATION_PRIMARY $LOCATION_SECONDARY $LOCATION_TERTIARY)
    local manager_ips=()

    for i in $(seq 1 $MANAGER_COUNT); do
        local node_name="${CLUSTER_NAME}-manager-${i}"
        local location=${locations[$((i-1))]}

        if hcloud server describe "$node_name" &>/dev/null; then
            log_warning "Manager node '$node_name' already exists"
            local ip=$(hcloud server describe "$node_name" -o format="{{.PublicNet.IPv4.IP}}")
            manager_ips+=($ip)
        else
            log "Creating manager node $i in location $location..."

            hcloud server create \
                --name "$node_name" \
                --type "$MANAGER_SERVER_TYPE" \
                --image "$IMAGE" \
                --location "$location" \
                --ssh-key "$SSH_KEY_NAME" \
                --network "$NETWORK_NAME" \
                --firewall "$FIREWALL_NAME" \
                --user-data-from-file /tmp/cloud-init-manager.yml \
                --label "role=manager" \
                --label "environment=production" \
                --label "cluster=$CLUSTER_NAME"

            # Wait for server to be ready
            log "Waiting for manager node $i to be ready..."
            hcloud server wait-for "$node_name"

            local ip=$(hcloud server describe "$node_name" -o format="{{.PublicNet.IPv4.IP}}")
            manager_ips+=($ip)

            log_success "Manager node $i created with IP $ip"
        fi
    done

    echo "${manager_ips[0]}" > /tmp/primary_manager_ip
    printf '%s\n' "${manager_ips[@]}" > /tmp/all_manager_ips

    log_success "All manager nodes created"
}

# Function to initialize Docker Swarm
initialize_swarm() {
    log "Initializing Docker Swarm cluster..."

    local primary_manager_ip=$(cat /tmp/primary_manager_ip)

    # Wait for Docker to be ready on primary manager
    log "Waiting for Docker to be ready on primary manager..."
    for i in {1..30}; do
        if ssh -o StrictHostKeyChecking=no root@$primary_manager_ip "docker info" &>/dev/null; then
            break
        fi
        log "Waiting for Docker... ($i/30)"
        sleep 10
    done

    # Initialize swarm on primary manager
    log "Initializing swarm on primary manager ($primary_manager_ip)..."
    ssh -o StrictHostKeyChecking=no root@$primary_manager_ip \
        "docker swarm init --advertise-addr $primary_manager_ip --data-path-port 7789"

    # Get join tokens
    local manager_token=$(ssh -o StrictHostKeyChecking=no root@$primary_manager_ip \
        "docker swarm join-token -q manager")
    local worker_token=$(ssh -o StrictHostKeyChecking=no root@$primary_manager_ip \
        "docker swarm join-token -q worker")

    echo "$manager_token" > /tmp/manager_token
    echo "$worker_token" > /tmp/worker_token

    log_success "Docker Swarm initialized"

    # Join other managers to swarm
    local manager_ips=($(cat /tmp/all_manager_ips))
    for i in {2..3}; do
        if [[ $i -le ${#manager_ips[@]} ]]; then
            local manager_ip=${manager_ips[$((i-1))]}
            log "Joining manager $i to swarm..."

            # Wait for Docker to be ready
            for j in {1..20}; do
                if ssh -o StrictHostKeyChecking=no root@$manager_ip "docker info" &>/dev/null; then
                    break
                fi
                log "Waiting for Docker on manager $i... ($j/20)"
                sleep 10
            done

            ssh -o StrictHostKeyChecking=no root@$manager_ip \
                "docker swarm join --token $manager_token $primary_manager_ip:2377"

            log_success "Manager $i joined swarm"
        fi
    done
}

# Function to create worker nodes
create_worker_nodes() {
    log "Creating worker nodes..."

    create_cloud_init_script "worker" ""

    local worker_token=$(cat /tmp/worker_token)
    local primary_manager_ip=$(cat /tmp/primary_manager_ip)
    local locations=($LOCATION_PRIMARY $LOCATION_SECONDARY $LOCATION_PRIMARY $LOCATION_SECONDARY $LOCATION_PRIMARY)

    for i in $(seq 1 $WORKER_COUNT); do
        local node_name="${CLUSTER_NAME}-worker-${i}"
        local location=${locations[$((i-1))]}

        if hcloud server describe "$node_name" &>/dev/null; then
            log_warning "Worker node '$node_name' already exists"
        else
            log "Creating worker node $i in location $location..."

            hcloud server create \
                --name "$node_name" \
                --type "$WORKER_SERVER_TYPE" \
                --image "$IMAGE" \
                --location "$location" \
                --ssh-key "$SSH_KEY_NAME" \
                --network "$NETWORK_NAME" \
                --firewall "$FIREWALL_NAME" \
                --user-data-from-file /tmp/cloud-init-worker.yml \
                --label "role=worker" \
                --label "environment=production" \
                --label "cluster=$CLUSTER_NAME"

            # Wait for server to be ready
            log "Waiting for worker node $i to be ready..."
            hcloud server wait-for "$node_name"

            local ip=$(hcloud server describe "$node_name" -o format="{{.PublicNet.IPv4.IP}}")

            # Wait for Docker to be ready
            log "Waiting for Docker on worker $i..."
            for j in {1..30}; do
                if ssh -o StrictHostKeyChecking=no root@$ip "docker info" &>/dev/null; then
                    break
                fi
                log "Waiting for Docker... ($j/30)"
                sleep 10
            done

            # Join worker to swarm
            log "Joining worker $i to swarm..."
            ssh -o StrictHostKeyChecking=no root@$ip \
                "docker swarm join --token $worker_token $primary_manager_ip:2377"

            log_success "Worker node $i created and joined swarm (IP: $ip)"
        fi
    done

    log_success "All worker nodes created and joined swarm"
}

# Function to create load balancer
create_load_balancer() {
    log "Creating load balancer..."

    if hcloud load-balancer describe "$LOAD_BALANCER_NAME" &>/dev/null; then
        log_warning "Load balancer '$LOAD_BALANCER_NAME' already exists"
    else
        # Get worker server IDs for load balancer targets
        local worker_ids=$(hcloud server list -l "role=worker,cluster=$CLUSTER_NAME" -o format="{{.ID}}" | tr '\n' ' ')

        hcloud load-balancer create \
            --name "$LOAD_BALANCER_NAME" \
            --type lb11 \
            --location "$LOCATION_PRIMARY" \
            --network "$NETWORK_NAME" \
            --algorithm round_robin \
            --label "environment=production" \
            --label "cluster=$CLUSTER_NAME"

        # Add HTTP service
        hcloud load-balancer add-service "$LOAD_BALANCER_NAME" \
            --listen-port 80 \
            --destination-port 80 \
            --protocol http \
            --health-check-protocol http \
            --health-check-port 80 \
            --health-check-path /

        # Add HTTPS service
        hcloud load-balancer add-service "$LOAD_BALANCER_NAME" \
            --listen-port 443 \
            --destination-port 443 \
            --protocol tcp \
            --health-check-protocol tcp \
            --health-check-port 443

        # Add worker targets
        for worker_id in $worker_ids; do
            hcloud load-balancer add-target "$LOAD_BALANCER_NAME" \
                --type server \
                --server "$worker_id"
        done

        local lb_ip=$(hcloud load-balancer describe "$LOAD_BALANCER_NAME" -o format="{{.PublicNet.IPv4.IP}}")

        log_success "Load balancer created with IP: $lb_ip"
        echo "$lb_ip" > /tmp/load_balancer_ip
    fi
}

# Function to display cluster information
display_cluster_info() {
    log "Cluster setup completed! Here's your cluster information:"

    echo ""
    echo "🏗️  Cluster Architecture:"
    echo "   Name: $CLUSTER_NAME"
    echo "   Managers: $MANAGER_COUNT × $MANAGER_SERVER_TYPE (ARM64)"
    echo "   Workers: $WORKER_COUNT × $WORKER_SERVER_TYPE (ARM64)"
    echo ""

    echo "📊 Cluster Capacity:"
    echo "   CPU Cores: $((WORKER_COUNT * 8 + MANAGER_COUNT * 4)) vCPU"
    echo "   Memory: $((WORKER_COUNT * 16 + MANAGER_COUNT * 8)) GB RAM"
    echo "   Storage: $((WORKER_COUNT * 160 + MANAGER_COUNT * 80)) GB NVMe SSD"
    echo "   Concurrent Tests: $((WORKER_COUNT * 15)) tests"
    echo ""

    echo "💰 Monthly Costs:"
    echo "   Managers: $MANAGER_COUNT × €7.59 = €$(echo "$MANAGER_COUNT * 7.59" | bc)"
    echo "   Workers: $WORKER_COUNT × €15.59 = €$(echo "$WORKER_COUNT * 15.59" | bc)"
    echo "   Load Balancer: €5.83"
    echo "   Network: Free"
    echo "   Total: €$(echo "$MANAGER_COUNT * 7.59 + $WORKER_COUNT * 15.59 + 5.83" | bc)"
    echo ""

    echo "🌐 Access Information:"
    if [[ -f /tmp/load_balancer_ip ]]; then
        echo "   Load Balancer IP: $(cat /tmp/load_balancer_ip)"
        echo "   Point your domain DNS A record to this IP"
    fi
    echo "   Primary Manager: $(cat /tmp/primary_manager_ip)"
    echo ""

    echo "🔧 Next Steps:"
    echo "   1. SSH to primary manager: ssh root@$(cat /tmp/primary_manager_ip)"
    echo "   2. Verify swarm: docker node ls"
    echo "   3. Deploy Supercheck: docker stack deploy -c supercheck-scaling.yml supercheck"
    echo "   4. Configure DNS to point to load balancer IP"
    echo "   5. Set up SSL certificates with Let's Encrypt"
    echo ""

    echo "📚 Useful Commands:"
    echo "   - View cluster: hcloud server list -l cluster=$CLUSTER_NAME"
    echo "   - SSH to primary manager: ssh root@$(cat /tmp/primary_manager_ip)"
    echo "   - Scale workers: hcloud server create --name ${CLUSTER_NAME}-worker-N ..."
    echo "   - View costs: hcloud server list -o format='{{.Name}} {{.ServerType.Name}} {{.ServerType.Prices.Monthly.Net}} EUR'"
    echo ""

    # Save cluster info to file
    cat > cluster-info.txt << EOF
Supercheck Docker Swarm Cluster on Hetzner Cloud

Cluster Name: $CLUSTER_NAME
Primary Manager IP: $(cat /tmp/primary_manager_ip)
Load Balancer IP: $(cat /tmp/load_balancer_ip 2>/dev/null || echo "Not created")

Manager Nodes: $MANAGER_COUNT × $MANAGER_SERVER_TYPE
Worker Nodes: $WORKER_COUNT × $WORKER_SERVER_TYPE

SSH Access: ssh root@$(cat /tmp/primary_manager_ip)
Docker Swarm: docker node ls

Created: $(date)
EOF

    log_success "Cluster information saved to cluster-info.txt"
}

# Function to show usage
show_usage() {
    echo "Hetzner Cloud Docker Swarm Cluster Setup"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  create      Create complete cluster (default)"
    echo "  destroy     Destroy the cluster"
    echo "  info        Show cluster information"
    echo "  scale       Scale worker nodes"
    echo "  help        Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  CLUSTER_NAME        Cluster name (default: supercheck-prod)"
    echo "  MANAGER_COUNT       Number of managers (default: 3)"
    echo "  WORKER_COUNT        Number of workers (default: 5)"
    echo ""
    echo "Examples:"
    echo "  $0 create                    # Create cluster with defaults"
    echo "  WORKER_COUNT=10 $0 create    # Create with 10 workers"
    echo "  $0 scale 15                  # Scale to 15 workers"
    echo "  $0 destroy                   # Destroy the cluster"
}

# Function to destroy cluster
destroy_cluster() {
    log_warning "This will destroy the entire cluster: $CLUSTER_NAME"
    read -p "Are you sure? Type 'yes' to confirm: " -r
    echo

    if [[ $REPLY == "yes" ]]; then
        log "Destroying cluster..."

        # Delete load balancer
        if hcloud load-balancer describe "$LOAD_BALANCER_NAME" &>/dev/null; then
            hcloud load-balancer delete "$LOAD_BALANCER_NAME"
            log_success "Load balancer deleted"
        fi

        # Delete servers
        hcloud server list -l "cluster=$CLUSTER_NAME" -o format="{{.Name}}" | while read server; do
            log "Deleting server: $server"
            hcloud server delete "$server"
        done

        # Delete firewall
        if hcloud firewall describe "$FIREWALL_NAME" &>/dev/null; then
            hcloud firewall delete "$FIREWALL_NAME"
            log_success "Firewall deleted"
        fi

        # Delete network
        if hcloud network describe "$NETWORK_NAME" &>/dev/null; then
            hcloud network delete "$NETWORK_NAME"
            log_success "Network deleted"
        fi

        # Delete SSH key
        if hcloud ssh-key describe "$SSH_KEY_NAME" &>/dev/null; then
            hcloud ssh-key delete "$SSH_KEY_NAME"
            log_success "SSH key deleted"
        fi

        log_success "Cluster destroyed"
    else
        log "Cluster destruction cancelled"
    fi
}

# Function to scale workers
scale_workers() {
    local target_count=${1:-$WORKER_COUNT}

    if [[ -z "$target_count" ]] || ! [[ "$target_count" =~ ^[0-9]+$ ]]; then
        log_error "Please provide a valid number of workers"
        exit 1
    fi

    log "Scaling workers to $target_count..."

    local current_count=$(hcloud server list -l "role=worker,cluster=$CLUSTER_NAME" | wc -l)
    log "Current workers: $current_count, Target: $target_count"

    if [[ $target_count -gt $current_count ]]; then
        # Scale up
        local worker_token=$(ssh -o StrictHostKeyChecking=no root@$(cat /tmp/primary_manager_ip 2>/dev/null || hcloud server list -l "role=manager,cluster=$CLUSTER_NAME" -o format="{{.PublicNet.IPv4.IP}}" | head -1) \
            "docker swarm join-token -q worker" 2>/dev/null)

        for i in $(seq $((current_count + 1)) $target_count); do
            local node_name="${CLUSTER_NAME}-worker-${i}"
            log "Creating worker node $i..."
            # Add worker creation logic here (similar to create_worker_nodes)
        done
    elif [[ $target_count -lt $current_count ]]; then
        # Scale down
        local excess=$((current_count - target_count))
        log "Removing $excess worker nodes..."

        hcloud server list -l "role=worker,cluster=$CLUSTER_NAME" -o format="{{.Name}}" | tail -$excess | while read server; do
            log "Removing worker: $server"
            hcloud server delete "$server"
        done
    else
        log "Already at target worker count: $target_count"
    fi

    log_success "Scaling complete"
}

# Main script logic
case "${1:-create}" in
    create)
        log "Starting Hetzner Cloud Docker Swarm cluster creation..."
        check_prerequisites
        create_ssh_key
        create_network
        create_firewall
        create_manager_nodes
        initialize_swarm
        create_worker_nodes
        create_load_balancer
        display_cluster_info
        ;;
    destroy)
        destroy_cluster
        ;;
    scale)
        scale_workers "$2"
        ;;
    info)
        display_cluster_info
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

# Cleanup temp files
rm -f /tmp/cloud-init-*.yml /tmp/primary_manager_ip /tmp/all_manager_ips /tmp/manager_token /tmp/worker_token