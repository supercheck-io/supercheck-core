# Dashboard Page Documentation

## Overview

The Dashboard page (`/app/src/app/(main)/page.tsx`) is the main project overview interface that provides comprehensive insights into project health, performance metrics, and system status. It serves as the central hub for monitoring tests, jobs, monitors, and overall project activity.

## Architecture

### Components Structure
```
Dashboard Page
├── API Data Layer
│   ├── /api/dashboard (main metrics)
│   └── /api/alerts/history (alert data)
├── Data Processing Layer
│   ├── Data validation & sanitization
│   ├── Chart data transformation
│   └── Error handling & fallbacks
└── UI Presentation Layer
    ├── Key Metrics Cards (4 cards)
    ├── Job Runs Chart (Bar)
    ├── Monitor Status Chart (Bar)
    ├── Test Types Chart (Pie)
    ├── Test Activity Chart (Area)
    ├── Job Activity Chart (Stacked Area)
    └── Uptime Trend Chart (Line)
```

## Security Implementation

### Authentication & Authorization
- **Project Context**: Uses `requireProjectContext()` to ensure user has valid project access
- **RBAC Integration**: Implements role-based access control with `hasPermission()` checks
- **Organization Scoping**: All data is scoped to user's organization and project

### Data Security
- **Private Caching**: Cache headers set to `private` to prevent public caching of sensitive data
- **Input Validation**: All API inputs are validated and sanitized through Drizzle ORM
- **SQL Injection Prevention**: Uses parameterized queries via Drizzle ORM
- **Error Sanitization**: Generic error messages prevent information disclosure
- **Data Bounds**: Array slicing prevents memory exhaustion attacks

### Frontend Security
- **XSS Prevention**: No `dangerouslySetInnerHTML` usage; all data is properly escaped
- **Request Timeouts**: 10-second timeout prevents hanging requests
- **Abort Controllers**: Proper request cancellation on component unmount
- **Error Boundaries**: Graceful error handling without exposing sensitive details

## Data Flow & Processing

### API Layer (`/api/dashboard/route.ts`)

#### Data Sources
1. **Monitors**: Status, uptime, response times, availability trends
2. **Jobs**: Execution statistics, recent runs, success/failure rates
3. **Tests**: Counts by type, playground execution trends
4. **Queue**: Running capacity and current load
5. **Audit Logs**: Playground execution history

#### Data Validation
```typescript
// Example of robust data validation
const transformedData: DashboardData = {
  stats: {
    tests: Math.max(0, Number(data.tests?.total) || 0),
    jobs: Math.max(0, Number(data.jobs?.total) || 0),
    monitors: Math.max(0, Number(data.monitors?.total) || 0),
    runs: Math.max(0, Number(data.jobs?.recentRuns7d) || 0),
  },
  // ... with bounds checking and array slicing
};
```

#### Query Optimization
- **Project Scoping**: All queries filter by `projectId` and `organizationId`
- **Date Filtering**: Efficient date-based filtering using `gte()` conditions
- **Parallel Execution**: Uses `Promise.all()` for concurrent database queries
- **Result Limiting**: Reasonable limits prevent excessive data transfer

### Frontend Data Processing

#### Chart Data Transformation
Each chart uses optimized data processing:

1. **Job Activity Chart**: 
   - Filters last 7 days of job runs
   - Categorizes by trigger type: `manual`, `remote`, `schedule`
   - Validates dates and handles malformed data

2. **Test Activity Chart**:
   - Maps playground execution trends to 7-day period
   - Validates trend data structure and types
   - Ensures non-negative execution counts

3. **Uptime Trend Chart**:
   - Uses real availability data when available
   - Consistent fallback to current uptime (no random data)
   - Proper percentage bounds (0-100%)

#### Performance Optimizations
- **Memoization**: `useMemo()` prevents unnecessary chart recalculations
- **Debounced Updates**: Cache headers reduce API call frequency
- **Efficient Filtering**: Optimized array operations with early returns
- **Memory Management**: Array slicing prevents large dataset issues

## Chart Configurations

