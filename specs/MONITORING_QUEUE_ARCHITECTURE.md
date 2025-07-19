# Monitoring Queue Architecture

This document outlines the architecture of the background job processing system for the monitoring features, managed by the `runner` service using BullMQ and Redis.

## I. Active Monitor Scheduling & Execution

This system is used for monitors that actively check a target, such as HTTP, Ping, Port, and Heartbeat checks. It is designed for heterogeneous scheduling, where each monitor can have a unique frequency.

### Queues

1.  **`monitor-scheduler`**
    *   **Purpose**: Manages the schedules for all active monitors.
    *   **Job Type**: Repeating jobs.
    *   **How it Works**: A unique, repeating job is created for each active monitor based on its configured frequency (e.g., every 5 minutes). When a job's schedule fires, its only task is to add a *new, one-time* execution job to the `monitor-execution` queue. This queue acts as a distributed cron system.

2.  **`monitor-execution`**
    *   **Purpose**: To execute the actual monitor checks.
    *   **Job Type**: One-time jobs.
    *   **How it Works**: The `MonitorProcessor` listens to this queue. It picks up jobs, executes the check, and saves the result. If a notification is required (e.g., status change), it delegates the task to the `MonitorAlertService`, which then uses the generic `NotificationService` to send alerts.

### Diagram: Active Monitoring Flow

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

## II. Heartbeat Monitoring

Heartbeat monitors now follow the **standard monitor pattern** and use the same scheduling and execution system as other monitors. The key difference is in the execution logic, which checks for missed pings rather than actively pinging external services.

### A. Standard Heartbeat Scheduling

Heartbeat monitors are scheduled using the same `monitor-scheduler` queue as other monitors:

1.  **Frequency Calculation**: `expected interval + grace period` (e.g., 60 + 10 = 70 minutes)
2.  **Scheduling**: Standard monitor scheduling via `monitor-scheduler` queue
3.  **Execution**: Standard monitor execution via `monitor-execution` queue
4.  **Logic**: `checkHeartbeatMissedPing` method in `MonitorService`

### B. Immediate Notifications (The "Express Lane")

This flow provides instant alerts when a service explicitly signals its status.

1.  **`heartbeat-ping-notification`**
    *   **Purpose**: To decouple immediate notification requests for heartbeat pings from the main application.
    *   **Job Type**: One-time jobs.
    *   **How it Works**: When the `app` receives a ping on a `/fail` or `/pass` URL for a heartbeat monitor, it first checks if the status has changed. If it has (e.g., was `up`, now `/fail`), it immediately updates the database and dispatches a job to this queue. The `runner` has a processor that listens to this queue and sends the alert, ensuring the `app` remains fast and responsive.

### Diagram: Heartbeat Notification Flow

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

## III. Heartbeat Monitor Architecture

### Standard Monitor Pattern

Heartbeat monitors now follow the exact same pattern as other monitors:

```mermaid
graph TD
    A[User creates heartbeat monitor] --> B[Save to database]
    B --> C[Schedule with frequency = expected interval + grace period]
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
3. **Accuracy**: Check frequency is mathematically correct (`expected interval + grace period`)
4. **Maintainability**: Standard patterns across all monitor types
5. **User Experience**: Clear UI with calculated check frequency display

### Removed Components

The following components were removed as part of the standardization:

- `app/src/lib/heartbeat-service.ts` - App-side service
- `app/src/lib/heartbeat-scheduler.ts` - Separate scheduler
- `runner/src/scheduler/processors/heartbeat-checker.processor.ts` - Separate processor
- `runner/src/monitor/services/heartbeat.service.ts` - Separate service
- `HEARTBEAT_CHECKER_QUEUE` - Redundant queue

This unified approach provides both robust scheduled checking and highly responsive immediate alerting while maintaining consistency across all monitor types. 