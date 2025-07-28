# Deployment and Migration Guide

This comprehensive guide explains how to deploy the Supertest monitoring and testing platform using Docker Compose with published images from GitHub Container Registry, including database migration setup, multi-architecture support, and production deployment strategies.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed (or Docker with Compose plugin)
- At least 4GB of available RAM
- At least 10GB of available disk space
- GitHub account with repository access (for private repositories)
- Basic understanding of Docker containers and environment variables

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
- **Frontend**: ${NEXT_PUBLIC_APP_URL}
- **MinIO Console**: http://${S3_HOST}:9001 (admin/minioadmin)
- **PostgreSQL**: ${DB_HOST}:5432
- **Redis**: ${REDIS_HOST}:6379

## 📋 Services Overview

### Frontend (Next.js App)
- **Port**: 3000
- **Image**: `ghcr.io/your-username/supertest/app:latest`
- **Purpose**: Web interface for managing tests, jobs, and monitors
- **Health Check**: ${NEXT_PUBLIC_APP_URL}/api/health

### Worker (NestJS Runner)
- **Port**: 3001
- **Image**: `ghcr.io/your-username/supertest/worker:latest`
- **Purpose**: Executes Playwright tests and processes job queues
- **Health Check**: ${WORKER_URL}/health

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

## 🗄️ Database Migration Setup

### Architecture

The migration setup follows the best practice of separating migration concerns from application concerns:

1. **Migration Service**: A dedicated container that runs migrations using DrizzleKit
2. **App Service**: The Next.js application that starts after migrations complete
3. **Worker Service**: The NestJS worker that starts after migrations complete

### Flow

```
PostgreSQL → Migration Service → App + Worker Services
```

1. PostgreSQL starts and becomes healthy
2. Migration service runs and applies all pending migrations
3. App and Worker services start only after migrations complete successfully

### Files

- `Dockerfile.migrate`: Dedicated migration container with only necessary dependencies
- `app/scripts/migrate.sh`: Migration script that handles database setup and migration application
- `docker-compose.yml`: Updated to include migration service with proper dependencies
- `.github/workflows/docker-build.yml`: GitHub Actions workflow for building and pushing images

### Images

- `ghcr.io/krish-kant/supercheck/migrate:latest`: Migration service image
- `ghcr.io/krish-kant/supercheck/app:latest`: Application image
- `ghcr.io/krish-kant/supercheck/worker:latest`: Worker image

### Benefits

✅ **Separation of Concerns**: Migration logic is isolated from application logic
✅ **Reliable Startup**: Apps only start after migrations complete successfully  
✅ **Lightweight Images**: App containers don't include dev dependencies
✅ **Better Error Handling**: Migration failures are clearly separated from app failures
✅ **Production Ready**: Follows Docker Compose best practices
✅ **Multi-Architecture Support**: Images built for both AMD64 and ARM64 platforms

### Usage

#### Start the full stack with migrations:
```bash
docker-compose up --build
```

#### Run only migrations:
```bash
docker-compose up migration
```

#### Test migration setup:
```bash
./test-migration-setup.sh
```

### Migration Script Features

- ✅ Waits for database to be ready
- ✅ Creates database if it doesn't exist
- ✅ Applies migrations in order
- ✅ Verifies all required tables exist
- ✅ Comprehensive error handling and retry logic
- ✅ Detailed logging for debugging

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
  image: ghcr.io/${GITHUB_REPOSITORY:-your-username/supertest}/app:latest

worker:
  image: ghcr.io/${GITHUB_REPOSITORY:-your-username/supertest}/worker:latest
