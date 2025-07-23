# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Please check through all the code you just wrote and make sure it follows security best practices. make sure there are no sensitive information in the front and and there are no vulnerabilities that can be exploited
8. Finally, add a review section to the todo.md file with a summary of the changes you made and any other relevant information.

## Project Overview

Supertest (aka Supercheck) is a comprehensive end-to-end testing platform built with a distributed architecture. It consists of:

- **Frontend (Next.js App)**: Located in `/app` - handles UI, API routes, job scheduling, and database migrations
- **Worker Service (NestJS)**: Located in `/runner` - executes Playwright tests in parallel with capacity management
- **Infrastructure**: PostgreSQL, Redis (job queues), MinIO (S3-compatible storage for artifacts)

The system uses BullMQ for job queuing, Better Auth for authentication, and Drizzle ORM with PostgreSQL for data persistence.

## Architecture

### Core Services
- **App Service**: Next.js frontend with internal API routes and schedulers
- **Worker Service**: NestJS service that processes test execution jobs from Redis queues
- **Database**: PostgreSQL with Drizzle ORM, auto-migrated on app startup
- **Queue System**: Redis with BullMQ for job processing and parallel execution management
- **Storage**: MinIO for storing Playwright reports and test artifacts

### Key Directories
- `/app/src/actions/` - Server actions for job, test, and monitor operations
- `/app/src/app/api/` - Next.js API routes
- `/app/src/components/` - React components organized by feature (jobs, tests, monitors, playground)
- `/app/src/lib/` - Core services (job scheduler, monitor service, queue management, validation)
- `/app/src/db/schema/schema.ts` - Drizzle database schema with comprehensive table definitions
- `/runner/src/` - NestJS worker service modules for test execution

## Common Development Commands

### App Service (Next.js)
```bash
cd app
npm run dev              # Start development server with Turbopack
npm run build           # Build production bundle
npm run lint            # ESLint checking
npm run db:generate     # Generate Drizzle migrations
npm run db:migrate      # Run database migrations
npm run db:studio       # Open Drizzle Studio
npm run db:migrate:prod # Production migration script
```

### Worker Service (NestJS)
```bash
cd runner
npm run dev             # Start in watch mode
npm run build           # Build the service
npm run start:prod      # Start production build
npm run lint            # ESLint checking
npm run test            # Run Jest tests
npm run test:watch      # Run tests in watch mode
```

### Docker Development
```bash
docker-compose up -d                    # Start all services
docker-compose up -d postgres redis minio  # Start just infrastructure
docker-compose logs -f app              # Follow app logs
docker-compose logs -f worker           # Follow worker logs
./scripts/docker-images.sh              # Build multi-arch Docker images
docker buildx ls                        # List available builders
```

## Database Schema

The database schema includes comprehensive tables for:
- **Authentication**: `user`, `session`, `account` (Better Auth integration)
- **Organizations**: `organization`, `member` (multi-tenant support)
- **Core Entities**: `test`, `job`, `run` (test execution pipeline)
- **Monitoring**: `monitor`, `monitor_run` (uptime and performance monitoring)
- **Notifications**: `notification_channel`, `alert_rule` (alerting system)
- **API Access**: `api_key` (API authentication)

## Key Features

### Test Execution
- Playwright-based end-to-end testing with parallel execution
- Configurable timeouts, capacity limits, and retry logic
- Real-time status updates via Server-Sent Events (SSE)
- Artifact storage in MinIO with presigned URL access

### Job Scheduling
- Cron-based job scheduling with `cron-parser`
- Manual job triggers via API keys or UI
- Queue-based execution with capacity management
- Job history and run tracking

### Monitoring System
- HTTP/HTTPS endpoint monitoring with configurable intervals
- Heartbeat monitoring with availability tracking
- Response time metrics and uptime calculations
- Integration with alerting system

### Alerting & Notifications
- Multi-channel notification support (email, webhooks)
- Rule-based alerting with customizable conditions
- Provider limits and quota management

## Development Workflow

1. **Database Changes**: Use `npm run db:generate` to create migrations, then `npm run db:migrate` to apply them
2. **Testing**: Always run both app and worker lint commands before committing
3. **Docker Development**: Use docker-compose for full-stack development with hot reloading
4. **Multi-Architecture Builds**: Use `./scripts/docker-images.sh` for production builds
5. **Production Deployment**: Images are built for `ghcr.io/krish-kant/supercheck/app:latest` and `ghcr.io/krish-kant/supercheck/worker:latest`
6. **Migration Testing**: Test migrations locally before deploying to production

## Environment Configuration

Key environment variables are managed through Docker Compose and include:
- Database connection settings (`DATABASE_URL`, `DB_*`)
- Redis configuration (`REDIS_URL`, `REDIS_HOST`)
- MinIO/S3 settings (`AWS_*`, `S3_*`)
- Capacity limits (`RUNNING_CAPACITY`, `QUEUED_CAPACITY`)
- Timeout configurations (`TEST_EXECUTION_TIMEOUT_MS`)
- Scheduler toggles (`DISABLE_JOB_SCHEDULER`, `DISABLE_MONITOR_SCHEDULER`)

## Testing Infrastructure

The platform includes comprehensive test execution capabilities:
- Playwright configuration in both `/app` and `/runner`
- Test artifact storage and retrieval
- Report generation with HTML outputs
- Parallel test execution with resource management

## Migration Strategy

Database migrations are handled automatically by the app service on startup using Drizzle ORM:
- **Migration Script**: `/app/scripts/migrate-node.js` - Uses proper Drizzle migration tracking
- **Startup Flow**: `/app/scripts/start.sh` - Runs migrations then starts Next.js server
- **Migration Tracking**: Uses `__drizzle_migrations` table to track applied migrations
- **Rollback Safety**: Migrations run in transactions with proper error handling

## Docker Multi-Architecture Support

The project supports both `linux/amd64` and `linux/arm64` architectures:
- **Build Script**: `./scripts/docker-images.sh` - Automated multi-arch builds with Docker Buildx
- **Registry Caching**: Uses GitHub Container Registry for layer caching
- **Platform Detection**: Automatically detects and builds for target architectures
- **Hetzner Compatibility**: Optimized for deployment on Hetzner servers

### Building Images
```bash
# Build and push multi-architecture images
./scripts/docker-images.sh

# Check manifest for multi-arch support
docker buildx imagetools inspect ghcr.io/krish-kant/supercheck/app:latest
```

## Deployment Best Practices

### For Dokploy/Hetzner Deployment:
1. **Pre-built Images**: Use pre-built multi-arch images from GHCR
2. **Health Checks**: Proper health checks ensure services are ready before dependent services start
3. **Migration Order**: App service handles migrations before worker services start
4. **Resource Limits**: Configured resource limits prevent OOM issues
5. **Dependency Management**: Proper service dependencies ensure correct startup order


