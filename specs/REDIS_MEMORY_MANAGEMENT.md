# Redis Memory Management and Cleanup System

This document outlines the sophisticated Redis memory management strategy implemented in the application to prevent unbounded memory growth and ensure optimal performance.

## Overview

The application uses Redis extensively for job queuing (BullMQ), real-time status updates, and caching. Without proper memory management, Redis can grow indefinitely, leading to out-of-memory conditions and degraded performance. This system implements a comprehensive cleanup strategy to maintain predictable memory usage.

## Memory Management Strategy

### 1. TTL (Time-To-Live) Settings

The system implements different TTL values for different types of data:

```typescript
// Constants for Redis TTL
const REDIS_CHANNEL_TTL = 60 * 60; // 1 hour in seconds
const REDIS_JOB_TTL = 7 * 24 * 60 * 60; // 7 days for job data
const REDIS_EVENT_TTL = 24 * 60 * 60; // 24 hours for events/stats
const REDIS_METRICS_TTL = 48 * 60 * 60; // 48 hours for metrics data
const REDIS_CLEANUP_BATCH_SIZE = 100; // Process keys in smaller batches
```

**TTL Breakdown:**
- **Job Data (7 days)**: Completed and failed jobs are retained for analysis and debugging
- **Event Streams (24 hours)**: Real-time status updates expire after a day
- **Metrics Data (48 hours)**: Performance metrics are kept for two days
- **Channel Data (1 hour)**: Temporary pub/sub channels expire quickly

### 2. BullMQ Configuration

The system uses BullMQ with memory-optimized settings:

```typescript
// Memory-optimized job options
const defaultJobOptions = {
  removeOnComplete: { count: 500, age: 24 * 3600 }, // Keep completed jobs for 24 hours (500 max)
  removeOnFail: { count: 1000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (1000 max)
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 }
};

// Queue settings with Redis TTL and auto-cleanup options
const queueSettings = {
  connection,
  defaultJobOptions,
  // Settings to prevent orphaned Redis keys
  stalledInterval: 30000, // Check for stalled jobs every 30 seconds
  metrics: {
    maxDataPoints: 60, // Limit metrics storage to 60 data points (1 hour at 1 min interval)
    collectDurations: true
  }
};
```

**Key Features:**
- **Limited Job Retention**: Only 500 completed jobs and 1000 failed jobs are kept
- **Age-based Cleanup**: Jobs older than specified age are automatically removed
- **Stalled Job Detection**: Jobs that haven't progressed are checked every 30 seconds
- **Metrics Limitation**: Only 60 data points are stored for metrics

### 3. Automated Cleanup Mechanisms

#### A. Job Cleanup

The system performs regular cleanup of completed and failed jobs:

```typescript
// Clean up completed and failed jobs older than TTL
await this.jobQueue.clean(REDIS_JOB_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'completed');
await this.jobQueue.clean(REDIS_JOB_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'failed');
await this.testQueue.clean(REDIS_JOB_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'completed');
await this.testQueue.clean(REDIS_JOB_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'failed');
```

#### B. Event Stream Trimming

Event streams are capped to prevent unbounded growth:

```typescript
// Trim event streams to reduce memory usage
await this.jobQueue.trimEvents(1000);
await this.testQueue.trimEvents(1000);
```

#### C. Orphaned Key Detection

Background workers scan for keys without TTL and add expiration:

```typescript
/**
 * Cleans up orphaned Redis keys that might not have TTL set
 * Uses efficient SCAN pattern to reduce memory pressure
 */
private async cleanupOrphanedKeys(queueName: string): Promise<void> {
  try {
    // Use scan instead of keys to reduce memory pressure
    let cursor = '0';
    let processedKeys = 0;
    
    do {
      const [nextCursor, keys] = await this.redisClient.scan(
        cursor, 
        'MATCH', 
        `bull:${queueName}:*`, 
        'COUNT', 
        '100'
      );
      
      cursor = nextCursor;
      processedKeys += keys.length;
      
      // Process this batch of keys
      for (const key of keys) {
        // Skip keys that BullMQ manages automatically
        if (key.includes(':active') || key.includes(':wait') || 
            key.includes(':delayed') || key.includes(':failed') ||
            key.includes(':completed')) {
          continue;
        }
        
        // Check if the key has a TTL set
        const ttl = await this.redisClient.ttl(key);
        if (ttl === -1) { // -1 means key exists but no TTL is set
          // Set appropriate TTL based on key type
          let expiryTime = REDIS_JOB_TTL;
          
          if (key.includes(':events:')) {
            expiryTime = REDIS_EVENT_TTL;
          } else if (key.includes(':metrics')) {
            expiryTime = REDIS_METRICS_TTL;
          } else if (key.includes(':meta')) {
            continue; // Skip meta keys as they should live as long as the app runs
          }
          
          await this.redisClient.expire(key, expiryTime);
          this.logger.debug(`Set TTL of ${expiryTime}s for key: ${key}`);
        }
      }
    } while (cursor !== '0');
    
    this.logger.debug(`Processed ${processedKeys} Redis keys for queue: ${queueName}`);
  } catch (error) {
    this.logger.error(`Error cleaning up orphaned keys for ${queueName}:`, error);
  }
}
```

