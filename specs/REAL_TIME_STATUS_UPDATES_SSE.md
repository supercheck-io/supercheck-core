# Real-Time Status Updates with Server-Sent Events (SSE)

This document outlines the comprehensive Server-Sent Events (SSE) implementation in Supertest for real-time status updates, providing live feedback for test execution, job processing, and queue statistics using Redis pub/sub events.

## Overview

The application uses Server-Sent Events (SSE) to provide real-time status updates for test and job execution. This enables users to see live progress without polling the server, creating a responsive and engaging user experience. The system now uses Redis pub/sub events for immediate status updates instead of database polling.

## Architecture

### 1. SSE Flow Diagram

```mermaid
flowchart TB
    subgraph "Frontend"
        A1[User Interface]
        A2[EventSource Connection]
        A3[Status Display]
    end
    
    subgraph "API Layer"
        B1[/api/test-status/events/[testId]]
        B2[/api/job-status/events/[jobId]]
        B3[SSE Stream Handler]
    end
    
    subgraph "Redis Pub/Sub"
        C1[Redis Channels]
        C2[test:${testId}:status]
        C3[test:${testId}:complete]
        C4[job:${jobId}:status]
        C5[job:${jobId}:complete]
    end
    
    subgraph "Queue System"
        D1[Redis/BullMQ]
        D2[Job Status Events]
    end
    
    subgraph "Database"
        E1[(PostgreSQL)]
        E2[Status Updates]
    end
    
    A1 -->|Initiate Test/Job| A2
    A2 -->|Connect to SSE| B1
    A2 -->|Connect to SSE| B2
    B1 -->|Subscribe to Redis Channels| C1
    B2 -->|Subscribe to Redis Channels| C1
    D1 -->|Publish Events| C2
    D1 -->|Publish Events| C3
    D1 -->|Publish Events| C4
    D1 -->|Publish Events| C5
    C1 -->|SSE Messages| B3
    B3 -->|SSE Messages| A2
    A2 -->|Update UI| A3
    E1 -->|Fallback Check| B3
```

### 2. SSE Implementation Components

#### A. Frontend EventSource

The frontend establishes SSE connections for real-time updates:

```typescript
// Test status SSE connection
const eventSource = new EventSource(`/api/test-status/events/${testId}`);

eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log("SSE event:", data);
    
    if (data.status) {
      const normalizedStatus = data.status.toLowerCase();
      
      if (normalizedStatus === "completed" || 
          normalizedStatus === "passed" || 
          normalizedStatus === "failed" || 
          normalizedStatus === "error") {
        // Test is done, update the UI
        setIsRunning(false);
        setIsReportLoading(false);
        
        // Update test execution status based on result
        const testPassed = normalizedStatus === "completed" || normalizedStatus === "passed";
        setTestExecutionStatus(testPassed ? 'passed' : 'failed');
        
        // Close the SSE connection
        eventSource.close();
        eventSourceClosed = true;
      }
    }
  } catch (error) {
    console.error(`[SSE] Error parsing message:`, error);
  }
};

eventSource.onerror = (error) => {
  console.error(`[SSE] SSE error:`, error);
  eventSource.close();
  eventSourceClosed = true;
};
```

#### B. Job Status SSE

For job execution, the system uses a similar pattern:

```typescript
// Job status SSE connection
const eventSource = new EventSource(`/api/job-status/events/${runId}`);

eventSource.onmessage = (event) => {
  try {
    const statusData = JSON.parse(event.data);
    console.log(`[JobContext] SSE status update for run ${runId}:`, statusData);

    // Handle terminal statuses with final toast
    if ((statusData.status === 'completed' || statusData.status === 'failed' || 
         statusData.status === 'passed' || statusData.status === 'error') && !hasShownFinalToastForRun) {
      
      // Only show the toast once for this run
      hasShownFinalToastForRun = true;
      
      // Update the job status
      setJobStatus(jobId, statusData.status);
      
      // Determine if job passed or failed
      const passed = statusData.status === 'completed' || statusData.status === 'passed';
      
      // Force dismiss existing toast with ID immediately
      if (toastId) {
        toast.dismiss(toastId);
      }
      
      // Clean up resources
      if (eventSourcesRef.current.has(jobId)) {
        eventSourcesRef.current.get(jobId)?.close();
        eventSourcesRef.current.delete(jobId);
      }
      
      // Remove from active runs
      setActiveRuns(prev => {
        const newRuns = { ...prev };
        delete newRuns[jobId];
        return newRuns;
      });
      
      // Remove from running jobs
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        if (newSet.size === 0) {
          setIsAnyJobRunning(false);
        }
        return newSet;
      });
    }
  } catch (error) {
    console.error(`[JobContext] Error parsing SSE message:`, error);
  }
};
```

