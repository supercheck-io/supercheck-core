# Alerts and Notifications System

This document provides a comprehensive overview of the alerts and notifications system in Supercheck, including configuration, implementation, and best practices for monitoring alerts and job notifications.

## Table of Contents

1. [System Overview](#system-overview)
2. [Alert Configuration Validation](#alert-configuration-validation)
3. [Monitor Alerting Flow](#monitor-alerting-flow)
4. [Job Alerting Flow](#job-alerting-flow)
5. [Threshold Logic](#threshold-logic)
6. [Notification Provider Types](#notification-provider-types)
7. [Notification Provider Creation](#notification-provider-creation)
8. [Notification Channel Limits](#notification-channel-limits)
9. [Database Schema](#database-schema)
10. [Alert History and Monitoring](#alert-history-and-monitoring)
11. [Error Handling and Resilience](#error-handling-and-resilience)
12. [Configuration Best Practices](#configuration-best-practices)

## System Overview

The Supercheck alerts and notifications system is built on a distributed architecture with two main components:

1. **`app` (Next.js Frontend):** The user-facing application where users configure monitors, jobs, and their respective alert settings. It includes the API endpoints for alert configuration and notification provider management.
2. **`worker` (NestJS Worker Service):** A background worker service responsible for executing monitors and jobs, evaluating alert conditions, and dispatching notifications through configured providers.

The services communicate via **Redis** and **BullMQ** for reliable message queuing, with **PostgreSQL** storing all configuration and audit data. The system supports multiple notification channels including email, Slack, webhooks, Telegram, Discord, and Microsoft Teams.

## Alert Configuration Validation

### Validation Requirements

When alerts are enabled for either monitors or jobs, the following validation rules apply:

1. **At least one notification provider must be selected**: Users must choose at least one notification provider (email, Slack, webhook, etc.) to receive alerts.

2. **At least one alert type must be selected**: Users must select at least one of the following alert types:
   - For monitors: `alertOnFailure`, `alertOnRecovery`, `alertOnSslExpiration`
   - For jobs: `alertOnFailure`, `alertOnSuccess`, `alertOnTimeout`

### Implementation

Validation is implemented at multiple levels:

1. **Frontend Validation**: Real-time validation in the AlertSettings component shows error messages when requirements are not met.

2. **Form Submission Validation**: Job and monitor forms prevent submission when validation fails, showing toast error messages.

3. **Server-Side Validation**: API routes and server actions validate alert configurations before saving to the database.

### Default Provider Removal

The system no longer supports default notification providers. Each notification provider must be explicitly configured and selected for each monitor or job. This ensures users have full control over their alert configurations and prevents confusion about which providers are being used.

## Monitor Alerting Flow

The monitor alerting flow is a sophisticated process designed to be robust and scalable. It can be broken down into the following stages:

### 1. Configuration

- **Where:** `app` (Frontend UI)
- **How:** Users create or edit a monitor and configure its `alertConfig`. This configuration is stored as a JSONB object in the `alertConfig` column of the `monitors` table in the database.

**Key `alertConfig` properties:**
- `enabled`: A boolean to toggle alerts for the monitor.
- `notificationProviders`: An array of `notification_provider` IDs to send alerts to.
- `alertOnFailure`: A boolean to send an alert when the monitor status changes to `down`.
- `alertOnRecovery`: A boolean to send an alert when the monitor status changes from `down` to `up`.
- `failureThreshold`: Number of consecutive failures before an alert is sent (default: 1).
- `recoveryThreshold`: Number of consecutive successes before a recovery alert is sent (default: 1).
- `customMessage`: Optional custom message to include in notifications.

### 2. Scheduling

- **Where:** `app` (Frontend UI)
- **How:** When a monitor is created or updated, the system schedules it using BullMQ repeatable jobs.
- **Component:** `app/src/lib/monitor-scheduler.ts`
- **Logic:** When a scheduled job fires, the `MonitorSchedulerProcessor`'s only responsibility is to add a *new, one-time* job to the `monitor-execution` queue. This pattern effectively creates a distributed cron system.

### 3. Execution

- **Where:** `worker`
- **How:** The `MonitorProcessor` listens for jobs on the `monitor-execution` queue.
- **Component:** `worker/src/monitor/monitor.processor.ts`
- **Logic:**
    1. The `process` method picks up the job.
    2. It calls `this.monitorService.executeMonitor(job.data)`.
    3. The `executeMonitor` method in `worker/src/monitor/monitor.service.ts` performs the actual check (e.g., HTTP request, ping) and returns a `MonitorExecutionResult`.
    4. Upon successful completion of the job, the `onCompleted` event handler in `MonitorProcessor` is triggered.

### 4. Result Processing & Alert Triggering

- **Where:** `worker`
- **How:** The `onCompleted` handler in `MonitorProcessor` calls `this.monitorService.saveMonitorResult(result)`.
- **Component:** `worker/src/monitor/monitor.service.ts`
- **Logic (`saveMonitorResult`):**
    1. The new result is saved to the `monitor_results` table.
    2. The `status` on the `monitors` table is updated.
    3. It compares the `currentStatus` (`up`/`down`) with the `previousStatus`.
    4. **Threshold Logic:** If `isStatusChange` is `true` and `monitor.alertConfig.enabled` is `true`, it fetches recent monitor results and calculates consecutive failures/successes.
    5. **Alert Conditions:** An alert is sent only if:
       - For failures: `alertOnFailure` is true AND consecutive failures >= `failureThreshold`
       - For recoveries: `alertOnRecovery` is true AND consecutive successes >= `recoveryThreshold`
    6. If conditions are met, it calls `this.monitorAlertService.sendNotification(...)`.

### 5. Notification Dispatch

- **Where:** `worker`
- **How:** The `MonitorAlertService` is responsible for preparing and sending the notification.
- **Components:**
    - `worker/src/monitor/services/monitor-alert.service.ts`
    - `worker/src/notification/notification.service.ts` (generic service)
- **Logic:**
    1. `sendNotification` in `MonitorAlertService` retrieves the full monitor details.
    2. It queries the `monitor_notification_settings` join table to get associated notification providers.
    3. It constructs a `NotificationPayload` containing details like title, message, severity, and metadata. It will use `customMessage` from `alertConfig` if present.
    4. It then calls the generic `this.notificationService.sendNotificationToMultipleProviders(...)`.
    5. This generic service iterates through the providers (e.g., Slack, Email) and sends the notification using the specific logic for each provider type.
    6. **Alert History:** After sending notifications, it saves a record to the `alert_history` table with the notification status and any error messages.

### Flow Diagram: Monitor Alerting

```mermaid
graph TD
    subgraph "app (Next.js)"
        A[User configures alert in UI] --> B{monitors.alertConfig};
        B --> C[api/monitors route];
        C --> D[DB: monitors table];
        C --> E[DB: monitor_notification_settings];
    end

    subgraph "worker (NestJS)"
        F(MonitorSchedulerProcessor) -- "Listens for schedules" --> G[monitor-scheduler queue];
        D -- "Reads config" --> G;
        G -- "On schedule fire" --> H[Adds one-time job];
        H --> I[monitor-execution queue];
        
        J(MonitorProcessor) -- "Picks up job" --> I;
        J -- "Executes check via" --> K(MonitorService);
        K -- "On status change" --> L[Check thresholds];
        L -- "Thresholds met" --> M(MonitorAlertService);
        M -- "Get providers from" --> P[monitor_notification_settings];
        M -- "Uses generic" --> Q(NotificationService);
        Q -- "Sends to providers" --> R((Slack, Email, etc.));
        Q -- "Save history" --> S[alert_history];
    end

    style app fill:#e1f0ff,stroke:#333
    style worker fill:#f1f1f1,stroke:#333
```

## Job Alerting Flow

Job alerting follows a similar pattern but is triggered by the completion of a test job rather than a scheduled monitor.

- **Trigger:** A job execution is completed by the `JobExecutionProcessor`.
- **Component:** `worker/src/execution/processors/job-execution.processor.ts`
- **Logic (`handleJobNotifications`):**
    1. After a job finishes, the processor retrieves the job's configuration, which includes an `alertConfig` similar to monitors. This config is stored on the `jobs` table.
    2. It retrieves the associated notification providers from the `job_notification_settings` join table.
    3. **Threshold Logic:** Job alerting explicitly checks for `failureThreshold` and `recoveryThreshold`. It fetches recent job runs and counts consecutive successes or failures.
    4. **Alert Triggering:** An alert is sent only if the number of consecutive statuses meets the configured threshold (e.g., alert on the 3rd consecutive failure).
    5. **Dispatch:** If an alert is warranted, it constructs a `NotificationPayload` and uses the same generic `NotificationService` to send it.
    6. **Alert History:** After sending notifications, it saves a record to the `alert_history` table.

### Key Differences from Monitor Alerting

- **Trigger:** Job completion vs. scheduled monitor check.
- **Thresholds:** Both job and monitor alerting now use the same threshold implementation that considers consecutive run statuses.
- **Configuration:** Stored on the `jobs` table instead of the `monitors` table.
- **Data Source:** Job alerting uses `runs` table for threshold calculation, while monitor alerting uses `monitor_results` table.

## Threshold Logic

The threshold logic prevents alert spam by ensuring alerts are only sent after a specified number of consecutive failures or successes.

### How Threshold Logic Works

1. **Data Collection:** The system fetches recent results (monitor checks or job runs) ordered by timestamp.
2. **Consecutive Counting:** It counts consecutive failures or successes starting from the most recent result.
3. **Threshold Check:** An alert is only sent if the consecutive count meets or exceeds the configured threshold.
4. **Status Reset:** When the status changes (e.g., from failure to success), the consecutive count resets.

### Threshold Example

**Scenario:** Monitor with `failureThreshold: 3`, checking every 5 minutes

```
10:00 AM: Monitor Down → No Alert (1 consecutive < threshold)
10:05 AM: Still Down → No Alert (2 consecutive < threshold)
10:10 AM: Still Down → Alert Sent (3 consecutive = threshold)
10:15 AM: Still Down → No Alert (deduplication prevents spam)
10:20 AM: Monitor Up → Recovery Alert Sent (1 consecutive = threshold)
```

### Threshold Benefits

- **Prevents False Alarms:** Requires multiple consecutive failures before alerting
- **Reduces Alert Noise:** Avoids alerting on temporary issues
- **Configurable Sensitivity:** Different thresholds for different types of monitors/jobs
- **Recovery Detection:** Separate thresholds for failure and recovery alerts

## Notification Provider Types

The system supports multiple notification provider types:

### Email
- **Configuration:** Environment-based SMTP and Resend configuration
- **Use Case:** Professional email notifications with automatic fallback
- **Features:** 
  - Dual delivery methods (SMTP primary, Resend fallback)
  - Professional HTML templates with responsive design
  - Automatic fallback for enhanced reliability
  - Batch processing for multiple recipients
  - Environment-controlled enable/disable toggles
  - Security-focused configuration (no hardcoded credentials)

### Slack
- **Configuration:** Webhook URL, channel name
- **Use Case:** Team collaboration, real-time notifications
- **Features:** Rich formatting, @mentions, custom emojis

### Webhook
- **Configuration:** URL, HTTP method, headers, body template
- **Use Case:** Integration with external systems
- **Features:** Custom payloads, authentication

### Telegram
- **Configuration:** Bot token, chat ID
- **Use Case:** Mobile notifications, personal alerts
- **Features:** Instant delivery, mobile-friendly

### Discord
- **Configuration:** Webhook URL
- **Use Case:** Gaming communities, developer teams
- **Features:** Rich embeds, custom formatting

### Microsoft Teams
- **Configuration:** Webhook URL
- **Use Case:** Corporate team communication, business alerts
- **Features:** MessageCard format, action buttons, rich formatting

## Notification Provider Creation

### Supported Provider Types

The system supports the following notification provider types:

- **email**: Dual-method email notifications (SMTP + Resend fallback)
- **slack**: Slack webhook notifications
- **webhook**: Generic HTTP webhook notifications
- **telegram**: Telegram bot notifications
- **discord**: Discord webhook notifications
- **teams**: Microsoft Teams webhook notifications

### Database Schema

#### Notification Providers Table

```sql
CREATE TABLE notification_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organization(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES user(id) ON DELETE NO ACTION,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Required Fields

- **name**: Human-readable name for the provider (e.g., "Production Slack Alerts")
- **type**: One of the supported provider types
- **config**: JSON configuration specific to the provider type
- **organizationId**: The organization this provider belongs to
- **createdByUserId**: The user who created this provider

### API Endpoints

#### Create Notification Provider

**Endpoint**: `POST /api/notification-providers`

**Request Body**:
```json
{
  "name": "Production Slack Alerts",
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/...",
    "channel": "#alerts",
    "isDefault": false
  },
  "organizationId": "uuid",
  "createdByUserId": "uuid"
}
```

**Response**:
```json
{
  "id": "uuid",
  "name": "Production Slack Alerts",
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/...",
    "channel": "#alerts",
    "isDefault": false
  },
  "organizationId": "uuid",
  "createdByUserId": "uuid",
  "isEnabled": true,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### Get Notification Providers

**Endpoint**: `GET /api/notification-providers`

**Response**:
```json
[
  {
    "id": "uuid",
    "name": "Production Slack Alerts",
    "type": "slack",
    "config": { ... },
    "organizationId": "uuid",
    "createdByUserId": "uuid",
    "isEnabled": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "lastUsed": "2024-01-01T12:00:00Z"
  }
]
```

### Provider-Specific Configuration

#### Email Provider

The email notification system supports dual delivery methods with automatic fallback between SMTP and Resend for enhanced reliability.

```json
{
  "type": "email",
  "config": {
    "emails": "admin@company.com, team@company.com, alerts@company.com",
    "isDefault": false
  }
}
```

#### Email Provider Configuration

The system uses environment variables for email configuration and supports both SMTP and Resend delivery methods:

**SMTP Configuration (Primary Method):**
- `SMTP_ENABLED` - Enable/disable SMTP delivery (default: true)
- `SMTP_HOST` - SMTP server hostname (e.g., "smtp.gmail.com")
- `SMTP_PORT` - SMTP server port (default: 587)
- `SMTP_USER` - SMTP username/email
- `SMTP_PASSWORD` - SMTP password or app password
- `SMTP_SECURE` - "true" for SSL (port 465), "false" for STARTTLS (default: false)
- `SMTP_FROM_EMAIL` - Sender email address (optional, defaults to SMTP_USER)

**Resend Configuration (Fallback Method):**
- `RESEND_ENABLED` - Enable/disable Resend delivery (default: true)
- `RESEND_API_KEY` - Resend service API key
- `RESEND_FROM_EMAIL` - Sender email address for Resend (must be from verified domain)

#### Email Delivery Behavior

1. **Primary Delivery**: The system first attempts to send emails via SMTP if configured and enabled
2. **Fallback Delivery**: If SMTP fails or is disabled, the system automatically falls back to Resend
3. **Dual Redundancy**: Both methods can be enabled simultaneously for maximum reliability
4. **Professional Templates**: All emails use responsive HTML templates with consistent branding
5. **Batch Processing**: Resend emails are sent in batches of up to 10 recipients for optimal performance

#### Email Template Features

- **Responsive Design**: Professional HTML templates that work across all email clients
- **Status Icons**: Visual indicators for different alert types (failure, recovery, SSL expiration)
- **Color-Coded Badges**: Status badges with appropriate colors for quick identification
- **Detailed Information**: Comprehensive alert details in a structured table format
- **Dashboard Links**: Direct links to relevant dashboard sections for easy navigation
- **Plain Text Fallback**: Automatic plain text versions for clients that don't support HTML

#### Slack Provider

```json
{
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
    "channel": "#alerts",
    "isDefault": false
  }
}
```

#### Webhook Provider

```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.company.com/webhooks/alerts",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer token",
      "Content-Type": "application/json"
    },
    "bodyTemplate": "{\"alert\": \"{{message}}\", \"timestamp\": \"{{timestamp}}\"}",
    "isDefault": false
  }
}
```

#### Telegram Provider

```json
{
  "type": "telegram",
  "config": {
    "botToken": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
    "chatId": "123456789",
    "isDefault": false
  }
}
```

#### Discord Provider

```json
{
  "type": "discord",
  "config": {
    "discordWebhookUrl": "https://discord.com/api/webhooks/...",
    "isDefault": false
  }
}
```

#### Microsoft Teams Provider

```json
{
  "type": "teams",
  "config": {
    "teamsWebhookUrl": "https://your-org.webhook.office.com/webhookb2/...",
    "isDefault": false
  }
}
```

### Frontend Integration

#### Form Validation

The frontend should validate:

1. **Name**: Required, max 255 characters
2. **Type**: Must be one of the supported types
3. **Config**: Must contain required fields for the selected type
4. **Organization**: Must be a valid organization ID
5. **Created By User**: Must be a valid user ID

#### Error Handling

Common validation errors:

- Missing required fields
- Invalid provider type
- Invalid configuration for the selected type
- Organization not found
- User not found
- Duplicate provider name within organization

#### Email Provider Testing

The system includes comprehensive testing for email providers:

**Test API Endpoint**: `POST /api/notification-providers/test`

```json
{
  "type": "email",
  "config": {
    "emails": "test@example.com"
  }
}
```

**Test Response**:
```json
{
  "success": true,
  "message": "Email connection successful via SMTP and Resend. Test email sent to test@example.com.",
  "details": {
    "smtp": {
      "success": true,
      "message": "SMTP connection successful",
      "error": ""
    },
    "resend": {
      "success": true,
      "message": "Resend connection successful (ID: abc123)",
      "error": ""
    }
  }
}
```

**Test Features**:
- Tests both SMTP and Resend connections
- Sends actual test emails to verify delivery
- Provides detailed results for each method
- Validates email address format
- Respects environment variable settings
- Security checks prevent localhost connections

#### Success Flow

1. User fills out the notification provider form
2. Frontend validates the input
3. Frontend sends POST request to `/api/notification-providers`
4. Backend validates the data using `notificationProvidersInsertSchema`
5. Backend inserts the provider into the database
6. Backend returns the created provider with status 201
7. Frontend shows success message and redirects to providers list

### Usage in Alerts

Once created, notification providers can be:

1. **Assigned to monitors** via the `monitorNotificationSettings` table
2. **Assigned to jobs** via the `jobNotificationSettings` table
3. **Referenced in alert configurations** via the `alerts` table

#### Monitor Integration

```sql
INSERT INTO monitor_notification_settings (monitor_id, notification_provider_id)
VALUES ('monitor-uuid', 'provider-uuid');
```

#### Job Integration

```sql
INSERT INTO job_notification_settings (job_id, notification_provider_id)
VALUES ('job-uuid', 'provider-uuid');
```

## Notification Channel Limits

### Environment Variables

**Email Notification Environment Variables:**
- `SMTP_ENABLED` - Enable/disable SMTP delivery (default: true)
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (default: 587)
- `SMTP_USER` - SMTP username/email
- `SMTP_PASSWORD` - SMTP password or app password
- `SMTP_SECURE` - "true" for SSL, "false" for STARTTLS (default: false)
- `SMTP_FROM_EMAIL` - Sender email address (optional, defaults to SMTP_USER)
- `RESEND_ENABLED` - Enable/disable Resend delivery (default: true)
- `RESEND_API_KEY` - Resend service API key
- `RESEND_FROM_EMAIL` - Sender email address for Resend (must be from verified domain)

**Notification Channel Limits:**
- `MAX_JOB_NOTIFICATION_CHANNELS` - Maximum channels for jobs (default: 10)
- `MAX_MONITOR_NOTIFICATION_CHANNELS` - Maximum channels for monitors (default: 10)
- `NEXT_PUBLIC_MAX_JOB_NOTIFICATION_CHANNELS` - Frontend limit for jobs (default: 10)
- `NEXT_PUBLIC_MAX_MONITOR_NOTIFICATION_CHANNELS` - Frontend limit for monitors (default: 10)

### Implementation Details

#### 1. Environment Variable Configuration

**Files Modified:**
- All API routes and components now use environment variables instead of hardcoded constants
- Frontend components use `NEXT_PUBLIC_` prefixed variables
- Backend API routes use non-prefixed variables

#### 2. Frontend Validation

**Files Modified:**
- `app/src/components/alerts/alert-settings.tsx`
- `app/src/components/jobs/job-creation-wizard.tsx`
- `app/src/components/jobs/edit-job.tsx`
- `app/src/components/monitors/monitor-form.tsx`
- `app/src/components/monitors/monitor-creation-wizard.tsx`

**Changes:**
- Added toast error message when trying to select more than the configured limit
- Added channel count display showing "X of Y channels selected"
- Updated `toggleProvider` function to check limit before adding channels
- **New UI Features:**
  - 4-column grid layout for notification channels
  - Pagination with 8 items per page (4 columns × 2 rows)
  - Page navigation with previous/next buttons
  - Automatic page reset when providers change

#### 3. Server-Side Validation

**Files Modified:**
- `app/src/app/api/jobs/route.ts`
- `app/src/app/api/jobs/[id]/route.ts`
- `app/src/app/api/monitors/route.ts`
- `app/src/app/api/monitors/[id]/route.ts`
- `app/src/actions/update-job.ts`

**Changes:**
- Added validation to check notification provider count before saving
- Returns 400 error with descriptive message when limit is exceeded
- Validation applies to both creation and update operations
- Uses environment variables for configurable limits

#### 4. User Experience Features

**Toast Messages:**
- "Channel limit reached" with description showing the configured limit
- Appears when user tries to select more than the allowed channels

**UI Indicators:**
- Channel count display: "X of Y channels selected"
- **Removed:** "Maximum X channels allowed" text as requested
- **New:** 4-column grid layout with pagination
- **New:** Page navigation with current page indicator

**Pagination Features:**
- 8 items per page (4 columns × 2 rows)
- Previous/Next navigation buttons
- Current page indicator
- Automatic reset to page 1 when providers change
- Disabled state for navigation buttons when at limits

### Validation Flow

1. **Frontend Validation:**
   - Real-time validation in AlertSettings component
   - Toast error when trying to exceed limit
   - Form submission validation in wizards and edit forms
   - Uses `NEXT_PUBLIC_` environment variables

2. **Server-Side Validation:**
   - API route validation before database operations
   - Consistent error messages across all endpoints
   - Validation for both jobs and monitors
   - Uses non-prefixed environment variables

3. **Database Level:**
   - Schema documentation indicates configurable limits
   - No database constraints (relying on application-level validation)

### Error Messages

**Frontend Toast:**
```
"Channel limit reached"
"You can only select up to X notification channels"
```

**API Error Response:**
```json
{
  "error": "You can only select up to X notification channels"
}
```

### UI Improvements

#### Grid Layout
- **4 columns** on extra-large screens (xl:grid-cols-4)
- **3 columns** on large screens (lg:grid-cols-3)
- **2 columns** on small screens (sm:grid-cols-2)
- **1 column** on mobile (grid-cols-1)

#### Pagination
- **8 items per page** (4 columns × 2 rows)
- **Navigation buttons** with chevron icons
- **Page indicator** showing "Page X of Y"
- **Disabled states** for navigation when at limits
- **Auto-reset** to page 1 when providers change

### Benefits

1. **Configurable Limits:** Different limits for jobs vs monitors
2. **Environment-Based:** Easy to configure per environment
3. **Better UX:** 4-column layout and pagination for better organization
4. **Performance:** Limits the number of notifications sent per alert
5. **User Experience:** Prevents overwhelming users with too many channels
6. **System Stability:** Reduces load on notification services
7. **Cost Control:** Limits potential costs from excessive notifications

## Database Schema

The core tables supporting this system are:

- **`monitors`**: Stores monitor configurations, including the `alertConfig` JSONB field.
- **`jobs`**: Stores job configurations, also with an `alertConfig` field.
- **`notification_providers`**: Stores the configuration for each notification channel (e.g., Slack webhook URL, SMTP server details).
- **`monitor_notification_settings`**: A many-to-many join table linking `monitors` to `notification_providers`.
- **`job_notification_settings`**: A many-to-many join table linking `jobs` to `notification_providers`.
- **`alert_history`**: Stores a log of all sent alerts with their status and any error messages.
- **`monitor_results`**: Stores individual monitor check results used for threshold calculations.
- **`runs`**: Stores job execution results used for threshold calculations.

## Alert History and Monitoring

### Alert History Table

The `alert_history` table provides a complete audit trail:

```sql
CREATE TABLE alert_history (
    id UUID PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'monitor_failure', 'job_success', etc.
    message TEXT NOT NULL,
    target VARCHAR(255) NOT NULL, -- Monitor/Job name
    target_type VARCHAR(50) NOT NULL, -- 'monitor' or 'job'
    monitor_id UUID REFERENCES monitors(id),
    job_id UUID REFERENCES jobs(id),
    provider VARCHAR(100) NOT NULL, -- Notification provider used
    status VARCHAR(50) NOT NULL, -- 'sent', 'failed', 'pending'
    error_message TEXT, -- Error details if failed
    sent_at TIMESTAMP DEFAULT NOW()
);
```

### Benefits of Alert History

- **Complete Audit Trail:** Track all sent alerts and their status
- **Debugging Support:** Error messages help troubleshoot notification issues
- **Analytics:** Monitor alert patterns and success rates
- **Compliance:** Maintain records for regulatory requirements

## Error Handling and Resilience

### Notification Service Error Handling

The notification system includes comprehensive error handling:

1. **Provider-Level Errors:** Each notification provider handles its own errors
2. **Partial Failures:** If some providers succeed and others fail, the system tracks both
3. **Retry Logic:** Failed notifications can be retried with exponential backoff
4. **Error Logging:** All errors are logged with detailed context
5. **Status Tracking:** Alert history tracks success/failure status for each notification

### System Resilience Features

- **Queue-Based Processing:** Notifications are processed asynchronously
- **Database Persistence:** Alert configurations and history are stored in the database
- **Multiple Providers:** Redundancy through multiple notification channels
- **Graceful Degradation:** System continues to function even if some providers fail

## Configuration Best Practices

### Alert Configuration

1. **Threshold Settings:**
   - Use `failureThreshold: 2-3` for most monitors to avoid false alarms
   - Use `recoveryThreshold: 1-2` for quick recovery notifications
   - Adjust based on monitor frequency and criticality

2. **Notification Providers:**
   - Configure multiple providers for redundancy
   - Use different providers for different alert types
   - Test provider configurations regularly
   - **Email-specific**: Enable both SMTP and Resend for maximum reliability

3. **Custom Messages:**
   - Include relevant context in custom messages
   - Use variables like `{monitor_name}`, `{target_url}`
   - Keep messages concise but informative

### Email Configuration Best Practices

1. **Dual Method Setup:**
   - Configure both SMTP and Resend for automatic fallback
   - Use environment variables for secure credential management
   - Test both methods during initial setup

2. **Environment Variables:**
   - Set `SMTP_ENABLED=true` and `RESEND_ENABLED=true` for dual redundancy
   - Use `SMTP_ENABLED=false` to disable SMTP and use only Resend
   - Use `RESEND_ENABLED=false` to disable Resend and use only SMTP

3. **Security Considerations:**
   - Store sensitive credentials in environment variables, not configuration
   - Use verified domains for sender addresses
   - Regularly rotate API keys and passwords
   - Monitor delivery logs for suspicious activity

4. **Performance Optimization:**
   - Use batch processing for multiple recipients
   - Configure appropriate timeouts for SMTP connections
   - Monitor rate limits for Resend service

### Monitor Configuration

1. **Check Frequency:**
   - Balance between responsiveness and system load
   - More critical monitors can use higher frequencies
   - Consider provider rate limits

2. **Alert Types:**
   - Enable `alertOnFailure` for most monitors
   - Enable `alertOnRecovery` for important services
   - Enable `alertOnSslExpiration` for HTTPS monitors

### Security Considerations

1. **API Keys and Tokens**: Store sensitive configuration in encrypted form
2. **Organization Isolation**: Providers are scoped to organizations
3. **User Permissions**: Only organization members can create providers
4. **Rate Limiting**: Implement rate limiting for webhook calls
5. **Validation**: Validate all webhook URLs and API endpoints

## Testing

### Unit Tests

- Test provider creation with valid data
- Test validation errors for invalid data
- Test provider type-specific configuration validation

### Integration Tests

- Test end-to-end provider creation flow
- Test provider usage in monitor alerts
- Test provider usage in job notifications

### Manual Testing

1. Create providers of each supported type
2. **Email Provider Testing**:
   - Use the `/api/notification-providers/test` endpoint
   - Test both SMTP and Resend delivery methods
   - Verify professional HTML email templates
   - Test multiple recipient email addresses
   - Verify fallback behavior when one method fails
3. Test webhook delivery to external services
4. Test Slack/Discord message formatting
5. Verify Telegram bot message delivery

## Troubleshooting

### Common Issues

1. **Email Delivery Failed**: 
   - Check both SMTP and Resend configurations
   - Verify `SMTP_ENABLED` and `RESEND_ENABLED` environment variables
   - Ensure email addresses are properly formatted
   - Check API keys and credentials
   - Verify from email domains are authorized
2. **SMTP Connection Failed**: 
   - Verify SMTP host, port, and authentication credentials
   - Check firewall and network connectivity
   - Ensure SMTP_SECURE setting matches server requirements
   - Verify SMTP_FROM_EMAIL domain is authorized
3. **Resend Delivery Failed**:
   - Verify RESEND_API_KEY is valid and active
   - Ensure RESEND_FROM_EMAIL is from a verified domain
   - Check Resend service status and rate limits
   - Verify recipient email addresses are valid
4. **Webhook Delivery Failed**: Verify URL and authentication
5. **Slack Message Not Delivered**: Check webhook URL and channel permissions
6. **Telegram Bot Not Responding**: Verify bot token and chat ID
7. **Discord Webhook Error**: Check webhook URL and permissions

### Debug Steps

1. Check application logs for error messages
2. Verify provider configuration in database
3. **Email-specific debugging**:
   - Use the test API endpoint to verify both SMTP and Resend connections
   - Check environment variables: `SMTP_ENABLED`, `RESEND_ENABLED`
   - Verify SMTP credentials and Resend API key
   - Check email domain authorization and DNS settings
   - Review logs for specific error messages from each delivery method
4. Test webhook endpoints manually
5. Check network connectivity to external services
6. Verify API keys and tokens are valid

## Future Enhancements

### Planned Features

1. **Advanced Thresholds:** Time-based thresholds (e.g., alert after 3 failures in 10 minutes)
2. **Alert Suppression:** Maintenance windows and scheduled downtime
3. **Alert Routing:** Different providers for different alert types
4. **Alert Templates:** Customizable message templates
5. **Alert Escalation:** Multi-level escalation for critical issues
6. **Alert Analytics:** Dashboard for alert patterns and trends
7. **Alert Integration:** Webhook endpoints for external integrations
8. **Alert Intelligence:** Machine learning for alert optimization

### Advanced Features

1. **Alert Automation:** Automatically trigger actions based on alerts
2. **Alert Intelligence:** Use machine learning to predict and prevent issues
3. **Alert Analytics:** Provide insights into alert patterns and system health
4. **Multi-tenant Alerting:** Support for different alert configurations per organization
5. **Alert Integration:** Integrate with external incident management systems

### Provider Enhancements

1. **Provider Templates:** Pre-configured templates for common services
2. **Provider Testing:** Built-in test functionality for each provider type
3. **Provider Analytics:** Track delivery success rates and response times
4. **Provider Scheduling:** Configure different providers for different times
5. **Provider Escalation:** Chain multiple providers for critical alerts

This document provides a solid foundation for understanding the current system and planning future improvements. 