### 4. Memory Optimization Techniques

#### A. Batched Processing

Keys are processed in small batches to reduce memory pressure:

```typescript
const REDIS_CLEANUP_BATCH_SIZE = 100; // Process keys in smaller batches
```

#### B. Efficient Key Scanning

Uses Redis SCAN instead of KEYS to reduce memory pressure:

```typescript
// Use scan instead of keys to reduce memory pressure
const [nextCursor, keys] = await this.redisClient.scan(
  cursor, 
  'MATCH', 
  `bull:${queueName}:*`, 
  'COUNT', 
  '100'
);
```

#### C. Reduced Storage Limits

Lower limits for completed jobs (500) and failed jobs (1000):

```typescript
removeOnComplete: { count: 500, age: 24 * 3600 }, // Keep completed jobs for 24 hours (500 max)
removeOnFail: { count: 1000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (1000 max)
```

#### D. Frequent Cleanup

Cleanup operations run every 12 hours:

```typescript
// Schedule cleanup every 12 hours - more frequent than before
this.cleanupInterval = setInterval(async () => {
  try {
    await this.performRedisCleanup();
  } catch (error) {
    this.logger.error('Error during scheduled Redis cleanup:', error);
  }
}, 12 * 60 * 60 * 1000); // 12 hours
```

## Implementation Details

### 1. Redis Service

The main Redis service handles cleanup operations:

```typescript
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;
  private jobQueueEvents: QueueEvents;
  private testQueueEvents: QueueEvents;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    @InjectQueue(JOB_EXECUTION_QUEUE) private jobQueue: Queue,
    @InjectQueue(TEST_EXECUTION_QUEUE) private testQueue: Queue,
    private dbService: DbService
  ) {
    // Initialize Redis connection
    this.redisClient = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: null,
    });

    // Set up periodic cleanup for orphaned Redis keys
    this.setupRedisCleanup();
  }

  /**
   * Sets up periodic cleanup of orphaned Redis keys to prevent unbounded growth
   */
  private setupRedisCleanup() {
    this.logger.log('Setting up periodic Redis cleanup task');
    
    // Schedule cleanup every 12 hours
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performRedisCleanup();
      } catch (error) {
        this.logger.error('Error during scheduled Redis cleanup:', error);
      }
    }, 12 * 60 * 60 * 1000); // 12 hours
  }
}
```

### 2. Queue Client Cleanup

The frontend queue client also implements cleanup:

```typescript
/**
 * Sets up periodic cleanup of orphaned Redis keys to prevent unbounded growth
 */
async function setupQueueCleanup(connection: Redis): Promise<void> {
  try {
    // Run initial cleanup on startup to clear any existing orphaned keys
    await performQueueCleanup(connection);
    
    // Schedule queue cleanup every 12 hours
    const cleanupInterval = setInterval(async () => {
      try {
        await performQueueCleanup(connection);
      } catch (error) {
        console.error('[Queue Client] Error during scheduled queue cleanup:', error);
      }
    }, 12 * 60 * 60 * 1000); // Run cleanup every 12 hours
    
    // Make sure interval is properly cleared on process exit
    process.on('exit', () => clearInterval(cleanupInterval));
  } catch (error) {
    console.error('[Queue Client] Failed to set up queue cleanup:', error);
  }
}
```

### 3. Cleanup Operations

The system performs comprehensive cleanup operations:

