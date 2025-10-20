<div align="center">
  <img src="./supercheck-logo.png" alt="Supercheck Logo" width="90">
  
  # Supercheck
  
  **Comprehensive Automation & Monitoring for Modern Apps with Distributed Architecture**
</div>

Supercheck is a powerful, scalable testing platform built with Next.js and NestJS that provides comprehensive end-to-end testing capabilities with real-time monitoring, job scheduling, and parallel test execution.

## 🏗️ Architecture

- **Frontend**: Next.js 15 with Turbopack for blazing-fast development
- **Backend Worker**: NestJS service for distributed test execution
- **Database**: PostgreSQL 18+ with Drizzle ORM for type-safe database operations (UUIDv7 support)
- **Queue System**: Redis with BullMQ for reliable job processing
- **Storage**: MinIO (S3-compatible) for test artifacts and reports
- **Authentication**: Better Auth with comprehensive RBAC system

## ✨ Key Features

### 🧪 Test Execution

- **Playwright Integration**: Full browser automation with Chromium, Firefox, and WebKit
- **Parallel Execution**: Configurable parallel test execution with capacity management
- **Real-time Updates**: Server-Sent Events (SSE) for live test status updates
- **Artifact Storage**: Automatic screenshot and video capture with secure storage

### 📅 Job Scheduling

- **Cron Scheduling**: Flexible cron-based job scheduling
- **Manual Triggers**: On-demand test execution via UI or API
- **Retry Logic**: Configurable retry mechanisms for failed tests
- **Queue Management**: Advanced queue processing with capacity limits

### 📊 Monitoring System

- **HTTP/HTTPS Monitoring**: Endpoint availability and response time tracking
- **Heartbeat Monitoring**: Ping-based health checking
- **Uptime Tracking**: Comprehensive availability metrics
- **Alerting**: Multi-channel notifications (email, webhooks, Slack)

### 🔐 Security & Admin

- **Role-Based Access Control**: Three-tier permission system (System, Organization, Project)
- **User Impersonation**: Secure admin impersonation with full audit trail
- **Multi-Factor Authentication**: TOTP-based MFA framework ready for production
- **Comprehensive Audit Logging**: Database-backed security event tracking

## 🚀 Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker and Docker Compose)
- Node.js 18+ (for local development)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd supercheck
cp .env.example .env  # Configure your environment variables
```

### 2. Start Infrastructure Services

**Option A: Using Docker Compose (Recommended)**

```bash
# Start PostgreSQL, Redis, and MinIO together
docker-compose up -d postgres redis minio
```

**Option B: Individual Service Commands**

```bash
# Start Redis
docker run -d --name redis-supercheck -p 6379:6379 redis:8

# Start PostgreSQL 18
docker run -d --name postgres-supercheck \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=supercheck \
  -p 5432:5432 postgres:18

# Start MinIO
docker run -d --name minio-supercheck \
  -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

### 3. Start Application Services

```bash
# Start the full application stack
docker-compose up -d

# Or for development with hot reload
cd app && npm run dev  # Frontend
cd worker && npm run dev  # Worker service (in separate terminal)
```

### 4. Set Up Your First Super Admin

1. Create a user account at `http://localhost:3001/sign-up`
2. Run one of the following commands:

   **For Docker Compose environments:**

   ```bash
   docker-compose exec app npm run setup:admin admin@yourcompany.com
   ```

   **For local development:**

   ```bash
   cd app
   npm run setup:admin admin@yourcompany.com
   ```

   Replace `admin@yourcompany.com` with the actual email address of the user you want to make a super admin.

### 5. Access the Application

- **Main App**: http://localhost:3001
- **Super Admin Dashboard**: http://localhost:3001/super-admin (super admin required)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## 📚 Documentation

### Essential Guides

- **[RBAC and Super Admin Setup](./.specs/RBAC_DOCUMENTATION.md)** - Complete guide for RBAC system and super admin management
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and project overview
- **[Security Guide](./.specs/SECURITY.md)** - Production security configuration

