# Queue Setup Guide

This document captures the canonical BullMQ/Redis configuration used by Supercheck across the Next.js app and the worker service. Use it as the single reference when standing up new environments or debugging queue-related behaviour.

## Overview

- **Queues**
  - `test-execution`: ad-hoc single test runs.
  - `job-execution`: batch / scheduled jobs (subject to capacity limits).
  - `monitor-execution`: monitor checks triggered by schedulers.
  - `job-scheduler` & `monitor-scheduler`: cron-driven trigger queues.
  - `data-lifecycle-cleanup`: background cleanup and retention tasks.
- **Redis**: shared instance, accessed via ioredis with `maxRetriesPerRequest: null`, disabled ready checks, exponential retry, and optional TLS.
- **Workers**: the NestJS worker service processes jobs; the Next.js app only enqueues jobs (except for the cleanup worker which runs when the app is online).

## Architecture Principles

1. **Separation of Concerns**: Clear distinction between job producers (app) and consumers (workers)
2. **Scalability**: Horizontal scaling through multiple worker instances
3. **Reliability**: Built-in retry mechanisms and error handling
4. **Observability**: Comprehensive monitoring and logging
5. **Security**: Authentication and TLS for all connections

## Required Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `REDIS_HOST` | `localhost` | Redis host for both app and worker. |
| `REDIS_PORT` | `6379` | Redis port. |
| `REDIS_PASSWORD` | – | Password when auth is enabled. |
| `REDIS_USERNAME` | – | Optional username (ACL-enabled Redis). |
| `REDIS_TLS_ENABLED` | `false` | Set to `true` to enable TLS. |
| `REDIS_TLS_REJECT_UNAUTHORIZED` | `true` | Disable if using self-signed certs. |
| `RUNNING_CAPACITY` | `5` | Max concurrent `job-execution` tasks allowed globally. |
| `QUEUED_CAPACITY` | `50` | Max queued jobs before new submissions fail fast. |
| `MAX_CONCURRENT_EXECUTIONS` | `5` | Worker-local limit for simultaneous Playwright runs. |
| `DB_POOL_MAX` | `10` | Database connection pool size for workers. |
| `DB_IDLE_TIMEOUT` | `30` | Database idle timeout in seconds. |
| `DB_CONNECT_TIMEOUT` | `10` | Database connect timeout in seconds. |
| `DB_MAX_LIFETIME` | `1800` | Database connection max lifetime in seconds. |

> The worker resolves `MAX_CONCURRENT_EXECUTIONS` at boot time. Adjusting the env value and restarting the worker lets you scale vertically without code changes.

## Queue Capacity Enforcement

1. **API-side guard** – `addJobToQueue` calls `verifyQueueCapacityOrThrow`, which reads live queue metrics (active/waiting/delayed) via `Queue.getJobCounts`. When `running >= RUNNING_CAPACITY` and queued jobs exceed `QUEUED_CAPACITY`, new submissions are rejected with a descriptive error.
2. **Worker-side guard** – `ExecutionService` enforces `MAX_CONCURRENT_EXECUTIONS` locally to prevent Playwright thrashing. Set this equal to (or below) the number of CPU cores reserved for the worker pod.
3. **Operational overrides** – `setRunCapacityLimit` / `setQueueCapacityLimit` update Redis keys through short-lived duplicated clients so the shared BullMQ connection remains healthy.

## Redis Considerations

- Every QueueEvents subscription now uses a dedicated Redis connection to avoid back-pressure on worker clients.
- Scheduled cleanup runs every 12 hours to trim completed/failed jobs, metrics, and orphaned keys.
- Avoid running ad-hoc `KEYS bull:*` commands in production; rely on `queue.getJobCounts` or the metrics endpoints.

## Running the Worker Service

```bash
pnpm --filter worker build
pnpm --filter worker start
```

Ensure the `.env` file (or container environment) contains the Redis settings above. When scaling horizontally, deploy one worker instance per CPU core pair and adjust `MAX_CONCURRENT_EXECUTIONS` accordingly.

## Troubleshooting

- **Stale capacity limits** – update them via the API helpers or directly in Redis: `SET supercheck:capacity:running <value>`.
- **Queue events not firing** – confirm the dedicated QueueEvents connections are able to reach Redis (check worker logs for “Failed to initialize queue status listeners”).
- **High queued counts** – inspect `job-execution` waiting/delayed counts with `node ./scripts/queue-inspect.js` (see `@/lib/queue-stats.ts` for reference commands).

For deeper operational procedures (draining queues, clearing jobs, etc.), extend this document so all queue playbooks remain centralised.