### 1. Key Metrics Cards (5 Cards)
- **Total Tests**: Available test cases in project
- **Active Jobs**: Currently running/scheduled jobs
- **Active Monitors**: Enabled monitoring endpoints
- **Total Runs**: Job executions in last 7 days
- **Execution Time**: Total Playwright execution time for billing (last 7 days)

### 2. Top Row Charts (3 Charts)

#### Job Runs Chart (Bar Chart)
- **Title**: "Job Runs" with CalendarClock icon
- **Description**: "Job execution success vs failure last 7 days"
- **Data**: Success vs Failed job runs from last 7 days
```typescript
const jobRunsData = [
  { name: 'Success', count: successCount, fill: '#22c55e' },
  { name: 'Failed', count: failedCount, fill: '#ef4444' }
];
```

#### Monitor Status Chart (Bar Chart) 
- **Title**: "Monitor Status" with Monitor icon
- **Description**: "Current monitor health distribution"
- **Data**: Current monitor health distribution
```typescript
const monitorStatusData = [
  { name: 'Up', count: upCount, fill: '#22c55e' },
  { name: 'Down', count: downCount, fill: '#ef4444' }
];
```

#### Test Types Chart (Pie Chart)
- **Title**: "Test Types" with Code icon
- **Description**: "Distribution of test types"
- **Data**: Distribution of test types (browser, api, database, custom)
- Color-coded by test type with consistent color mapping
- Shows relative proportions of different test categories

### 3. Bottom Row Charts (3 Charts)

#### Test Activity Chart (Area Chart)
- **Title**: "Test Activity" with Activity icon
- **Description**: "Playground test executions last 7 days"
- **Data Source**: Playground execution trends from audit logs
- **Time Range**: Last 7 days with daily granularity
- **Validation**: Robust date and count validation
- **Styling**: Blue area chart with 0.2 fill opacity

#### Job Activity Chart (Stacked Area Chart)
- **Title**: "Job Activity" with CalendarClock icon
- **Description**: "Job execution by trigger types last 7 days"
- **Layers**: Manual (green), Scheduled (blue), Remote (orange)
- **Data Source**: Recent job runs filtered by last 7 days
- **Trigger Mapping**: Correctly maps to schema trigger values
- **Styling**: Stacked area chart with 0.6 fill opacity per layer

#### Uptime Trend Chart (Line Chart)
- **Title**: "Uptime Trend" with TrendingUp icon
- **Description**: "Monitor uptime percentage last 7 days"
- **Data Source**: Monitor availability trend data
- **Fallback**: Uses current uptime for missing days
- **Range**: Y-axis scaled 80-100% for better visibility
- **Styling**: Blue line chart with dots at data points

## Error Handling

### API Error Handling
```typescript
try {
  // Database operations
} catch (error) {
  // Log error for debugging without sensitive data
  console.error("Dashboard API error:", error instanceof Error ? error.message : 'Unknown error');
  
  // Return generic error to client
  return NextResponse.json(
    { error: "Failed to fetch dashboard data" },
    { status: 500 }
  );
}
```

### Frontend Error Handling
- **Network Timeouts**: 10-second timeout with user-friendly messages
- **API Failures**: Graceful degradation with error state UI
- **Data Validation**: Extensive validation prevents runtime errors
- **Loading States**: Comprehensive skeleton loading UI

## Performance Considerations

### Database Performance
- **Indexed Queries**: All queries use indexed columns (`projectId`, `organizationId`, `createdAt`)
- **Limited Results**: Reasonable limits on all result sets
- **Efficient Joins**: Proper join strategies for related data
- **Date Range Queries**: Optimized with `gte()` for time-based filtering

### Frontend Performance
- **Memoization**: Chart data memoized to prevent recalculation
- **Lazy Loading**: Charts only render when data is available
- **Efficient Re-renders**: UseCallback and dependency arrays optimized
- **Memory Management**: Array bounds prevent excessive memory usage

### Caching Strategy
```typescript
// Private caching for security with reasonable TTL
response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
```

## Data Validation & Sanitization

### Input Validation
All API data undergoes comprehensive validation:

