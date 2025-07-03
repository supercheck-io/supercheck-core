# Job Execution Flow & Parallelism (2024)

## Overview

This document describes the current job execution flow, parallel execution logic, and recent changes to the job runner system.

---

## Job Execution Flow

### Manual Job Run
1. **User clicks Run** in the UI.
2. **API (`/api/jobs/run`)**:
   - Creates a new `run` record in the DB (status: `running`).
   - Prepares test scripts.
   - Queues a job in BullMQ with `runId` as the BullMQ job ID.
   - **Does NOT update the job status in the DB** (worker is the only source of truth).
3. **Worker (JobExecutionProcessor)**:
   - Picks up the job from the queue.
   - Runs the tests, uploads reports, updates the `run` and `job` status in the DB.
   - Sends notifications if configured.

### Scheduled Job Run
1. **Job scheduler** (BullMQ repeatable job) triggers based on cron.
2. **Scheduler worker** creates a new `run` record and queues a job with `runId` as the BullMQ job ID.
3. **Worker (JobExecutionProcessor)**: Same as above.

---

## Parallel Execution Logic

- **Parallelism is controlled by BullMQ worker concurrency.**
- The number of jobs that can run in parallel is set by the worker's `concurrency` option.
- **No polling, no orphan checks, no manual DB status updates outside the worker.**
- Jobs above the concurrency limit are queued and processed as soon as a slot is free.

### Example: Setting Concurrency

```ts
// In your worker setup (NestJS or plain Node):
new Worker(JOB_EXECUTION_QUEUE, processor, { concurrency: process.env.PARALLEL_EXECUTIONS || 5 });
```

- To change parallelism per plan, set `PARALLEL_EXECUTIONS` dynamically based on the user's subscription.

---

## How to Change Parallelism Per Plan

- Store the allowed parallel executions per user/plan in your DB or config.
- When starting the worker, read this value and set the concurrency accordingly.
- You can run multiple workers for different tenants if needed.

---

## Recent Changes & Best Practices

- **Removed all polling, orphan checks, and manual capacity logic.**
- **Single source of truth:** Only the worker updates job and run status in the DB.
- **No more race conditions:** API does not update job status after queuing.
- **BullMQ events only:** All status changes are event-driven.
- **Consistent job ID usage:** Always use `runId` as the BullMQ job ID for both manual and scheduled runs.
- **Notifications:** Sent only after job completion, using the correct job ID for DB lookups.

---

## Troubleshooting

- **Job status stuck as 'running' after refresh?**
  - Ensure the API does NOT update job status after queuing. Only the worker should update status.
- **Parallel jobs exceed limit?**
  - Check the worker's concurrency setting. BullMQ will enforce this strictly.
- **Job status not updating?**
  - Ensure the worker is running and connected to the queue.

---

## Extending for Future Plans

- To support different parallelism per user/plan:
  - Store the allowed concurrency in your user/plan model.
  - Dynamically set the worker concurrency at startup or per tenant.
  - Optionally, use separate queues/workers for different plans.

---

## Summary

- **No polling, no orphan checks, no duplicate DB updates.**
- **BullMQ concurrency is the only limit on parallel jobs.**
- **Worker is the single source of truth for job status.**
- **All status changes are event-driven.**
- **Easy to extend for SaaS plans.** 