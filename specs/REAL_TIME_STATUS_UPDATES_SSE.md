# Real-Time Status Updates with Server-Sent Events (SSE)

This document outlines the Server-Sent Events (SSE) implementation used for real-time status updates in the application, providing live feedback for test and job execution progress.

## Overview

The application uses Server-Sent Events (SSE) to provide real-time status updates for test and job execution. This enables users to see live progress without polling the server, creating a responsive and engaging user experience.

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
        B1[/api/test-status/sse/[testId]]
        B2[/api/job-status/sse/[jobId]]
        B3[SSE Stream Handler]
    end
    
    subgraph "Queue System"
        C1[Redis/BullMQ]
        C2[Job Status Events]
    end
    
    subgraph "Database"
        D1[(PostgreSQL)]
        D2[Status Updates]
    end
    
    A1 -->|Initiate Test/Job| A2
    A2 -->|Connect to SSE| B1
    A2 -->|Connect to SSE| B2
    B1 -->|Poll Queue Status| C1
    B2 -->|Poll Queue Status| C1
    B3 -->|Check DB Status| D1
    C1 -->|Job Events| B3
    D1 -->|Status Data| B3
    B3 -->|SSE Messages| A2
    A2 -->|Update UI| A3
```

### 2. SSE Implementation Components

#### A. Frontend EventSource

The frontend establishes SSE connections for real-time updates:

```typescript
// Test status SSE connection
const eventSource = new EventSource(`/api/test-status/sse/${testId}`);

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
const eventSource = new EventSource(`/api/job-status/sse/${runId}`);

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
// app/src/app/api/test-status/sse/[testId]/route.ts
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

        // Get Redis connection and create the Bull queue
        const connection = await getRedisConnection();
        const testQueue = new Queue(TEST_EXECUTION_QUEUE, { connection });
        
        // Handle disconnection
        const cleanup = async () => {
          if (!connectionClosed) {
            connectionClosed = true;
            controller.close();
            console.log(`[SSE] Client disconnected for test ${testId}`);
            try {
              await connection.disconnect();
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
        
        // Get all Bull jobs for this test ID
        const jobs = await testQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
        const testJob = jobs.find(job => job.data.testId === testId);
        
        if (!testJob) {
          console.log(`[SSE] Test ${testId} not found in Bull queue`);
          return;
        }
        
        // Set up polling to check test status from Bull queue
        const pollInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(pollInterval);
            return;
          }
          
          try {
            // Get all jobs again to find the latest state
            const updatedJobs = await testQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
            const updatedTestJob = updatedJobs.find(job => job.data.testId === testId);
            
            if (!updatedTestJob) {
              return;
            }
            
            // Get job state
            const state = await updatedTestJob.getState();
            const progress = JSON.stringify(await updatedTestJob.progress);
            
            // Map Bull states to our application states
            let status = state;
            if (state === 'completed') {
              const result = await updatedTestJob.returnvalue;
              status = result?.success === true ? 'completed' : 'failed';
            }
            
            // Get latest report data from DB
            const updatedReport = await db.query.reports.findFirst({
              where: and(
                eq(reports.entityType, 'test'),
                eq(reports.entityId, testId)
              ),
            });
            
            controller.enqueue(encoder.encode(createSSEMessage({ 
              status,
              testId,
              progress,
              reportPath: updatedReport?.reportPath,
              s3Url: updatedReport?.s3Url,
              error: undefined,
              ...(updatedTestJob.returnvalue || {})
            })));
            
            // If terminal state, close connection
            if (['completed', 'failed'].includes(state)) {
              console.log(`[SSE] Test ${testId} reached terminal state ${status}, closing connection`);
              connectionClosed = true;
              clearInterval(pollInterval);
              await cleanup();
              controller.close();
            }
          } catch (pollError) {
            console.error(`[SSE] Error polling test ${testId} status:`, pollError);
          }
        }, 1000); // Poll every second
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
// app/src/app/api/job-status/sse/[jobId]/route.ts
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

        // Get Redis connection and create the Bull queue
        const connection = await getRedisConnection();
        const jobQueue = new Queue(JOB_EXECUTION_QUEUE, { connection });
        
        // Handle disconnection
        const cleanup = async () => {
          if (!connectionClosed) {
            connectionClosed = true;
            controller.close();
            console.log(`[SSE] Client disconnected for job ${jobId}`);
            try {
              await connection.disconnect();
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
        
        // Get the Bull job to watch for events
        let job = await jobQueue.getJob(runId);
        
        if (!job) {
          console.log(`[SSE] Job ${runId} not found in Bull queue`);
          // Even if job not found in Bull, keep the connection alive
          // as it might be added later or already completed
          return;
        }
        
        // Set up polling to check job status from Bull queue and database
        const pollInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(pollInterval);
            return;
          }
          
          try {
            // Get fresh database run status first (more reliable than queue)
            const dbRun = await db.query.runs.findFirst({
              where: eq(runs.id, runId),
            });
            
            // If run shows terminal status in DB, use that status
            if (dbRun && ['completed', 'failed', 'passed', 'error'].includes(dbRun.status)) {
              console.log(`[SSE] Run ${runId} has terminal status ${dbRun.status} in database, sending update`);
              
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status: dbRun.status,
                runId: dbRun.id,
                duration: dbRun.duration,
                startedAt: dbRun.startedAt,
                completedAt: dbRun.completedAt,
                errorDetails: dbRun.errorDetails,
                artifactPaths: dbRun.artifactPaths
              })));
              
              // Close connection for terminal status
              connectionClosed = true;
              clearInterval(pollInterval);
              await cleanup();
              controller.close();
              return;
            }
            
            // Get fresh job from queue
            job = await jobQueue.getJob(runId);
            
            // If we have a job from the queue, process its state
            if (job) {
              // Get job state
              const state = await job.getState();
              const progress = JSON.stringify(await job.progress);
              
              // Map Bull states to our application states
              let status = state;
              if (state === 'completed') {
                // Check result to determine if passed or failed
                const result = await job.returnvalue;
                status = result?.success === true ? 'passed' : 'failed';
              }
              
              // Send status update based on Bull job state
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status,
                runId,
                progress,
                duration: dbRun?.duration || null,
                ...(job.returnvalue || {})
              })));
              
              // If terminal state, close connection
              if (['completed', 'failed'].includes(state)) {
                console.log(`[SSE] Job ${runId} reached terminal state ${status}, closing connection`);
                connectionClosed = true;
                clearInterval(pollInterval);
                await cleanup();
                controller.close();
              }
            } else if (dbRun) {
              // If we have a database run but no job in the queue, send the database status
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status: dbRun.status,
                runId: dbRun.id,
                duration: dbRun.duration,
                startedAt: dbRun.startedAt,
                completedAt: dbRun.completedAt
              })));
            }
          } catch (pollError) {
            console.error(`[SSE] Error polling job ${runId} status:`, pollError);
          }
        }, 1000); // Poll every second
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
 * Get or create Redis connection using environment variables.
 */