```typescript
// Number validation with bounds
Math.max(0, Number(data.field) || 0)

// Array validation with size limits
Array.isArray(data.array) ? data.array.slice(0, limit) : []

// Percentage validation
Math.max(0, Math.min(100, Number(data.uptime) || 0))

// Date validation
if (isNaN(runDate.getTime())) return false;
```

### Data Sanitization
- **HTML Escaping**: All dynamic content properly escaped by React
- **SQL Injection Prevention**: Parameterized queries via Drizzle ORM
- **Type Coercion**: Safe type conversion with fallbacks
- **Bounds Checking**: Numeric values bounded to sensible ranges

## Accessibility

### ARIA Compliance
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **Screen Reader Support**: Chart containers with descriptive labels
- **Color Contrast**: High contrast colors for chart elements
- **Focus Management**: Proper focus handling for interactive elements

### Responsive Design
- **Mobile First**: Grid layouts adapt to screen size
- **Touch Friendly**: Adequate touch targets for mobile interaction
- **Flexible Charts**: Responsive chart containers
- **Readable Typography**: Appropriate font sizes across devices

## Monitoring & Observability

### Logging
```typescript
// Structured logging for debugging
console.error("Dashboard API error:", error instanceof Error ? error.message : 'Unknown error');
console.log(`[${jobId}/${runId}] Test ${testScript.name} uses ${usedVariables.length} variables`);
```

### Metrics
- **Cache Hit Rate**: Monitor cache effectiveness
- **Response Times**: Track API performance
- **Error Rates**: Monitor failure rates
- **User Engagement**: Track chart interaction

## Testing Strategy

### Unit Tests
- **Data Transformation**: Test chart data processing logic
- **Validation Functions**: Test input validation and sanitization
- **Error Handling**: Test error boundary behavior
- **Memoization**: Test performance optimizations

### Integration Tests
- **API Integration**: Test dashboard API responses
- **Database Queries**: Test query performance and correctness
- **Chart Rendering**: Test chart component rendering
- **Error States**: Test error handling across the stack

### E2E Tests
- **User Workflows**: Test complete dashboard loading flow
- **Chart Interactions**: Test tooltip and interaction behavior
- **Error Recovery**: Test error state and recovery flows
- **Performance**: Test loading times and responsiveness

## Security Checklist

### ✅ Implemented Protections
- [x] Authentication required (`requireProjectContext`)
- [x] Authorization checks (`hasPermission`)
- [x] Private caching (`Cache-Control: private`)
- [x] Input validation (comprehensive data validation)
- [x] SQL injection prevention (Drizzle ORM)
- [x] XSS prevention (React auto-escaping)
- [x] Error message sanitization
- [x] Request timeouts
- [x] Memory exhaustion protection (array limits)
- [x] Information disclosure prevention

### 🔍 Regular Security Reviews
- Review error logging for sensitive data exposure
- Audit cache headers for data sensitivity
- Monitor for new XSS vectors in chart libraries
- Validate input sanitization effectiveness
- Check for information disclosure in error responses

## Best Practices Applied

### Code Quality
- **TypeScript**: Full type safety with interfaces
- **ESLint**: Automated code quality checks
- **Error Boundaries**: Graceful error handling
- **Clean Code**: Descriptive variable names and comments

### Security
- **Defense in Depth**: Multiple layers of security controls
- **Principle of Least Privilege**: Minimal data exposure
- **Secure by Default**: Conservative security settings
- **Input Validation**: Comprehensive data validation

### Performance
- **Efficient Algorithms**: Optimized data processing
- **Caching Strategy**: Balanced performance and freshness
- **Memory Management**: Bounded resource usage
- **Lazy Loading**: On-demand resource loading

### Maintainability
- **Modular Design**: Separated concerns and responsibilities
- **Documentation**: Comprehensive inline and external docs
- **Consistent Patterns**: Uniform code patterns throughout
- **Testable Code**: Design supports effective testing

## Billing Integration - Execution Time Tracking

