# Supercheck

**Comprehensive End-to-End Testing Platform with Distributed Architecture**

Supercheck is a powerful, scalable testing platform built with Next.js and NestJS that provides comprehensive end-to-end testing capabilities with real-time monitoring, job scheduling, and parallel test execution.

## 🏗️ Architecture

- **Frontend**: Next.js 15 with Turbopack for blazing-fast development
- **Backend Worker**: NestJS service for distributed test execution  
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
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
- Docker and Docker Compose
- Node.js 18+ (for local development)

### 1. Clone and Setup
```bash
git clone <repository-url>
cd supertest
cp .env.example .env  # Configure your environment variables
```

### 2. Start Infrastructure Services
```bash
# Start PostgreSQL, Redis, and MinIO
docker-compose up -d postgres redis minio
```

### 3. Start Application Services
```bash
# Start the full application stack
docker-compose up -d

# Or for development with hot reload
cd app && npm run dev  # Frontend
cd runner && npm run dev  # Worker service (in separate terminal)
```

### 4. Set Up Your First Super Admin

**Option A: Automated Setup (Recommended)**
```bash
# Run the interactive setup script
./scripts/setup-super-admin.sh
```

**Option B: Manual Setup**
1. Create a user account at `http://localhost:3001/sign-up`
2. Add your email to environment (preferred method):
   ```bash
   echo "SUPER_ADMIN_EMAILS=your-email@example.com" >> .env
   docker-compose restart app
   ```
   
   Or use the legacy user ID method:
   ```bash
   # Get your user ID from the database
   docker exec postgres-supercheck psql -U postgres -d supercheck -c "SELECT id FROM \"user\" WHERE email = 'your-email@example.com';"
   # Add to environment
   echo "SUPER_ADMIN_USER_IDS=your-user-id-here" >> .env
   docker-compose restart app
   ```

### 5. Access the Application
- **Main App**: http://localhost:3001
- **Super Admin Dashboard**: http://localhost:3001/super-admin (super admin required)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## 📚 Documentation

### Essential Guides
- **[RBAC and Super Admin Setup](./RBAC_DOCUMENTATION.md)** - Complete guide for RBAC system and super admin management
- **[CLAUDE.md](./CLAUDE.md)** - Development guidelines and project overview
- **[Security Guide](./specs/SECURITY.md)** - Production security configuration
- **[RBAC Security Audit](./RBAC_SECURITY_AUDIT.md)** - Comprehensive security analysis

### System Documentation
- **[API Routes Analysis](./specs/API_ROUTES_ANALYSIS.md)** - Complete API reference
- **[Test Execution Flow](./specs/TEST_EXECUTION_AND_JOB_QUEUE_FLOW.md)** - How test execution works
- **[Monitoring System](./specs/MONITORING_SYSTEM.md)** - Uptime and performance monitoring
- **[Deployment Guide](./specs/DEPLOYMENT_AND_MIGRATION.md)** - Production deployment instructions

## 🛠️ Development

### Local Development Setup
```bash
# Install dependencies
cd app && npm install
cd ../runner && npm install

# Start development services
cd app && npm run dev      # Next.js app with Turbopack
cd runner && npm run dev   # NestJS worker service

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

```bash
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
SUPER_ADMIN_EMAILS=admin@example.com,admin2@example.com  # Comma-separated super admin emails (preferred)
SUPER_ADMIN_USER_IDS=user-id-1,user-id-2                # Comma-separated super admin user IDs (legacy)

# Schedulers (optional)
DISABLE_JOB_SCHEDULER=false
DISABLE_MONITOR_SCHEDULER=false
```

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

### Managing Users (Admin)
1. Access the Admin Dashboard at `/admin`
2. View system statistics and user activity
3. Manage user roles and permissions
4. Impersonate users for support and testing
5. Monitor system performance and capacity

### API Access
```bash
# Get API key from the dashboard
curl -H "Authorization: Bearer your-api-key" \
     -X POST http://localhost:3001/api/jobs \
     -d '{"name": "API Test Job", "tests": ["test-id"]}'
```

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

# Check environment variables
docker-compose exec app env | grep SUPER_ADMIN_EMAILS
docker-compose exec app env | grep SUPER_ADMIN_USER_IDS
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
1. Check the [Troubleshooting Guide](./specs/TROUBLESHOOTING.md)
2. Review application logs: `docker-compose logs -f app`
3. Check the [Security Documentation](./specs/SECURITY.md)
4. For super admin issues, see [RBAC and Super Admin Setup Guide](./RBAC_DOCUMENTATION.md)

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