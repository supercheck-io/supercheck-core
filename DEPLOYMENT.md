# Supertest Deployment Guide

This guide explains how to deploy the Supertest monitoring and testing platform using Docker Compose with published images from GitHub Container Registry.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- At least 4GB of available RAM
- At least 10GB of available disk space
- GitHub account with repository access

### 1. Clone and Setup
```bash
git clone <your-repo>
cd supertest
```

### 2. Set Environment Variable
```bash
# Set your GitHub repository name
export GITHUB_REPOSITORY="your-username/supertest"

# Or use it directly in docker-compose
GITHUB_REPOSITORY=your-username/supertest docker-compose up -d
```

### 3. Start All Services
```bash
# Start all services in the background
docker-compose up -d

# View logs
docker-compose logs -f

# View logs for a specific service
docker-compose logs -f frontend
docker-compose logs -f worker
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (admin/minioadmin)
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## 📋 Services Overview

### Frontend (Next.js App)
- **Port**: 3000
- **Image**: `ghcr.io/your-username/supertest/frontend:latest`
- **Purpose**: Web interface for managing tests, jobs, and monitors
- **Health Check**: http://localhost:3000/api/health

### Worker (NestJS Runner)
- **Port**: 3001
- **Image**: `ghcr.io/your-username/supertest/worker:latest`
- **Purpose**: Executes Playwright tests and processes job queues
- **Health Check**: http://localhost:3001/health

### PostgreSQL
- **Port**: 5432
- **Purpose**: Primary database for all application data
- **Credentials**: postgres/postgres

### Redis
- **Port**: 6379
- **Purpose**: Job queue management and caching
- **Persistence**: Enabled with AOF

### MinIO
- **Ports**: 9000 (API), 9001 (Console)
- **Purpose**: S3-compatible storage for test artifacts
- **Credentials**: minioadmin/minioadmin

## 🔧 Configuration

### Environment Variables
The Docker Compose file includes all necessary environment variables. Key configurations:

```yaml
# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supertest

# Redis
REDIS_URL=redis://redis:6379

# MinIO/S3
S3_ENDPOINT=http://minio:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin

# App Settings
RUNNING_CAPACITY=5
QUEUED_CAPACITY=50
TEST_EXECUTION_TIMEOUT_MS=900000
```

### Resource Limits
- **Frontend**: 1 CPU, 2GB RAM
- **Worker**: 2 CPU, 4GB RAM
- **PostgreSQL**: 0.5 CPU, 1GB RAM
- **Redis**: 0.5 CPU, 512MB RAM
- **MinIO**: 0.5 CPU, 1GB RAM

## 🐳 Docker Image Management

### Using Published Images
The Docker Compose file is configured to use images from GitHub Container Registry:

```yaml
frontend:
  image: ghcr.io/${GITHUB_REPOSITORY:-your-username/supertest}/frontend:latest

worker:
  image: ghcr.io/${GITHUB_REPOSITORY:-your-username/supertest}/worker:latest
```

### Building and Publishing Images

#### Option 1: Using GitHub Actions (Recommended)
Images are automatically built and published when you push to main branch or create tags:

```bash
# Push to main branch to trigger build
git push origin main

# Create a release tag
git tag v1.0.0
git push origin v1.0.0
```

#### Option 2: Manual Build and Push
```bash
# Make script executable
chmod +x scripts/docker-images.sh

# Build images locally
./scripts/docker-images.sh build

# Push to GitHub Container Registry
./scripts/docker-images.sh push

# Pull latest images
./scripts/docker-images.sh pull

# Tag with version
./scripts/docker-images.sh tag v1.0.0
```

### GitHub Container Registry Setup

1. **Create GitHub Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate a token with `write:packages` permission

2. **Login to GHCR**:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
   ```

3. **Set Repository Variable**:
   ```bash
   export GITHUB_REPOSITORY="your-username/supertest"
   ```

## 🐳 Docker Swarm Deployment

To deploy to Docker Swarm:

