# Monitor Cleanup Testing Guide

## ✅ Implementation Verification Checklist

### Core Logic Review
- [x] **Batch processing**: Uses `LIMIT` in CTE for controlled deletions
- [x] **Safety limits**: `maxIterations` prevents runaway deletions
- [x] **Status change preservation**: Conditional WHERE clause preserves important events
- [x] **Error handling**: Try-catch blocks with proper error propagation
- [x] **Database efficiency**: Uses CTE with RETURNING for accurate counts
- [x] **Memory safety**: Processes in batches, doesn't load all IDs into memory
- [x] **Configuration validation**: Validates all env vars on initialization

### Integration Points
- [x] **BullMQ integration**: Queue, Worker, QueueEvents properly configured
- [x] **Scheduler integration**: Initialized in scheduler-initializer.tsx
- [x] **Lifecycle management**: Shutdown handlers in place
- [x] **Redis connection**: Shares connection from queue system

---

## 🧪 Testing Strategy

### Phase 1: Pre-Flight Checks (No Data Risk)
### Phase 2: Dry-Run Testing (Safe - No Deletions)
### Phase 3: Small-Scale Testing (Controlled Deletion)
### Phase 4: Production Testing (Full Deployment)

---

## Phase 1: Pre-Flight Checks

### 1.1 Verify Installation

```bash
# Check file exists
ls -la app/src/lib/monitor-data-cleanup.ts

# Check TypeScript compilation
cd app
npx tsc --noEmit src/lib/monitor-data-cleanup.ts

# Expected: No errors
```

### 1.2 Verify Configuration

```bash
# Check environment variables are set
grep MONITOR_ .env

# Expected output:
# MONITOR_CLEANUP_ENABLED=true
# MONITOR_CLEANUP_CRON=0 2 * * *
# MONITOR_RETENTION_DAYS=30
# MONITOR_CLEANUP_BATCH_SIZE=1000
# MONITOR_PRESERVE_STATUS_CHANGES=true
# MONITOR_CLEANUP_SAFETY_LIMIT=1000000
```

### 1.3 Verify Service Initialization

```bash
# Start the app
docker-compose up -d app

# Check logs for initialization
docker-compose logs app | grep MONITOR_CLEANUP

# Expected logs:
# [MONITOR_CLEANUP] Initialized with config: { ... }
# [MONITOR_CLEANUP] Scheduling cleanup job with cron: 0 2 * * *
# [MONITOR_CLEANUP] Cleanup job scheduled successfully
# [MONITOR_CLEANUP] Initialization completed successfully
# ✅ Monitor data cleanup initialized successfully
```

**✅ If you see these logs, initialization is working!**

---

## Phase 2: Dry-Run Testing (Safe)

### 2.1 Create Test API Endpoint

Create: `app/src/app/api/admin/monitor-cleanup/test/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getMonitorDataCleanupService } from '@/lib/monitor-data-cleanup';
import { requireAuth } from '@/lib/rbac/middleware';
import { isSuperAdmin } from '@/lib/admin';

export async function POST() {
  try {
    // Require super admin
    await requireAuth();
    const isAdmin = await isSuperAdmin();

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const service = getMonitorDataCleanupService();

    if (!service) {
      return NextResponse.json({
        error: 'Monitor cleanup service not initialized'
      }, { status: 500 });
    }

    // DRY RUN - no actual deletion
    const result = await service.triggerManualCleanup(true);

    return NextResponse.json({
      success: true,
      dryRun: true,
      result,
    });
  } catch (error) {
    console.error('Dry run test failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### 2.2 Run Dry-Run Test

```bash
# Method 1: Via API (requires super admin login)
curl -X POST http://localhost:3000/api/admin/monitor-cleanup/test \
  -H "Cookie: your-session-cookie" \
  -H "Content-Type: application/json"

# Method 2: Via Docker logs and manual trigger
# (Add manual trigger endpoint or use Node REPL)