### System Documentation

- **[API Routes Analysis](./.specs/API_ROUTES_ANALYSIS.md)** - Complete API reference
- **[Test Execution Flow](./.specs/TEST_EXECUTION_AND_JOB_QUEUE_FLOW.md)** - How test execution works
- **[Monitoring System](./.specs/MONITORING_SYSTEM.md)** - Uptime and performance monitoring
- **[Deployment Guide](./.specs/DEPLOYMENT_AND_MIGRATION.md)** - Production deployment instructions

## 🛠️ Development

### Local Development Setup

```bash
# Install dependencies
cd app && npm install
cd ../worker && npm install

# Start development services
cd app && npm run dev      # Next.js app with Turbopack
cd worker && npm run dev   # NestJS worker service

# Database operations
cd app
npm run db:generate        # Generate migrations
npm run db:migrate         # Apply migrations
npm run db:studio          # Open Drizzle Studio
```

### Common Commands

```bash
# Linting and type checking
npm run lint               # ESLint
npm run build              # Production build

# Database management
npm run db:generate        # Create new migration
npm run db:migrate         # Apply pending migrations
npm run db:studio          # Database GUI

# Testing
npm run test               # Run Jest tests
npm run test:watch         # Watch mode
```

### Docker Development

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app
docker-compose logs -f worker

# Rebuild specific service
docker-compose up -d --build app

# Database shell access
docker exec -it postgres-supercheck psql -U postgres -d supercheck
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

````bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supercheck

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# MinIO/S3
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000

# Capacity Management
RUNNING_CAPACITY=5         # Max concurrent test executions
QUEUED_CAPACITY=50         # Max queued jobs

# Security
# Super admin access is now managed through the database
# Use `npm run setup:admin admin@yourcompany.com` to configure super admin users

### Production Configuration
See [Security Guide](./specs/SECURITY.md) for production security settings:
- Redis authentication
- SSL/TLS certificates
- Email service configuration
- Resource limits and scaling

## 🏃‍♂️ Usage

### Creating Tests
1. Navigate to the Tests section
2. Click "New Test" to create a Playwright test
3. Write your test script or use the visual editor
4. Configure test settings (timeouts, retries, etc.)
5. Run immediately or schedule for later

### Setting Up Monitoring
1. Go to the Monitors section
2. Add HTTP/HTTPS endpoints or heartbeat monitors
3. Configure check intervals and alert thresholds
4. Set up notification channels (email, webhooks, Slack)

### Using the Dashboard

1. Navigate to the main Dashboard for system overview
2. View real-time test execution status and metrics
3. Monitor system health and performance indicators
4. Track recent activity across tests, jobs, and monitors
5. Access quick creation shortcuts for common tasks

### Managing Jobs

1. Go to the Jobs section to schedule automated test execution
2. Create new jobs with cron-based scheduling
3. Configure job settings: timeouts, retries, and execution parameters
4. Link jobs to specific tests or test suites
5. Monitor job execution history and status

### Viewing Test Runs

1. Navigate to the Runs section for execution history
2. Filter runs by test, status, date range, or execution type
3. View detailed run reports with logs and artifacts
4. Download test results and Playwright reports
5. Analyze performance trends and failure patterns

### Using the Playground

1. Access the Playground for interactive test creation
2. Choose test type: Browser Test, API Test, Database Test, or Custom Test
3. Write and edit test scripts with real-time syntax highlighting
4. Run tests immediately with live feedback
5. Save successful tests to your test library

### Organization Administration

1. Access the Organization Admin panel at `/org-admin`
2. Manage organization members and their roles
3. Configure organization-wide settings and preferences
4. Monitor organization usage and capacity

### Super Admin Management