## API Implementation

### 1. Test Status SSE Endpoint

```typescript
// app/src/app/api/test-status/events/[testId]/route.ts
export async function GET(request: Request) {
  // Extract testId from the URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const testId = pathParts[pathParts.length - 1];

  let connectionClosed = false;
  
  // Create response with appropriate headers for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check if we already have a result for this test
        const report = await db.query.reports.findFirst({
          where: and(
            eq(reports.entityType, 'test'),
            eq(reports.entityId, testId)
          ),
        });

        // If report exists and has a terminal status, send result and close
        if (report && ['completed', 'failed'].includes(report.status)) {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: report.status,
            testId: report.entityId,
            reportPath: report.reportPath,
            s3Url: report.s3Url,
            error: undefined
          })));
          connectionClosed = true;
          controller.close();
          return;
        }

        // Get Redis connection for pub/sub
        const subscriber = await getRedisConnection();
        
        // Handle disconnection
        const cleanup = async () => {
          if (!connectionClosed) {
            connectionClosed = true;
            controller.close();
            console.log(`[SSE] Client disconnected for test ${testId}`);
            try {
              await subscriber.disconnect();
            } catch (err) {
              console.error(`Error disconnecting Redis: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        };
        
        request.signal.addEventListener('abort', () => {
          cleanup().catch(err => console.error("Error in cleanup:", err));
        });
        
        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
          if (!connectionClosed) {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
        
        // Clean up on close
        request.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
        });
        
        // Send initial running status if we have an active report
        if (report && report.status === 'running') {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: 'running',
            testId: report.entityId
          })));
        } else {
          controller.enqueue(encoder.encode(createSSEMessage({ status: 'waiting' })));
        }
        
        // Subscribe to Redis channels for test status updates
        const testStatusChannel = `test:${testId}:status`;
        const testCompleteChannel = `test:${testId}:complete`;
        
        console.log(`[SSE] Subscribing to channels: ${testStatusChannel}, ${testCompleteChannel}`);
        
        // Subscribe to status updates
        await subscriber.subscribe(testStatusChannel, testCompleteChannel);
        
        // Handle messages from Redis pub/sub
        subscriber.on('message', async (channel, message) => {
          if (connectionClosed) return;
          
          try {
            const data = JSON.parse(message);
            console.log(`[SSE] Received message on channel ${channel}:`, data);
            
            if (channel === testCompleteChannel) {
              // Test completed, send final status and close connection
              controller.enqueue(encoder.encode(createSSEMessage({
                status: data.status,
                testId: data.testId,
                reportPath: data.reportPath,
                s3Url: data.s3Url,
                error: data.error
              })));
              
              connectionClosed = true;
              clearInterval(pingInterval);
              await cleanup();
              controller.close();
            } else if (channel === testStatusChannel) {
              // Status update
              controller.enqueue(encoder.encode(createSSEMessage({
                status: data.status,
                testId: data.testId,
                reportPath: data.reportPath,
                s3Url: data.s3Url,
                error: data.error
              })));
            }
          } catch (parseError) {
            console.error(`[SSE] Error parsing message from channel ${channel}:`, parseError);
          }
        });
        
        // Set up a fallback mechanism to check database periodically (less frequent)
        // This is only for cases where Redis pub/sub might miss events
        const fallbackInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(fallbackInterval);
            return;
          }
          
          try {
            // Check database for terminal status (less frequent than before)
            const dbReport = await db.query.reports.findFirst({
              where: and(
                eq(reports.entityType, 'test'),
                eq(reports.entityId, testId)
              ),
            });
            
            if (dbReport && ['completed', 'failed'].includes(dbReport.status)) {
              console.log(`[SSE] Fallback: Test ${testId} has terminal status ${dbReport.status} in database`);
              
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status: dbReport.status,
                testId: dbReport.entityId,
                reportPath: dbReport.reportPath,
                s3Url: dbReport.s3Url,
                error: undefined
              })));
              
              connectionClosed = true;
              clearInterval(fallbackInterval);
              await cleanup();
              controller.close();
            }
          } catch (fallbackError) {
            console.error(`[SSE] Error in fallback check for test ${testId}:`, fallbackError);
          }
        }, 30000); // Check every 30 seconds instead of every second
        
        // Clean up fallback interval on close
        request.signal.addEventListener('abort', () => {
          clearInterval(fallbackInterval);
        });
        
      } catch (err) {
        console.error('[SSE] Error in SSE stream:', err);
        controller.enqueue(encoder.encode(createSSEMessage({ 
          status: 'error', 
          message: 'Failed to establish status stream' 
        })));
        
        connectionClosed = true;
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

### 2. Job Status SSE Endpoint

```typescript
// app/src/app/api/job-status/events/[jobId]/route.ts
export async function GET(request: Request) {
  // Extract jobId from the URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const jobId = pathParts[pathParts.length - 1];

  let connectionClosed = false;
  
  // Create response with appropriate headers for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check if we already have a result for this job's latest run
        const runId = jobId; // In our system, the SSE endpoint is now called with runId
        
        // Get the specific run by ID
        const run = await db.query.runs.findFirst({
          where: eq(runs.id, runId),
        });

        // If run exists and has a terminal status, send result and close
        if (run && ['completed', 'failed', 'passed', 'error'].includes(run.status)) {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: run.status,
            runId: run.id,
            duration: run.duration,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            errorDetails: run.errorDetails,
            artifactPaths: run.artifactPaths
          })));
          connectionClosed = true;
          controller.close();
          return;
        }

        // Get Redis connection for pub/sub
        const subscriber = await getRedisConnection();
        
        // Handle disconnection
        const cleanup = async () => {
          if (!connectionClosed) {
            connectionClosed = true;
            controller.close();
            console.log(`[SSE] Client disconnected for job ${jobId}`);
            try {
              await subscriber.disconnect();
            } catch (err) {
              console.error(`Error disconnecting Redis: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        };
        
        request.signal.addEventListener('abort', () => {
          cleanup().catch(err => console.error("Error in cleanup:", err));
        });
        
        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
          if (!connectionClosed) {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
        
        // Clean up on close
        request.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
        });
        
        // Send initial running status if we have an active run
        if (run && run.status === 'running') {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: 'running',
            runId: run.id,
            startedAt: run.startedAt,
            duration: run.duration
          })));
        } else {
          controller.enqueue(encoder.encode(createSSEMessage({ status: 'waiting' })));
        }
        
        // Subscribe to Redis channels for job status updates
        const jobStatusChannel = `job:${runId}:status`;
        const jobCompleteChannel = `job:${runId}:complete`;
        
        console.log(`[SSE] Subscribing to channels: ${jobStatusChannel}, ${jobCompleteChannel}`);
        
        // Subscribe to status updates
        await subscriber.subscribe(jobStatusChannel, jobCompleteChannel);
        
        // Handle messages from Redis pub/sub
        subscriber.on('message', async (channel, message) => {
          if (connectionClosed) return;
          
          try {
            const data = JSON.parse(message);
            console.log(`[SSE] Received message on channel ${channel}:`, data);
            
            if (channel === jobCompleteChannel) {
              // Job completed, send final status and close connection
              controller.enqueue(encoder.encode(createSSEMessage({
                status: data.status,
                runId: data.runId,
                duration: data.duration,
                startedAt: data.startedAt,
                completedAt: data.completedAt,
                errorDetails: data.errorDetails,
                artifactPaths: data.artifactPaths
              })));
              
              connectionClosed = true;
              clearInterval(pingInterval);
              await cleanup();
              controller.close();
            } else if (channel === jobStatusChannel) {
              // Status update
              controller.enqueue(encoder.encode(createSSEMessage({
                status: data.status,
                runId: data.runId,
                duration: data.duration,
                startedAt: data.startedAt,
                completedAt: data.completedAt,
                errorDetails: data.errorDetails,
                artifactPaths: data.artifactPaths
              })));
            }
          } catch (parseError) {
            console.error(`[SSE] Error parsing message from channel ${channel}:`, parseError);
          }
        });
        
        // Set up a fallback mechanism to check database periodically (less frequent)
        // This is only for cases where Redis pub/sub might miss events
        const fallbackInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(fallbackInterval);
            return;
          }
          
          try {
            // Check database for terminal status (less frequent than before)
            const dbRun = await db.query.runs.findFirst({
              where: eq(runs.id, runId),
            });
            
            if (dbRun && ['completed', 'failed', 'passed', 'error'].includes(dbRun.status)) {
              console.log(`[SSE] Fallback: Run ${runId} has terminal status ${dbRun.status} in database`);
              
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status: dbRun.status,
                runId: dbRun.id,
                duration: dbRun.duration,
                startedAt: dbRun.startedAt,
                completedAt: dbRun.completedAt,
                errorDetails: dbRun.errorDetails,
                artifactPaths: dbRun.artifactPaths
              })));
              
              connectionClosed = true;
              clearInterval(fallbackInterval);
              await cleanup();
              controller.close();
            }
          } catch (fallbackError) {
            console.error(`[SSE] Error in fallback check for job ${runId}:`, fallbackError);
          }
        }, 30000); // Check every 30 seconds instead of every second
        
        // Clean up fallback interval on close
        request.signal.addEventListener('abort', () => {
          clearInterval(fallbackInterval);
        });
        
      } catch (err) {
        console.error('[SSE] Error in SSE stream:', err);
        controller.enqueue(encoder.encode(createSSEMessage({ 
          status: 'error', 
          message: 'Failed to establish status stream' 
        })));
        
        connectionClosed = true;
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

## Redis Pub/Sub Channels

### 1. Test Status Channels

The system uses the following Redis channels for test status updates:

- **`test:${testId}:status`** - For intermediate status updates during test execution
- **`test:${testId}:complete`** - For final completion status when test finishes

### 2. Job Status Channels

For job execution status:

- **`job:${runId}:status`** - For intermediate status updates during job execution
- **`job:${runId}:complete`** - For final completion status when job finishes

### 3. Publishing Events

The queue processors publish events to these channels when status changes occur:

```typescript
// Example of publishing test status events
const redis = await getRedisConnection();
await redis.publish(`test:${testId}:status`, JSON.stringify({
  status: 'running',
  testId: testId,
  reportPath: reportPath,
  s3Url: s3Url
}));

// Example of publishing test completion events
await redis.publish(`test:${testId}:complete`, JSON.stringify({
  status: 'completed',
  testId: testId,
  reportPath: reportPath,
  s3Url: s3Url,
  error: undefined
}));
```

## Helper Functions

### 1. SSE Message Creation

```typescript
/**
 * Helper function to create SSE message
 */
const createSSEMessage = (data: Record<string, unknown>) => {
  return `data: ${JSON.stringify(data)}\n\n`;
};
```

### 2. Redis Connection Management

```typescript
/**
 * Get or create Redis connection for SSE pub/sub
 */
const getRedisConnection = async (): Promise<Redis> => {
  console.log(`Creating Redis connection for SSE endpoint`);
  
  const host = process.env.REDIS_HOST || 'redis';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;
  
  console.log(`[SSE Redis Client] Connecting to Redis at ${host}:${port}`);
  
  const redis = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  
  redis.on('error', (err) => console.error('[SSE Redis Client Error]', err));
  redis.on('connect', () => console.log('[SSE Redis Client Connected]'));
  
  return redis;
};
```

## Status Management Components

### 1. Job Status Component

```typescript
// app/src/components/runs/job-status.tsx
export function JobStatus({ jobId, initialStatus }: JobStatusProps) {
  const [status, setStatus] = useState(initialStatus);
  const router = useRouter();
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasShownToastRef = useRef<boolean>(false);
  const lastStatusRef = useRef<string>(initialStatus);

  useEffect(() => {
    // Only set up SSE if the job is not in a terminal state
    if (['completed', 'failed', 'passed', 'error'].includes(initialStatus)) {
      setStatus(initialStatus);
      return;
    }

    // Clean up function
    const cleanupSSE = () => {
      if (eventSourceRef.current) {
        console.log(`[JobStatus] Cleaning up SSE connection for job ${jobId}`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    console.log(`[JobStatus] Setting up SSE for job status: ${jobId}, initial status: ${initialStatus}`);
    
    // Create new EventSource connection
    const eventSource = new EventSource(`/api/job-status/events/${jobId}`);
    eventSourceRef.current = eventSource;
    
    // Reset toast flag on new connection
    hasShownToastRef.current = false;
    lastStatusRef.current = initialStatus;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[JobStatus] Status update received:`, data);
        
        if (data.status) {
          const newStatus = data.status;
          // Update the displayed status
          setStatus(newStatus);
          
          // Handle status change with toast notifications
          const isTerminalStatus = ['completed', 'passed', 'failed', 'error'].includes(newStatus);
          const isStatusChange = lastStatusRef.current !== newStatus;
          
          // Update our tracking of last status
          lastStatusRef.current = newStatus;
          
          // Show toast for terminal status changes if we haven't shown one already
          if (isTerminalStatus && isStatusChange && !hasShownToastRef.current) {
            // Mark that we've shown a toast to prevent duplicates
            hasShownToastRef.current = true;
            
            // Determine if job passed or failed
            const passed = newStatus === 'completed' || newStatus === 'passed';
            
            // Show toast message for status change
            toast[passed ? 'success' : 'error'](
              passed ? "Job execution passed" : "Job execution failed",
              {
                description: passed 
                  ? "All tests executed successfully." 
                  : `One or more tests failed. ${data.error || ''}`,
                duration: 5000
              }
            );
            
            // Close the connection after terminal status
            cleanupSSE();
            
            // Refresh the page data to show updated job statuses
            setTimeout(() => {
              router.refresh();
            }, 500);
          }
        }
      } catch (error) {
        console.error(`[JobStatus] Error parsing SSE message:`, error);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[JobStatus] SSE error:`, error);
      cleanupSSE();
    };

    // Clean up on unmount
    return cleanupSSE;
  }, [jobId, initialStatus, router]);

  // Find the status object based on current status
  const statusInfo = runStatuses.find((s) => s.value === status) || runStatuses[0];
  const StatusIcon = statusInfo.icon;

  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${statusInfo.color}`}>
      <StatusIcon className="h-3 w-3" />
      <span>{statusInfo.label}</span>
    </Badge>
  );
}
```

### 2. Run Status Listener

```typescript
// app/src/components/runs/run-status-listener.tsx
export function RunStatusListener({ 
  runId, 
  status,
  onStatusUpdate 
}: RunStatusListenerProps) {
  const router = useRouter();
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasShownToastRef = useRef<boolean>(false);
  const loadingToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    // If the run is already in a terminal state, don't set up SSE
    if (status === 'completed' || status === 'failed' || status === 'passed' || status === 'error') {
      console.log(`[RunStatusListener] Run ${runId} is already in terminal state: ${status}, not setting up SSE`);
      return;
    }

    // Clean up function
    const cleanupSSE = () => {
      if (eventSourceRef.current) {
        console.log(`[RunStatusListener] Cleaning up SSE connection for run ${runId}`);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    // Establish SSE connection
    console.log(`[RunStatusListener] Setting up SSE connection for run ${runId}`);
    const eventSource = new EventSource(`/api/job-status/events/${runId}`);
    eventSourceRef.current = eventSource;
    
    // Reset toast flag on new connection
    hasShownToastRef.current = false;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[RunStatusListener] Status update for run ${runId}:`, data);
        
        // Notify parent component of status updates
        if (data.status && onStatusUpdate) {
          console.log(`[RunStatusListener] Calling onStatusUpdate with: status=${data.status}, reportUrl=${data.s3Url}, duration=${data.duration}`);
          onStatusUpdate(data.status, data.s3Url, data.duration);
        }
        
        // Handle terminal statuses
        if ((data.status === 'completed' || data.status === 'failed' || 
            data.status === 'passed' || data.status === 'error') && !hasShownToastRef.current) {
          
          // Mark as shown to prevent duplicates
          hasShownToastRef.current = true;
          
          // Close SSE connection after terminal status
          cleanupSSE();
          
          // Refresh page data to show updated statuses
          setTimeout(() => router.refresh(), 500);
        }
      } catch (error) {
        console.error(`[RunStatusListener] Error parsing message:`, error);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[RunStatusListener] SSE error:`, error);
      cleanupSSE();
    };

    // Clean up on unmount
    return cleanupSSE;
  }, [runId, status, onStatusUpdate, router]);
}
```

## Benefits

### 1. Real-Time Updates with Redis Pub/Sub

- **Immediate Events**: Status updates are pushed immediately via Redis pub/sub
- **Reduced Latency**: No polling delays, events are delivered instantly
- **Better Performance**: Eliminates constant database queries for status checks

### 2. Efficient Resource Usage

- **Event-Driven**: Only processes events when they occur
- **Reduced Database Load**: Minimal database queries for fallback only
- **Connection Reuse**: SSE connections stay open for the duration of operations

### 3. Reliable Status Tracking

- **Primary Events**: Redis pub/sub provides immediate status updates
- **Fallback Mechanism**: Database checks every 30 seconds as backup
- **Error Handling**: Graceful handling of connection errors and timeouts

### 4. Scalable Architecture

- **Redis Pub/Sub**: Highly scalable event distribution
- **Connection Management**: Proper cleanup of SSE connections
- **Load Distribution**: SSE endpoints can be load balanced

## Configuration

### 1. Environment Variables

```bash
# Redis Configuration (for SSE pub/sub)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# SSE Configuration
SSE_PING_INTERVAL=30000        # 30 seconds ping interval
SSE_FALLBACK_INTERVAL=30000    # 30 seconds fallback check interval
SSE_CONNECTION_TIMEOUT=300000  # 5 minutes connection timeout
```

### 2. Headers Configuration

```typescript
// SSE response headers
headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
}
```

## Best Practices

### 1. Event-Driven Architecture

- **Redis Pub/Sub**: Use Redis channels for immediate event distribution
- **Event Naming**: Use consistent channel naming conventions
- **Event Structure**: Standardize event payload structure

### 2. Connection Management

- **Proper Cleanup**: Always close SSE connections when no longer needed
- **Error Handling**: Implement robust error handling for connection failures
- **Timeout Management**: Set appropriate timeouts for long-running operations

### 3. Fallback Mechanisms

- **Database Fallback**: Periodic database checks for missed events
- **Graceful Degradation**: Fall back to polling if Redis pub/sub fails
- **Status Persistence**: Store status in database for reliability

### 4. Performance Optimization

- **Event Filtering**: Only subscribe to relevant channels
- **Memory Management**: Clean up resources properly
- **Load Balancing**: Distribute SSE connections across multiple servers

## Migration from Database Polling

The system has been migrated from database polling to Redis pub/sub events:

### Before (Database Polling)
- Polled database every 1 second for status updates
- High database load with frequent queries
- Delayed status updates due to polling intervals

### After (Redis Pub/Sub)
- Immediate events via Redis pub/sub channels
- Minimal database queries (only fallback every 30 seconds)
- Real-time status updates with no polling delays

This comprehensive SSE implementation provides reliable, real-time status updates using Redis pub/sub events while maintaining system performance and user experience. 