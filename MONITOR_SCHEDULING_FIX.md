# Monitor Scheduling System - Robust Implementation

## Overview

This document describes the comprehensive fix implemented for the monitor scheduling system to address issues with monitors not running regularly after laptop sleep/resume cycles.

## Problem Statement

### Original Issues
1. **Monitors not running after sleep/resume**: Monitor schedules were lost when the system went to sleep and resumed
2. **Inconsistent behavior**: Job schedulers worked fine, but monitor schedulers failed
3. **Architecture gap**: Monitor schedulers used Redis-only repeatable jobs, which are less reliable than job schedulers
4. **Missing workers**: The app created monitor schedules but had no workers to process them

### Root Causes
- **Redis-only scheduling**: Monitors used Redis repeatable jobs that don't handle system sleep/resume well
- **No persistence**: Schedules were lost on system restarts
- **Architecture mismatch**: Different scheduling patterns between jobs and monitors
- **Missing initialization**: No proper startup sequence for monitor schedulers

## Solution Architecture

### 1. Database Schema Changes

**Added `scheduledJobId` field to monitors table:**
```sql
ALTER TABLE "monitors" ADD COLUMN "scheduled_job_id" varchar(255);
```

This follows the same pattern as jobs, which store their scheduler IDs in the database for persistence.

### 2. Monitor Scheduler Implementation

**File: `app/src/lib/monitor-scheduler.ts`**

#### Key Functions:
- `scheduleMonitor()` - Creates BullMQ repeatable jobs for monitors
- `deleteScheduledMonitor()` - Removes monitor schedules
- `initializeMonitorSchedulers()` - Initializes all active monitors on startup
- `cleanupMonitorScheduler()` - Cleans up orphaned jobs

#### Features:
- **BullMQ repeatable jobs** instead of Redis-only
- **Persistent scheduling** that survives restarts
- **Proper cleanup** of orphaned jobs
- **Retry logic** with exponential backoff

### 3. Monitor Service Layer

**File: `app/src/lib/monitor-service.ts`**

#### Key Functions:
- `createMonitorHandler()` - Creates monitors and schedules them
- `updateMonitorHandler()` - Updates monitors and re-schedules if needed
- `deleteMonitorHandler()` - Deletes monitors and removes schedules

#### Features:
- **Database integration** with `scheduledJobId` tracking
- **Consistent state** between database and Redis
- **Proper cleanup** on monitor deletion/updates
- **Graceful failures** - monitors still work if scheduling fails

### 4. API Routes Update

**File: `app/src/app/api/monitors/route.ts`**

#### Changes:
- Updated to use new service functions
- Added proper null checks for `organizationId`
- Maintains existing functionality while using new scheduler
- Better error handling and validation

### 5. Runner Integration

**File: `runner/src/scheduler/processors/monitor-scheduler.processor.ts`**

#### Features:
- Processes scheduled monitor triggers
- Adds jobs to execution queue (like job scheduler does)
- Handles retries and error logging
- Follows same pattern as job execution

## Implementation Details

### Scheduling Flow

1. **Monitor Creation**:
   ```typescript
   const schedulerId = await scheduleMonitor({
     monitorId: monitor.id,
     frequencyMinutes: monitor.frequencyMinutes,
     jobData: jobDataPayload,
     retryLimit: 3
   });
   
   // Update monitor with scheduler ID
   await db.update(monitorTable)
     .set({ scheduledJobId: schedulerId })
     .where(eq(monitorTable.id, monitor.id));
   ```

2. **Scheduling Process**:
   - Creates BullMQ repeatable job with specified frequency
   - Stores scheduler ID in database for persistence
   - Handles cleanup of existing schedules

3. **Execution Flow**:
   - BullMQ triggers repeatable job at specified interval
   - Scheduler processor adds job to execution queue
   - Runner processes execution job and performs monitoring

### Startup Process

1. **App starts** → `SchedulerInitializer` runs
2. **Cleanup** → Removes orphaned jobs from previous runs
3. **Initialize** → Schedules all active monitors from database
4. **Runner starts** → Processes scheduled triggers and execution jobs

### Error Handling

- **Graceful failures**: Monitors still work if scheduling fails
- **Comprehensive logging**: Detailed logs for debugging
- **Retry mechanisms**: Exponential backoff for transient failures
- **Orphaned job cleanup**: Prevents duplicate schedules

