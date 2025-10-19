# Hetzner Docker Swarm Setup Guide

This guide provides a comprehensive walkthrough for setting up a production-ready Docker Swarm cluster on Hetzner servers for deploying Supercheck.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Planning](#server-planning)
3. [Initial Server Setup](#initial-server-setup)
4. [Docker Swarm Initialization](#docker-swarm-initialization)
5. [Stack Deployment](#stack-deployment)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Security Best Practices](#security-best-practices)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- Hetzner Cloud Account (HCloud)
- HCloud CLI installed and configured
- SSH key pair for server access
- Domain name (optional but recommended)

### System Requirements

- Minimum 3 manager nodes for high availability
- At least 1 worker node (recommended 2+ for production)
- Each server: Ubuntu 22.04 LTS or later
- Minimum 2GB RAM per server (4GB+ recommended)
- Minimum 20GB storage per server
- Private networking enabled

## Server Planning

### Recommended Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Manager-1     │    │   Manager-2     │    │   Manager-3     │
│  (Control Plane)│    │  (Control Plane)│    │  (Control Plane)│
│   4GB RAM       │    │   4GB RAM       │    │   4GB RAM       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Worker-1     │    │    Worker-2     │    │    Worker-N     │
│  (App Service)  │    │ (Worker Service)│    │  (Load Balanced)│
│   4GB RAM       │    │   4GB RAM       │    │   4GB RAM       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Server Types

| Role    | Instance Type | CPU | RAM | Storage | Purpose                |
| ------- | ------------- | --- | --- | ------- | ---------------------- |
| Manager | cpx21         | 2   | 4GB | 40GB    | Control plane, routing |
| Worker  | cpx21         | 2   | 4GB | 40GB    | Application services   |
| Storage | cpx31         | 2   | 8GB | 80GB    | Database, file storage |

## Initial Server Setup

### 1. Create SSH Key

```bash
# Generate new SSH key
ssh-keygen -t rsa -b 4096 -C "hetzner-swarm" -f ~/.ssh/hetzner_swarm

# Add to HCloud
hcloud ssh-key create --name hetzner-swarm --public-key-from-file ~/.ssh/hetzner_swarm.pub
```

### 2. Create Network

```bash
# Create private network
hcloud network create --name swarm-network --ip-range 10.0.0.0/16
hcloud network add-subnet swarm-network --network-zone eu-central --type cloud --ip-range 10.0.1.0/24
```

### 3. Create Server Group

```bash
# Create server group for managers
hcloud server-group create --name managers --type swarm

# Create server group for workers
hcloud server-group create --name workers --type swarm
```

### 4. Create Manager Nodes

```bash
# Create first manager
hcloud server create \
  --name manager-1 \
  --type cpx21 \
  --image ubuntu-22.04 \
  --location nbg1 \
  --ssh-key hetzner-swarm \
  --network swarm-network \
  --server-group managers \
  --enable-backup \
  --enable-ipv4 \
  --enable-ipv6

# Create additional managers
for i in 2 3; do
  hcloud server create \
    --name manager-$i \
    --type cpx21 \
    --image ubuntu-22.04 \
    --location nbg1 \
    --ssh-key hetzner-swarm \
    --network swarm-network \
    --server-group managers \
    --enable-backup \
    --enable-ipv4 \
    --enable-ipv6
done
```

### 5. Create Worker Nodes

```bash
# Create worker nodes
for i in 1 2; do
  hcloud server create \
    --name worker-$i \
    --type cpx21 \
    --image ubuntu-22.04 \
    --location nbg1 \
    --ssh-key hetzner-swarm \
    --network swarm-network \
    --server-group workers \
    --enable-backup \
    --enable-ipv4 \
    --enable-ipv6
done
```

### 6. Initial Server Configuration

Connect to each server and run the initial setup:

```bash
#!/bin/bash
# Save as docker/scripts/initial-setup.sh

# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  software-properties-common \
  htop \
  fail2ban \
  ufw

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 22/tcp
ufw allow 2376/tcp  # Docker Swarm
ufw allow 2377/tcp  # Docker Swarm cluster management
ufw allow 7946/tcp  # Docker Swarm node discovery
ufw allow 7946/udp  # Docker Swarm node discovery
ufw allow 4789/udp  # Docker Swarm overlay traffic
ufw --force enable

# Configure fail2ban
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl start fail2ban

# Set timezone
timedatectl set-timezone UTC

# Configure swap
swapoff -a
sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# Add Docker repository
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Configure Docker
cat > /etc/docker/daemon.json << EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "userland-proxy": false,
  "experimental": false
}
EOF

# Enable and start Docker
systemctl enable docker
systemctl start docker

# Add current user to docker group
usermod -aG docker ubuntu

# Create swap file for Docker
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

echo "Initial setup completed. Please reboot the server."
```

Apply this script to all servers:

```bash
# Copy script to servers
scp -i ~/.ssh/hetzner_swarm docker/scripts/initial-setup.sh ubuntu@<server-ip>:/tmp/

# Execute on each server
ssh -i ~/.ssh/hetzner_swarm ubuntu@<server-ip> "chmod +x /tmp/initial-setup.sh && sudo /tmp/initial-setup.sh"

# Reboot servers
ssh -i ~/.ssh/hetzner_swarm ubuntu@<server-ip> "sudo reboot"
```

## Docker Swarm Initialization

### 1. Initialize First Manager

```bash
# Connect to manager-1
ssh -i ~/.ssh/hetzner_swarm ubuntu@<manager-1-ip>

# Get private IP
PRIVATE_IP=$(ip route get 10.0.1.1 | awk '{print $7}')

# Initialize Swarm
docker swarm init --advertise-addr $PRIVATE_IP

# Get join tokens
MANAGER_JOIN_TOKEN=$(docker swarm join-token -q manager)
WORKER_JOIN_TOKEN=$(docker swarm join-token -q worker)

# Display join commands
echo "Manager join command:"
echo "docker swarm join --token $MANAGER_JOIN_TOKEN $PRIVATE_IP:2377"

echo "Worker join command:"
echo "docker swarm join --token $WORKER_JOIN_TOKEN $PRIVATE_IP:2377"
```

### 2. Join Additional Managers

```bash
# Connect to manager-2 and manager-3
ssh -i ~/.ssh/hetzner_swarm ubuntu@<manager-2-ip>
docker swarm join --token <MANAGER_JOIN_TOKEN> <manager-1-private-ip>:2377

ssh -i ~/.ssh/hetzner_swarm ubuntu@<manager-3-ip>
docker swarm join --token <MANAGER_JOIN_TOKEN> <manager-1-private-ip>:2377
```

### 3. Join Worker Nodes

```bash
# Connect to each worker
for worker in worker-1 worker-2; do
  ssh -i ~/.ssh/hetzner_swarm ubuntu@<$worker-ip>
  docker swarm join --token <WORKER_JOIN_TOKEN> <manager-1-private-ip>:2377
done
```

### 4. Verify Swarm Status

```bash
# On any manager
docker node ls
docker info
docker network ls
```

### 5. Configure Swarm Networks

```bash
# Create overlay networks
docker network create --driver overlay --attachable supercheck-backend
docker network create --driver overlay --attachable supercheck-frontend
docker network create --driver overlay --attachable supercheck-monitoring
```

## Stack Deployment

### 1. Prepare Environment Files

Create environment-specific files in `docker/configs/`:

```bash
# Production environment
cp docker/configs/.env.production.example docker/configs/.env.production

# Development environment
cp docker/configs/.env.development.example docker/configs/.env.development
```

### 2. Deploy Stack

```bash
# Deploy Supercheck stack
docker stack deploy -c docker/stacks/supercheck.yml supercheck

# Deploy monitoring stack
docker stack deploy -c docker/stacks/monitoring.yml monitoring

# Check stack status
docker stack ls
docker stack services supercheck
docker stack ps supercheck
```

## Monitoring and Maintenance

### 1. Set up Monitoring

```bash
# Check node status
docker node ls

# Check service logs
docker service logs supercheck_app

# Check resource usage
docker stats

# Check swarm health
docker service ls
```

### 2. Regular Maintenance Tasks

```bash
#!/bin/bash
# Save as docker/scripts/maintenance.sh

# Clean up unused Docker resources
docker system prune -f

# Update Docker images
docker pull ghcr.io/supercheck-io/supercheck/app:latest
docker pull ghcr.io/supercheck-io/supercheck/worker:latest

# Update services
docker service update --image ghcr.io/supercheck-io/supercheck/app:latest supercheck_app
docker service update --image ghcr.io/supercheck-io/supercheck/worker:latest supercheck_worker

# Check service health
docker service ps supercheck_app
docker service ps supercheck_worker
```

## Security Best Practices

### 1. Network Security

- Use private networks for inter-node communication
- Configure firewall rules properly
- Use VPN for management access
- Regularly update security patches

### 2. Docker Security

- Use read-only filesystems where possible
- Limit container capabilities
- Use resource constraints
- Regularly scan images for vulnerabilities

### 3. Access Control

- Use SSH key authentication
- Implement least privilege access
- Regularly rotate secrets
- Use external secret management

## Troubleshooting

### Common Issues

1. **Nodes can't join Swarm**

   - Check firewall rules
   - Verify network connectivity
   - Check Docker daemon status

2. **Services not starting**

   - Check resource availability
   - Verify image pull permissions
   - Check service constraints

3. **Network connectivity issues**
   - Verify overlay network creation
   - Check DNS resolution
   - Validate port exposure

### Debug Commands

```bash
# Check node status
docker node inspect <node-name>

# Check service details
docker service inspect <service-name>

# Check container logs
docker logs <container-id>

# Check network connectivity
docker network inspect <network-name>
```

## Next Steps

1. Configure backup and disaster recovery
2. Set up comprehensive monitoring
3. Implement CI/CD pipeline
4. Configure SSL certificates
5. Set up alerting and notifications

For detailed guides on each topic, refer to the specific documentation files in the `docker/docs/` directory.
