# Monitor Data Cleanup Implementation

## Overview

Automated cleanup service for managing monitor result data growth in high-frequency monitoring scenarios. This enterprise-grade solution prevents database bloat while preserving critical historical data.

## Problem Statement

High-frequency monitoring (1-minute intervals) generates significant data:

- **1 monitor**: 1,440 records/day = 525,600 records/year
- **100 monitors**: 144,000 records/day = 52.6M records/year
- **500 monitors**: 720,000 records/day = 263M records/year

Without cleanup, the `monitor_results` table grows unbounded, causing:

- Slower query performance
- Increased storage costs
- Backup/restore difficulties
- Database maintenance issues

## Solution Architecture

### Two-Layer Approach

1. **UI Display Limit** (`NEXT_PUBLIC_RECENT_MONITOR_RESULTS_LIMIT`)

   - Controls how many results are **displayed** in the UI
   - Default: 10,000 most recent results
   - Keeps queries fast via pagination

2. **Database Retention** (`MONITOR_RETENTION_DAYS`)
   - Controls how long data is **stored** in the database
   - Default: 30 days
   - Actually deletes old data via scheduled cleanup

## Implementation Details

### Core Service

**Location**: [app/src/lib/monitor-data-cleanup.ts](../app/src/lib/monitor-data-cleanup.ts)

**Features**:

- ✅ BullMQ-based scheduling with retry logic
- ✅ Batch processing (configurable batch size)
- ✅ Per-monitor cleanup tracking
- ✅ Preserves critical status change events
- ✅ Safety limits prevent runaway deletions
- ✅ Comprehensive logging and metrics
- ✅ Dry-run mode for testing
- ✅ Manual trigger capability

### Configuration

```env
# Monitor Data Cleanup Configuration
MONITOR_CLEANUP_ENABLED=true                # Enable/disable cleanup
MONITOR_CLEANUP_CRON="0 2 * * *"            # Run daily at 2 AM
MONITOR_RETENTION_DAYS=30                    # Keep 30 days of data
MONITOR_CLEANUP_BATCH_SIZE=1000              # Delete 1000 records at a time
MONITOR_PRESERVE_STATUS_CHANGES=true         # Keep status change events
MONITOR_CLEANUP_SAFETY_LIMIT=1000000         # Max 1M records per run
```

### Integration Points

1. **Scheduler Initialization** - [scheduler-initializer.tsx](../app/src/components/scheduler-initializer.tsx)

   - Initializes on application startup
   - Runs alongside job and monitor schedulers

2. **Job Scheduler** - [job-scheduler.ts](../app/src/lib/job-scheduler.ts)

   - Provides initialization and cleanup functions
   - Manages service lifecycle

3. **Environment Files**
   - [.env.example](../.env.example)
   - [app/.env.example](../app/.env.example)
   - [docker-compose.yml](../docker-compose.yml)
   - [docker-compose-secure.yml](../docker-compose-secure.yml)

## How It Works

### Cleanup Process

```
1. Scheduled Job Triggers (cron: 0 2 * * *)
   ↓
2. Calculate Cutoff Date (NOW - RETENTION_DAYS)
   ↓
3. For Each Monitor:
   ↓
   a. Query records older than cutoff
   ↓
   b. Delete in batches (BATCH_SIZE)
   ↓
   c. Preserve status changes (optional)
   ↓
   d. Track metrics and errors
   ↓
4. Return Detailed Results
```

### Batch Processing

```typescript
// Efficient batch deletion with safety checks
DELETE FROM monitor_results
WHERE monitor_id = ?
  AND checked_at < ?
  AND is_status_change = false  -- Preserve status changes
LIMIT 1000;  -- Process in batches
```

### Status Change Preservation

When `MONITOR_PRESERVE_STATUS_CHANGES=true`:

- Keeps all `is_status_change = true` records
- Critical for uptime history
- Useful for incident analysis
- Minimal storage overhead

## Best Practices

### Retention Period Selection

| Scenario             | Recommended Days | Rationale                      |
| -------------------- | ---------------- | ------------------------------ |
| Development          | 7 days           | Quick testing, minimal storage |
| Small Production     | 30 days          | Balance history & performance  |
| Enterprise           | 90 days          | Compliance, detailed analysis  |
| Long-term Monitoring | 365 days         | Trend analysis, SLA reporting  |

