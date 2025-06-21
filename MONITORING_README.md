# Supertest Monitoring & Alerting System

A comprehensive monitoring and alerting platform built with Next.js, NestJS, and PostgreSQL. This system provides real-time monitoring capabilities for HTTP endpoints, ping monitoring, port checking, and multi-channel alerting.

## 🚀 Features

### Monitoring Capabilities
- **HTTP Request Monitoring**: Monitor REST APIs, websites, and web services
- **Ping Host Monitoring**: Monitor server availability and network connectivity  
- **Port Check Monitoring**: Verify if specific ports are open and accessible
- **Real-time Status Updates**: Live status updates via Server-Sent Events (SSE)
- **Response Time Tracking**: Detailed response time metrics and historical data
- **Status Code Validation**: Configurable expected status codes (2xx, 3xx, specific codes)
- **Content Validation**: Keyword presence/absence checking in response bodies

### Authentication Support
- **Basic Authentication**: Username/password authentication
- **Bearer Token**: JWT and API token authentication
- **No Authentication**: For public endpoints

### Alerting System
- **Multi-Channel Notifications**: Email, Slack, Webhook, Telegram, Discord
- **Smart Alert Logic**: Only sends alerts on status changes (up/down transitions)
- **Professional Templates**: Rich HTML emails and formatted messages
- **Alert History**: Complete audit trail of all sent notifications
- **Provider Management**: Easy configuration of notification channels
- **Monitor-Provider Linking**: Flexible assignment of alerts to specific channels

### Advanced Features
- **Cron-based Scheduling**: Flexible monitoring intervals using cron expressions
- **Concurrent Execution**: Multi-threaded monitoring with configurable parallelism
- **Timeout Management**: Configurable timeouts with intelligent error handling
- **Error Categorization**: Detailed error reporting (timeout, network, HTTP errors)
- **Dashboard Analytics**: Visual charts and metrics for monitoring performance
- **Search & Filtering**: Advanced filtering capabilities across all monitors and alerts

## 🏗️ Architecture

### Frontend (Next.js App)
```
app/
├── src/app/
│   ├── monitors/           # Monitor management pages
│   ├── alerts/            # Alert management and history
│   ├── api/               # API routes for frontend-backend communication
│   └── ...
├── src/components/
│   ├── monitors/          # Monitor-related UI components
│   ├── alerts/           # Alert management UI components
│   └── ui/               # Shared UI components
└── src/lib/
    ├── alert-service.ts  # Alert processing logic
    ├── monitor-service.ts # Monitor management
    └── ...
```

### Backend (NestJS Runner)
```
runner/
├── src/
│   ├── monitor/
│   │   ├── monitor.service.ts     # Core monitoring logic
│   │   ├── monitor.processor.ts   # Job queue processing
│   │   └── dto/                   # Data transfer objects
│   ├── execution/
│   │   ├── services/              # Execution services
│   │   └── processors/            # Background job processors
│   └── db/
│       └── schema.ts              # Database schema
```

### Database Schema
- **monitors**: Monitor configurations and metadata
- **monitor_results**: Historical monitoring results
- **notification_providers**: Alert channel configurations
- **monitor_notification_settings**: Monitor-to-provider relationships
- **jobs**: Scheduled monitoring jobs
- **runs**: Job execution history

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL 12+
- Redis (for job queues)
- Docker & Docker Compose (optional)

### Environment Variables

#### Frontend (.env.local)
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/supertest"

# Authentication
AUTH_SECRET="your-auth-secret"
AUTH_URL="http://localhost:3000"

# Redis
REDIS_URL="redis://localhost:6379"

# Runner Communication
RUNNER_URL="http://localhost:4000"
```

#### Backend (runner/.env)
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/supertest"

# Redis
REDIS_URL="redis://localhost:6379"

# App Communication
APP_URL="http://localhost:3000"

# Email (optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

### Installation Steps

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository>
   cd supertest
   
   # Install frontend dependencies
   cd app
   npm install --legacy-peer-deps
   
   # Install backend dependencies  
   cd ../runner
   npm install
   ```

