# Supercheck Monitoring System Architecture Overview

## Executive Summary

The Supercheck monitoring system is a distributed, queue-based architecture for executing periodic health checks on various types of endpoints and services. It combines a Next.js frontend/scheduler with a NestJS worker service that executes monitors in parallel using Redis-backed job queues (BullMQ).

---

## 1. DATABASE SCHEMA FOR MONITORS

### Core Tables

#### `monitors` Table
**Location:** `/app/src/db/schema/schema.ts` (lines 506-537)

**Purpose:** Stores monitor definitions and their current state.

**Key Columns:**
```typescript
{
  id: UUID (primary key, UUIDv7)
  organizationId: UUID (references organization)
  projectId: UUID (references projects)
  createdByUserId: UUID (references user)
  name: varchar(255) - Display name of the monitor
  description: text - Optional description
  type: varchar(50) - MonitorType enum:
    - "http_request" - HTTP/HTTPS endpoint checks
    - "website" - Website availability with SSL checking
    - "ping_host" - ICMP ping checks
    - "port_check" - TCP/UDP port connectivity
    - "synthetic_test" - Playwright test execution
  target: varchar(2048) - URL, hostname, or IP address
  frequencyMinutes: integer - Execution interval (default: 5)
  enabled: boolean - Whether monitor is active
  status: varchar(50) - Current status enum:
    - "up" - Last check was successful
    - "down" - Last check failed
    - "paused" - Manually disabled
    - "pending" - Awaiting first check
    - "maintenance" - Under maintenance
    - "error" - Error during last check
  config: JSONB - MonitorConfig object with:
    {
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"
      headers?: Record<string, string>
      body?: string
      expectedStatusCodes?: string - Flexible format: "200", "2xx", "200-299", "200,301,404"
      keywordInBody?: string - Text to search for in response
      keywordInBodyShouldBePresent?: boolean
      responseBodyJsonPath?: { path: string; expectedValue: unknown }
      auth?: {
        type: "none" | "basic" | "bearer"
        username?: string
        password?: string
        token?: string
      }
      port?: number - For port_check
      protocol?: "tcp" | "udp"
      enableSslCheck?: boolean
      sslDaysUntilExpirationWarning?: number (default: 30)
      sslCheckFrequencyHours?: number (default: 24)
      sslLastCheckedAt?: string - ISO timestamp
      sslCheckOnStatusChange?: boolean
      timeoutSeconds?: number
      regions?: string[] - UNUSED: Reserved for future multi-location support
      retryStrategy?: { maxRetries: number; backoffFactor: number }
      alertChannels?: string[]
      testId?: string - For synthetic_test monitors
      testTitle?: string - Cached test title
      playwrightOptions?: {
        headless?: boolean
        timeout?: number
        retries?: number
      }
    }
  alertConfig: JSONB - AlertConfig object:
    {
      enabled: boolean
      notificationProviders: string[] - Provider IDs
      alertOnFailure: boolean
      alertOnRecovery?: boolean
      alertOnSslExpiration?: boolean
      alertOnSuccess?: boolean
      alertOnTimeout?: boolean
      failureThreshold: number - Consecutive failures before alert
      recoveryThreshold: number
      customMessage?: string
    }
  lastCheckAt: timestamp - When last check executed
  lastStatusChangeAt: timestamp - When status last changed
  mutedUntil: timestamp - Muted alerts until this time
  scheduledJobId: varchar(255) - BullMQ scheduler job ID
  createdAt: timestamp (default: now)
  updatedAt: timestamp (default: now)
}
```

**Relationships:**
- Belongs to `organization` (cascading delete)
- Belongs to `projects` (cascading delete)
- Has many `monitorResults`
- Has many `monitorTags` (join table)
- Has many `monitorNotificationSettings` (join table)

---

#### `monitor_results` Table
**Location:** `/app/src/db/schema/schema.ts` (lines 565-587)

**Purpose:** Stores the detailed results of each monitor execution.