## Benefits Over Previous System

### Robustness
- ✅ **BullMQ proven scheduling** instead of custom Redis implementation
- ✅ **Persistent schedules** that survive system restarts
- ✅ **Proper error handling** with retry logic
- ✅ **Consistent state** between database and Redis

### Reliability
- ✅ **Sleep/resume resilience** - schedules persist through system sleep
- ✅ **Restart recovery** - automatic re-initialization on startup
- ✅ **Orphaned job cleanup** - prevents duplicate schedules
- ✅ **Graceful degradation** - monitors work even if scheduling fails

### Maintainability
- ✅ **Consistent patterns** - follows same approach as job scheduling
- ✅ **Clear separation** - scheduler, service, and API layers
- ✅ **Comprehensive logging** - easy debugging and monitoring
- ✅ **Type safety** - proper TypeScript integration

### Performance
- ✅ **Efficient scheduling** - BullMQ's optimized repeatable jobs
- ✅ **Minimal overhead** - lightweight scheduler initialization
- ✅ **Proper cleanup** - prevents memory leaks and duplicate jobs

## Configuration

### Environment Variables
```bash
# Disable schedulers if needed (for development/testing)
DISABLE_JOB_SCHEDULER=true
DISABLE_MONITOR_SCHEDULER=true
```

### Database Migration
```bash
# Apply the schema changes
npx drizzle-kit push
```

## Testing

### Manual Testing
1. Create a monitor with frequency > 0
2. Check that `scheduledJobId` is populated in database
3. Verify repeatable job exists in Redis
4. Test system restart - schedules should persist
5. Test sleep/resume - monitors should continue running

### Automated Testing
- Monitor creation with scheduling
- Monitor updates with re-scheduling
- Monitor deletion with cleanup
- Startup initialization
- Orphaned job cleanup

## Monitoring and Debugging

### Logs to Watch
```bash
# Monitor scheduler initialization
"Initializing monitor schedulers..."
"Found X active monitors to initialize"
"Initialized monitor scheduler X for monitor Y"

# Monitor scheduling
"Setting up scheduled monitor X with frequency Y minutes"
"Created monitor scheduler X with frequency Y minutes"

# Cleanup
"Cleaning up monitor scheduler..."
"Found X orphaned repeatable jobs to clean up"
```

### Common Issues and Solutions

1. **Monitors not scheduling**:
   - Check if `organizationId` is set in session
   - Verify monitor is enabled and has frequency > 0
   - Check Redis connection and BullMQ queues

2. **Duplicate schedules**:
   - Run cleanup function to remove orphaned jobs
   - Check for existing `scheduledJobId` before creating new

3. **Schedules lost on restart**:
   - Verify `scheduledJobId` is stored in database
   - Check initialization logs for errors
   - Ensure runner is running to process jobs

## Migration Guide

### From Old System
1. **Database**: Apply migration to add `scheduledJobId` column
2. **Code**: Update to use new service functions
3. **Configuration**: No changes needed
4. **Deployment**: Deploy new code and restart services

### Rollback Plan
1. **Database**: Remove `scheduledJobId` column (if needed)
2. **Code**: Revert to old scheduler functions
3. **Redis**: Clear monitor scheduler queues
4. **Restart**: Restart app and runner services

## Future Enhancements

### Potential Improvements
1. **Dynamic frequency changes** - Update schedules without recreation
2. **Bulk operations** - Schedule/unschedule multiple monitors
3. **Advanced scheduling** - Cron expressions for complex schedules
4. **Monitoring dashboard** - View active schedules and their status
5. **Health checks** - Verify scheduler health and performance

### Performance Optimizations
1. **Batch initialization** - Process multiple monitors in batches
2. **Lazy loading** - Initialize schedulers on-demand
3. **Caching** - Cache monitor configurations for faster access
4. **Queue optimization** - Optimize BullMQ queue configurations

## Conclusion

This implementation provides a robust, reliable, and maintainable monitor scheduling system that:

- ✅ **Solves the original problem** of monitors not running after sleep/resume
- ✅ **Follows best practices** from the job scheduling system
- ✅ **Provides comprehensive error handling** and logging
- ✅ **Ensures data consistency** between database and Redis
- ✅ **Survives system restarts** and sleep/resume cycles
- ✅ **Maintains backward compatibility** with existing functionality

The system is now production-ready and provides the same level of reliability as the job scheduling system. 