# Expected response:
{
  "success": true,
  "dryRun": true,
  "result": {
    "success": true,
    "recordsDeleted": 12500,  // Would delete this many
    "monitorsProcessed": 15,
    "errorsEncountered": 0,
    "duration": 1250,
    "details": [
      {
        "monitorId": "...",
        "monitorName": "API Health Check",
        "recordsDeleted": 4320  // 3 days of 1-min checks
      }
      // ... more monitors
    ]
  }
}
```

### 2.3 Analyze Dry-Run Results

**Key Checks:**
1. **Sanity check numbers**: Does `recordsDeleted` make sense?
   ```
   Expected = (monitors) × (checks per day) × (days beyond retention)
   Example: 10 monitors × 1440 checks/day × 3 days = 43,200 records
   ```

2. **Verify status changes preserved**:
   - Compare total records vs what would be deleted
   - Should see status changes are NOT counted

3. **Check error count**: Should be 0

**If numbers look wrong:**
```bash
# Manually verify database
docker-compose exec postgres psql -U postgres -d supercheck

-- Count total monitor results
SELECT COUNT(*) FROM monitor_results;

-- Count records older than 30 days
SELECT COUNT(*) FROM monitor_results
WHERE checked_at < NOW() - INTERVAL '30 days';

-- Count status changes that would be preserved
SELECT COUNT(*) FROM monitor_results
WHERE checked_at < NOW() - INTERVAL '30 days'
  AND is_status_change = true;
```

---

## Phase 3: Small-Scale Testing

### 3.1 Create Test Monitor with Old Data

```sql
-- Connect to database
docker-compose exec postgres psql -U postgres -d supercheck

-- Find a test monitor
SELECT id, name FROM monitors LIMIT 1;

-- Insert old test records (safe to delete)
INSERT INTO monitor_results (
  monitor_id,
  checked_at,
  status,
  is_up,
  is_status_change,
  consecutive_failure_count,
  alerts_sent_for_failure
)
SELECT
  '<your-monitor-id>',
  NOW() - INTERVAL '35 days' + (i || ' minutes')::INTERVAL,
  'up',
  true,
  false,
  0,
  0
FROM generate_series(1, 1000) i;

-- Verify insertion
SELECT COUNT(*) FROM monitor_results
WHERE monitor_id = '<your-monitor-id>'
  AND checked_at < NOW() - INTERVAL '30 days';

-- Should return 1000
```

### 3.2 Test with Reduced Retention (Temporary)

```bash
# Temporarily set low retention for testing
# Edit .env
MONITOR_RETENTION_DAYS=30  # Keep this
MONITOR_CLEANUP_BATCH_SIZE=100  # Reduce for testing

# Restart app
docker-compose restart app

# Check logs
docker-compose logs -f app | grep MONITOR_CLEANUP
```

### 3.3 Manual Trigger (Real Deletion)

Create: `app/src/app/api/admin/monitor-cleanup/run/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getMonitorDataCleanupService } from '@/lib/monitor-data-cleanup';
import { requireAuth } from '@/lib/rbac/middleware';
import { isSuperAdmin } from '@/lib/admin';