2. **Database Setup**
   ```bash
   # Create database
   createdb supertest
   
   # Run migrations (from app directory)
   cd app
   npm run db:migrate
   
   # Run migrations (from runner directory)
   cd ../runner  
   npm run db:migrate
   ```

3. **Start Services**
   ```bash
   # Terminal 1: Start Redis
   redis-server
   
   # Terminal 2: Start Backend (from runner/)
   npm run start:dev
   
   # Terminal 3: Start Frontend (from app/)
   npm run dev
   ```

4. **Docker Setup (Alternative)**
   ```bash
   # Start all services
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   ```

## 📊 Usage Guide

### Creating Monitors

1. **Navigate to Monitors**: Go to `/monitors` in the web interface
2. **Click "Create Monitor"**: Choose from available monitor types
3. **Configure Settings**:
   - **Name**: Descriptive monitor name
   - **Target**: URL, hostname, or IP address
   - **Type**: HTTP Request, Ping Host, or Port Check
   - **Frequency**: Cron expression (e.g., `*/5 * * * *` for every 5 minutes)
   - **Timeout**: Maximum wait time in seconds
   - **Authentication**: Configure if needed

#### HTTP Request Configuration
- **Method**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Headers**: Custom HTTP headers
- **Body**: Request payload for POST/PUT requests
- **Expected Status**: 2xx, 3xx, or specific codes (200, 404, etc.)
- **Keyword Validation**: Check for presence/absence of text in response

#### Ping Host Configuration  
- **Target**: Hostname or IP address
- **Timeout**: Ping timeout in seconds
- **Packet Count**: Number of ping packets (default: 1)

#### Port Check Configuration
- **Target**: Hostname or IP address
- **Port**: Port number (1-65535)
- **Protocol**: TCP or UDP
- **Timeout**: Connection timeout

### Setting Up Alerts

1. **Navigate to Alerts**: Go to `/alerts` in the web interface
2. **Configure Notification Providers**:
   - Click "Add Provider" in the Notification Providers tab
   - Choose provider type and configure settings
   - Test the connection

3. **Link Monitors to Providers**:
   - Edit a monitor
   - Select notification providers in the alerts section
   - Save configuration

#### Supported Notification Channels

**Email (SMTP)**
- SMTP server configuration
- Multiple recipient support
- Rich HTML templates
- Attachment support

**Slack**
- Webhook URL integration
- Custom channel/user targeting
- Rich message formatting
- Thread support

**Webhook**
- Custom HTTP endpoint
- Configurable headers
- Template interpolation
- Retry logic

**Telegram**
- Bot token authentication
- Chat ID targeting
- Markdown formatting
- Silent notifications

**Discord**
- Webhook URL integration
- Embed messages
- Custom colors and formatting
- Mention support

### Alert Templates

Alerts include comprehensive information:
- Monitor name and type
- Current status and previous status
- Error details and response times
- Timestamp and duration
- Direct links to monitor details

### Monitoring Dashboard

The dashboard provides:
- **Real-time Status**: Live monitor status updates
- **Response Time Charts**: Historical performance metrics
- **Availability Statistics**: Uptime percentages and SLA tracking
- **Alert Summary**: Recent alerts and notification status
- **System Health**: Queue status and processing metrics

## 🔧 Configuration

### Cron Expressions
The system uses cron expressions for scheduling. Common patterns:

```bash
*/5 * * * *     # Every 5 minutes
*/15 * * * *    # Every 15 minutes  
0 * * * *       # Every hour
0 0 * * *       # Daily at midnight
0 0 * * 1       # Weekly on Monday
0 0 1 * *       # Monthly on 1st
```

### Timeout Configuration
- **Default**: 30 seconds
- **Minimum**: 5 seconds
- **Maximum**: 300 seconds (5 minutes)
- **Recommendation**: Set based on expected response times

