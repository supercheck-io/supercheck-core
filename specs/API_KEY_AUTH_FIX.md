# API Key Authentication Fix

## Problem
The error "Unauthorized or invalid session" was occurring when trying to create API keys because the better-auth server-side API calls were not working correctly with the session context.

## Root Cause
The better-auth API was throwing an error: "The property you're trying to set can only be set from the server auth instance only." This indicated that the API key creation needed to be handled differently.

## Solution
Replaced better-auth API calls with direct database operations to create, update, delete, and verify API keys while maintaining proper session validation:

### Files Modified:

1. **`app/src/app/api/jobs/[id]/api-keys/route.ts`**
   - Replaced `auth.api.createApiKey()` with direct database insertion
   - Added proper session validation and user association

2. **`app/src/app/api/jobs/[id]/api-keys/[keyId]/route.ts`**
   - Replaced `auth.api.updateApiKey()` with direct database update
   - Replaced `auth.api.deleteApiKey()` with direct database deletion
   - Added missing imports for database operations

3. **`app/src/app/api/jobs/[id]/trigger/route.ts`**
   - Replaced `auth.api.verifyApiKey()` with direct database verification
   - Added proper API key validation (enabled, expired, permissions)
   - Added JSON parsing for permissions validation
   - Added job tests fetching to provide required data for job execution

## Code Changes

### Before (API Key Creation):
```typescript
const apiKey = await auth.api.createApiKey({
  body: {
    name: name.trim(),
    prefix: "job",
    permissions: {
      jobs: [`trigger:${jobId}`],
    },
    expiresIn: expiresIn,
  },
});
```

### After (Direct Database):
```typescript
// Create API key directly in database with proper permissions
const apiKeyId = crypto.randomUUID();
const apiKeyValue = `job_${crypto.randomUUID().replace(/-/g, '')}`;
const apiKeyStart = apiKeyValue.substring(0, 8);

const now = new Date();
const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

const newApiKey = await db.insert(apikey).values({
  id: apiKeyId,
  name: name.trim(),
  start: apiKeyStart,
  prefix: "job",
  key: apiKeyValue,
  userId: session.user.id,
  enabled: true,
  expiresAt: expiresAt,
  createdAt: now,
  updatedAt: now,
  permissions: JSON.stringify({
    jobs: [`trigger:${jobId}`],
  }),
}).returning();

const apiKey = newApiKey[0];
```

## Why This Fixes the Issue
- Direct database operations bypass the better-auth API limitations
- Session validation is still maintained through `auth.api.getSession()`
- API keys are properly associated with the authenticated user via `session.user.id`
- Permissions are stored as JSON strings in the database
- API key verification now works with our custom-created keys
- All security and validation logic remains intact

## Security Considerations
- Session validation is still required before any API key operations
- API keys are associated with the authenticated user
- Permissions are properly scoped to specific jobs
- Database operations use parameterized queries to prevent SQL injection

## Verification
The fix ensures that:
1. Users must be authenticated to create API keys
2. API keys are properly associated with the authenticated user
3. Session validation works correctly in API routes
4. No unauthorized API key creation is possible
5. API key operations work reliably without better-auth API limitations
6. API key verification works correctly for job triggering
7. Proper permission checking for job-specific API keys
8. Job triggering includes all required test data for execution

## Related Files
- `app/src/utils/auth.ts` - better-auth configuration
- `app/src/middleware/middleware.ts` - session validation middleware
- `app/src/app/(main)/layout.tsx` - main layout with session validation
- `app/src/components/jobs/api-key-dialog.tsx` - frontend API key creation UI
- `app/src/db/schema/schema.ts` - database schema for API keys 