### Overview
The dashboard includes a **billing-critical** execution time tracking feature that calculates total Playwright execution time for usage-based pricing. This implementation follows financial-grade accuracy standards with comprehensive audit logging.

### Execution Time Calculation

#### Data Sources
```sql
-- Query fetches all completed runs from last 7 days
SELECT duration, status, startedAt, completedAt 
FROM runs 
LEFT JOIN jobs ON runs.jobId = jobs.id 
WHERE runs.startedAt >= (NOW() - INTERVAL '7 days')
  AND jobs.projectId = :projectId 
  AND jobs.organizationId = :organizationId
  AND runs.completedAt IS NOT NULL  -- Only completed runs for accuracy
```

#### Duration Format Handling
The system robustly handles multiple duration formats:
```typescript
// Supported formats:
"123s"     → 123 seconds (123,000ms)
"1234ms"   → 1,234 milliseconds  
"60"       → 60 seconds (60,000ms) - fallback
```

#### Validation & Security
- **Range Validation**: 0ms to 24 hours maximum
- **Format Validation**: Multiple parsing strategies with fallbacks
- **Completed Runs Only**: Only includes runs with `completedAt` timestamp
- **Error Tracking**: Comprehensive error logging for data integrity

#### Billing Audit Trail
```json
{
  "projectId": "uuid",
  "organizationId": "uuid", 
  "timestamp": "2025-01-18T12:00:00.000Z",
  "totalExecutionTimeMs": 245000,
  "totalExecutionTimeMinutes": 4.08,
  "totalExecutionTimeSeconds": 245,
  "processedRuns": 12,
  "skippedRuns": 2,
  "totalRuns": 14,
  "errorCount": 0,
  "period": "last 7 days (UTC)",
  "queryStartTime": "2025-01-11T12:00:00.000Z",
  "queryEndTime": "2025-01-18T12:00:00.000Z",
  "calculationMethod": "duration_field_aggregation",
  "dataIntegrity": {
    "hasNegativeDurations": false,
    "hasExcessiveDurations": false,
    "completedRunsOnly": true
  }
}
```

### Frontend Display
The execution time card shows:
- **Primary Metric**: Minutes (if ≥1) or seconds (if <1 minute)
- **Run Count**: Number of processed runs
- **Error Indication**: Warning if parsing errors occurred
- **Period**: "Last 7 days" timeframe

### Billing Accuracy Features

#### ✅ Financial-Grade Validation
- Multiple format parsing with strict validation
- Range bounds checking (0ms to 24 hours)
- Completed runs only (no partial executions)
- Comprehensive error tracking and logging

#### ✅ Audit Compliance
- Structured JSON logging for audit trails
- Immutable calculation methodology
- Timestamp precision with UTC timezone
- Error classification and tracking

#### ✅ Data Integrity
- SQL injection prevention via Drizzle ORM
- Input sanitization and bounds checking
- Graceful handling of malformed data
- Comprehensive error recovery

#### ✅ Security Measures
- Project and organization scoping
- Permission-based access control
- Private cache headers (no public caching)
- Error message sanitization

### Usage for Billing Systems

#### Recommended Implementation
1. **Daily Aggregation**: Store daily totals for billing periods
2. **Monthly Invoicing**: Sum daily totals for invoice generation  
3. **Rate Limiting**: Monitor execution time quotas
4. **Audit Logging**: Maintain execution time history

#### Integration Points
```typescript
// Example billing integration
const executionTime = dashboardData.jobs.executionTime;
const billableMinutes = executionTime.totalMinutes;
const billingRate = 0.05; // $0.05 per minute
const totalCost = billableMinutes * billingRate;
```

### Monitoring & Alerts
- **Error Threshold**: Alert if >5% parsing errors
- **Data Anomaly**: Alert for unusual execution time spikes
- **Audit Trail**: Monitor for calculation methodology changes
- **Accuracy Validation**: Cross-reference with worker duration logs

This execution time tracking system provides enterprise-grade accuracy suitable for production billing scenarios with comprehensive audit trails and error handling.

---

This dashboard implementation represents a production-ready, secure, and performant solution for project monitoring and analytics with integrated billing capabilities.