### Parallel Execution
- **Default**: 5 concurrent monitors
- **Configuration**: Set via `PARALLEL_THREADS` environment variable
- **Recommendation**: Adjust based on system resources

## 🚨 Troubleshooting

### Common Issues

**Monitor Always Failing**
- Check network connectivity from runner to target
- Verify authentication credentials
- Confirm expected status codes are correct
- Review timeout settings

**Alerts Not Sending**
- Verify notification provider configuration
- Check provider API keys/credentials
- Review monitor-provider linkage
- Check alert service logs

**High Response Times**
- Monitor system resources (CPU, memory)
- Check network latency to targets
- Consider reducing monitoring frequency
- Review concurrent execution limits

**Database Connection Issues**
- Verify DATABASE_URL configuration
- Check PostgreSQL service status
- Confirm database migrations are applied
- Review connection pool settings

### Logging

**Frontend Logs**
```bash
# Development
npm run dev

# Production  
pm2 logs supertest-app
```

**Backend Logs**
```bash
# Development
npm run start:dev

# Production
pm2 logs supertest-runner
```

**Database Logs**
```bash
# PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log

# Query logging (enable in postgresql.conf)
log_statement = 'all'
```

## 🔒 Security Considerations

### Authentication Storage
- Passwords and tokens are stored in database
- Consider implementing encryption at rest
- Use environment variables for sensitive configuration
- Implement proper secret rotation policies

### Network Security
- Run monitors from secure network segments
- Use HTTPS for all external communications
- Implement proper firewall rules
- Consider VPN for internal resource monitoring

### Access Control
- Implement proper user authentication
- Use role-based access control (RBAC)
- Audit monitor and alert configurations
- Secure notification provider credentials

## 📈 Performance Optimization

### Database Optimization
- Regular vacuum and analyze operations
- Implement proper indexing strategy
- Archive old monitoring results
- Use connection pooling

### Monitoring Optimization
- Distribute monitors across multiple runners
- Implement intelligent retry logic
- Use appropriate monitoring frequencies
- Cache DNS lookups where possible

### Alert Optimization
- Implement alert deduplication
- Use exponential backoff for retries
- Batch notifications where appropriate
- Implement alert rate limiting

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Install dependencies
4. Make changes with tests
5. Submit pull request

### Code Standards
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Jest for testing

### Testing
```bash
# Frontend tests
cd app && npm test

# Backend tests  
cd runner && npm test

# E2E tests
npm run test:e2e
```

## 📝 API Documentation

### Monitor Management
- `GET /api/monitors` - List all monitors
- `POST /api/monitors` - Create new monitor
- `GET /api/monitors/:id` - Get monitor details
- `PUT /api/monitors/:id` - Update monitor
- `DELETE /api/monitors/:id` - Delete monitor

### Alert Management
- `GET /api/alerts` - List alert history
- `POST /api/alerts/process` - Process alert (internal)
- `GET /api/notification-providers` - List providers
- `POST /api/notification-providers` - Create provider

### Real-time Updates
- `GET /api/monitor-status/sse/:id` - Monitor status updates
- `GET /api/queue-stats/sse` - Queue statistics

## 🗺️ Roadmap

### Planned Features
- [ ] Multi-step monitoring workflows
- [ ] Custom dashboard creation
- [ ] Advanced analytics and reporting
- [ ] Mobile app for alerts
- [ ] Integration with popular monitoring tools
- [ ] Machine learning for anomaly detection
- [ ] Geographic monitoring distribution
- [ ] Advanced SLA tracking and reporting

### Version History
- **v1.0.0**: Initial release with basic monitoring
- **v1.1.0**: Added alerting system
- **v1.2.0**: Enhanced authentication support
- **v1.3.0**: Professional UI improvements
- **v1.4.0**: Multi-channel alerting (current)

## 📞 Support

For issues, questions, or contributions:
- Create GitHub issues for bugs/features
- Join our Discord community
- Check documentation wiki
- Review existing discussions

---

**Built with ❤️ using Next.js, NestJS, and PostgreSQL** 