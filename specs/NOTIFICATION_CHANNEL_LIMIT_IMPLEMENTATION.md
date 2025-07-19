# Notification Channel Limit Implementation

## Overview

This document describes the implementation of configurable notification channel limits for jobs and monitors. The limits are now controlled by environment variables and the UI has been improved with pagination and 4-column layout.

## Environment Variables

**Required Environment Variables:**
- `MAX_JOB_NOTIFICATION_CHANNELS` - Maximum channels for jobs (default: 10)
- `MAX_MONITOR_NOTIFICATION_CHANNELS` - Maximum channels for monitors (default: 10)
- `NEXT_PUBLIC_MAX_JOB_NOTIFICATION_CHANNELS` - Frontend limit for jobs (default: 10)
- `NEXT_PUBLIC_MAX_MONITOR_NOTIFICATION_CHANNELS` - Frontend limit for monitors (default: 10)

## Implementation Details

### 1. Environment Variable Configuration

**Files Modified:**
- All API routes and components now use environment variables instead of hardcoded constants
- Frontend components use `NEXT_PUBLIC_` prefixed variables
- Backend API routes use non-prefixed variables

### 2. Frontend Validation

**Files Modified:**
- `app/src/components/alerts/alert-settings.tsx`
- `app/src/components/jobs/job-creation-wizard.tsx`
- `app/src/components/jobs/edit-job.tsx`
- `app/src/components/monitors/monitor-form.tsx`
- `app/src/components/monitors/monitor-creation-wizard.tsx`

**Changes:**
- Added toast error message when trying to select more than the configured limit
- Added channel count display showing "X of Y channels selected"
- Updated `toggleProvider` function to check limit before adding channels
- **New UI Features:**
  - 4-column grid layout for notification channels
  - Pagination with 8 items per page (4 columns × 2 rows)
  - Page navigation with previous/next buttons
  - Automatic page reset when providers change

### 3. Server-Side Validation

**Files Modified:**
- `app/src/app/api/jobs/route.ts`
- `app/src/app/api/jobs/[id]/route.ts`
- `app/src/app/api/monitors/route.ts`
- `app/src/app/api/monitors/[id]/route.ts`
- `app/src/actions/update-job.ts`

**Changes:**
- Added validation to check notification provider count before saving
- Returns 400 error with descriptive message when limit is exceeded
- Validation applies to both creation and update operations
- Uses environment variables for configurable limits

### 4. User Experience Features

**Toast Messages:**
- "Channel limit reached" with description showing the configured limit
- Appears when user tries to select more than the allowed channels

**UI Indicators:**
- Channel count display: "X of Y channels selected"
- **Removed:** "Maximum X channels allowed" text as requested
- **New:** 4-column grid layout with pagination
- **New:** Page navigation with current page indicator

**Pagination Features:**
- 8 items per page (4 columns × 2 rows)
- Previous/Next navigation buttons
- Current page indicator
- Automatic reset to page 1 when providers change
- Disabled state for navigation buttons when at limits

## Validation Flow

1. **Frontend Validation:**
   - Real-time validation in AlertSettings component
   - Toast error when trying to exceed limit
   - Form submission validation in wizards and edit forms
   - Uses `NEXT_PUBLIC_` environment variables

2. **Server-Side Validation:**
   - API route validation before database operations
   - Consistent error messages across all endpoints
   - Validation for both jobs and monitors
   - Uses non-prefixed environment variables

3. **Database Level:**
   - Schema documentation indicates configurable limits
   - No database constraints (relying on application-level validation)

## Error Messages

**Frontend Toast:**
```
"Channel limit reached"
"You can only select up to X notification channels"
```

**API Error Response:**
```json
{
  "error": "You can only select up to X notification channels"
}
```

## UI Improvements

### Grid Layout
- **4 columns** on extra-large screens (xl:grid-cols-4)
- **3 columns** on large screens (lg:grid-cols-3)
- **2 columns** on small screens (sm:grid-cols-2)
- **1 column** on mobile (grid-cols-1)

### Pagination
- **8 items per page** (4 columns × 2 rows)
- **Navigation buttons** with chevron icons
- **Page indicator** showing "Page X of Y"
- **Disabled states** for navigation when at limits
- **Auto-reset** to page 1 when providers change

## Testing

The implementation can be tested by:

1. **Frontend Testing:**
   - Try to select more than the configured notification channels
   - Verify toast message appears with correct limit
   - Verify channel count display shows correct limit
   - Test pagination with many notification channels
   - Verify 4-column layout on different screen sizes

2. **API Testing:**
   - Send POST/PUT requests with more than the configured notification providers
   - Verify 400 error response with correct message
   - Test with different environment variable values

3. **Integration Testing:**
   - Create/edit jobs and monitors with various channel counts
   - Verify validation works consistently across all forms
   - Test pagination with large numbers of notification channels

## Benefits

1. **Configurable Limits:** Different limits for jobs vs monitors
2. **Environment-Based:** Easy to configure per environment
3. **Better UX:** 4-column layout and pagination for better organization
4. **Performance:** Limits the number of notifications sent per alert
5. **User Experience:** Prevents overwhelming users with too many channels
6. **System Stability:** Reduces load on notification services
7. **Cost Control:** Limits potential costs from excessive notifications

## Future Considerations

1. **Dynamic Limits:** Limits could be made configurable per organization
2. **Tiered Limits:** Different limits for different subscription tiers
3. **Channel Prioritization:** Allow users to prioritize channels when limit is reached
4. **Bulk Operations:** Consider limits for bulk operations across multiple jobs/monitors
5. **Advanced Pagination:** Add page size options or jump to page functionality 