**Key Columns:**
```typescript
{
  id: UUID (primary key, UUIDv7)
  monitorId: UUID (FK: monitors.id, cascading delete)
  checkedAt: timestamp - When check was performed (default: now)
  status: varchar(50) - MonitorResultStatus enum:
    - "up" - Service is operational
    - "down" - Service is not responding as expected
    - "error" - Execution error
    - "timeout" - Check timed out
  responseTimeMs: integer - Response time in milliseconds
  details: JSONB - MonitorResultDetails object:
    {
      statusCode?: number - HTTP status code
      statusText?: string - HTTP status text
      errorMessage?: string - Error description
      responseHeaders?: Record<string, string>
      responseBodySnippet?: string - Truncated response body (1000 chars max)
      ipAddress?: string - Resolved IP address
      location?: string - Execution location (UNUSED, for future multi-location)
      sslCertificate?: {
        valid: boolean
        issuer?: string
        subject?: string
        validFrom?: string - ISO date
        validTo?: string - ISO date
        daysRemaining?: number
      }
      [key: string]: unknown - Additional arbitrary data
    }
  isUp: boolean - Quick status flag (true = up/success)
  isStatusChange: boolean - Whether this result differs from previous
  consecutiveFailureCount: integer - Failures in current sequence
  alertsSentForFailure: integer - Number of failure alerts sent (max 3)
  testExecutionId: text - Unique ID for synthetic test execution
  testReportS3Url: text - S3 URL to test report (HTML/JSON)
}
```

**Relationships:**
- Belongs to `monitors`
- Indexed on `(monitorId, checkedAt)` for efficient queries

---

### Related Tables

#### `monitor_tags` Table
Join table linking monitors to organizational tags for filtering/organization.

#### `monitor_notification_settings` Table
Join table linking monitors to notification providers for alert delivery.

#### `alert_history` Table
Tracks all sent alerts with types: "monitor_failure", "monitor_recovery", "ssl_expiring"

---

## 2. MONITOR EXECUTION FLOW (Complete Lifecycle)

### A. Monitor Scheduling (App Service)

**File:** `/app/src/lib/monitor-scheduler.ts`

#### Step 1: Monitor Creation/Update
```
User creates monitor in UI
    ↓
API route processes request
    ↓
createMonitorHandler() or updateMonitorHandler() in monitor-service.ts
    ↓
Validates monitor data with Zod schema
    ↓
Inserts/updates monitor in database
    ↓
scheduleMonitor() in monitor-scheduler.ts
```

#### Step 2: Scheduling with BullMQ
```typescript
// Creates repeatable job in Redis
monitorSchedulerQueue.add(
  `scheduled-monitor-${monitorId}`,
  {
    monitorId,
    jobData,
    frequencyMinutes,
    retryLimit: 3
  },
  {
    repeat: {
      every: frequencyMinutes * 60 * 1000  // Convert to milliseconds
    },
    removeOnComplete: true,
    removeOnFail: 100,
    jobId: schedulerJobName
  }
);

// Returns monitorId to store in database
```

**Key Functions:**
- `scheduleMonitor()` - Creates repeatable BullMQ job
- `deleteScheduledMonitor()` - Removes repeatable jobs
- `initializeMonitorSchedulers()` - Startup function to reschedule all active monitors
- `cleanupMonitorScheduler()` - Cleanup function for shutdown

#### Step 3: Immediate Execution (on creation/update)
```
triggerImmediateMonitorExecution(monitorId)
    ↓
Validates monitor is enabled and not paused
    ↓
addMonitorExecutionJobToQueue(jobData)
    ↓
Adds to Redis queue for immediate execution
```

---

### B. Monitor Scheduler Processor (Worker Service)

**File:** `/worker/src/scheduler/processors/monitor-scheduler.processor.ts`

When the repeatable job triggers:
```
Scheduler timer fires
    ↓
MonitorSchedulerProcessor receives job
    ↓
Adds MonitorJobDataDto to execution queue
    ↓
Triggers worker processor
```

---

### C. Monitor Execution (Worker Service)

**Files:**
- `/worker/src/monitor/monitor.processor.ts` - Job handler
- `/worker/src/monitor/monitor.service.ts` - Execution logic

#### Step 1: Job Processing
```typescript
@Processor(MONITOR_EXECUTION_QUEUE)
export class MonitorProcessor extends WorkerHost {
  async process(job: Job<MonitorJobDataDto>): Promise<MonitorExecutionResult | null> {
    return this.monitorService.executeMonitor(job.data);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: MonitorExecutionResult) {
    this.monitorService.saveMonitorResult(result);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    // Log error
  }
}
```

#### Step 2: Execution by Type