export async function POST() {
  try {
    await requireAuth();
    const isAdmin = await isSuperAdmin();

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const service = getMonitorDataCleanupService();

    if (!service) {
      return NextResponse.json({
        error: 'Service not initialized'
      }, { status: 500 });
    }

    // REAL CLEANUP - actually deletes data
    const result = await service.triggerManualCleanup(false);

    return NextResponse.json({
      success: true,
      dryRun: false,
      result,
    });
  } catch (error) {
    console.error('Cleanup failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### 3.4 Run Real Cleanup

```bash
# Trigger cleanup
curl -X POST http://localhost:3000/api/admin/monitor-cleanup/run \
  -H "Cookie: your-session-cookie"

# Expected response:
{
  "success": true,
  "dryRun": false,
  "result": {
    "success": true,
    "recordsDeleted": 1000,  // Actually deleted
    "monitorsProcessed": 1,
    "errorsEncountered": 0,
    "duration": 523,
    "details": [...]
  }
}
```

### 3.5 Verify Deletion

```sql
-- Verify records were deleted
SELECT COUNT(*) FROM monitor_results
WHERE monitor_id = '<your-monitor-id>'
  AND checked_at < NOW() - INTERVAL '30 days';

-- Should return 0 (all deleted)

-- Verify recent records remain
SELECT COUNT(*) FROM monitor_results
WHERE monitor_id = '<your-monitor-id>'
  AND checked_at >= NOW() - INTERVAL '30 days';

-- Should show recent records intact
```

### 3.6 Verify Status Changes Preserved

```sql
-- Insert test status change in old data
INSERT INTO monitor_results (
  monitor_id,
  checked_at,
  status,
  is_up,
  is_status_change,  -- Set to TRUE
  consecutive_failure_count,
  alerts_sent_for_failure
)
VALUES (
  '<your-monitor-id>',
  NOW() - INTERVAL '60 days',  -- Very old
  'down',
  false,
  true,  -- STATUS CHANGE
  1,
  0
);

-- Run cleanup
-- (Use API endpoint from 3.4)

-- Verify status change was preserved
SELECT * FROM monitor_results
WHERE monitor_id = '<your-monitor-id>'
  AND is_status_change = true
  AND checked_at < NOW() - INTERVAL '30 days';

-- Should return the status change record
```

---

## Phase 4: Production Testing

### 4.1 Monitor Queue Status

```bash
# Check cleanup queue status via API
# Create: app/src/app/api/admin/monitor-cleanup/status/route.ts
```

```typescript
import { NextResponse } from 'next/server';
import { getMonitorDataCleanupService } from '@/lib/monitor-data-cleanup';
import { requireAuth } from '@/lib/rbac/middleware';
import { isSuperAdmin } from '@/lib/admin';

export async function GET() {
  try {
    await requireAuth();
    const isAdmin = await isSuperAdmin();

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const service = getMonitorDataCleanupService();

    if (!service) {
      return NextResponse.json({
        error: 'Service not initialized'
      }, { status: 500 });
    }

    const status = await service.getCleanupStatus();

    return NextResponse.json(status);
  } catch (error) {
    console.error('Status check failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### 4.2 Wait for Scheduled Run

```bash
# Check when next run is scheduled (2 AM daily by default)
docker-compose logs app | grep "monitor-cleanup-job"

# On next day at 2 AM, check logs
docker-compose logs app | grep MONITOR_CLEANUP | grep "Starting cleanup"

# Expected logs:
# [MONITOR_CLEANUP] Processing cleanup job: monitor-cleanup-recurring
# [MONITOR_CLEANUP] Starting cleanup process...
# [MONITOR_CLEANUP] Deleting monitor results older than: 2025-01-03T02:00:00.000Z
# [MONITOR_CLEANUP] Found 50 monitors to process
# [MONITOR_CLEANUP] Monitor API Check (xxx): deleted 4,320 records
# [MONITOR_CLEANUP] Cleanup completed: 215,000 records deleted in 45,230ms
```

### 4.3 Monitor Database Size

```bash
# Before cleanup
docker-compose exec postgres psql -U postgres -d supercheck -c \
  "SELECT pg_size_pretty(pg_total_relation_size('monitor_results'));"

# Wait for cleanup to run

# After cleanup
docker-compose exec postgres psql -U postgres -d supercheck -c \
  "SELECT pg_size_pretty(pg_total_relation_size('monitor_results'));"

# Should see size reduction
```

### 4.4 Verify No Performance Impact

```bash
# Monitor database during cleanup
docker-compose exec postgres psql -U postgres -d supercheck -c \
  "SELECT pid, state, query FROM pg_stat_activity WHERE state != 'idle';"

# Should see DELETE queries in batches
# Each batch should complete quickly (< 1 second)
```

---

## 🐛 Troubleshooting

### Issue: Service not initializing

**Check:**
```bash
# Verify Redis is running
docker-compose ps redis

# Check Redis connectivity
docker-compose exec app node -e "
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL);
  redis.ping().then(() => console.log('✅ Redis OK')).catch(e => console.error('❌', e));
"
```

### Issue: No cleanup happening

**Check:**
1. Is cleanup enabled?
   ```bash
   docker-compose exec app printenv | grep MONITOR_CLEANUP_ENABLED
   ```

2. Is cron schedule valid?
   ```bash
   # Test cron parsing
   docker-compose exec app node -e "
     const parser = require('cron-parser');
     const schedule = '0 2 * * *';
     const interval = parser.parseExpression(schedule);
     console.log('Next run:', interval.next().toString());
   "
   ```

3. Check BullMQ queue:
   ```bash
   docker-compose logs app | grep "monitor-data-cleanup"
   ```

### Issue: Too much/too little data deleted

**Verify configuration:**
```bash
# Check retention days
echo $MONITOR_RETENTION_DAYS

# Manually calculate expected deletions
docker-compose exec postgres psql -U postgres -d supercheck -c "
  SELECT
    COUNT(*) as total_old_records,
    COUNT(*) FILTER (WHERE is_status_change = false) as would_delete,
    COUNT(*) FILTER (WHERE is_status_change = true) as would_preserve
  FROM monitor_results
  WHERE checked_at < NOW() - INTERVAL '30 days';
"
```

---

## ✅ Success Criteria

### Your implementation is working correctly if:

1. **Dry run shows accurate counts** ✓
2. **Actual cleanup deletes expected amount** ✓
3. **Status changes are preserved** (if enabled) ✓
4. **Recent data remains intact** ✓
5. **No database errors in logs** ✓
6. **Scheduled jobs execute at correct time** ✓
7. **Database size decreases appropriately** ✓
8. **No performance degradation during cleanup** ✓

---

## 📊 Monitoring in Production

### Daily Checks (Week 1)

```bash
# Check last cleanup result
docker-compose logs app | grep "Cleanup completed" | tail -1

# Verify database growth is controlled
docker-compose exec postgres psql -U postgres -d supercheck -c "
  SELECT
    COUNT(*) as total_records,
    pg_size_pretty(pg_total_relation_size('monitor_results')) as table_size,
    MAX(checked_at) as newest_record,
    MIN(checked_at) as oldest_record
  FROM monitor_results;
"
```

### Weekly Checks (Month 1)

- Database size trend (should stabilize)
- Cleanup success rate (should be 100%)
- Error logs (should be none)
- Query performance (should remain fast)

---

## 🎯 Quick Start Testing

**Fastest way to test:**

```bash
# 1. Ensure service is running
docker-compose up -d

# 2. Check initialization
docker-compose logs app | grep "Monitor data cleanup"

# 3. Trigger dry run (via API or logs)
# Create test endpoint and call it

# 4. Verify results make sense

# 5. Run actual cleanup on test data

# 6. Verify deletion worked

# Done! ✅
```

---

## 📝 Test Results Template

```markdown
## Monitor Cleanup Test Results

**Date**: 2025-02-03
**Environment**: Development/Staging/Production
**Tester**: Your Name

### Pre-Flight Checks
- [ ] Files exist and compile
- [ ] Configuration validated
- [ ] Service initializes successfully

### Dry-Run Tests
- [ ] Dry run completes without errors
- [ ] Record counts are accurate
- [ ] Status changes accounted for correctly

### Small-Scale Tests
- [ ] Test data created successfully
- [ ] Manual cleanup deletes correct amount
- [ ] Recent data preserved
- [ ] Status changes preserved (if enabled)

### Production Tests
- [ ] Scheduled job runs at correct time
- [ ] Database size decreases appropriately
- [ ] No performance impact
- [ ] No errors in logs

### Issues Found
- None / List any issues

### Recommendations
- Ready for production / Needs adjustments

**Approval**: ✅ / ❌
```

---

## Summary

This testing guide provides:
✅ **4-phase testing approach** (safe → production)
✅ **SQL verification queries** (double-check everything)
✅ **API endpoints for manual testing** (easy testing)
✅ **Troubleshooting guide** (when things go wrong)
✅ **Success criteria checklist** (know when it works)

**Start with Phase 1 and 2** - they're completely safe and will give you confidence the implementation works correctly!