```bash
# Initialize swarm (if not already done)
docker swarm init

# Set environment variable
export GITHUB_REPOSITORY="your-username/supertest"

# Deploy the stack
docker stack deploy -c docker-compose.yml supertest

# View services
docker service ls

# View logs
docker service logs supertest_frontend
docker service logs supertest_worker

# Scale services
docker service scale supertest_worker=3

# Remove stack
docker stack rm supertest
```

## 🔍 Monitoring and Troubleshooting

### Check Service Status
```bash
# View all services
docker-compose ps

# Check service health
docker-compose exec frontend wget -q -O- http://localhost:3000/api/health
docker-compose exec worker wget -q -O- http://localhost:3001/health
```

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs frontend
docker-compose logs worker
docker-compose logs postgres
docker-compose logs redis
docker-compose logs minio

# Follow logs
docker-compose logs -f worker
```

### Database Operations
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d supertest

# Run migrations
docker-compose exec frontend npm run db:migrate
docker-compose exec worker npm run db:migrate
```

### Storage and Volumes
```bash
# List volumes
docker volume ls

# Backup PostgreSQL
docker-compose exec postgres pg_dump -U postgres supertest > backup.sql

# Restore PostgreSQL
docker-compose exec -T postgres psql -U postgres supertest < backup.sql
```

## 🛠️ Development Setup

### Local Development with Published Images
```bash
# Start only infrastructure services
docker-compose up -d postgres redis minio

# Run frontend locally
cd app
npm install
npm run dev

# Run worker locally
cd runner
npm install
npm run start:dev
```

### Building Images Locally
```bash
# Build images for local development
./scripts/docker-images.sh build

# Use local images in docker-compose
# Edit docker-compose.yml to use local images instead of published ones
```

### Environment Variables for Development
Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supertest
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=supertest

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# MinIO
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_FORCE_PATH_STYLE=true
```

## 🔒 Security Considerations

### Production Deployment
1. **Change default passwords** for PostgreSQL and MinIO
2. **Use secrets management** for sensitive environment variables
3. **Enable SSL/TLS** for database connections
4. **Configure firewall rules** to restrict access
5. **Use external Redis** with authentication
6. **Set up proper backups** for PostgreSQL and MinIO data

### Environment Variables for Production
```bash
# Generate strong passwords
POSTGRES_PASSWORD=your-strong-password
MINIO_ROOT_PASSWORD=your-strong-password
REDIS_PASSWORD=your-strong-password

# Use external services
DATABASE_URL=postgresql://user:pass@external-host:5432/supertest
REDIS_URL=redis://:password@external-host:6379
```

## 📊 Performance Tuning

### Resource Optimization
- **Increase worker replicas** for higher test execution capacity
- **Adjust Redis memory** based on queue size
- **Scale PostgreSQL** based on data volume
- **Monitor MinIO** storage usage

### Scaling Commands
```bash
# Scale worker service
docker-compose up -d --scale worker=3

# Scale in Docker Swarm
docker service scale supertest_worker=5
```

## 🚨 Troubleshooting

### Common Issues

1. **Images not found**
   ```bash
   # Check if images exist
   docker images | grep ghcr.io
   
   # Pull images manually
   ./scripts/docker-images.sh pull
   ```

2. **Services not starting**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

3. **Database connection issues**
   ```bash
   docker-compose exec postgres pg_isready -U postgres
   ```

4. **Redis connection issues**
   ```bash
   docker-compose exec redis redis-cli ping
   ```

5. **MinIO not accessible**
   ```bash
   docker-compose exec minio mc ready local
   ```

6. **Worker not processing jobs**
   ```bash
   docker-compose logs worker
   docker-compose exec worker npm run start:prod
   ```

### Log Analysis
```bash
# Check for errors
docker-compose logs | grep -i error

# Check for warnings
docker-compose logs | grep -i warn

# Monitor resource usage
docker stats
```

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Swarm Documentation](https://docs.docker.com/engine/swarm/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [MinIO Documentation](https://docs.min.io/) 