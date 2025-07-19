# API Key Job Association Fix

## Problem
The previous API key system had two issues:
1. API keys were deleted when users were deleted (cascade delete)
2. API keys were associated with users but only had permissions for jobs, making the relationship indirect

## Solution
Restructured the API key system to:
1. **API keys are NOT deleted when users are deleted** (changed from `cascade` to `no action`)
2. **API keys belong to specific jobs** (added `jobId` field)
3. **Permissions field kept but not used** (maintained for future flexibility)

## Database Schema Changes

### Before:
```sql
CREATE TABLE "apikey" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "permissions" text, -- JSON string with job permissions
  -- other fields...
);
```

### After:
```sql
CREATE TABLE "apikey" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE no action,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE cascade,
  "permissions" text, -- Kept for future use but not currently used
  -- other fields...
);
```

## Key Changes Made

### 1. **Foreign Key Behavior Changes**
- **User → API Key**: Changed from `ON DELETE cascade` to `ON DELETE no action`
  - API keys now persist when users are deleted
  - Maintains historical access and audit trails
- **Job → API Key**: Added `ON DELETE cascade`
  - When a job is deleted, its API keys are automatically deleted
  - Ensures clean job lifecycle management

### 2. **API Key Association**
- **Direct Job Association**: API keys now have a direct `jobId` field
- **Simplified Permissions**: No need for complex JSON permissions parsing in current implementation
- **Job-Specific Access**: Each API key can only trigger its associated job
- **Future Flexibility**: Permissions field kept for potential future use

### 3. **Code Changes**

#### API Key Creation (`/api/jobs/[id]/api-keys`)
```typescript
// Before: Used permissions JSON
permissions: JSON.stringify({
  jobs: [`trigger:${jobId}`],
})

// After: Direct job association (permissions field not used)
jobId: jobId,
// permissions field exists but not populated
```

#### API Key Verification (`/api/jobs/[id]/trigger`)
```typescript
// Before: Parse permissions JSON
let hasPermission = false;
if (key.permissions) {
  const permissions = JSON.parse(key.permissions);
  hasPermission = permissions.jobs && permissions.jobs.includes(`trigger:${jobId}`);
}

// After: Direct job ID comparison
if (key.jobId !== jobId) {
  return NextResponse.json({ error: "API key not authorized for this job" }, { status: 403 });
}
```

#### API Key Listing (`/api/jobs/[id]/api-keys`)
```typescript
// Before: Search by permissions pattern
.where(like(apikey.permissions, `%trigger:${jobId}%`))

// After: Direct job ID query
.where(eq(apikey.jobId, jobId))
```

## Benefits

### 1. **Data Persistence**
- ✅ API keys survive user deletion
- ✅ Maintains historical job execution capabilities
- ✅ Preserves audit trails and access logs

### 2. **Simplified Security Model**
- ✅ Direct job association eliminates permission parsing
- ✅ Reduced attack surface (no JSON injection risks)
- ✅ Clearer access control logic

### 3. **Better Job Lifecycle Management**
- ✅ API keys automatically cleaned up when jobs are deleted
- ✅ No orphaned API keys for deleted jobs
- ✅ Cleaner database state

### 4. **Performance Improvements**
- ✅ Direct foreign key queries instead of JSON pattern matching
- ✅ Simpler database indexes
- ✅ Faster API key validation

### 5. **Future Flexibility**
- ✅ Permissions field available for future enhancements
- ✅ Can implement more complex permission models later
- ✅ Backward compatibility maintained

## Migration Applied

### Migration Files:
1. `0003_youthful_clea.sql` - Added jobId field, changed user foreign key
2. `0004_sharp_weapon_omega.sql` - Removed permissions field (temporarily)
3. `0005_dry_zarda.sql` - Added permissions field back (for future use)

### Schema Updates:
- `app/src/db/schema/schema.ts` - Updated API key table definition
- `runner/src/db/schema.ts` - Updated runner schema to match

## What Happens When User is Deleted

### Before:
- ❌ All user's API keys were deleted
- ❌ Job triggering capabilities lost
- ❌ Historical access information lost

### After:
- ✅ API keys remain in the system
- ✅ Jobs can still be triggered via existing API keys
- ✅ Audit trails preserved
- ⚠️ `userId` becomes a dangling reference (points to deleted user)

## Security Considerations

### API Key Security:
- ✅ API keys are still associated with the user who created them
- ✅ Job-specific access control maintained
- ✅ Expiration and enabled/disabled status still work
- ✅ Rate limiting and other security features preserved

### Access Control:
- ✅ Only API keys associated with a specific job can trigger that job
- ✅ No cross-job access possible
- ✅ Clean separation of concerns

## Current Implementation vs Future Possibilities

### Current Implementation:
- Uses `jobId` field for direct job association
- Permissions field exists but is not used
- Simple and efficient job-specific access control

### Future Possibilities:
- Could use `permissions` field for more granular access control
- Could implement role-based permissions within jobs
- Could add cross-job permissions for admin users
- Could implement time-based or conditional permissions

## Testing

### Test Scenarios:
1. **Create API Key**: Should associate with specific job
2. **Trigger Job**: Should work with job-specific API key
3. **User Deletion**: API keys should persist
4. **Job Deletion**: API keys should be deleted
5. **Cross-Job Access**: Should be denied

### Example Test:
```bash
# Create API key for job
curl -X POST "http://localhost:3000/api/jobs/{jobId}/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key"}'

# Trigger job with API key
curl -X POST "http://localhost:3000/api/jobs/{jobId}/trigger" \
  -H "x-api-key: {api-key}"
```

## Related Files
- `app/src/db/schema/schema.ts` - Main schema definition
- `runner/src/db/schema.ts` - Runner schema definition
- `app/src/app/api/jobs/[id]/api-keys/route.ts` - API key management
- `app/src/app/api/jobs/[id]/trigger/route.ts` - Job triggering
- `app/src/db/migrations/0003_youthful_clea.sql` - Migration 1
- `app/src/db/migrations/0004_sharp_weapon_omega.sql` - Migration 2
- `app/src/db/migrations/0005_dry_zarda.sql` - Migration 3 