**HTTP Request Monitor:**
```
executeMonitor() 
    ↓
Case: 'http_request'
    ↓
executeHttpRequest(target, config)
    ↓
1. Validate target URL (SSRF protection)
2. Validate monitor configuration
3. Create Axios request with:
   - Headers (User-Agent, Accept, etc.)
   - Authentication (Basic, Bearer)
   - Request body (POST/PUT/PATCH)
   - Timeout (default 30s)
   - Max redirects (5)
4. Execute request with high-resolution timing
5. Parse response:
   - Check status code against expectedStatusCodes
   - Search for keywords in response body
   - Extract response headers
   - Parse JSON paths if configured
6. Return result with responseTimeMs
```

**Website Monitor:**
```
Same as HTTP request PLUS:
1. Default to GET method
2. Default to 200-299 status codes
3. If enableSslCheck is true:
   a. Check SSL certificate validity
   b. Verify expiration date
   c. Calculate days remaining
   d. Check against warning threshold
   e. Handle certificate errors separately
4. Return combined result
```

**Ping Host Monitor:**
```
executePingHost(target, config)
    ↓
1. Validate target (prevent command injection)
2. Determine OS (Windows vs Linux/Mac)
3. Execute ping command:
   - Windows: ping -n 1 -w timeout target
   - Linux/Mac: ping -c 1 -W timeout target
4. Parse response time from output
5. Return up/down status
```

**Port Check Monitor:**
```
executePortCheck(target, config)
    ↓
TCP Check:
1. Create net.Socket()
2. Connect to target:port with timeout
3. Measure connection time
4. Return up on successful connect

UDP Check:
1. Create dgram socket
2. Send test packet
3. Wait for response or timeout
4. Return up on successful send
```

**Synthetic Test Monitor:**
```
executeSyntheticTest(monitorId, config)
    ↓
1. Validate testId in config
2. Fetch test from database
3. Decode Base64-encoded Playwright script
4. Execute test using ExecutionService
5. Capture testExecutionId and reportUrl
6. Return result with test metadata
```

#### Step 3: Result Processing
```typescript
async saveMonitorResult(result: MonitorExecutionResult) {
  1. Fetch previous result for comparison
  2. Calculate consecutive failure count
  3. Determine if status changed
  4. Save result to database
  5. Update monitor status and lastCheckAt
  6. Check alert thresholds:
     - If down: Send failure alert if threshold met
     - If up + was down: Send recovery alert
  7. Check SSL expiration alerts
  8. Update alert counters (max 3 per sequence)
}
```

---

## 3. MONITOR TYPES AND EXECUTION DETAILS

