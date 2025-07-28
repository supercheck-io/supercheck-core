# Monitoring System

This document provides a comprehensive overview of the Supertest monitoring system, including architecture, queue management, heartbeat monitoring, scheduling implementation, and troubleshooting guides for production deployments.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Queue System](#queue-system)
4. [Heartbeat Monitoring](#heartbeat-monitoring)
5. [Scheduling System](#scheduling-system)
6. [Fixes and Improvements](#fixes-and-improvements)
7. [Implementation Details](#implementation-details)
8. [Testing and Verification](#testing-and-verification)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)

## System Overview

The monitoring system provides real-time monitoring capabilities for HTTP endpoints, ping monitoring, port checking, and multi-channel alerting. It's built with Next.js, NestJS, and PostgreSQL using BullMQ and Redis for job processing.

### Key Features
- **HTTP Request Monitoring**: Monitor REST APIs, websites, and web services with custom headers, authentication, and body validation
- **Ping Host Monitoring**: Monitor server availability and network connectivity using ICMP pings
- **Port Check Monitoring**: Verify if specific TCP/UDP ports are open and accessible
- **Heartbeat Monitoring**: Passive monitoring where external services ping Supertest endpoints
- **Smart SSL Certificate Monitoring**: Intelligent SSL certificate expiration checking with adaptive frequency
- **Immediate Monitor Execution**: Monitors execute immediately when created/updated for instant validation
- **Real-time Status Updates**: Live status updates via Server-Sent Events (SSE) for immediate feedback
- **Multi-Channel Alerting**: Supports email, Slack, webhooks, Telegram, Discord, and Microsoft Teams
- **SSL Expiration Alerts**: Independent SSL certificate expiration warnings without status changes
- **Threshold-Based Alerting**: Configurable failure/recovery thresholds to prevent alert spam
- **Professional Templates**: Rich HTML emails and formatted messages with full context
- **Complete Audit Trail**: Alert history with delivery status and error tracking

## Architecture

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
    ├── monitor-scheduler.ts # Monitor scheduling
    └── ...
```

### Backend (NestJS Runner)
```
runner/
├── src/
│   ├── monitor/
│   │   ├── monitor.service.ts     # Core monitoring logic
│   │   ├── monitor.processor.ts   # Job queue processing
│   │   ├── services/
│   │   │   └── monitor-alert.service.ts # Alert handling
│   │   ├── processors/
│   │   │   └── heartbeat-ping-notification.processor.ts # Heartbeat notifications
│   │   └── dto/                   # Data transfer objects
│   ├── scheduler/
│   │   ├── processors/
│   │   │   ├── job-scheduler.processor.ts
│   │   │   └── monitor-scheduler.processor.ts
│   │   └── constants.ts
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

## Queue System

The monitoring system uses BullMQ and Redis for robust job processing with the following queues:

### Active Monitor Scheduling & Execution

#### 1. **`monitor-scheduler`**
- **Purpose**: Manages the schedules for all active monitors
- **Job Type**: Repeating jobs
- **How it Works**: A unique, repeating job is created for each active monitor based on its configured frequency (e.g., every 5 minutes). When a job's schedule fires, its only task is to add a *new, one-time* execution job to the `monitor-execution` queue. This queue acts as a distributed cron system.

#### 2. **`monitor-execution`**
- **Purpose**: To execute the actual monitor checks
- **Job Type**: One-time jobs
- **How it Works**: The `MonitorProcessor` listens to this queue. It picks up jobs, executes the check, and saves the result. If a notification is required (e.g., status change), it delegates the task to the `MonitorAlertService`, which then uses the generic `NotificationService` to send alerts.

### Heartbeat Monitoring

#### 3. **`heartbeat-ping-notification`**
- **Purpose**: To decouple immediate notification requests for heartbeat pings from the main application
- **Job Type**: One-time jobs
- **How it Works**: When the `app` receives a ping on a `/fail` or `/pass` URL for a heartbeat monitor, it first checks if the status has changed. If it has (e.g., was `up`, now `/fail`), it immediately updates the database and dispatches a job to this queue. The `runner` has a processor that listens to this queue and sends the alert, ensuring the `app` remains fast and responsive.

### Queue Architecture Diagrams

#### Active Monitoring Flow
```mermaid
graph TD
    subgraph app [Main Application]
        A[User creates/updates Monitor] --> B{Save Monitor Config};
    end

    subgraph runner [Runner Service]
        C(MonitorSchedulerProcessor) -- "Listens for schedules" --> D[monitor-scheduler queue];
        B -- "Creates/updates repeating job" --> D;

        D -- "On schedule fire" --> E[Adds one-time job];
        E --> F[monitor-execution queue];
        G(MonitorProcessor) -- "Picks up job" --> F;
        G -- "Executes check" --> H((External Service));
        G -- "Saves result" --> I([Database]);
        G -- "Delegates alerting to" --> J(MonitorAlertService);
        J -- "Uses generic" --> K(NotificationService);
        K -- "Sends to providers" --> L((Slack, Email, etc.));
    end

    style runner fill:#f1f1f1,stroke:#333
    style app fill:#e1f0ff,stroke:#333
```

#### Heartbeat Notification Flow
```mermaid
graph TD
    subgraph Monitored Service
        J[Cron Job / Service];
    end

    subgraph app [Main Application]
        K[/api/heartbeat/.../fail]
        L[/api/heartbeat/.../pass]

        J -- "Pings on failure" --> K;
        J -- "Pings on success" --> L;

        K -- "If status changes" --> M{Adds job};
        L -- "If status changes" --> M;
        M --> N[heartbeat-ping-notification queue];
    end

    subgraph runner [Runner Service]
        O(HeartbeatPingNotificationProcessor) -- "Picks up job" --> N;
        O -- "Sends notification" --> P((Slack, Email, etc.));
    end

    style runner fill:#f1f1f1,stroke:#333
    style app fill:#e1f0ff,stroke:#333
```

## Heartbeat Monitoring

Heartbeat monitors follow the **standard monitor pattern** and use the same scheduling and execution system as other monitors. The key difference is in the execution logic, which checks for missed pings rather than actively pinging external services.

### Current Implementation Logic

#### **Frequency Calculation Strategy** ✅
**Implemented**: Smart adaptive checking based on total wait time.

```typescript
// Helper function to calculate optimal check frequency for heartbeat monitors
const calculateOptimalFrequency = (expected: number, grace: number) => {
  // Total time to wait before considering the heartbeat failed
  const totalWaitMinutes = expected + grace;
  
  // For very short total wait times (≤5min), check at half the total wait time
  // but ensure we don't check more frequently than every minute
  if (totalWaitMinutes <= 5) {
    return Math.max(1, Math.round(totalWaitMinutes / 2));
  }
  
  // For longer intervals, check at 1/3 of the total wait time
  // This ensures failures are detected reasonably quickly after they occur
  // but not so frequently as to waste resources
  const optimalFrequency = Math.max(1, Math.round(totalWaitMinutes / 3));
  
  // Apply reasonable limits: minimum 1 minute, maximum 60 minutes
  return Math.max(1, Math.min(optimalFrequency, 60));
};
```

**Real-world Examples**:
```
1 min interval + 0 min grace → Check every 1 min
1 min interval + 1 min grace → Check every 1 min  
5 min interval + 5 min grace → Check every 3 min (≤5 total, so totalWait/2)
60 min interval + 10 min grace → Check every 23 min (>5 total, so totalWait/3)
```

#### **Detection Logic** ✅
**Implemented**: Optimized detection logic that only records failure entries when needed.

The `checkHeartbeatMissedPing` method in `MonitorService` implements the following logic:

1. **Initial Ping Check**: For monitors that haven't received their first ping yet
   - Checks if monitor was created more than `totalWaitMinutes` ago
   - If overdue: Creates failure entry with "No initial ping received" message
   - If within grace period: Returns `null` (no database entry)

2. **Subsequent Ping Check**: For monitors that have received at least one ping
   - Compares `minutesSinceLastPing` against `totalWaitMinutes`
   - If overdue: Creates failure entry with detailed timing information
   - If recent: Returns `null` (no database entry)

3. **Failure Detection Timeline**:
   ```
   Expected: 60min, Grace: 10min, Check: 23min intervals
   
   0min: Service starts, next ping expected at 60min
   23min: Check - OK (no ping expected yet)
   46min: Check - OK (no ping expected yet)  
   60min: Service fails, no ping sent
   70min: Check - FAILURE DETECTED (exactly at grace period end)
   93min: Check - Still down (send recovery alert when ping resumes)
   ```

#### **Status Tracking Implementation** ✅
**Implemented**: Robust status tracking with proper change detection.

```typescript
// Status tracking in monitor config
interface MonitorConfig {
  expectedIntervalMinutes: number;
  gracePeriodMinutes: number;
  lastPingAt?: string;                    // Latest ping timestamp
  heartbeatUrl: string;                   // Generated ping URL
  // ... other fields
}

// Status updates through ping endpoints
// /api/heartbeat/[token] - Updates lastPingAt and sets status to 'up'
// /api/heartbeat/[token]/fail - Sets status to 'down' with failure details
```

**Features**:
- **Persistent tracking**: `lastPingAt` stored in monitor configuration
- **Status change detection**: Compares current vs recent monitor results
- **Automatic recovery**: Status automatically changes to 'up' when pings resume
- **Alert integration**: Status changes trigger appropriate notifications

#### **Database Entry Strategy** ✅
**Implemented**: Efficient database strategy that only creates entries for failures.

```typescript
// Current logic (optimized for efficiency)
if (minutesSinceLastPing > totalWaitMinutes) {
  // Create failure entry only when overdue
  return {
    status: 'down',
    isUp: false,
    details: {
      errorMessage: 'No ping received within expected interval',
      expectedInterval: expectedIntervalMinutes,
      gracePeriod: gracePeriodMinutes,
      lastPingAt: currentLastPingAt,
      totalWaitMinutes,
      // ... detailed failure information
    }
  };
} else {
  // Return null to skip database entry (no failure to record)
  return null;
}
```

**Benefits**:
- **Efficient**: Only creates database entries when failures occur
- **Clean data**: Monitor results show actual failure events, not constant "up" status
- **Performance**: Reduces database writes for normal operation

### Heartbeat Ping Endpoints

#### **Success Ping**: `GET/POST /api/heartbeat/[token]`
- Updates monitor status to 'up'
- Records `lastPingAt` timestamp in monitor config
- Creates successful monitor result entry
- Triggers recovery notification if previously down

#### **Failure Ping**: `GET/POST /api/heartbeat/[token]/fail`
- Updates monitor status to 'down'
- Records `lastPingAt` timestamp (failure is still activity)
- Creates failure monitor result entry with error details
- Triggers failure notification if previously up

### Notification System

#### **Manual Notification Trigger**
- **Endpoint**: `POST /api/monitors/[id]/notify`
- **Purpose**: Allows manual triggering of notifications for status changes
- **Features**:
  - Validates monitor existence and alert configuration
  - Checks notification provider settings
  - Respects alert configuration (failure/recovery settings)
  - Saves alert history for tracking
  - Supports multiple notification providers (Slack, Email, Webhook)

#### **Automatic Notifications**
- **Recovery**: Triggered when status changes from 'down' to 'up'
- **Failure**: Triggered when status changes from 'up' to 'down'
- **Queue**: Uses `heartbeat-ping-notification` queue for async processing
- **Processor**: `HeartbeatPingNotificationProcessor` handles notification delivery

### Configuration Recommendations

**For Production Heartbeat Monitors**:
```typescript
interface OptimalHeartbeatConfig {
  // User-configured
  expectedIntervalMinutes: number;    // e.g., 60
  gracePeriodMinutes: number;         // e.g., 10
  
  // System-calculated optimal values
  checkFrequencyMinutes: number;      // calculated via calculateOptimalFrequency()
  alertDelayMinutes: 0;               // Alert immediately on detection
  recoveryConfirmationChecks: 1;     // Confirm recovery after 1 successful ping
}
```

### Standard Heartbeat Scheduling

Heartbeat monitors are scheduled using the same `monitor-scheduler` queue as other monitors:

1. **Frequency Calculation**: Uses `calculateOptimalFrequency(expectedInterval, gracePeriod)`
2. **Scheduling**: Standard monitor scheduling via `monitor-scheduler` queue
3. **Execution**: Standard monitor execution via `monitor-execution` queue
4. **Logic**: `checkHeartbeatMissedPing` method in `MonitorService`

### Standard Monitor Pattern

Heartbeat monitors follow the exact same pattern as other monitors:

```mermaid
graph TD
    A[User creates heartbeat monitor] --> B[Save to database]
    B --> C[Schedule with calculated frequency]
    C --> D[monitor-scheduler queue]
    D --> E[MonitorSchedulerProcessor]
    E --> F[Add to monitor-execution queue]
    F --> G[MonitorProcessor]
    G --> H[MonitorService.executeMonitor]
    H --> I[checkHeartbeatMissedPing]
    I --> J[Save result & send alerts]
```

### Key Benefits

1. **Consistency**: Same architecture as HTTP, Ping, and Port monitors
2. **Simplicity**: No complex hybrid approach or app-side filtering
3. **Accuracy**: Check frequency is mathematically optimized for detection speed
4. **Maintainability**: Standard patterns across all monitor types
5. **User Experience**: Clear UI with calculated check frequency display
6. **Efficiency**: Only creates database entries for actual failures