1. Access the Super Admin Dashboard at `/super-admin`
2. View system-wide statistics and user activity
3. Manage user roles and permissions across all organizations
4. Impersonate users for support and testing purposes
5. Monitor system performance and capacity limits

### API Access
```bash
# Get API key from the dashboard
curl -H "Authorization: Bearer your-api-key" \
     -X POST http://localhost:3001/api/jobs \
     -d '{"name": "API Test Job", "tests": ["test-id"]}'
````

## 🔒 Security Features

### Role-Based Access Control (RBAC)

- **System Level**: Super admins and platform administrators
- **Organization Level**: Organization owners, admins, members, viewers
- **Project Level**: Project owners, admins, editors, viewers

### Admin Capabilities

- **User Management**: Create, edit, ban/unban users
- **Role Management**: Change user roles with visual interface
- **User Impersonation**: Secure impersonation with audit trail
- **System Monitoring**: View platform statistics and performance
- **Security Auditing**: Complete audit logs for all admin actions

### Security Best Practices

- ✅ Database audit logging for all security events
- ✅ Rate limiting on admin operations
- ✅ Session token hashing and validation
- ✅ Multi-factor authentication framework
- ✅ Comprehensive permission checking
- ✅ Secure impersonation with context switching

## 🐛 Troubleshooting

### Common Issues

**Super Admin Access Issues**

```bash
# Verify super admin setup
docker exec postgres-supercheck psql -U postgres -d supercheck \
  -c "SELECT id, email, role FROM \"user\" WHERE email = 'your-email@example.com';"
```

**Database Connection Issues**

```bash
# Check if PostgreSQL is running
docker ps | grep postgres-supercheck

# Test database connection
docker exec postgres-supercheck pg_isready -U postgres
```

**Redis Connection Issues**

```bash
# Check Redis status
docker ps | grep redis-supercheck

# Test Redis connection
docker exec redis-supercheck redis-cli ping
```

### Getting Help

1. Review application logs: `docker-compose logs -f app`
2. Check the [Security Documentation](./specs/SECURITY.md)
3. For super admin issues, see [RBAC and Super Admin Setup Guide](./.specs/RBAC_DOCUMENTATION.md)

## 📚 Complete Documentation

### Essential Documentation

- **[Technical Specifications](./.specs/README.md)** - Complete technical documentation index
- **[RBAC and Super Admin Setup](./.specs/RBAC_DOCUMENTATION.md)** - User management and admin setup
- **[Security Guide](./.specs/SECURITY.md)** - Production security configuration
- **[Development Guidelines](./CLAUDE.md)** - Project overview and coding standards

### System Architecture

- **[API Routes Analysis](./.specs/API_ROUTES_ANALYSIS.md)** - Complete API reference and optimization guide
- **[Test Execution Flow](./.specs/TEST_EXECUTION_AND_JOB_QUEUE_FLOW.md)** - Job processing and execution pipeline
- **[Monitoring System](./.specs/MONITORING_SYSTEM.md)** - Health checks and uptime monitoring
- **[Deployment Guide](./.specs/DEPLOYMENT_AND_MIGRATION.md)** - Production deployment procedures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow the development guidelines in [CLAUDE.md](./CLAUDE.md)
4. Run tests and linting: `npm run lint && npm run test`
5. Commit with clear messages: `git commit -m 'Add amazing feature'`
6. Push and create a Pull Request

### Development Standards

- Follow TypeScript best practices
- Write comprehensive tests for new features
- Document all API changes
- Follow the security guidelines
- Update relevant documentation

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [NestJS](https://nestjs.com/)
- Uses [Playwright](https://playwright.dev/) for browser automation
- Powered by [PostgreSQL](https://postgresql.org/), [Redis](https://redis.io/), and [MinIO](https://min.io/)
- UI components from [Shadcn/ui](https://ui.shadcn.com/)
- Authentication via [Better Auth](https://better-auth.com/)

---

**🚀 Ready to start testing? Follow the Quick Start guide above and create your first super admin account!**
