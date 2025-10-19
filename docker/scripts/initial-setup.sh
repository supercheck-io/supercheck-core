#!/bin/bash

# Hetzner Docker Swarm Server Initial Setup Script
# This script prepares a fresh Hetzner Ubuntu server for Docker Swarm

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

# System information
log "Starting server initialization..."
log "System information:"
log "  OS: $(lsb_release -d | cut -f2)"
log "  Kernel: $(uname -r)"
log "  Architecture: $(uname -m)"
log "  Memory: $(free -h | awk '/^Mem:/ {print $2}')"
log "  Disk: $(df -h / | awk 'NR==2 {print $2}')"

# Update system packages
log "Updating system packages..."
apt update && apt upgrade -y

# Install required packages
log "Installing required packages..."
apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
    htop \
    fail2ban \
    ufw \
    unattended-upgrades \
    apt-listchanges \
    logrotate \
    rsync \
    wget \
    vim \
    git

# Configure automatic security updates
log "Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
Unattended-Upgrade::Mail "root";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Enable unattended-upgrades
systemctl enable unattended-upgrades
systemctl start unattended-upgrades

# Configure firewall
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 22/tcp

# Docker Swarm ports
ufw allow 2376/tcp  # Docker daemon
ufw allow 2377/tcp  # Docker Swarm cluster management
ufw allow 7946/tcp  # Docker Swarm node discovery
ufw allow 7946/udp  # Docker Swarm node discovery
ufw allow 4789/udp  # Docker Swarm overlay traffic

# Application ports
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8080/tcp  # Application
ufw allow 3000/tcp  # Development

# Monitoring ports
ufw allow 9090/tcp  # Prometheus
ufw allow 3001/tcp  # Grafana
ufw allow 5601/tcp  # Kibana

ufw --force enable

# Configure fail2ban
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[ufw]
enabled = true
port = ssh
logpath = /var/log/ufw.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# Set timezone
log "Setting timezone to UTC..."
timedatectl set-timezone UTC

# Configure system limits
log "Configuring system limits..."
cat >> /etc/security/limits.conf << EOF

# Docker limits
* soft nofile 65536
* hard nofile 65536
* soft nproc 65536
* hard nproc 65536
root soft nofile 65536
root hard nofile 65536
root soft nproc 65536
root hard nproc 65536
EOF

# Configure kernel parameters for Docker
log "Configuring kernel parameters..."
cat > /etc/sysctl.d/99-docker.conf << EOF
# Docker Swarm network settings
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1

# Connection tracking
net.netfilter.nf_conntrack_max = 1048576

# Memory management
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# File system
fs.file-max = 2097152
fs.inotify.max_user_instances = 8192
fs.inotify.max_user_watches = 524288
EOF

sysctl -p /etc/sysctl.d/99-docker.conf

# Disable swap
log "Disabling swap..."
swapoff -a
sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# Remove old Docker installations
log "Removing old Docker installations..."
apt remove -y docker docker-engine docker.io containerd runc || true

# Add Docker repository
log "Adding Docker repository..."
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
log "Installing Docker..."
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin

# Configure Docker daemon
log "Configuring Docker daemon..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "userland-proxy": false,
  "experimental": false,
  "metrics-addr": "127.0.0.1:9323",
  "exec-opts": ["native.cgroupdriver=systemd"],
  "bridge": "none",
  "ip-forward": true,
  "iptables": true,
  "default-address-pools": [
    {
      "base": "172.30.0.0/16",
      "size": 24
    }
  ]
}
EOF

# Create Docker systemd override directory
mkdir -p /etc/systemd/system/docker.service.d

# Create Docker systemd override
cat > /etc/systemd/system/docker.service.d/override.conf << EOF
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
TimeoutStartSec=0
Delegate=yes
KillMode=process
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s
EOF

# Enable and start Docker
systemctl daemon-reload
systemctl enable docker
systemctl start docker

# Add ubuntu user to docker group
log "Adding ubuntu user to docker group..."
usermod -aG docker ubuntu

# Create swap file for Docker (if not already exists)
if [ ! -f /swapfile ]; then
    log "Creating 2GB swap file..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Configure log rotation
log "Configuring log rotation..."
cat > /etc/logrotate.d/docker << EOF
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF

