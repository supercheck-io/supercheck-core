# Migration Guide: PgBoss to BullMQ

This document explains the changes made to replace PgBoss (PostgreSQL-based queue) with BullMQ (Redis-based queue) and how to migrate your existing application.

## Changes Summary

1. **Queue Backend**: Changed from PostgreSQL to Redis
2. **Queue Library**: Replaced PgBoss with BullMQ
3. **Dependencies**: Added `bullmq` and `ioredis` packages
4. **Configuration**: Added Redis connection settings

## Migration Steps

### 1. Install New Dependencies

```bash
npm install --save bullmq ioredis
```

### 2. Configure Redis Connection

Add the following environment variable:

```bash
REDIS_URL=redis://localhost:6379
```

### 3. API Differences Between PgBoss and BullMQ

| PgBoss                  | BullMQ                                |
|-------------------------|---------------------------------------|
| `boss.send()`           | `queue.add()`                         |
| `boss.work()`           | `new Worker()`                        |
| `boss.schedule()`       | `queue.add()` with `repeat` option    |
| `boss.unschedule()`     | `queue.removeRepeatableByKey()`       |
| `boss.getSchedules()`   | `queue.getRepeatableJobs()`           |
| `boss.getQueueSize()`   | `queue.getJobCounts()`                |
| `boss.stop()`           | `queue.close()` and `worker.close()`  |
| `boss.start()`          | Queue is ready upon creation          |

### 4. Key Implementation Changes

1. **Job Creation**
   - PgBoss: `await boss.send(queueName, data, options)`
   - BullMQ: `await queue.add(queueName, data, options)`

2. **Worker Processing**
   - PgBoss: Processes jobs in batches
   - BullMQ: Processes jobs individually

3. **Job Completion**
   - PgBoss: Uses state-based queues (`__state__completed__`)
   - BullMQ: Uses events (`completed`, `failed`)

4. **Scheduling**
   - PgBoss: Uses a separate schedule API
   - BullMQ: Uses the same job API with repeat options

### 5. Data Migration

If you need to migrate existing queued jobs from PgBoss to BullMQ:

1. Get all pending jobs from PgBoss:

   ```sql
   SELECT * FROM pgboss.job WHERE state = 'created' OR state = 'retry';
   ```

2. Re-queue these jobs in BullMQ:

   ```javascript
   for (const job of pgBossJobs) {
     await queue.add(job.name, JSON.parse(job.data), {
       jobId: job.id,
       attempts: job.retryLimit + 1
     });
   }
   ```

### 6. Configuration for Kubernetes

The BullMQ implementation is designed to be stateless and ready for Kubernetes:

1. Job results are tracked in Redis instead of in-memory
2. Queue events are distributed across pods
3. Workers can run in separate pods from the API

See `deployment.md` for detailed Kubernetes deployment configurations.

### 7. Monitoring

BullMQ provides better monitoring capabilities:

1. Use the BullMQ dashboard UI or Bull Board for monitoring
2. Redis metrics can be monitored using Redis exporters for Prometheus
3. Worker events (`completed`, `failed`, `stalled`) can be used for metrics

## Recommendations for Testing

1. Start with a clean Redis instance
2. Run both systems in parallel during migration
3. Monitor job completion to ensure the new system processes jobs correctly
4. Watch for any Redis-specific issues (memory, connection limits)

## Common Issues

1. **Redis Connection Errors**
   - Ensure Redis is running and accessible
   - Check REDIS_URL format and authentication

2. **Job Processing Differences**
   - BullMQ processing is more immediate than PgBoss
   - May need to adjust concurrency settings

3. **Memory Usage**
   - Redis is memory-based, so monitor memory usage
   - Configure appropriate Redis persistence settings

4. **Statelessness Considerations**
   - For true statelessness, ensure Redis is clustered or highly available
   - Use Redis Sentinel or Redis Cluster for production environments