```typescript
/**
 * Performs the actual queue cleanup operations
 */
async function performQueueCleanup(connection: Redis): Promise<void> {
  console.log('[Queue Client] Running queue cleanup for Redis keys');
  const queuesToClean = [
    { name: TEST_EXECUTION_QUEUE, queue: testQueue },
    { name: JOB_EXECUTION_QUEUE, queue: jobQueue },
    { name: MONITOR_EXECUTION_QUEUE, queue: monitorExecution },
    { name: HEARTBEAT_PING_NOTIFICATION_QUEUE, queue: heartbeatPingNotificationQueue },
    { name: JOB_SCHEDULER_QUEUE, queue: jobSchedulerQueue },
    { name: MONITOR_SCHEDULER_QUEUE, queue: monitorSchedulerQueue },
  ];

  for (const { name, queue } of queuesToClean) {
    if (queue) {
      console.log(`[Queue Client] Cleaning up queue: ${name}`);
      await cleanupOrphanedKeys(connection, name);
      
      // Clean completed and failed jobs older than TTL
      await queue.clean(REDIS_JOB_KEY_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'completed');
      await queue.clean(REDIS_JOB_KEY_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'failed');
      
      // Trim events to prevent Redis memory issues
      await queue.trimEvents(1000);
      console.log(`[Queue Client] Finished cleaning queue: ${name}`);
    }
  }
  console.log('[Queue Client] Finished all queue cleanup tasks.');
}
```

## Benefits

### 1. Predictable Memory Usage

- **Bounded Growth**: Memory usage is capped by TTL settings and cleanup limits
- **Automatic Cleanup**: No manual intervention required
- **Consistent Performance**: System performance remains stable over time

### 2. Automatic Recovery

- **Memory Leak Protection**: Orphaned keys are automatically detected and cleaned
- **Self-Healing**: System recovers from memory issues without manual intervention
- **Graceful Degradation**: Performance degrades gracefully under memory pressure

### 3. Protection Against Out-of-Memory

- **Redis OOM Prevention**: Prevents Redis from running out of memory
- **System Stability**: Ensures the entire application remains stable
- **Resource Efficiency**: Optimizes Redis memory usage for cost-effectiveness

### 4. Consistent Performance

- **Predictable Behavior**: Memory usage follows predictable patterns
- **No Performance Degradation**: System performance remains consistent regardless of uptime
- **Scalable Architecture**: Memory management scales with system load

## Monitoring and Debugging

### 1. Logging

The system provides comprehensive logging for cleanup operations:

```typescript
this.logger.log('Setting up periodic Redis cleanup task');
this.logger.debug(`Set TTL of ${expiryTime}s for key: ${key}`);
this.logger.debug(`Processed ${processedKeys} Redis keys for queue: ${queueName}`);
this.logger.log('Redis cleanup completed successfully');
```

### 2. Error Handling

Robust error handling ensures cleanup failures don't affect system operation:

```typescript
try {
  await this.performRedisCleanup();
} catch (error) {
  this.logger.error('Error during scheduled Redis cleanup:', error);
}
```

### 3. Metrics

The system tracks cleanup metrics for monitoring:

- Number of keys processed per cleanup cycle
- TTL values set for different key types
- Cleanup operation duration
- Error rates and types

## Configuration

### Environment Variables

The Redis memory management system can be configured via environment variables:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Memory Management (optional overrides)
REDIS_JOB_TTL=604800        # 7 days in seconds
REDIS_EVENT_TTL=86400       # 24 hours in seconds
REDIS_METRICS_TTL=172800    # 48 hours in seconds
REDIS_CLEANUP_BATCH_SIZE=100
```

### Docker Configuration

Redis is configured with memory limits in Docker:

```yaml
redis:
  image: redis:latest
  command: sh -c "rm -rf /data/* && redis-server --maxmemory 256mb --maxmemory-policy noeviction --save '' --appendonly no"
  deploy:
    resources:
      limits:
        cpus: '0.25'
        memory: 256M
      reservations:
        cpus: '0.1'
        memory: 128M
```

## Best Practices

### 1. Regular Monitoring

- Monitor Redis memory usage regularly
- Set up alerts for memory usage approaching limits
- Track cleanup operation success rates

### 2. Tuning TTL Values

- Adjust TTL values based on application needs
- Consider data retention requirements
- Balance memory usage with debugging needs

### 3. Batch Size Optimization

- Adjust batch sizes based on Redis performance
- Monitor cleanup operation duration
- Optimize for your specific workload

### 4. Error Handling

- Implement proper error handling for cleanup operations
- Log cleanup failures for investigation
- Ensure cleanup failures don't affect system operation

This comprehensive Redis memory management system ensures the application maintains optimal performance while preventing memory-related issues that could affect system stability and reliability. 