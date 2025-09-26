# Hetzner Cloud Manual Server Setup Guide for Supercheck

This guide walks you through manually purchasing and configuring Hetzner Cloud shared ARM servers for your Supercheck Docker Swarm cluster without using the CLI tools.

## 📋 Table of Contents

- [Account Setup & Preparation](#account-setup--preparation)
- [Server Purchase Process](#server-purchase-process)
- [Network Configuration](#network-configuration)
- [Security Setup](#security-setup)
- [Docker Installation](#docker-installation)
- [Docker Swarm Cluster Setup](#docker-swarm-cluster-setup)
- [Final Configuration](#final-configuration)

## 🚀 Account Setup & Preparation

### **1. Create Hetzner Cloud Account**

1. Visit [https://www.hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Click "Sign up" and create your account
3. Verify your email address
4. Add payment method (credit card or PayPal)
5. Complete identity verification if required

### **2. Prepare SSH Key**

Before creating servers, generate an SSH key pair on your local machine:

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "supercheck-cluster@yourdomain.com" -f ~/.ssh/supercheck_hetzner

# Copy public key to clipboard (macOS)
pbcopy < ~/.ssh/supercheck_hetzner.pub

# Copy public key to clipboard (Linux)
xclip -sel clip < ~/.ssh/supercheck_hetzner.pub

# Or display to copy manually
cat ~/.ssh/supercheck_hetzner.pub
```

### **3. Add SSH Key to Hetzner**

1. Log into Hetzner Cloud Console
2. Go to "Security" → "SSH Keys"
3. Click "Add SSH Key"
4. Name: `supercheck-cluster-key`
5. Paste your public key
6. Click "Add SSH Key"

## 🖥️ Server Purchase Process

### **📊 Recommended Server Configuration**

#### **Manager Nodes (3 required for HA):**
- **Server Type**: CAX21 (Shared ARM)
- **Specs**: 4 vCPU (shared), 8GB RAM, 80GB SSD
- **Cost**: €7.59/month each
- **Purpose**: Docker Swarm managers

#### **Worker Nodes (5+ recommended):**
- **Server Type**: CAX31 (Shared ARM)
- **Specs**: 8 vCPU (shared), 16GB RAM, 160GB SSD
- **Cost**: €15.59/month each
- **Purpose**: Playwright test execution

### **🛒 Step-by-Step Server Purchase**

#### **Step 1: Create Manager Nodes (Repeat 3 times)**

1. **Navigate to Server Creation:**
   - Go to Hetzner Cloud Console
   - Click "Projects" → "Default" (or create new project)
   - Click "Add Server"

2. **Choose Location:**
   - **Primary Manager**: Falkenstein (fsn1) - Germany
   - **Secondary Manager**: Nuremberg (nbg1) - Germany
   - **Tertiary Manager**: Helsinki (hel1) - Finland
   - Click "Continue"

3. **Select Image:**
   - Choose "Ubuntu 22.04"
   - Click "Continue"

4. **Choose Server Type:**
   - Select "Shared vCPU" tab
   - Select "CAX21" (ARM64)
   - Specs: 4 vCPU, 8GB RAM, 80GB SSD, €7.59/month
   - Click "Continue"

5. **Configure Networking:**
   - **Private Networks**: Create new or select existing
     - Name: `supercheck-private`
     - Subnet: `10.0.0.0/16`
   - **Public IPv4**: Enable (needed for initial setup)
   - **Public IPv6**: Enable (optional)
   - Click "Continue"

6. **Additional Options:**
   - **SSH Keys**: Select `supercheck-cluster-key`
   - **Volumes**: None needed
   - **Firewalls**: We'll create later
   - **Placement Groups**: Create new
     - Name: `supercheck-managers`
     - Type: `spread`
   - Click "Continue"

7. **Server Details:**
   - **Name**: `supercheck-manager-1` (then `-2`, `-3`)
   - **Labels**:
     - `role=manager`
     - `environment=production`
     - `cluster=supercheck`
   - Click "Create & Buy Now"

#### **Step 2: Create Worker Nodes (Repeat 5+ times)**

Follow the same process but with these differences:

1. **Server Type**: Select "CAX31" (ARM64)
   - Specs: 8 vCPU, 16GB RAM, 160GB SSD, €15.59/month

2. **Placement Groups**: Create new
   - Name: `supercheck-workers`
   - Type: `spread`

3. **Server Details:**
   - **Name**: `supercheck-worker-1` (then `-2`, `-3`, etc.)
   - **Labels**:
     - `role=worker`
     - `environment=production`
     - `cluster=supercheck`

### **💰 Cost Calculation**

```yaml
Monthly Costs (Shared ARM Servers):
├── 3x Manager Nodes (CAX21): €22.77/month
├── 5x Worker Nodes (CAX31): €77.95/month
├── Private Network: €0/month (free)
├── Load Balancer (optional): €5.39/month
└── Total: €100.72-106.11/month

Compare to Dedicated ARM (CCX):
├── 3x CCX21: €38.97/month (+€16.20)
├── 5x CCX31: €129.95/month (+€52.00)
└── Total: €168.92/month (+€68.20 = 68% more expensive!)
```

## 🌐 Network Configuration

### **1. Create Private Network (if not done during server creation)**

1. Go to "Networking" → "Networks"
2. Click "Create Network"
3. **Name**: `supercheck-private`
4. **IP Range**: `10.0.0.0/16`
5. **Subnets**:
   - Zone: `eu-central` (fsn1)
   - Network Zone: `10.0.1.0/24`
6. Click "Create Network"

### **2. Attach Servers to Private Network**

1. Go to "Networking" → "Networks"
2. Click on `supercheck-private`
3. Click "Attach Resources"
4. Select all your servers
5. Click "Attach Resources"

### **3. Create Firewall Rules**

1. Go to "Security" → "Firewalls"
2. Click "Create Firewall"
3. **Name**: `supercheck-firewall`

#### **Inbound Rules:**
```yaml
SSH Access:
- Source: Your IP (or 0.0.0.0/0 temporarily)
- Protocol: TCP
- Port: 22

HTTP/HTTPS (for Traefik):
- Source: 0.0.0.0/0, ::/0
- Protocol: TCP
- Port: 80, 443

Docker Swarm (Internal Only):
- Source: 10.0.0.0/16
- Protocol: TCP
- Port: 2377 (management), 7946 (communication)
- Protocol: UDP
- Port: 4789 (overlay network)
```

4. **Apply to Resources**: Select all servers
5. Click "Create Firewall"

### **4. Create Load Balancer (Optional but Recommended)**

1. Go to "Networking" → "Load Balancers"
2. Click "Create Load Balancer"
3. **Name**: `supercheck-lb`
4. **Type**: LB11 (€5.39/month)
5. **Location**: Falkenstein (fsn1)
6. **Public Network**: Enable IPv4 & IPv6
7. **Private Network**: Select `supercheck-private`
8. **Algorithm**: Round Robin
9. **Health Check**:
   - Protocol: HTTP
   - Port: 80
   - Path: `/api/health`
   - Interval: 15s
10. **Targets**: Select manager nodes
11. Click "Create Load Balancer"

## 🔐 Security Setup

### **1. Initial Server Hardening**

SSH into each server and run these commands:

```bash
# Connect to each server
ssh root@<server-ip>

# Update system
apt update && apt upgrade -y

# Create non-root user
adduser deployer
usermod -aG sudo deployer

# Setup SSH key for deployer user
mkdir -p /home/deployer/.ssh
cp /root/.ssh/authorized_keys /home/deployer/.ssh/
chown -R deployer:deployer /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
chmod 600 /home/deployer/.ssh/authorized_keys

# Secure SSH configuration
cat > /etc/ssh/sshd_config.d/99-security.conf << 'EOF'
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deployer
X11Forwarding no
EOF

systemctl restart sshd
```

### **2. Install UFW Firewall**

```bash
# Install UFW
apt install ufw -y

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (change port if modified)
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow Docker Swarm (internal network only)
ufw allow from 10.0.0.0/16 to any port 2377 comment 'Docker Swarm Management'
ufw allow from 10.0.0.0/16 to any port 7946 comment 'Docker Swarm Communication'
ufw allow from 10.0.0.0/16 to any port 4789 comment 'Docker Overlay Network'

# Enable firewall
ufw --force enable
ufw status numbered
```

### **3. Install System Updates & Basic Tools**

```bash
# Install essential packages
apt install -y \
    curl \
    wget \
    vim \
    htop \
    tree \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Setup automatic security updates
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades
```

## 🐳 Docker Installation

### **1. Install Docker on All Servers**

Run this on each server:

```bash
# Remove old versions
apt remove docker docker-engine docker.io containerd runc -y

# Add Docker's official GPG key
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package index
apt update

# Install Docker
apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y

# Add deployer user to docker group
usermod -aG docker deployer

# Enable Docker service
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
```

### **2. Configure Docker Daemon**

Create optimized Docker configuration:

```bash
# Create Docker daemon configuration
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true,
  "experimental": true,
  "metrics-addr": "0.0.0.0:9323",
  "default-ulimits": {
    "nofile": {
      "Hard": 65536,
      "Name": "nofile",
      "Soft": 65536
    }
  }
}
EOF

# Restart Docker
systemctl restart docker

# Verify configuration
docker info | grep -E "(Live Restore|Experimental|Security Options)"
```

## 🔗 Docker Swarm Cluster Setup

### **1. Initialize Swarm on Primary Manager**

SSH into your first manager node (`supercheck-manager-1`):

```bash
# Switch to deployer user
su - deployer

# Get private IP address
PRIVATE_IP=$(ip route get 8.8.8.8 | awk '{print $7}' | head -n1)
echo "Manager private IP: $PRIVATE_IP"

# Initialize Docker Swarm
docker swarm init --advertise-addr $PRIVATE_IP

# Note: Save the output tokens - you'll need them!
```

The output will look like:
```
Swarm initialized: current node (abc123...) is now a manager.

To add a worker to this swarm, run the following command:
    docker swarm join --token SWMTKN-1-worker-token-here 10.0.0.10:2377

To add a manager to this swarm, run 'docker swarm join-token manager' and run the
command on a new manager node.
```

### **2. Add Additional Manager Nodes**

SSH into manager nodes 2 and 3:

```bash
# Get manager join token from primary manager
docker swarm join-token manager

# Copy the output command and run it on other manager nodes
docker swarm join --token SWMTKN-1-manager-token-here 10.0.0.10:2377
```

### **3. Add Worker Nodes**

SSH into each worker node and run:

```bash
# Use the worker token from step 1
docker swarm join --token SWMTKN-1-worker-token-here 10.0.0.10:2377
```

### **4. Verify Cluster**

From any manager node:

```bash
# Check nodes
docker node ls

# Should show all nodes with STATUS=Ready
# Managers should have MANAGER STATUS=Leader/Reachable
# Workers should have MANAGER STATUS blank

# Label nodes for placement
docker node update --label-add zone=primary supercheck-manager-1
docker node update --label-add zone=secondary supercheck-manager-2
docker node update --label-add zone=tertiary supercheck-manager-3

# Label worker nodes
docker node update --label-add zone=workers supercheck-worker-1
docker node update --label-add zone=workers supercheck-worker-2
# ... repeat for all workers
```

## ⚙️ Final Configuration

### **1. Create Docker Secrets**

On any manager node, create your secrets:

```bash
# Database URL (Neon PostgreSQL)
echo "postgresql://username:password@host.neon.tech/database?sslmode=require" | docker secret create database_url -

# Redis URL (Redis Cloud)
echo "rediss://default:password@host.redislabs.com:port" | docker secret create redis_url -

# AWS S3 credentials
echo "your-aws-access-key-id" | docker secret create aws_access_key_id -
echo "your-aws-secret-access-key" | docker secret create aws_secret_access_key -

# Auth secret
openssl rand -base64 32 | docker secret create auth_secret -

# Encryption keys
openssl rand -base64 32 | docker secret create credential_encryption_key -
openssl rand -base64 32 | docker secret create variables_encryption_key -

# Verify secrets
docker secret ls
```

### **2. Create Docker Networks**

```bash
# Create overlay network for Supercheck services
docker network create \
  --driver overlay \
  --attachable \
  --encrypt \
  --subnet 10.0.9.0/24 \
  supercheck-network

# Verify network
docker network ls
```

### **3. Deploy Supercheck Stack**

```bash
# Clone your docker-swarm configuration (or upload files)
# Option 1: If you have git access
git clone https://github.com/your-repo/supercheck-core.git
cd supercheck-core/docker-swarm

# Option 2: Upload files manually via scp
# scp -r docker-swarm/ deployer@<manager-ip>:/home/deployer/

# Deploy the stack
docker stack deploy -c stacks/supercheck-external-services.yml supercheck

# Monitor deployment
docker stack services supercheck
docker service logs supercheck_supercheck-app
```

### **4. Setup Monitoring (Optional)**

```bash
# Deploy monitoring stack
docker stack deploy -c stacks/monitoring.yml monitoring

# Check monitoring services
docker stack services monitoring
```

## 🔍 Verification & Testing

### **1. Health Checks**

```bash
# Check all services are running
docker stack services supercheck

# Check individual service logs
docker service logs supercheck_supercheck-app
docker service logs supercheck_supercheck-worker
docker service logs supercheck_traefik

# Check node resources
docker node ls
docker system df
```

### **2. Test Application**

1. **Find your Load Balancer IP**:
   - Go to Hetzner Console → Load Balancers
   - Note the public IP address

2. **Update DNS**:
   - Point your domain to the Load Balancer IP
   - Or test with IP directly

3. **Access Application**:
   - Visit `http://your-domain.com` or `http://load-balancer-ip`
   - Should see Supercheck application

4. **Test Functionality**:
   - Create account
   - Run test execution
   - Monitor worker scaling

### **3. Scaling Test**

```bash
# Scale workers manually
docker service scale supercheck_supercheck-worker=10

# Check scaling
docker service ps supercheck_supercheck-worker

# Scale back down
docker service scale supercheck_supercheck-worker=5
```

## 🛠️ Maintenance Commands

### **Daily Health Check**
```bash
# Check service health
docker stack services supercheck | grep -v "REPLICAS"

# Check resource usage
docker stats --no-stream

# Check disk space
df -h

# Check system load
uptime
```

### **Adding New Worker Node**
```bash
# Get join token
docker swarm join-token worker

# After purchasing new Hetzner server, SSH and run:
# 1. Complete security setup
# 2. Install Docker
# 3. Run join command
# 4. Label the node from manager
```

### **Backup Configuration**
```bash
# Backup Docker secrets list
docker secret ls > /home/deployer/secrets-backup.txt

# Backup service configurations
docker service ls --format "table {{.Name}}\t{{.Image}}\t{{.Replicas}}" > /home/deployer/services-backup.txt

# Copy stack files to safe location
cp -r /home/deployer/supercheck-core/docker-swarm /home/deployer/supercheck-backup-$(date +%Y%m%d)
```

## 💰 Monthly Cost Summary

```yaml
Final Cost Breakdown (Shared ARM Servers):
├── 3x CAX21 Manager Nodes: €22.77/month
├── 5x CAX31 Worker Nodes: €77.95/month
├── Private Network: €0/month (free)
├── Load Balancer (LB11): €5.39/month
├── Bandwidth: ~€1-5/month (1TB free)
└── Total: €106.11-111.11/month

Capacity:
├── Concurrent Tests: 75-100 (5x workers × 15-20 tests each)
├── Burst Capacity: Up to 125 tests during peaks
├── Monthly Test Runs: Unlimited
└── High Availability: 99.9% uptime with 3-zone setup
```

## 🎉 Success!

You now have a production-ready Docker Swarm cluster running on cost-effective Hetzner Cloud shared ARM servers! The cluster provides:

✅ **High Availability**: 3-zone manager setup
✅ **Cost Effective**: 68% savings vs dedicated CPUs
✅ **Scalable**: Easy horizontal scaling of workers
✅ **Secure**: Network isolation and hardened configuration
✅ **Production Ready**: Proper monitoring and maintenance procedures

Your Supercheck platform is ready to handle paid users with concurrent test execution at optimal cost! 🚀

---

*Remember to regularly backup your configurations and monitor resource usage as you scale.*