```

### Building and Publishing Images

#### Prerequisites for GHCR Publishing

1. **Create GitHub Personal Access Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate a new token with the following permissions:
     - `write:packages` - Upload packages to GitHub Package Registry
     - `read:packages` - Download packages from GitHub Package Registry
     - `delete:packages` - Delete packages from GitHub Package Registry
   - Copy the token and save it securely

2. **Login to GitHub Container Registry**:
   ```bash
   # Set your GitHub username and token
   export GITHUB_USERNAME="your-github-username"
   export GITHUB_TOKEN="your-github-token"
   
   # Login to GHCR
   echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
   ```

3. **Set Repository Variable**:
   ```bash
   export GITHUB_REPOSITORY="your-username/supertest"
   ```

#### Option 1: Using GitHub Actions (Recommended)

Create a GitHub Actions workflow to automatically build and publish images:

1. **Create the workflow directory and file**:
   ```bash
   mkdir -p .github/workflows
   ```

2. **Create `.github/workflows/docker-publish.yml`**:
   ```yaml
   name: Build and Publish Docker Images
   
   on:
     push:
       branches: [ main ]
       tags: [ 'v*' ]
     pull_request:
       branches: [ main ]
   
   env:
     REGISTRY: ghcr.io
     IMAGE_NAME: ${{ github.repository }}
   
   jobs:
     build:
       runs-on: ubuntu-latest
       permissions:
         contents: read
         packages: write
       
       steps:
       - name: Checkout repository
         uses: actions/checkout@v4
       
       - name: Set up Docker Buildx
         uses: docker/setup-buildx-action@v3
       
       - name: Log in to Container Registry
         uses: docker/login-action@v3
         with:
           registry: ${{ env.REGISTRY }}
           username: ${{ github.actor }}
           password: ${{ secrets.GITHUB_TOKEN }}
       
       - name: Extract metadata
         id: meta
         uses: docker/metadata-action@v5
         with:
           images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/app,${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/worker
           tags: |
             type=ref,event=branch
             type=ref,event=pr
             type=semver,pattern={{version}}
             type=semver,pattern={{major}}.{{minor}}
             type=sha
       
       - name: Build and push App image
         uses: docker/build-push-action@v5
         with:
           context: ./app
           file: ./app/Dockerfile
           push: true
           tags: ${{ steps.meta.outputs.tags }}
           labels: ${{ steps.meta.outputs.labels }}
           cache-from: type=gha
           cache-to: type=gha,mode=max
       
       - name: Build and push Worker image
         uses: docker/build-push-action@v5
         with:
           context: ./runner
           file: ./runner/Dockerfile
           push: true
           tags: ${{ steps.meta.outputs.tags }}
           labels: ${{ steps.meta.outputs.labels }}
           cache-from: type=gha
           cache-to: type=gha,mode=max
   ```

3. **Commit and push the workflow**:
   ```bash
   git add .github/workflows/docker-publish.yml
   git commit -m "Add Docker image build workflow"
   git push origin main
   ```

4. **Trigger the workflow**:
   ```bash
   # Push to main branch to trigger build
   git push origin main
   
   # Create a release tag
   git tag v1.0.0
   git push origin v1.0.0
   ```

#### Option 2: Manual Build and Push

1. **Build Images Locally**:
   ```bash
   # Set your GitHub repository name
   export GITHUB_REPOSITORY="your-username/supertest"
   
   # Build app image
   docker build -t ghcr.io/$GITHUB_REPOSITORY/app:latest ./app
   
   # Build worker image
   docker build -t ghcr.io/$GITHUB_REPOSITORY/worker:latest ./runner
   
   # Tag with version (optional)
   docker tag ghcr.io/$GITHUB_REPOSITORY/app:latest ghcr.io/$GITHUB_REPOSITORY/app:v1.0.0
   docker tag ghcr.io/$GITHUB_REPOSITORY/worker:latest ghcr.io/$GITHUB_REPOSITORY/worker:v1.0.0
   ```

2. **Push Images to GHCR**:
   ```bash
   # Push latest tags
   docker push ghcr.io/$GITHUB_REPOSITORY/app:latest
   docker push ghcr.io/$GITHUB_REPOSITORY/worker:latest
   
   # Push version tags (optional)
   docker push ghcr.io/$GITHUB_REPOSITORY/app:v1.0.0
   docker push ghcr.io/$GITHUB_REPOSITORY/worker:v1.0.0
   ```

3. **Pull Images**:
   ```bash
   # Pull latest images
   docker pull ghcr.io/$GITHUB_REPOSITORY/app:latest
   docker pull ghcr.io/$GITHUB_REPOSITORY/worker:latest
   ```

#### Option 3: Using the Build Script

The project includes a build script for convenience:

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

### Using Images in Docker Compose

1. **Set Environment Variable**:
   ```bash
   export GITHUB_REPOSITORY="your-username/supertest"
   ```

2. **Start Services**:
   ```bash
   # Start with environment variable
   GITHUB_REPOSITORY=your-username/supertest docker-compose up -d
   
   # Or set it permanently
   echo 'export GITHUB_REPOSITORY="your-username/supertest"' >> ~/.bashrc
   source ~/.bashrc
   docker-compose up -d
   ```

3. **Verify Images are Pulled**:
   ```bash
   # Check if images exist locally
   docker images | grep ghcr.io
   
   # Pull images if needed
   docker-compose pull
   ```

### Image Versioning Strategy

- **`latest`**: Latest development version (from main branch)
- **`v1.0.0`**: Semantic versioned releases
- **`sha-abc123`**: Commit-specific builds (from GitHub Actions)

### Managing Image Permissions

1. **Make Package Public** (if desired):
   - Go to your GitHub repository
   - Click on "Packages" tab
   - Select the package (frontend or worker)
   - Go to "Package settings" → "Inherit access from source repository"
   - Or set specific permissions under "Manage actions access"

2. **Delete Old Images**:
   ```bash
   # List images
   docker images ghcr.io/$GITHUB_REPOSITORY/*
   
   # Remove local images
   docker rmi ghcr.io/$GITHUB_REPOSITORY/app:latest
   docker rmi ghcr.io/$GITHUB_REPOSITORY/worker:latest
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
docker-compose exec frontend wget -q -O- ${NEXT_PUBLIC_APP_URL}/api/health
docker-compose exec worker wget -q -O- ${WORKER_URL}/health
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

### Migration Troubleshooting

#### Migration fails
Check the migration service logs:
```bash
docker-compose logs migration
```

#### Database connection issues
Verify PostgreSQL is running and healthy:
```bash
docker-compose logs postgres
```

#### Migration script issues
The migration script includes comprehensive error handling and retry logic. Check the script logs for detailed error messages.

## 🛠️ Development Setup

### Running Docker Containers Locally

#### Option 1: Build and Run Individual Containers

1. **Build App Container**:
   ```bash
   # Navigate to app directory
   cd app
   
   # Build the app image
   docker build -t supertest-app:latest .
   
   # Run the app container
   docker run -d \
     --name supertest-app \
     --network supertest-network \
     -p 3000:3000 \
     -e DATABASE_URL=postgresql://postgres:postgres@postgres-supercheck:5432/supercheck \
     -e REDIS_HOST=supertest-redis \
     -e REDIS_PORT=6379 \
     -e NEXT_PUBLIC_APP_URL=http://supertest-app:3000 \
     -e S3_ENDPOINT=http://host.docker.internal:9000 \
     -e AWS_ACCESS_KEY_ID=minioadmin \
     -e AWS_SECRET_ACCESS_KEY=minioadmin \
     supertest-app:latest
   ```

2. **Build Worker Container**:
   ```bash
   # Navigate to runner directory
   cd runner
   
   # Build the worker image
   docker build -t supertest-worker:latest .
   
   # Run the worker container
   docker run -d \
     --name supertest-worker \
     --network supertest-network \
     -p 3001:3001 \
     -e DATABASE_URL=postgresql://postgres:postgres@postgres-supercheck:5432/supercheck \
     -e REDIS_HOST=supertest-redis \
     -e REDIS_PORT=6379 \
     -e NEXT_PUBLIC_APP_URL=http://supertest-app:3000 \
     -e S3_ENDPOINT=http://host.docker.internal:9000 \
     -e AWS_ACCESS_KEY_ID=minioadmin \
     -e AWS_SECRET_ACCESS_KEY=minioadmin \
     supertest-worker:latest
   ```

3. **Start Infrastructure Services**:
   ```bash
   # Start PostgreSQL
   docker run -d \
     --name supertest-postgres \
     -p 5432:5432 \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=supercheck \
     postgres:16
   
   # Start Redis
   docker run -d \
     --name supertest-redis \
     -p 6379:6379 \
     redis:7-alpine
   
   # Start MinIO
   docker run -d \
     --name supertest-minio \
     -p 9000:9000 \
     -p 9001:9001 \
     -e MINIO_ROOT_USER=minioadmin \
     -e MINIO_ROOT_PASSWORD=minioadmin \
     minio/minio server /data --console-address ":9001"
   ```

#### Option 2: Using Docker Compose with Local Builds

1. **Create a local docker-compose file** (`docker-compose.local.yml`):
   ```yaml
   version: '3.8'
   
   services:
     app:
       build:
         context: ./app
         dockerfile: Dockerfile
       ports:
         - "3000:3000"
       environment:
         - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supercheck
         - REDIS_URL=redis://redis:6379
         - S3_ENDPOINT=http://minio:9000
         - AWS_ACCESS_KEY_ID=minioadmin
         - AWS_SECRET_ACCESS_KEY=minioadmin
       depends_on:
         - postgres
         - redis
         - minio
   
     worker:
       build:
         context: ./runner
         dockerfile: Dockerfile
       ports:
         - "3001:3001"
       environment:
         - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/supercheck
         - REDIS_URL=redis://redis:6379
         - S3_ENDPOINT=http://minio:9000
         - AWS_ACCESS_KEY_ID=minioadmin
         - AWS_SECRET_ACCESS_KEY=minioadmin
       depends_on:
         - postgres
         - redis
         - minio
   
     postgres:
       image: postgres:15
       environment:
         - POSTGRES_PASSWORD=postgres
         - POSTGRES_DB=supercheck
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data
   
     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data
   
     minio:
       image: minio/minio
       environment:
         - MINIO_ROOT_USER=minioadmin
         - MINIO_ROOT_PASSWORD=minioadmin
       ports:
         - "9000:9000"
         - "9001:9001"
       volumes:
         - minio_data:/data
       command: server /data --console-address ":9001"
   
   volumes:
     postgres_data:
     redis_data:
     minio_data:
   ```

2. **Build and run with local images**:
   ```bash
   # Build and start all services
   docker-compose -f docker-compose.local.yml up -d --build
   
   # View logs
   docker-compose -f docker-compose.local.yml logs -f
   
   # Stop services
   docker-compose -f docker-compose.local.yml down
   ```

#### Option 3: Development with Hot Reload

For development with hot reload, you can run the containers with volume mounts:

```bash
# App with hot reload
docker run -d \
  --name supertest-app-dev \
  -p 3000:3000 \
  -v $(pwd)/app:/app \
  -v /app/node_modules \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/supercheck \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e S3_ENDPOINT=http://host.docker.internal:9000 \
  -e AWS_ACCESS_KEY_ID=minioadmin \
  -e AWS_SECRET_ACCESS_KEY=minioadmin \
  supertest-app:latest npm run dev

# Worker with hot reload
docker run -d \
  --name supertest-worker-dev \
  -p 3001:3001 \
  -v $(pwd)/runner:/app \
  -v /app/node_modules \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/supercheck \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e S3_ENDPOINT=http://host.docker.internal:9000 \
  -e AWS_ACCESS_KEY_ID=minioadmin \
  -e AWS_SECRET_ACCESS_KEY=minioadmin \
  supertest-worker:latest npm run start:dev
```

#### Managing Local Containers

**View running containers**:
```bash
# List all containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container logs
docker logs supertest-app
docker logs supertest-worker
docker logs supertest-postgres
docker logs supertest-redis
docker logs supertest-minio

# Follow logs in real-time
docker logs -f supertest-app
```

**Stop and remove containers**:
```bash
# Stop containers
docker stop supertest-app supertest-worker supertest-postgres supertest-redis supertest-minio

# Remove containers
docker rm supertest-app supertest-worker supertest-postgres supertest-redis supertest-minio

# Stop and remove in one command
docker rm -f supertest-app supertest-worker supertest-postgres supertest-redis supertest-minio
```

**Clean up images**:
```bash
# Remove local images
docker rmi supertest-app:latest supertest-worker:latest

# Remove all unused images
docker image prune -a

# Remove all unused containers, networks, and images
docker system prune -a
```

**Access container shell**:
```bash
# Access app container
docker exec -it supertest-app /bin/bash

# Access worker container
docker exec -it supertest-worker /bin/bash

# Access PostgreSQL
docker exec -it supertest-postgres psql -U postgres -d supercheck
```

**Run database migrations**:
```bash
# Run migrations in app container
docker exec supertest-app npm run db:migrate

# Run migrations in worker container
docker exec supertest-worker npm run db:migrate
```

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
DATABASE_URL=postgresql://postgres:postgres@${DB_HOST}:5432/supertest
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=supertest

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://${REDIS_HOST}:6379

# MinIO
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://${S3_HOST}:9000
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
   
   # Check if images exist in GHCR
   curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/user/packages/container/app/versions
   ```

2. **Authentication issues with GHCR**
   ```bash
   # Re-login to GHCR
   docker logout ghcr.io
   echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
   
   # Verify login
   docker login ghcr.io --username $GITHUB_USERNAME
   ```

3. **Permission denied errors**
   ```bash
   # Check if package is public or you have access
   # Go to GitHub repository → Packages tab → Check package visibility
   
   # For private packages, ensure you're logged in with correct account
   docker login ghcr.io -u $GITHUB_USERNAME
   ```

4. **Services not starting**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

5. **Database connection issues**
   ```bash
   docker-compose exec postgres pg_isready -U postgres
   ```

6. **Redis connection issues**
   ```bash
   docker-compose exec redis redis-cli ping
   ```

7. **MinIO not accessible**
   ```bash
   docker-compose exec minio mc ready local
   ```

8. **Worker not processing jobs**
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
- [DrizzleKit Documentation](https://orm.drizzle.team/kit-docs/) 