# Create Docker user directory structure
log "Creating Docker directories..."
mkdir -p /opt/docker/{data,logs,configs,backups}
chown -R ubuntu:ubuntu /opt/docker

# Configure SSH security
log "Configuring SSH security..."
cat >> /etc/ssh/sshd_config << EOF

# Security enhancements
Protocol 2
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
MaxSessions 10
Banner /etc/ssh/banner
EOF

# Create SSH banner
cat > /etc/ssh/banner << EOF
***************************************************************************
                            AUTHORIZED ACCESS ONLY
***************************************************************************
This system is for the use of authorized users only. Individuals using
this computer system without authority, or in excess of their authority,
are subject to having all of their activities on this system monitored
and recorded by system personnel.
***************************************************************************
EOF

# Restart SSH service
systemctl restart sshd

# Create maintenance script
log "Creating maintenance script..."
cat > /usr/local/bin/docker-maintenance.sh << 'EOF'
#!/bin/bash

# Docker maintenance script
set -euo pipefail

echo "Starting Docker maintenance..."

# Clean up unused Docker resources
docker system prune -f --volumes

# Clean up unused images
docker image prune -f -a

# Clean up unused networks
docker network prune -f

# Clean up build cache
docker builder prune -f

# Check Docker disk usage
echo "Docker disk usage:"
docker system df

echo "Docker maintenance completed."
EOF

chmod +x /usr/local/bin/docker-maintenance.sh

# Create cron job for maintenance
log "Setting up maintenance cron job..."
(crontab -l 2>/dev/null; echo "0 2 * * 0 /usr/local/bin/docker-maintenance.sh >> /var/log/docker-maintenance.log 2>&1") | crontab -

# Create health check script
log "Creating health check script..."
cat > /usr/local/bin/swarm-health-check.sh << 'EOF'
#!/bin/bash

# Docker Swarm health check script
set -euo pipefail

# Check if node is part of a swarm
if ! docker info | grep -q "Swarm: active"; then
    echo "Node is not part of a Docker Swarm"
    exit 1
fi

# Check node status
NODE_STATUS=$(docker node ls --format "{{.Status}}" | head -1)
if [ "$NODE_STATUS" != "Ready" ]; then
    echo "Node status is not Ready: $NODE_STATUS"
    exit 1
fi

# Check Docker daemon
if ! systemctl is-active --quiet docker; then
    echo "Docker daemon is not running"
    exit 1
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo "Disk usage is high: ${DISK_USAGE}%"
    exit 1
fi

# Check memory usage
MEM_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo "Memory usage is high: ${MEM_USAGE}%"
    exit 1
fi

echo "All health checks passed"
EOF

chmod +x /usr/local/bin/swarm-health-check.sh

# Create cron job for health check
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/swarm-health-check.sh >> /var/log/swarm-health-check.log 2>&1") | crontab -

# Create log files
touch /var/log/docker-maintenance.log
touch /var/log/swarm-health-check.log
chown ubuntu:ubuntu /var/log/docker-maintenance.log
chown ubuntu:ubuntu /var/log/swarm-health-check.log

# Display system information
log "Setup completed successfully!"
log "System information:"
log "  Docker version: $(docker --version)"
log "  Docker Compose version: $(docker compose version)"
log "  System uptime: $(uptime -p)"
log "  Memory usage: $(free -h | awk '/^Mem:/ {print $3 "/" $2}')"
log "  Disk usage: $(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 ")"}')"

# Display next steps
echo ""
log "Next steps:"
echo "1. Reboot the server: sudo reboot"
echo "2. After reboot, verify Docker is running: docker info"
echo "3. Join the Docker Swarm cluster"
echo "4. Verify node status: docker node ls"

# Display important files created
echo ""
log "Important files created:"
echo "  - /etc/docker/daemon.json (Docker configuration)"
echo "  - /etc/sysctl.d/99-docker.conf (Kernel parameters)"
echo "  - /usr/local/bin/docker-maintenance.sh (Maintenance script)"
echo "  - /usr/local/bin/swarm-health-check.sh (Health check script)"
echo "  - /opt/docker/ (Docker data directory)"

echo ""
log "Server initialization completed. Please reboot the server."