export async function getRedisConnection(): Promise<Redis> {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  if (redisClient) {
    try { await redisClient.quit(); } catch (e) { console.error('Error quitting old Redis client', e); }
    redisClient = null;
  }

  // Read directly from process.env
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;

  console.log(`[Queue Client] Connecting to Redis at ${host}:${port}`);
  
  const connectionOpts: RedisOptions = {
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Avoid ready check for client connection
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 3000); // Exponential backoff capped at 3s
      console.warn(`[Queue Client] Redis connection retry ${times}, delaying ${delay}ms`);
      return delay;
    }
  };

  redisClient = new Redis(connectionOpts);

  redisClient.on('error', (err) => console.error('[Queue Client] Redis Error:', err));
  redisClient.on('connect', () => console.log('[Queue Client] Redis Connected'));
  redisClient.on('ready', () => console.log('[Queue Client] Redis Ready'));
  redisClient.on('close', () => console.log('[Queue Client] Redis Closed'));

  return redisClient;
}
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
    const eventSource = new EventSource(`/api/job-status/sse/${jobId}`);
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
    const eventSource = new EventSource(`/api/job-status/sse/${runId}`);
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

### 1. Real-Time Updates

- **Live Progress**: Users see status changes immediately without refreshing
- **Reduced Polling**: Eliminates the need for constant API polling
- **Better UX**: Provides immediate feedback for long-running operations

### 2. Efficient Resource Usage

- **Single Connection**: One SSE connection per test/job instead of multiple HTTP requests
- **Server Push**: Server pushes updates when available, reducing client overhead
- **Connection Reuse**: Connection stays open for the duration of the operation

### 3. Reliable Status Tracking

- **Multiple Sources**: Combines BullMQ queue status with database status
- **Fallback Mechanisms**: Uses database status when queue status is unavailable
- **Error Handling**: Graceful handling of connection errors and timeouts

### 4. Scalable Architecture

- **Connection Management**: Proper cleanup of SSE connections
- **Memory Efficiency**: Minimal memory footprint per connection
- **Load Distribution**: SSE endpoints can be load balanced

## Configuration

### 1. Environment Variables

```bash
# Redis Configuration (for SSE)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# SSE Configuration
SSE_PING_INTERVAL=30000        # 30 seconds ping interval
SSE_POLL_INTERVAL=1000         # 1 second status poll interval
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

### 1. Connection Management

- **Proper Cleanup**: Always close SSE connections when no longer needed
- **Error Handling**: Implement robust error handling for connection failures
- **Timeout Management**: Set appropriate timeouts for long-running operations

### 2. Status Polling

- **Efficient Polling**: Use appropriate polling intervals (1 second for status updates)
- **Database Priority**: Check database status first, then queue status
- **Terminal State Detection**: Close connections when operations complete

### 3. Error Recovery

- **Graceful Degradation**: Fall back to polling if SSE fails
- **Reconnection Logic**: Implement automatic reconnection for dropped connections
- **Status Persistence**: Store status in database for reliability

### 4. Performance Optimization

- **Connection Limits**: Monitor and limit concurrent SSE connections
- **Memory Management**: Clean up resources properly
- **Load Balancing**: Distribute SSE connections across multiple servers

This comprehensive SSE implementation provides reliable, real-time status updates while maintaining system performance and user experience. 