### A. HTTP Request (http_request)
- **Target Format:** Full URL (http://example.com or https://api.example.com/v1/health)
- **Configuration:** Method, headers, body, auth, expected status codes
- **Default Timeout:** 30 seconds
- **Response Time:** Measured in milliseconds
- **Validation:** 
  - SSRF protection (blocks internal IPs unless ALLOW_INTERNAL_TARGETS=true)
  - Keyword matching in response body
  - JSON path assertions
  - Response size limits (stored only 1000 char snippets)

### B. Website (website)
- **Target Format:** Full URL with HTTPS preferred
- **Configuration:** Same as HTTP + SSL checking
- **Default Status Codes:** 200-299
- **SSL Checking:**
  - Validates certificate validity
  - Calculates days until expiration
  - Smart frequency (more often when nearing expiration)
  - Separate alert for SSL expiration warnings
- **Default Timeout:** 30 seconds

### C. Ping Host (ping_host)
- **Target Format:** Hostname or IP address
- **Execution:** OS-specific ping command
- **Response Time:** Extracted from ping output
- **Validation:** Hostname/IP validation to prevent command injection
- **Default Timeout:** 5 seconds

### D. Port Check (port_check)
- **Target Format:** Hostname or IP address
- **Configuration:** port (1-65535), protocol (tcp/udp)
- **TCP:** Socket connection attempt
- **UDP:** Sends test packet, inherently unreliable
- **Default Timeout:** 10 seconds

### E. Synthetic Test (synthetic_test)
- **Target:** Test ID (stored in config.testId)
- **Configuration:** Playwright script (Base64-encoded)
- **Execution:** Runs via existing ExecutionService
- **Results Include:**
  - Test execution ID (for report access)
  - S3 URL to test report (HTML/JSON)
  - Test logs (truncated to 500 chars)
  - Execution time
- **Default Timeout:** From test configuration

---

## 4. FRONTEND DISPLAY AND MONITOR RESULTS

### A. Monitor Detail Components

**Files:**
- `/app/src/components/monitors/monitor-detail-client.tsx` - Main detail view
- `/app/src/components/monitors/monitor-chart.tsx` - Result visualization
- `/app/src/components/monitors/response-time-line-chart.tsx` - Response time graph
- `/app/src/components/monitors/AvailabilityBarChart.tsx` - Uptime visualization

### B. Result Display Features

1. **Status Timeline:**
   - Recent 30-day history of up/down status
   - Visual indicators (green for up, red for down)
   - Response time overlay

2. **Response Time Charts:**
   - Line chart with time on X-axis
   - Response time in milliseconds on Y-axis
   - Trends over last 7, 14, or 30 days

3. **Availability Metrics:**
   - Daily uptime percentage
   - Success/failure counts
   - Average response time

4. **Result Details:**
   - Last check timestamp
   - Current status
   - Response status code (HTTP)
   - Error messages
   - SSL certificate details (if available)
   - Response body snippet (truncated)

### C. Data Fetching Flow

```
MonitorDetailClient Component
    ↓
useEffect hook triggers on mount
    ↓
Fetch monitor details via API
    ↓
Fetch recent results (last 30-60 days)
    ↓
Format data for charts
    ↓
Render with Recharts visualization
```

---

## 5. ALERTING SYSTEM

### Alert Configuration

**Location:** `AlertConfig` in schema (lines 298-309)

```typescript
{
  enabled: boolean
  notificationProviders: string[] // Provider IDs
  alertOnFailure: boolean
  alertOnRecovery: boolean
  alertOnSslExpiration: boolean
  alertOnSuccess: boolean
  alertOnTimeout: boolean
  failureThreshold: number // Consecutive failures before alert
  recoveryThreshold: number
  customMessage?: string
}
```

### Alert Logic

**Failure Alerts:**
1. First alert: When status changes from up to down
2. Subsequent alerts: Every X failures (based on threshold)
3. Maximum 3 alerts per failure sequence

**Recovery Alerts:**
1. Send when status changes from down to up
2. Only if `alertOnRecovery` is enabled

**SSL Expiration Alerts:**
1. Check independently of monitor status
2. Alert when days remaining <= warning threshold
3. Rate-limited to once per day

### Notification Channels

**Types:**
- Email
- Slack
- Webhook
- Telegram
- Discord

**Processing:**
```
saveMonitorResult()
    ↓
Check alert thresholds
    ↓
monitorAlertService.sendNotification()
    ↓
Send to configured providers
    ↓
Log in alertHistory table
```

---

## 6. CURRENT ARCHITECTURE LIMITATIONS

### A. No Multi-Location Support
- **Reserved Field:** `config.regions?: string[]` exists but is unused
- **Current State:** All monitors execute from single worker instance
- **Impact:** 
  - No geographic redundancy
  - Single point of failure for monitoring
  - No latency measurement from different regions
  - Cannot detect regional outages

### B. Single Execution Per Monitor
- Each monitor executes once per frequency interval
- No parallel execution from multiple locations
- Cannot measure response time variance across regions

### C. Result Storage
- All results stored in single `monitor_results` table
- No location/region dimension in results
- Cannot compare performance across regions

---

## 7. DATABASE QUERY PATTERNS

### Common Queries (from code)

```typescript
// Get monitor by ID
db.query.monitors.findFirst({
  where: eq(monitors.id, monitorId)
})

// Get recent results
db.query.monitorResults.findMany({
  where: eq(monitorResults.monitorId, monitorId),
  orderBy: [desc(monitorResults.checkedAt)],
  limit: 50
})

// Get all active monitors (for initialization)
db.select().from(monitors).where(and(
  isNotNull(monitors.frequencyMinutes),
  eq(monitors.enabled, true),
  ne(monitors.status, 'paused')
))

// Get last result
db.query.monitorResults.findFirst({
  where: eq(monitorResults.monitorId, monitorId),
  orderBy: [desc(monitorResults.checkedAt)]
})
```

---

## 8. CONFIGURATION AND ENVIRONMENT

### BullMQ Queues

```typescript
// In queue configuration
{
  monitorSchedulerQueue: // Handles periodic scheduling
  monitorExecutionQueue: // Handles actual execution
}
```

### Environment Variables

From `/app/.env` or docker-compose:
```
REDIS_URL or REDIS_HOST/REDIS_PORT
DATABASE_URL
S3_BUCKET (for test reports)
TEST_EXECUTION_TIMEOUT_MS
RUNNING_CAPACITY (parallel test limit)
ALLOW_INTERNAL_TARGETS (default: false, for SSRF)
```

---

## 9. ERROR HANDLING AND RESILIENCE

### Timeout Handling
- Default timeouts per monitor type (30s HTTP, 5s ping, 10s port check)
- Measured with high-resolution timers (process.hrtime)
- Records actual measured time even on timeout

### Failure Recovery
- Scheduled jobs removed on completion/failure
- Automatic retry with exponential backoff
- Failed jobs tracked with error messages in database

### Resource Management
- Response size limits (prevents memory exhaustion)
- Connection pooling for HTTP requests
- Process timeouts prevent hanging

### Security
- SSRF protection for URL validation
- Command injection prevention for ping/port checks
- Credential masking in logs
- Response body sanitization (redacts emails, SSNs, credit cards)

---

## 10. SCALING CONSIDERATIONS

### Current Bottlenecks
1. Single worker instance (can be scaled horizontally with Redis coordination)
2. Database writes on every result (could batch)
3. No result aggregation (queried from raw results)

### Ready for Scaling
- BullMQ queue system supports multiple workers
- Database schema supports sharding by organizationId/projectId
- Monitor execution is stateless

### Future Multi-Location Enhancement
- Add `monitorLocationResults` table with region/location dimension
- Extend `executeMonitor()` to accept location parameter
- Modify scheduler to trigger per-location execution
- Update alerting to consider multi-location results
- New dashboard views for geographic performance

---

## 11. KEY FILES REFERENCE

| File | Purpose |
|------|---------|
| `/app/src/db/schema/schema.ts` | Database schema (monitors, monitorResults) |
| `/app/src/lib/monitor-service.ts` | CRUD operations and scheduling logic |
| `/app/src/lib/monitor-scheduler.ts` | BullMQ job scheduling |
| `/worker/src/monitor/monitor.service.ts` | Execution logic for all monitor types |
| `/worker/src/monitor/monitor.processor.ts` | BullMQ job processor |
| `/app/src/components/monitors/*` | Frontend UI components |
| `/app/src/app/api/monitors/` | API routes for monitor management |

---

## 12. EXECUTION EXAMPLE FLOW

```
5-minute interval timer fires in Redis
    ↓
MonitorSchedulerProcessor.process()
    ↓
Gets monitor data from database
    ↓
Creates MonitorJobDataDto
    ↓
Adds to monitorExecutionQueue
    ↓
MonitorProcessor.process() picks up job
    ↓
MonitorService.executeMonitor() routes to type handler:
    
    For HTTP: executeHttpRequest()
    ├─ Validate URL
    ├─ Create Axios config
    ├─ Execute request
    ├─ Parse response
    ├─ Check status and keywords
    └─ Return result
    
    For Website: executeHttpRequest() + executeSslCheck()
    ├─ Check HTTP status
    ├─ Validate SSL certificate
    ├─ Calculate days until expiration
    └─ Merge results
    
    For Ping: executePingHost()
    ├─ Validate hostname
    ├─ Execute ping command
    ├─ Parse response time
    └─ Return result
    
    For Port: executePortCheck()
    ├─ Validate target and port
    ├─ Create socket connection
    ├─ Measure connection time
    └─ Return result
    
    For Synthetic: executeSyntheticTest()
    ├─ Fetch test from database
    ├─ Decode script
    ├─ Execute via ExecutionService
    └─ Capture report metadata
    ↓
MonitorProcessor.onCompleted()
    ↓
MonitorService.saveMonitorResult()
    ├─ Save to monitorResults table
    ├─ Update monitor status/lastCheckAt
    ├─ Check failure/recovery thresholds
    ├─ Check SSL expiration alerts
    └─ Send notifications if needed
    ↓
Result stored and alerts sent
```

---

## Summary

The Supercheck monitoring system is a sophisticated, distributed architecture that:

1. **Schedules** monitors using Redis-backed repeating jobs
2. **Executes** 5 monitor types (HTTP, Website, Ping, Port, Synthetic)
3. **Stores** detailed results with status, response time, and error information
4. **Alerts** users via multiple channels (email, Slack, webhooks) based on configurable thresholds
5. **Visualizes** monitoring data through interactive charts and status timelines
6. **Scales** horizontally with Redis and BullMQ coordination

The architecture is ready for multi-location enhancement with reserved configuration fields and extensible result structure, but currently executes all monitors from a single worker instance.

