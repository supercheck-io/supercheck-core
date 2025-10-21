# Supercheck Deployment Guide: Complete Technical Implementation

This comprehensive guide provides detailed deployment instructions for Supercheck across all supported platforms and infrastructure options. Designed for technical teams implementing production-grade test automation platforms.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Deployment Options](#deployment-options)
- [Prerequisites](#prerequisites)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Docker Swarm Deployment](#docker-swarm-deployment)
- [Kubernetes (K3s) Deployment](#kubernetes-k3s-deployment)
- [Windows Server Deployment](#windows-server-deployment)
- [Cloud Provider Deployments](#cloud-provider-deployments)
- [External Services Integration](#external-services-integration)
- [Deployment Decision Matrix](#deployment-decision-matrix)
- [Scaling Strategies](#scaling-strategies)
- [Cost Analysis](#cost-analysis)
- [Migration Paths](#migration-paths)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## 🏗️ Architecture Overview

### Core Components

```mermaid
graph TB
    subgraph "Supercheck Platform"
        A[Next.js App<br/>Port: 3000<br/>UI & API]
        B[NestJS Worker<br/>Port: 3001<br/>Test Execution]
        C[Job Scheduler<br/>Cron Management]
        D[Queue Manager<br/>Redis/BullMQ]
    end

    subgraph "Data Layer"
        E[(PostgreSQL 18+<br/>Primary Database)]
        F[(Redis<br/>Job Queue & Cache)]
        G[(MinIO/S3<br/>Artifact Storage)]
    end

    subgraph "External Services"
        H[SMTP Provider<br/>Email Notifications]
        I[AI Service<br/>OpenAI/Claude]
        J[Monitoring<br/>Prometheus/Grafana]
    end

    A --> E
    A --> F
    A --> G
    B --> E
    B --> F
    B --> G
    C --> F
    D --> F

    A --> H
    B --> I
    A --> J
    B --> J
```

### Service Dependencies

```mermaid
graph LR
    A[Load Balancer] --> B[Next.js App]
    B --> C[NestJS Worker]
    B --> D[PostgreSQL]
    B --> E[Redis]
    B --> F[MinIO/S3]
    C --> D
    C --> E
    C --> F
```

## 🚀 Deployment Options

### Quick Comparison

| Deployment Type      | Complexity | Scalability | Cost | Best For                      |
| -------------------- | ---------- | ----------- | ---- | ----------------------------- |
| **Docker Compose**   | Low        | Limited     | $    | Development/Small Teams       |
| **Docker Swarm**     | Medium     | High        | $$   | Production/Small-Medium Teams |
| **Kubernetes (K3s)** | High       | Very High   | $$$  | Enterprise/Large Scale        |
| **Windows Server**   | Medium     | Medium      | $$   | Windows Environments          |
| **Cloud Managed**    | Low        | Very High   | $$$$ | Fully Managed Services        |

### Recommended Path

```mermaid
graph TD
    Start[Start Here] --> TeamSize{Team Size}

    TeamSize -->|1-5 devs| Small[Small Team]
    TeamSize -->|5-20 devs| Medium[Medium Team]
    TeamSize -->|20+ devs| Large[Large Team]

    Small --> DockerCompose[Docker Compose]
    Medium --> DockerSwarm[Docker Swarm]
    Large --> Kubernetes[Kubernetes/K3s]

    DockerCompose --> Scale1{Scale Needed?}
    DockerSwarm --> Scale2{Scale Needed?}
    Kubernetes --> Scale3{Scale Needed?}

    Scale1 -->|Yes| SwarmMigrate[Migrate to Swarm]
    Scale2 -->|Yes| K8sMigrate[Migrate to K8s]
    Scale3 -->|Yes| CloudNative[Cloud Native]

    Scale1 -->|No| ComposeProd[Compose Production]
    Scale2 -->|No| SwarmProd[Swarm Production]
    Scale3 -->|No| K8sProd[K8s Production]
```

## 📋 Prerequisites

### System Requirements

#### Minimum Requirements

- **CPU**: 4 cores
- **RAM**: 8GB
- **Storage**: 50GB SSD
- **Network**: 100Mbps

#### Recommended Production

- **CPU**: 8+ cores
- **RAM**: 16GB+
- **Storage**: 100GB+ SSD
- **Network**: 1Gbps

### Software Requirements

```bash
# Required Software
- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)
- Git
- SSH Client

# Optional for Kubernetes
- kubectl
- Helm 3.0+
- k3s/k3d (for local K8s)

# Optional for Cloud
- AWS CLI / gcloud / az
- Terraform (IaC)
```

### External Services Setup

Before deploying, prepare these external services:

1. **Database**: PostgreSQL 18+ (Neon, AWS RDS, etc.)
2. **Redis**: Redis instance (Redis Cloud, ElastiCache, etc.)
3. **Storage**: S3-compatible storage (AWS S3, MinIO, R2)
4. **Email**: SMTP provider (Resend, SendGrid, etc.)
5. **AI**: OpenAI API key (for AI features)

## 🐳 Docker Compose Deployment

### Overview

Docker Compose is ideal for:

- Development environments
- Small production deployments
- Quick testing and validation
- Single-server deployments

### Architecture

```mermaid
graph TB
    subgraph "Single Server"
        A[Traefik<br/>Load Balancer]
        B[Next.js App<br/>2 Replicas]
        C[NestJS Worker<br/>4 Replicas]
        D[PostgreSQL<br/>Database]
        E[Redis<br/>Queue]
        F[MinIO<br/>Storage]
    end

    Internet --> A
    A --> B
    B --> C
    B --> D
    B --> E
    B --> F
    C --> D
    C --> E
    C --> F
```

### Implementation

#### 1. Environment Setup

```bash
# Clone repository
git clone https://github.com/supercheck-io/supercheck-core.git
cd supercheck-core

# Copy environment template
cp .env.example .env

# Edit environment variables
vim .env
```

#### 2. Configure Environment

```bash
# .env file configuration
# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supercheck
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-secure-password
DB_NAME=supercheck

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_URL=redis://:your-redis-password@redis:6379

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
BETTER_AUTH_URL=https://your-domain.com
BETTER_AUTH_SECRET=your-super-secret-auth-key
NODE_ENV=production

# Capacity Management
RUNNING_CAPACITY=6
QUEUED_CAPACITY=50
MAX_CONCURRENT_EXECUTIONS=2
TEST_EXECUTION_TIMEOUT_MS=120000
JOB_EXECUTION_TIMEOUT_MS=900000

# S3/MinIO Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=http://minio:9000
S3_JOB_BUCKET_NAME=supercheck-job-artifacts
S3_TEST_BUCKET_NAME=supercheck-test-artifacts
S3_FORCE_PATH_STYLE=true

# Security
SECRET_ENCRYPTION_KEY=your-64-character-secret-encryption-key

# Email Configuration
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=your-smtp-password
SMTP_SECURE=false
SMTP_FROM_EMAIL=notifications@your-domain.com

# AI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=your-openai-api-key
```

#### 3. Deployment

```bash
# Start infrastructure services
docker-compose up -d postgres redis minio

# Wait for services to be ready
sleep 30

# Start application services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

#### 4. Verification

```bash
# Check application health
curl http://localhost:3000/api/health

# Check worker health
curl http://localhost:3001/health

# Access application
open http://localhost:3000
```

#### 5. Production Configuration

For production deployment, use the production compose file:

```bash
# Use production compose file
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Or use external services configuration
docker-compose -f docker-compose-external.yml up -d
```

### Scaling

```bash
# Scale workers
docker-compose up -d --scale worker=6

# Scale app
docker-compose up -d --scale app=3

# Check scaling status
docker-compose ps
```

### Maintenance

```bash
# Update images
docker-compose pull

# Restart services
docker-compose up -d

# Backup database
docker-compose exec postgres pg_dump -U postgres supercheck > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres supercheck < backup.sql
```

## 🐙 Docker Swarm Deployment

### Overview

Docker Swarm provides production-grade orchestration with:

- Multi-node clustering
- Service discovery
- Load balancing
- Rolling updates
- Secret management
- High availability

### Architecture

```mermaid
graph TB
    subgraph "Manager Nodes (3)"
        M1[Manager 1<br/>Leader]
        M2[Manager 2<br/>Reachable]
        M3[Manager 3<br/>Reachable]
    end

    subgraph "Worker Nodes (5+)"
        W1[Worker 1<br/>App + Workers]
        W2[Worker 2<br/>Workers]
        W3[Worker 3<br/>Workers]
        W4[Worker 4<br/>Workers]
        W5[Worker 5<br/>Workers]
    end

    subgraph "Load Balancer"
        LB[Traefik<br/>HTTPS Termination]
    end

    subgraph "External Services"
        DB[(Neon DB)]
        Redis[(Redis Cloud)]
        S3[(AWS S3/R2)]
    end

    M1 --> M2
    M1 --> M3
    M1 --> W1
    M2 --> W2
    M3 --> W3
    W1 --> W4
    W1 --> W5

    Internet --> LB
    LB --> M1
    LB --> M2
    LB --> M3

    W1 --> DB
    W1 --> Redis
    W1 --> S3
    W2 --> DB
    W2 --> Redis
    W2 --> S3
```

### Implementation

#### 1. Cluster Setup

```bash
# Initialize Swarm on first manager
docker swarm init --advertise-addr <MANAGER-IP>

# Get join tokens
docker swarm join-token worker
docker swarm join-token manager

# Join other managers
docker swarm join --token <MANAGER-TOKEN> <MANAGER-IP>:2377

# Join workers
docker swarm join --token <WORKER-TOKEN> <MANAGER-IP>:2377

# Verify cluster
docker node ls
```

#### 2. Network Setup

```bash
# Create overlay network
docker network create \
  --driver overlay \
  --attachable \
  --encrypt \
  --subnet 10.0.9.0/24 \
  supercheck-network
```

#### 3. Secrets Management

```bash
# Create secrets from environment variables
echo "your-database-url" | docker secret create database_url -
echo "your-redis-url" | docker secret create redis_url -
echo "your-aws-access-key" | docker secret create aws_access_key_id -
echo "your-aws-secret-key" | docker secret create aws_secret_access_key -
echo "your-auth-secret" | docker secret create auth_secret -
echo "your-credential-key" | docker secret create credential_encryption_key -
echo "your-variables-key" | docker secret create variables_encryption_key -
echo "your-smtp-password" | docker secret create smtp_password -
echo "your-openai-key" | docker secret create openai_api_key -

# List secrets
docker secret ls
```

#### 4. Deploy Stack

```bash
# Clone repository with Docker Swarm configurations
git clone https://github.com/supercheck-io/supercheck-core.git
cd supercheck-core/docker-swarm

# Deploy production stack
docker stack deploy -c stacks/supercheck-external-services.yml supercheck

# Monitor deployment
docker stack services supercheck
docker service logs -f supercheck_supercheck-app
```

#### 5. Configure Load Balancer

```bash
# Deploy Traefik
docker stack deploy -c stacks/traefik.yml traefik

# Verify Traefik dashboard
curl http://localhost:8080/dashboard/
```

### Scaling Operations

```bash
# Scale workers
docker service scale supercheck_supercheck-worker=8

# Scale app
docker service scale supercheck_supercheck-app=3

# Check service status
docker service ls
docker service ps supercheck_supercheck-worker
```

### Rolling Updates

```bash
# Update app image
docker service update \
  --image ghcr.io/supercheck-io/supercheck/app:latest \
  supercheck_supercheck-app

# Update worker image
docker service update \
  --image ghcr.io/supercheck-io/supercheck/worker:latest \
  supercheck_supercheck-worker

# Monitor update
docker service logs -f supercheck_supercheck-app
```

### Health Monitoring

```bash
# Check service health
docker service ps supercheck_supercheck-app

# Check node resources
docker node ls
docker node inspect <NODE-ID>

# Check resource usage
docker stats
```

## ☸️ Kubernetes (K3s) Deployment

### Overview

K3s is a lightweight Kubernetes distribution perfect for:

- Edge computing
- CI/CD pipelines
- Development environments
- Small production clusters

### Architecture

```mermaid
graph TB
    subgraph "K3s Cluster"
        subgraph "Control Plane"
            CP[Control Plane<br/>API Server<br/>Scheduler<br/>Controller Manager]
        end

        subgraph "Worker Nodes"
            W1[Worker 1<br/>kubelet<br/>containerd]
            W2[Worker 2<br/>kubelet<br/>containerd]
            W3[Worker 3<br/>kubelet<br/>containerd]
        end
    end

    subgraph "Kubernetes Components"
        Ingress[Traefik Ingress]
        SVC[Services]
        CM[ConfigMaps]
        Secrets[Secrets]
        PVC[Persistent Volumes]
    end

    subgraph "External Services"
        DB[(Neon DB)]
        Redis[(Redis Cloud)]
        S3[(AWS S3)]
    end

    CP --> W1
    CP --> W2
    CP --> W3

    Ingress --> SVC
    SVC --> CM
    SVC --> Secrets

    W1 --> DB
    W2 --> Redis
    W3 --> S3
```

### Implementation

#### 1. K3s Cluster Setup

```bash
# Install K3s on server
curl -sfL https://get.k3s.io | sh -

# Get kubeconfig
sudo cat /etc/rancher/k3s/k3s.yaml > ~/.kube/config

# Install kubectl locally
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Verify cluster
kubectl get nodes
```

#### 2. Prepare Namespace

```bash
# Create namespace
kubectl create namespace supercheck

# Set default namespace
kubectl config set-context --current --namespace=supercheck
```

#### 3. Create Secrets

```bash
# Create secrets from environment variables
kubectl create secret generic supercheck-secrets \
  --from-literal=database-url="your-database-url" \
  --from-literal=redis-url="your-redis-url" \
  --from-literal=aws-access-key-id="your-aws-access-key" \
  --from-literal=aws-secret-access-key="your-aws-secret-key" \
  --from-literal=better-auth-secret="your-auth-secret" \
  --from-literal=credential-encryption-key="your-credential-key" \
  --from-literal=variables-encryption-key="your-variables-key" \
  --from-literal=smtp-password="your-smtp-password" \
  --from-literal=openai-api-key="your-openai-key"
```

#### 4. Deploy Supercheck

```bash
# Clone repository
git clone https://github.com/supercheck-io/supercheck-core.git
cd supercheck-core/k3s

# Deploy Supercheck
kubectl apply -f configs/supercheck.yaml

# Deploy Traefik
kubectl apply -f configs/traefik-lb.yaml

# Check deployment
kubectl get pods
kubectl get services
kubectl get ingress
```

#### 5. Configure Ingress

```bash
# Update ingress host
kubectl edit ingress supercheck-ingress

# Or patch with specific host
kubectl patch ingress supercheck-ingress \
  --type='json' \
  -p='[{"op": "replace", "path": "/spec/rules/0/host", "value": "supercheck.yourdomain.com"}]'
```

### Scaling

```bash
# Scale deployment
kubectl scale deployment supercheck-worker --replicas=6

# Scale app
kubectl scale deployment supercheck-app --replicas=3

# Check status
kubectl get pods
kubectl get hpa  # If HPA is configured
```

### Updates

```bash
# Update image
kubectl set image deployment/supercheck-app \
  app=ghcr.io/supercheck-io/supercheck/app:v1.1.0

# Update worker
kubectl set image deployment/supercheck-worker \
  worker=ghcr.io/supercheck-io/supercheck/worker:v1.1.0

# Check rollout status
kubectl rollout status deployment/supercheck-app
kubectl rollout status deployment/supercheck-worker
```

### Monitoring

```bash
# Check pod logs
kubectl logs -f deployment/supercheck-app
kubectl logs -f deployment/supercheck-worker

# Check events
kubectl get events

# Describe resources
kubectl describe pod <pod-name>
kubectl describe service <service-name>
```

## 🪟 Windows Server Deployment

### Overview

Supercheck can be deployed on Windows Server using:

- Docker Desktop for Windows
- Windows Containers
- IIS as reverse proxy
- Native Node.js installation

### Architecture

```mermaid
graph TB
    subgraph "Windows Server"
        IIS[IIS<br/>Reverse Proxy]
        App1[Supercheck App<br/>Instance 1]
        App2[Supercheck App<br/>Instance 2]
        Worker1[Worker Service<br/>Instance 1]
        Worker2[Worker Service<br/>Instance 2]
    end

    subgraph "External Services"
        DB[(SQL Server/PostgreSQL)]
        Redis[(Redis)]
        S3[(Azure Blob/S3)]
    end

    Internet --> IIS
    IIS --> App1
    IIS --> App2
    App1 --> Worker1
    App2 --> Worker2
    App1 --> DB
    App2 --> DB
    Worker1 --> Redis
    Worker2 --> Redis
    Worker1 --> S3
    Worker2 --> S3
```

### Implementation

#### 1. Docker Desktop Setup

```powershell
# Install Docker Desktop for Windows
# Download from https://www.docker.com/products/docker-desktop

# Switch to Windows Containers
& "$Env:ProgramFiles\Docker\Docker\DockerCli.exe" -SwitchDaemon

# Verify
docker version
docker info
```

#### 2. Prepare Environment

```powershell
# Create project directory
mkdir C:\supercheck
cd C:\supercheck

# Create environment file
New-Item -Path .env -ItemType File -Value @"
DATABASE_URL=postgresql://user:pass@server:5432/supercheck
REDIS_URL=redis://server:6379
NEXT_PUBLIC_APP_URL=https://your-domain.com
BETTER_AUTH_URL=https://your-domain.com
BETTER_AUTH_SECRET=your-secret-key
NODE_ENV=production
"@
```

#### 3. Create Docker Compose

```powershell
# Create docker-compose.windows.yml
New-Item -Path docker-compose.windows.yml -ItemType File -Value @"
version: '3.8'

services:
  app:
    image: ghcr.io/supercheck-io/supercheck/app:latest
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - C:\supercheck\tests:C:\app\public\tests
      - C:\supercheck\results:C:\app\public\test-results
    restart: unless-stopped

  worker:
    image: ghcr.io/supercheck-io/supercheck/worker:latest
    env_file:
      - .env
    volumes:
      - C:\supercheck\reports:C:\app\playwright-reports
    restart: unless-stopped
    deploy:
      replicas: 2
"@
```

#### 4. Deploy Services

```powershell
# Start services
docker-compose -f docker-compose.windows.yml up -d

# Check status
docker-compose -f docker-compose.windows.yml ps

# View logs
docker-compose -f docker-compose.windows.yml logs -f
```

#### 5. IIS Configuration

```powershell
# Install IIS
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer
Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpLogging
Enable-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent

# Install URL Rewrite Module
# Download from https://www.iis.net/downloads/microsoft/url-rewrite

# Create web.config
New-Item -Path C:\inetpub\wwwroot\supercheck\web.config -ItemType File -Value @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyInboundRule1" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@
```

#### 6. Native Node.js Deployment (Alternative)

```powershell
# Install Node.js
# Download from https://nodejs.org/

# Install PM2
npm install -g pm2

# Create ecosystem.config.js
New-Item -Path ecosystem.config.js -ItemType File -Value @"
module.exports = {
  apps: [{
    name: 'supercheck-app',
    script: 'app/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }, {
    name: 'supercheck-worker',
    script: 'worker/dist/main.js',
    instances: 4,
    exec_mode: 'cluster'
  }]
};
"@

# Start applications
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Monitoring

```powershell
# Check Docker containers
docker ps
docker stats

# Check PM2 processes
pm2 list
pm2 monit

# Check IIS logs
Get-EventLog -LogName System -Source "W3SVC" -Newest 10
```

## ☁️ Cloud Provider Deployments

### AWS Deployment

#### Architecture

```mermaid
graph TB
    subgraph "AWS Cloud"
        ALB[Application Load Balancer]
        ECS[ECS Cluster]
        RDS[(RDS PostgreSQL)]
        ElastiCache[(ElastiCache Redis)]
        S3[S3 Storage]
    end

    subgraph "ECS Services"
        App[Supercheck App Service]
        Worker[Supercheck Worker Service]
    end

    Internet --> ALB
    ALB --> App
    App --> Worker
    App --> RDS
    App --> ElastiCache
    App --> S3
    Worker --> RDS
    Worker --> ElastiCache
    Worker --> S3
```

#### Implementation

```bash
# 1. Create VPC and networking
aws ec2 create-vpc --cidr-block 10.0.0.0/16
aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.0.1.0/24
aws ec2 create-subnet --vpc-id <vpc-id> --cidr-block 10.0.2.0/24

# 2. Create ECS cluster
aws ecs create-cluster --cluster-name supercheck

# 3. Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier supercheck-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username postgres \
  --master-user-password <password> \
  --allocated-storage 20

# 4. Create ElastiCache Redis
aws elasticache create-cache-cluster \
  --cache-cluster-id supercheck-redis \
  --engine redis \
  --cache-node-type cache.t3.micro

# 5. Create S3 buckets
aws s3 mb s3://supercheck-job-artifacts
aws s3 mb s3://supercheck-test-artifacts

# 6. Create ECS task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# 7. Create service
aws ecs create-service \
  --cluster supercheck \
  --service-name supercheck-app \
  --task-definition supercheck:1 \
  --desired-count 2
```

### GCP Deployment

#### Implementation

```bash
# 1. Create GKE cluster
gcloud container clusters create supercheck \
  --num-nodes=3 \
  --machine-type=e2-standard-2 \
  --region=us-central1

# 2. Create Cloud SQL instance
gcloud sql instances create supercheck-db \
  --database-version=POSTGRES_13 \
  --tier=db-f1-micro \
  --region=us-central1

# 3. Create Memorystore Redis
gcloud redis instances create supercheck-redis \
  --size=1 \
  --region=us-central1

# 4. Create GCS buckets
gsutil mb gs://supercheck-job-artifacts
gsutil mb gs://supercheck-test-artifacts

# 5. Deploy to GKE
kubectl apply -f k8s/gcp/
```

### Azure Deployment

#### Implementation

```bash
# 1. Create resource group
az group create --name supercheck-rg --location eastus

# 2. Create AKS cluster
az aks create \
  --resource-group supercheck-rg \
  --name supercheck-aks \
  --node-count 3 \
  --node-vm-size Standard_B2s

# 3. Create PostgreSQL
az postgres server create \
  --resource-group supercheck-rg \
  --name supercheck-db \
  --sku B_Gen5_1 \
  --admin-user postgres \
  --admin-password <password>

# 4. Create Redis Cache
az redis create \
  --resource-group supercheck-rg \
  --name supercheck-redis \
  --sku Basic \
  --vm-size C0

# 5. Create Storage Account
az storage account create \
  --resource-group supercheck-rg \
  --name supercheckstorage \
  --sku Standard_LRS

# 6. Deploy to AKS
kubectl apply -f k8s/azure/
```

### Hetzner Deployment

#### Implementation

```bash
# 1. Create servers
hcloud server create --name supercheck-manager-1 --type cpx21 --image ubuntu-22.04
hcloud server create --name supercheck-worker-1 --type cpx31 --image ubuntu-22.04

# 2. Setup Docker Swarm
# Follow Docker Swarm deployment guide

# 3. Create Load Balancer
hcloud load-balancer create --name supercheck-lb --type lb11

# 4. Add targets to load balancer
hcloud load-balancer add-service \
  --load-balancer supercheck-lb \
  --protocol http \
  --port 80 \
  --destination-port 3000
```

## 🔗 External Services Integration

### Database Options

#### Neon PostgreSQL (Recommended)

```bash
# Create Neon project
curl -X POST https://console.neon.tech/api/v1/projects \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"project": {"name": "supercheck"}}'

# Connection string format
DATABASE_URL=postgresql://username:password@ep-example.us-east-1.aws.neon.tech/supercheck?sslmode=require
```

#### AWS RDS

```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier supercheck \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username postgres \
  --master-user-password <password> \
  --allocated-storage 20
```

#### PlanetScale (MySQL)

```bash
# Create database
pscale database create supercheck main

# Connection string
DATABASE_URL=mysql://username:password@host.psdb.cloud/supercheck?sslmode=require
```

### Redis Options

#### Redis Cloud

```bash
# Create Redis database
# Connection string
REDIS_URL=redis://default:password@host.redislabs.com:port
```

#### AWS ElastiCache

```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id supercheck-redis \
  --engine redis \
  --cache-node-type cache.t3.micro
```

### Storage Options

#### AWS S3

```bash
# Create buckets
aws s3 mb s3://supercheck-job-artifacts
aws s3 mb s3://supercheck-test-artifacts

# Configure IAM policy
aws iam create-policy \
  --policy-name SupercheckS3Policy \
  --policy-document file://s3-policy.json
```

#### Cloudflare R2

```bash
# Create buckets
curl -X POST https://api.cloudflare.com/client/v4/accounts/<account-id>/r2/buckets \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "supercheck-job-artifacts"}'
```

#### MinIO (Self-hosted)

```yaml
# docker-compose.yml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    - MINIO_ROOT_USER=minioadmin
    - MINIO_ROOT_PASSWORD=minioadmin
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio-data:/data
```

## 📊 Deployment Decision Matrix

### Comparison Table

| Factor                | Docker Compose | Docker Swarm | Kubernetes | Windows Server | Cloud Managed |
| --------------------- | -------------- | ------------ | ---------- | -------------- | ------------- |
| **Setup Complexity**  | Very Low       | Low          | High       | Medium         | Very Low      |
| **Learning Curve**    | Minimal        | Low          | Steep      | Medium         | Minimal       |
| **Scalability**       | Limited        | Good         | Excellent  | Good           | Excellent     |
| **High Availability** | No             | Yes          | Yes        | Limited        | Yes           |
| **Cost**              | $              | $$           | $$$        | $$             | $$$$          |
| **Maintenance**       | Low            | Medium       | High       | Medium         | Very Low      |
| **Team Size**         | 1-2            | 2-10         | 5+         | 2-5            | 1+            |
| **Use Case**          | Dev/Testing    | Production   | Enterprise | Windows        | Enterprise    |

### Decision Flow

```mermaid
flowchart TD
    Start[Start] -> Team{Team Size}
    Team -->|1-2| Solo[Solo/Small Team]
    Team -->|3-10| Medium[Medium Team]
    Team -->|10+| Large[Large Team]

    Solo --> Budget{Budget}
    Medium --> Complexity{Complexity Preference}
    Large --> Enterprise{Enterprise Requirements}

    Budget -->|Low| Compose[Docker Compose]
    Budget -->|Medium| Swarm[Docker Swarm]

    Complexity -->|Simplicity| Swarm2[Docker Swarm]
    Complexity -->|Advanced| K8s[Kubernetes]

    Enterprise -->|Yes| Cloud[Cloud Managed]
    Enterprise -->|No| K8s2[Kubernetes]

    Compose --> Q1{Need Windows?}
    Swarm2 --> Q1
    K8s --> Q1
    Cloud --> Q1
    K8s2 --> Q1

    Q1 -->|Yes| Windows[Windows Server]
    Q1 -->|No| End[Deployment Selected]
```

### Recommendations

#### Small Teams (1-5 developers)

- **Development**: Docker Compose
- **Production**: Docker Swarm + External Services
- **Cloud**: Hetzner + Docker Swarm

#### Medium Teams (5-20 developers)

- **Development**: Docker Compose
- **Production**: Docker Swarm or K3s
- **Cloud**: AWS/GCP + K3s or Docker Swarm

#### Large Teams (20+ developers)

- **Development**: Docker Compose or K3s
- **Production**: Kubernetes (EKS/GKE/AKS)
- **Cloud**: Managed Kubernetes Services

#### Windows-Centric Organizations

- **Development**: Docker Desktop (Windows Containers)
- **Production**: Windows Server + IIS
- **Cloud**: Azure App Service or Azure Container Instances

## 📈 Scaling Strategies

### Horizontal Scaling

#### Docker Swarm

```bash
# Scale workers
docker service scale supercheck_supercheck-worker=10

# Add new nodes
docker swarm join-token worker
# Run on new server
docker swarm join --token <token> <manager-ip>:2377

# Auto-scaling script
#!/bin/bash
QUEUE_DEPTH=$(redis-cli llen supercheck:jobs)
if [ $QUEUE_DEPTH -gt 50 ]; then
    docker service scale supercheck_supercheck-worker=8
elif [ $QUEUE_DEPTH -lt 10 ]; then
    docker service scale supercheck_supercheck-worker=4
fi
```

#### Kubernetes

```yaml
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: supercheck-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: supercheck-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Vertical Scaling

#### Resource Limits Adjustment

```yaml
# Docker Swarm
docker service update \
  --limit-cpu 2 \
  --limit-memory 4G \
  supercheck_supercheck-worker

# Kubernetes
kubectl patch deployment supercheck-worker \
  --type='json' \
  -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/cpu", "value":"2"}]'
```

### Cluster Scaling

#### Adding Nodes

```bash
# Docker Swarm
# Provision new server
# Install Docker
# Join cluster
docker swarm join --token <token> <manager-ip>:2377

# Kubernetes
# Add new node
# Install k3s/kubelet
# Join cluster
kubeadm join <control-plane-ip>:6443 --token <token> --discovery-token-ca-cert-hash <hash>
```

## 💰 Cost Analysis

### Infrastructure Costs

#### Docker Swarm (Hetzner)

```yaml
Monthly Costs:
  ├── 3x CAX21 Manager Nodes: €22.77
  ├── 5x CAX31 Worker Nodes: €77.95
  ├── Load Balancer: €5.39
  ├── External Services: ~$50
  └── Total: ~$150/month

Capacity:
  ├── Concurrent Tests: 75-100
  ├── Monthly Test Runs: Unlimited
  └── Storage: 1TB included
```

#### Kubernetes (AWS)

```yaml
Monthly Costs:
  ├── EKS Cluster: $73
  ├── 3x t3.medium Nodes: $135
  ├── RDS PostgreSQL: $25
  ├── ElastiCache Redis: $25
  ├── S3 Storage: $23
  ├── Load Balancer: $25
  └── Total: ~$306/month

Capacity:
  ├── Concurrent Tests: 100-150
  ├── Monthly Test Runs: Unlimited
  └── Storage: 1TB+
```

#### Cloud Managed (AWS ECS)

```yaml
Monthly Costs:
  ├── ECS Cluster: $0
  ├── Fargate Tasks: $200
  ├── RDS PostgreSQL: $25
  ├── ElastiCache Redis: $25
  ├── S3 Storage: $23
  ├── Load Balancer: $25
  └── Total: ~$298/month

Capacity:
  ├── Concurrent Tests: 100-200
  ├── Monthly Test Runs: Unlimited
  └── Storage: 1TB+
```

### Cost Optimization

#### Strategies

1. **Use Spot Instances**: Save 60-90% on worker nodes
2. **Autoscaling**: Scale down during off-hours
3. **External Services**: Use serverless databases
4. **Resource Rightsizing**: Monitor and adjust resources
5. **Multi-region**: Deploy in cost-effective regions

#### Example: Cost-Optimized Setup

```bash
# Use Hetzner ARM servers
# Use Neon database (scales to zero)
# Use Upstash Redis (pay per request)
# Use Cloudflare R2 (cheaper S3 alternative)

# Total monthly cost: ~$80-100
# With 90% cost savings vs traditional setup
```

## 🔄 Migration Paths

### Docker Compose to Docker Swarm

```bash
# 1. Export data
docker-compose exec postgres pg_dump -U postgres supercheck > backup.sql

# 2. Initialize Swarm
docker swarm init

# 3. Convert compose file
# Use docker-compose.yml as is for most services
# Add deploy section for production configs

# 4. Create secrets
# Convert environment variables to secrets

# 5. Deploy stack
docker stack deploy -c docker-compose.yml supercheck

# 6. Import data
# Restore to external database
```

### Docker Swarm to Kubernetes

```bash
# 1. Export configurations
docker service ls --format "{{.Name}}: {{.Image}}" > services.txt
docker secret ls > secrets.txt

# 2. Convert to Kubernetes manifests
# Use kompose or manual conversion

# 3. Create Kubernetes cluster
# Install k3s or use managed service

# 4. Apply manifests
kubectl apply -f k8s/

# 5. Verify migration
kubectl get pods,services
```

### Self-hosted to External Services

```bash
# 1. Set up external services
# Create Neon database
# Create Redis Cloud instance
# Create S3 buckets

# 2. Migrate data
# Export PostgreSQL
# Import to Neon

# 3. Update configuration
# Change connection strings
# Update secrets

# 4. Redeploy
# Apply new configuration
# Verify connectivity
```

## ✅ Best Practices

### Security

1. **Use Secrets Management**: Never hardcode credentials
2. **Network Isolation**: Use private networks
3. **HTTPS Only**: Enforce SSL/TLS
4. **Regular Updates**: Keep images and dependencies updated
5. **Access Control**: Implement RBAC
6. **Audit Logging**: Enable audit logs

### Performance

1. **Resource Monitoring**: Monitor CPU, memory, disk
2. **Connection Pooling**: Configure database pools
3. **Caching**: Use Redis for caching
4. **CDN**: Use CDN for static assets
5. **Optimize Images**: Use minimal base images

### Reliability

1. **Health Checks**: Implement comprehensive health checks
2. **Backups**: Regular database and file backups
3. **High Availability**: Multi-node deployments
4. **Disaster Recovery**: Document recovery procedures
5. **Monitoring**: Comprehensive monitoring and alerting

### Maintenance

1. **Infrastructure as Code**: Use GitOps
2. **Automated Deployments**: CI/CD pipelines
3. **Rolling Updates**: Zero-downtime deployments
4. **Documentation**: Keep documentation updated
5. **Testing**: Test deployments in staging

## 🔧 Troubleshooting

### Common Issues

#### Database Connection

```bash
# Test database connectivity
docker exec -it <container> node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(console.log).catch(console.error);
"

# Common solutions
- Check connection string
- Verify network access
- Check credentials
- Verify SSL settings
```

#### Redis Connection

```bash
# Test Redis connectivity
docker exec -it <container> node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(console.log).catch(console.error);
"

# Common solutions
- Check URL format
- Verify password
- Check network access
- Verify firewall rules
```

#### Worker Issues

```bash
# Check worker logs
docker service logs supercheck_supercheck-worker
kubectl logs deployment/supercheck-worker

# Common solutions
- Check resource limits
- Verify environment variables
- Check network connectivity
- Restart service/deployment
```

#### Performance Issues

```bash
# Check resource usage
docker stats
kubectl top pods

# Common solutions
- Scale workers
- Optimize resource limits
- Check database queries
- Optimize Playwright configuration
```

### Debug Commands

```bash
# Docker Swarm
docker service ps --no-trunc supercheck_supercheck-app
docker service logs --details supercheck_supercheck-app
docker inspect <container-id>

# Kubernetes
kubectl describe pod <pod-name>
kubectl logs <pod-name> --previous
kubectl exec -it <pod-name> -- /bin/bash

# System
docker system df
docker system prune -f
kubectl top nodes
kubectl get events
```

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Swarm Guide](https://docs.docker.com/engine/swarm/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [K3s Documentation](https://docs.k3s.io/)
- [Hetzner Cloud Docs](https://docs.hetzner.com/)
- [AWS Documentation](https://docs.aws.amazon.com/)
- [Google Cloud Docs](https://cloud.google.com/docs)
- [Azure Documentation](https://docs.microsoft.com/en-us/azure/)

---

This deployment guide provides comprehensive technical implementation details for all Supercheck deployment options. Choose the deployment strategy that best fits your team size, budget, and technical requirements.