### Performance Tuning

**Batch Size**:

- Small databases: 500-1000 records
- Large databases: 1000-5000 records
- Very large: Consider aggregation tables

**Schedule**:

- Off-peak hours (default: 2 AM)
- After backups complete
- Before heavy monitoring periods

**Safety Limits**:

- Prevents accidental mass deletion
- Default: 1M records per run
- Adjust based on data volume

## Monitoring & Metrics

### Cleanup Results

```typescript
interface CleanupResult {
  success: boolean;
  recordsDeleted: number;
  monitorsProcessed: number;
  errorsEncountered: number;
  duration: number;
  details: Array<{
    monitorId: string;
    monitorName: string;
    recordsDeleted: number;
    error?: string;
  }>;
}
```

### Logs

```
[MONITOR_CLEANUP] Initialized with config: { ... }
[MONITOR_CLEANUP] Starting cleanup process...
[MONITOR_CLEANUP] Deleting monitor results older than: 2025-01-03T02:00:00.000Z (30 days ago)
[MONITOR_CLEANUP] Found 150 monitors to process
[MONITOR_CLEANUP] Monitor API Health Check (123-456): deleted 42,500 records
[MONITOR_CLEANUP] Cleanup completed: 3,245,000 records deleted in 125,430ms
```

## Manual Operations

### Trigger Manual Cleanup

```typescript
import { getMonitorDataCleanupService } from "@/lib/monitor-data-cleanup";

const service = getMonitorDataCleanupService();
if (service) {
  // Actual cleanup
  const result = await service.triggerManualCleanup(false);

  // Or dry run (analyze only)
  const analysis = await service.triggerManualCleanup(true);
}
```

### Check Status

```typescript
const status = await service.getCleanupStatus();
console.log(status.queueStatus);
```

## Security Considerations

✅ **Safe by Design**:

- Batch processing prevents lock escalation
- Safety limits prevent accidental mass deletion
- Transaction support for rollback
- No sensitive data in logs

✅ **Access Control**:

- Only app service can trigger cleanup
- No external API exposure
- Respects database permissions

## Troubleshooting

### Issue: Cleanup not running

**Check**:

1. `MONITOR_CLEANUP_ENABLED=true`
2. Valid cron schedule
3. Redis connectivity
4. Check logs for errors

### Issue: Slow cleanup

**Solutions**:

1. Reduce `MONITOR_CLEANUP_BATCH_SIZE`
2. Add database indexes on `checked_at`
3. Run during off-peak hours
4. Consider partitioning large tables

### Issue: Too much data deleted

**Prevention**:

1. Test with dry run first
2. Verify `MONITOR_RETENTION_DAYS`
3. Check `MONITOR_PRESERVE_STATUS_CHANGES`
4. Review safety limits

## Future Enhancements

### Potential Features

1. **Aggregation Tables**

   - Hourly/daily summaries
   - Reduced storage with trend data
   - Faster historical queries

2. **Plan-Based Retention**

   - Free tier: 7 days
   - Pro tier: 30 days
   - Enterprise: 90+ days

3. **Export Before Delete**

   - Archive to cold storage
   - Compliance requirements
   - Historical analysis

4. **Selective Retention**
   - Critical monitors: longer retention
   - Test monitors: shorter retention
   - Tag-based policies

## References

- [Data Retention Strategy](./DATA_RETENTION_STRATEGY.md) - Comprehensive retention planning
- [Enterprise Data Cleanup Implementation](./ENTERPRISE_DATA_CLEANUP_IMPLEMENTATION.md) - Full enterprise patterns
- [Playground Cleanup](../app/src/lib/playground-cleanup.ts) - Similar pattern for S3 cleanup

## Summary

This implementation provides a robust, enterprise-grade solution for managing monitor data growth:

- **Automated**: Runs on schedule, no manual intervention
- **Safe**: Batch processing, safety limits, status change preservation
- **Configurable**: Flexible retention policies via environment variables
- **Observable**: Detailed metrics and logging
- **Tested**: Dry-run mode for validation

The service prevents database bloat while preserving critical historical data, ensuring Supercheck can scale efficiently for high-frequency monitoring workloads.
