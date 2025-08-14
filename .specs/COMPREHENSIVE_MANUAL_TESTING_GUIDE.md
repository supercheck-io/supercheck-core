# Comprehensive Manual Testing Guide for Supercheck Platform

## Table of Contents

1. [Overview](#overview)
2. [Testing Environment Setup](#testing-environment-setup)
3. [Authentication & Authorization Testing](#authentication--authorization-testing)
4. [Organization & Project Management Testing](#organization--project-management-testing)
5. [Test Management & Playground Testing](#test-management--playground-testing)
6. [Job Scheduling & Execution Testing](#job-scheduling--execution-testing)
7. [Monitoring System Testing](#monitoring-system-testing)
8. [Notification & Alerting Testing](#notification--alerting-testing)
9. [API Integration Testing](#api-integration-testing)
10. [Worker Service Testing](#worker-service-testing)
11. [Security Testing](#security-testing)
12. [Performance & Load Testing](#performance--load-testing)
13. [Data Integrity & Edge Cases](#data-integrity--edge-cases)
14. [Cross-Browser & Device Testing](#cross-browser--device-testing)

## Overview

This comprehensive manual testing guide covers all aspects of the Supercheck platform - an end-to-end testing platform with distributed architecture. Supercheck consists of:

- **Frontend (Next.js App)**: UI, API routes, job scheduling, database migrations
- **Worker Service (NestJS)**: Parallel Playwright test execution with capacity management  
- **Infrastructure**: PostgreSQL, Redis (job queues), MinIO (S3-compatible storage)

### Key Features to Test:
- Multi-tenant role-based access control (6 role types)
- Playwright-based test execution with playground environment
- Job scheduling with cron expressions
- HTTP/Website/Ping/Port monitoring with SSL checks
- Multi-channel notifications and alerting
- Variable/secret management with encryption

---

## Testing Environment Setup

### Prerequisites Checklist

- [ ] **Docker Environment**
  - Docker and Docker Compose installed
  - All services running: `docker-compose up -d`
  - Services healthy: postgres, redis, minio, app, worker

- [ ] **Database Setup**
  - PostgreSQL accessible and migrations applied
  - Test data seeded (if applicable)
  - Connection strings verified

- [ ] **External Dependencies**
  - Email service configured (SMTP settings)
  - S3/MinIO storage accessible
  - Redis queue system operational

- [ ] **Environment Variables**
  - All required environment variables set
  - Secret keys configured
  - External service credentials available

### Test Data Requirements

Create the following test accounts and data:

1. **Super Admin User**: For system-level testing
2. **Organization Owners**: For multi-tenant testing
3. **Regular Users**: With different role levels
4. **Test Organizations**: With various project setups
5. **Sample Tests**: Browser, API, database test scripts
6. **Sample Monitors**: Different monitor types
7. **Notification Channels**: Email, Slack, webhook endpoints

---

## Authentication & Authorization Testing

### User Registration & Login

#### TC-AUTH-001: User Registration Flow
**Objective**: Verify user can successfully register for a new account

**Test Steps**:
1. Navigate to `/sign-up`
2. Fill in registration form:
   - Name: "John Doe"
   - Email: "john.doe@example.com"
   - Password: "SecurePass123!"
3. Click "Create Account"
4. Check email for verification (if enabled)
5. Verify redirect to onboarding/dashboard

**Expected Results**:
- User account created successfully
- User redirected to appropriate landing page
- Email verification sent (if configured)
- User appears in database with correct default role

**Edge Cases to Test**:
- Duplicate email registration
- Weak password validation
- Invalid email format
- Missing required fields
- SQL injection attempts in form fields

#### TC-AUTH-002: User Login Flow
**Objective**: Verify existing user can login successfully

**Test Steps**:
1. Navigate to `/sign-in`
2. Enter valid credentials
3. Click "Sign In"
4. Verify redirect to dashboard

**Expected Results**:
- Successful authentication
- Session created
- Redirect to dashboard
- User menu shows correct user info

**Edge Cases to Test**:
- Invalid credentials
- Non-existent user
- Disabled/banned user
- Account lockout after failed attempts
- SQL injection in login fields

### Role-Based Access Control (RBAC)

#### TC-AUTH-003: Super Admin Permissions
**Objective**: Verify super admin has access to all system features

**Test Steps**:
1. Login as super admin user
2. Navigate to admin panel (`/super-admin`)
3. Test access to:
   - User management
   - Organization management
   - System statistics
   - User impersonation
   - Audit logs

**Expected Results**:
- Full access to all admin features
- Can view/edit all organizations
- Can impersonate other users
- Can view system-wide statistics
- Can access audit logs

#### TC-AUTH-004: Organization Owner Permissions
**Objective**: Verify org owner has full control over their organization

**Test Steps**:
1. Login as organization owner
2. Test access to:
   - Organization settings
   - Member management
   - All projects within organization
   - Billing/subscription settings
   - Organization deletion

**Expected Results**:
- Can edit organization details
- Can invite/remove members
- Can create/delete projects
- Cannot access other organizations
- Can delete own organization

#### TC-AUTH-005: Project-Limited Role Testing
**Objective**: Verify project editors/admins are limited to assigned projects

**Test Steps**:
1. Login as project editor
2. Attempt to access:
   - Assigned projects (should work)
   - Non-assigned projects (should fail)
   - Organization-wide settings (should fail)
   - User management (should fail)

**Expected Results**:
- Access granted only to assigned projects
- Proper error messages for unauthorized access
- Navigation menus hide unavailable options
- API endpoints return 403 for unauthorized actions

### Session Management

#### TC-AUTH-006: Session Timeout and Security
**Objective**: Verify session security features work correctly

**Test Steps**:
1. Login to application
2. Leave session idle for extended period
3. Attempt to access protected resources
4. Test concurrent sessions from different browsers
5. Test session after password change
6. Test "remember me" functionality

**Expected Results**:
- Session expires after timeout period
- User redirected to login after timeout
- Password change invalidates other sessions
- Concurrent sessions handled properly
- Remember me extends session appropriately

#### TC-AUTH-007: User Impersonation (Super Admin)
**Objective**: Verify super admin can impersonate other users safely

**Test Steps**:
1. Login as super admin
2. Navigate to user management
3. Click "Impersonate" on a regular user
4. Verify interface changes to show impersonation
5. Test that impersonated user's permissions apply
6. Stop impersonation and return to admin account

**Expected Results**:
- Impersonation starts successfully
- UI clearly indicates impersonation mode
- All actions performed as impersonated user
- Impersonation can be stopped easily
- Admin session restored after stopping
- Audit log records impersonation events

---

## Organization & Project Management Testing

### Organization Management

#### TC-ORG-001: Organization Creation
**Objective**: Verify users can create new organizations

**Test Steps**:
1. Login as authenticated user
2. Navigate to organization creation
3. Fill in organization details:
   - Name: "Test Organization"
   - Slug: "test-org"
   - Description: "Test organization for manual testing"
4. Submit form
5. Verify organization appears in list
6. Verify user becomes organization owner

**Expected Results**:
- Organization created successfully
- User automatically assigned as owner
- Organization appears in user's org list
- Slug is unique and URL-friendly
- Database record created correctly

#### TC-ORG-002: Member Invitation Flow
**Objective**: Verify organization owners can invite members

**Test Steps**:
1. Login as organization owner
2. Navigate to organization members page
3. Click "Invite Member"
4. Fill invitation form:
   - Email: "newmember@example.com"
   - Role: "project_editor"
   - Selected projects: Choose specific projects
5. Send invitation
6. Check invitation email
7. Use invitation link to join organization

**Expected Results**:
- Invitation email sent successfully
- Invitation link works and is secure
- New member added with correct role
- Member has access to assigned projects only
- Invitation expires after set time

#### TC-ORG-003: Member Role Management
**Objective**: Verify organization admins can manage member roles

**Test Steps**:
1. Login as organization admin/owner
2. Navigate to members page
3. Change member role from "project_viewer" to "project_editor"
4. Assign/remove projects from member
5. Test member's new permissions
6. Remove member from organization

**Expected Results**:
- Role changes take effect immediately
- Member's access updates correctly
- Project assignments work properly
- Removed members lose all access
- Database updates reflect changes

### Project Management

#### TC-PROJ-001: Project Creation and Configuration
**Objective**: Verify project creation works with proper permissions

**Test Steps**:
1. Login as org admin or higher
2. Navigate to projects page
3. Click "Create Project"
4. Fill project details:
   - Name: "API Testing Project"
   - Description: "Project for API test automation"
   - Status: "active"
5. Create project
6. Verify project appears in list
7. Test project access for different role types

**Expected Results**:
- Project created successfully
- Creator has admin access to project
- Project visible to appropriate org members
- Project settings configurable
- Proper URL slug generated

#### TC-PROJ-002: Project Member Management
**Objective**: Verify project-level member management

**Test Steps**:
1. Login as project admin
2. Navigate to project settings
3. Add members to project:
   - User A as "project_editor" 
   - User B as "project_viewer"
4. Test each member's access level
5. Remove member from project
6. Verify access changes

**Expected Results**:
- Members added successfully
- Role-based access enforced
- Members can see project in their list
- Removed members lose project access
- Audit trail records changes

---

## Test Management & Playground Testing

### Playground Environment

#### TC-TEST-001: Test Script Creation and Validation
**Objective**: Verify users can create and validate test scripts

**Test Steps**:
1. Login and navigate to playground
2. Create new test script:
   - Type: "Browser Test"
   - Title: "Login Flow Test"
   - Priority: "High"
3. Write Playwright test script:
```javascript
import { test, expect } from '@playwright/test';

test('Login flow validation', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
  await expect(page.getByRole('heading', { name: 'Playwright' })).toBeVisible();
});
```
4. Click "Validate Script"
5. Run test script
6. View execution results

**Expected Results**:
- Script validation passes
- Test executes successfully in worker
- Results displayed with pass/fail status
- Screenshots/videos captured if configured
- Execution logs available
- Report stored in S3/MinIO

#### TC-TEST-002: Test Script Types and Libraries
**Objective**: Verify different test types and supported libraries work

**Test Steps**:
1. Test Browser automation script
2. Test API testing script:
```javascript
import { test, expect } from '@playwright/test';

test('API endpoint testing', async ({ request }) => {
  const response = await request.get('https://jsonplaceholder.typicode.com/posts/1');
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.id).toBe(1);
});
```
3. Test Database connection script:
```javascript
const { test, expect } = require('@playwright/test');

test('Database connection test', async () => {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  await client.connect();
  const result = await client.query('SELECT NOW()');
  expect(result.rows.length).toBeGreaterThan(0);
  await client.end();
});
```
4. Verify each test type executes properly

**Expected Results**:
- All test types supported
- Required libraries available (faker, axios, database clients)
- Environment variables accessible
- Proper error handling for failures
- Different execution contexts work

#### TC-TEST-003: Variable and Secret Management
**Objective**: Verify secure handling of variables and secrets

**Test Steps**:
1. Navigate to project variables page
2. Add regular variable:
   - Key: "TEST_URL"
   - Value: "https://example.com"
   - Type: "Variable"
3. Add secret variable:
   - Key: "API_KEY"
   - Value: "sk_test_12345"
   - Type: "Secret"
4. Use variables in test script:
```javascript
test('Using project variables', async ({ page }) => {
  await page.goto(process.env.TEST_URL);
  // Use API_KEY in headers
  console.log('API Key available:', !!process.env.API_KEY);
});
```
5. Execute test and verify variables work
6. Check that secrets are masked in logs

**Expected Results**:
- Variables saved and encrypted properly
- Secrets masked in UI and logs
- Variables available in test execution
- Proper access control for variable management
- Audit trail for variable changes

### Test Organization and Tagging

#### TC-TEST-004: Test Tagging and Filtering
**Objective**: Verify test organization through tags

**Test Steps**:
1. Create multiple tests with different tags:
   - "smoke-tests"
   - "regression"  
   - "api-tests"
   - "ui-tests"
2. Navigate to tests overview page
3. Filter tests by tags
4. Search tests by name/description
5. Sort tests by priority/date

**Expected Results**:
- Tags created and assigned successfully
- Filtering works correctly
- Search functionality accurate
- Sorting options functional
- Test counts match filters

---

## Job Scheduling & Execution Testing

### Job Creation and Configuration

#### TC-JOB-001: Basic Job Creation
**Objective**: Verify job creation with multiple tests

**Test Steps**:
1. Navigate to jobs page
2. Click "Create Job"
3. Configure job:
   - Name: "Daily Smoke Tests"
   - Description: "Daily automated testing suite"
   - Tests: Select 3-5 different tests
   - Schedule: "0 2 * * *" (daily at 2 AM)
4. Configure alert settings:
   - Alert on failure: true
   - Notification channels: Email
   - Custom message: "Daily tests failed"
5. Save job

**Expected Results**:
- Job created successfully
- Tests associated correctly
- Cron schedule validated
- Alert configuration saved
- Job appears in jobs list

#### TC-JOB-002: Manual Job Execution
**Objective**: Verify manual job triggers work correctly

**Test Steps**:
1. Open existing job
2. Click "Run Now" button
3. Monitor job execution:
   - Watch status change to "running"
   - View real-time progress if available
   - Check individual test results
4. Wait for completion
5. Review final results and artifacts

**Expected Results**:
- Job starts immediately
- Status updates in real-time
- Individual test results visible
- Overall job status calculated correctly
- Execution artifacts stored properly
- Duration calculated accurately

#### TC-JOB-003: Scheduled Job Execution
**Objective**: Verify cron-based scheduling works

**Test Steps**:
1. Create job with near-future schedule (5 minutes)
2. Wait for scheduled execution time
3. Verify job runs automatically
4. Check job history for scheduled runs
5. Modify schedule and verify changes take effect

**Expected Results**:
- Job executes at scheduled time
- Automatic execution marked as "schedule" trigger
- Job history shows scheduled runs
- Schedule modifications work immediately
- No manual intervention required

### API Key Authentication

#### TC-JOB-004: API Key Management
**Objective**: Verify API key creation and usage for job triggers

**Test Steps**:
1. Navigate to job settings
2. Click "Manage API Keys"
3. Create new API key:
   - Name: "CI/CD Integration"
   - Permissions: Job trigger only
   - Expiration: 90 days
4. Copy generated API key
5. Test API key with curl:
```bash
curl -X POST \
  https://your-domain.com/api/jobs/{job-id}/trigger \
  -H "Authorization: Bearer your-api-key"
```
6. Verify job executes
7. Test API key revocation

**Expected Results**:
- API key generated successfully
- Key format secure and unpredictable
- API endpoint accepts valid keys
- Job executes via API trigger
- Invalid keys rejected with 401
- Revoked keys immediately invalid
- API key usage tracked

### Job Results and Reporting

#### TC-JOB-005: Job Results and Artifacts
**Objective**: Verify job execution results are properly stored and accessible

**Test Steps**:
1. Execute job with mixed pass/fail tests
2. Navigate to job run results page
3. Verify the following are available:
   - Overall job status (pass/fail)
   - Individual test results
   - Execution duration
   - Artifacts (screenshots, videos, reports)
   - Execution logs
   - Error details for failures
4. Download artifacts
5. Share job results via URL

**Expected Results**:
- All execution data captured
- Artifacts downloadable and viewable
- Pass/fail status clearly indicated
- Logs provide debugging information
- Results shareable with proper permissions
- Historical results maintained

---

## Monitoring System Testing

### HTTP/Website Monitoring

#### TC-MON-001: HTTP Request Monitor
**Objective**: Verify HTTP request monitoring functionality

**Test Steps**:
1. Navigate to monitors page
2. Create new HTTP monitor:
   - Name: "API Health Check"
   - Type: "HTTP Request"
   - Target: "https://jsonplaceholder.typicode.com/posts/1"
   - Method: "GET"
   - Expected status codes: "200"
   - Check frequency: "5 minutes"
3. Configure request details:
   - Headers: "Content-Type: application/json"
   - Authentication: None (for this test)
   - Timeout: 30 seconds
4. Enable monitor and wait for first check
5. View monitor results

**Expected Results**:
- Monitor created successfully
- First check executes within expected timeframe
- Response time measured accurately
- Status code validation works
- Monitor status updates correctly (up/down)
- Historical data begins collecting

#### TC-MON-002: Website Monitoring with Content Checks
**Objective**: Verify website monitoring with keyword validation

**Test Steps**:
1. Create website monitor:
   - Name: "Homepage Monitor"
   - Type: "Website"
   - Target: "https://playwright.dev"
   - Expected status: "200-299"
   - Keyword in body: "Playwright"
   - Keyword should be present: true
2. Create second monitor with negative keyword check:
   - Keyword in body: "error"
   - Keyword should be present: false
3. Wait for monitor checks
4. Verify keyword detection works correctly

**Expected Results**:
- Website loads and validates successfully
- Keyword presence/absence detected correctly
- Failed keyword checks mark monitor as down
- Response body snippet captured for debugging
- Content-based monitoring reliable

#### TC-MON-003: HTTP Authentication Testing
**Objective**: Verify monitors work with authenticated endpoints

**Test Steps**:
1. Create monitor with Basic authentication:
   - Target: authenticated endpoint
   - Auth type: Basic
   - Username: test credentials
   - Password: test credentials
2. Create monitor with Bearer token:
   - Auth type: Bearer
   - Token: valid API token
3. Execute both monitors
4. Verify authentication headers sent correctly

**Expected Results**:
- Authenticated requests succeed
- Credentials handled securely
- Auth failures detected and reported
- No credentials leak in logs
- Different auth types supported

### SSL Certificate Monitoring

#### TC-MON-004: SSL Certificate Monitoring
**Objective**: Verify SSL certificate monitoring and expiration warnings

**Test Steps**:
1. Create website monitor with SSL checking:
   - Target: "https://expired.badssl.com" (for testing expired certs)
   - Enable SSL checks: true
   - Days until expiration warning: 30
   - SSL check frequency: 24 hours
2. Create monitor for valid certificate:
   - Target: "https://github.com"
   - Same SSL settings
3. Wait for SSL checks to execute
4. Review SSL certificate information
5. Test SSL expiration alerts

**Expected Results**:
- SSL certificate details captured
- Expiration dates calculated correctly
- Expired certificates detected
- SSL warnings generated appropriately
- Certificate chain information available
- SSL-specific alerts sent

### Network Monitoring

#### TC-MON-005: Ping Host Monitoring
**Objective**: Verify ping-based host monitoring

**Test Steps**:
1. Create ping monitor:
   - Name: "Server Ping Test"
   - Type: "Ping Host"
   - Target: "8.8.8.8" (Google DNS)
   - Timeout: 5 seconds
   - Frequency: 2 minutes
2. Create monitor for unreachable host:
   - Target: "192.0.2.1" (documentation IP, should be unreachable)
3. Wait for ping results
4. Verify response time measurements
5. Check failure handling

**Expected Results**:
- Successful pings show response times
- Unreachable hosts marked as down
- Timeout values respected
- Packet loss calculated correctly
- Network errors handled gracefully

#### TC-MON-006: Port Connectivity Monitoring
**Objective**: Verify TCP/UDP port monitoring

**Test Steps**:
1. Create TCP port monitor:
   - Target: "github.com"
   - Port: 443
   - Protocol: TCP
   - Timeout: 10 seconds
2. Create monitor for closed port:
   - Target: "github.com"
   - Port: 23 (telnet, likely closed)
   - Protocol: TCP
3. Create UDP port monitor:
   - Target: "8.8.8.8"
   - Port: 53 (DNS)
   - Protocol: UDP
4. Execute all monitors
5. Verify connection results

**Expected Results**:
- TCP connections succeed/fail correctly
- UDP sends complete (with limitations noted)
- Connection times measured
- Port status accurately reported
- Protocol differences handled

### Monitor Alerting and Notifications

#### TC-MON-007: Monitor Alert Configuration
**Objective**: Verify monitor alerting works correctly

**Test Steps**:
1. Create monitor with alerting enabled:
   - Alert on failure: true
   - Alert on recovery: true
   - Failure threshold: 2 consecutive failures
   - Recovery threshold: 1 success
   - Notification channels: email, webhook
2. Force monitor to fail (use invalid URL)
3. Wait for threshold to be reached
4. Verify failure alert sent
5. Fix monitor and verify recovery alert

**Expected Results**:
- Failure alerts sent after threshold reached
- Recovery alerts sent when monitor recovers
- Alert thresholds respected
- Multiple notification channels work
- Alert history tracked
- No spam/duplicate alerts

---

## Notification & Alerting Testing

### Notification Channel Management

#### TC-NOTIFY-001: Email Notification Setup
**Objective**: Verify email notification channel configuration

**Test Steps**:
1. Navigate to notification settings
2. Create email notification channel:
   - Name: "Team Email Alerts"
   - Type: "Email"
   - Recipients: "team@example.com,admin@example.com"
   - Configuration: SMTP settings
3. Test email channel with test message
4. Verify email delivery
5. Check email content and formatting

**Expected Results**:
- Email channel configured successfully
- Test email sent and received
- Email content properly formatted
- Multiple recipients supported
- Email templates professional

#### TC-NOTIFY-002: Webhook Notification Setup
**Objective**: Verify webhook notification functionality

**Test Steps**:
1. Set up webhook endpoint for testing (use requestbin or similar)
2. Create webhook notification channel:
   - Name: "Slack Integration"
   - URL: webhook endpoint URL
   - Method: POST
   - Headers: Content-Type: application/json
   - Custom body template
3. Trigger test notification
4. Verify webhook payload received
5. Check payload structure and data

**Expected Results**:
- Webhook configured successfully
- HTTP requests sent to correct endpoint
- Payload contains expected data
- Custom templates work
- Authentication headers supported
- Retry logic for failures

#### TC-NOTIFY-003: Multiple Notification Channels
**Objective**: Verify multiple notification channels work together

**Test Steps**:
1. Configure multiple notification channels:
   - Email for critical alerts
   - Webhook for team chat
   - SMS/Telegram for urgent issues
2. Create alert rule using multiple channels
3. Trigger alert condition
4. Verify all channels receive notification
5. Check notification content consistency

**Expected Results**:
- All channels receive notifications
- Content appropriate for each channel type
- No notification channels missed
- Performance not impacted by multiple sends
- Failed channels don't block others

### Alert Rules and Conditions

#### TC-NOTIFY-004: Complex Alert Rules
**Objective**: Verify advanced alert rules and conditions

**Test Steps**:
1. Create alert rule with multiple conditions:
   - Monitor type: HTTP monitor
   - Condition: Response time > 1000ms OR status != 200
   - Frequency: Check every 5 minutes
   - Escalation: Different channels for different severity
2. Create time-based alert rule:
   - Only alert during business hours
   - Weekend alerts to different channel
3. Test rule conditions
4. Verify proper escalation

**Expected Results**:
- Complex conditions evaluated correctly
- Time-based rules respected
- Escalation paths followed
- Alert frequency controlled
- Rule engine reliable

---

## API Integration Testing

### API Authentication

#### TC-API-001: API Key Authentication
**Objective**: Verify API authentication mechanisms

**Test Steps**:
1. Generate API key for testing
2. Test authenticated endpoints:
```bash
# Test job trigger
curl -X POST \
  https://api.example.com/api/jobs/123/trigger \
  -H "Authorization: Bearer your-api-key"

# Test monitor creation  
curl -X POST \
  https://api.example.com/api/monitors \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test Monitor",
    "type": "http_request", 
    "target": "https://example.com"
  }'
```
3. Test invalid API key
4. Test expired API key
5. Verify rate limiting

**Expected Results**:
- Valid API keys accepted
- Invalid keys return 401 Unauthorized
- Expired keys rejected
- Rate limiting enforced
- API usage tracked

#### TC-API-002: REST API CRUD Operations
**Objective**: Verify full CRUD operations via API

**Test Steps**:
1. **Create** resources via API:
   - Create test: `POST /api/tests`
   - Create job: `POST /api/jobs` 
   - Create monitor: `POST /api/monitors`
2. **Read** resources via API:
   - List all: `GET /api/tests`
   - Get specific: `GET /api/tests/{id}`
   - Filter/search: `GET /api/tests?tag=smoke`
3. **Update** resources via API:
   - Update test: `PUT /api/tests/{id}`
   - Partial update: `PATCH /api/tests/{id}`
4. **Delete** resources via API:
   - Delete test: `DELETE /api/tests/{id}`

**Expected Results**:
- All CRUD operations work correctly
- Proper HTTP status codes returned
- Request/response formats consistent
- Data validation enforced
- Error messages helpful

### API Error Handling

#### TC-API-003: API Error Handling and Validation
**Objective**: Verify API properly handles errors and validates input

**Test Steps**:
1. Send malformed JSON:
```bash
curl -X POST /api/tests \
  -H "Content-Type: application/json" \
  -d '{"invalid": json}'
```
2. Send missing required fields:
```bash
curl -X POST /api/tests \
  -H "Content-Type: application/json" \
  -d '{"name": "Test without required script"}'
```
3. Send invalid data types:
```bash
curl -X POST /api/monitors \
  -d '{"frequencyMinutes": "invalid-number"}'
```
4. Test resource not found:
```bash
curl -X GET /api/tests/non-existent-id
```
5. Test authorization errors

**Expected Results**:
- 400 Bad Request for malformed data
- 422 Unprocessable Entity for validation errors  
- 404 Not Found for missing resources
- 403 Forbidden for unauthorized access
- Clear error messages provided
- Error format consistent

---

## Worker Service Testing

### Test Execution Environment

#### TC-WORKER-001: Playwright Test Execution
**Objective**: Verify worker service executes Playwright tests correctly

**Test Steps**:
1. Create complex Playwright test:
```javascript
import { test, expect } from '@playwright/test';

test('Complex browser interaction', async ({ page }) => {
  // Navigate to test site
  await page.goto('https://demo.playwright.dev/todomvc');
  
  // Add todo items
  const newTodo = page.getByPlaceholder('What needs to be done?');
  await newTodo.fill('Learn Playwright');
  await newTodo.press('Enter');
  
  // Verify todo added
  await expect(page.getByTestId('todo-title')).toHaveText(['Learn Playwright']);
  
  // Mark as complete
  await page.getByTestId('todo-item').getByRole('checkbox').check();
  await expect(page.getByTestId('todo-item')).toHaveClass(/completed/);
});
```
2. Execute test via playground
3. Monitor worker service logs
4. Verify test results and artifacts

**Expected Results**:
- Test executes successfully in worker
- Screenshots/videos captured
- Trace files generated
- Results returned to app service
- Artifacts uploaded to S3/MinIO
- Worker resources cleaned up

#### TC-WORKER-002: Concurrent Test Execution
**Objective**: Verify worker handles multiple concurrent tests

**Test Steps**:
1. Create 5 different test scripts
2. Create job with all 5 tests
3. Execute job and monitor:
   - Worker resource usage
   - Concurrent execution limits
   - Test isolation
   - Resource cleanup
4. Verify all tests complete successfully
5. Check for resource leaks

**Expected Results**:
- Tests execute concurrently within limits
- Proper resource isolation
- No cross-test interference
- Memory usage stays within bounds
- All browser processes cleaned up
- Concurrent limits enforced

#### TC-WORKER-003: Test Timeout and Error Handling
**Objective**: Verify worker handles test timeouts and errors gracefully

**Test Steps**:
1. Create test with infinite loop:
```javascript
test('Infinite loop test', async () => {
  while(true) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});
```
2. Create test with syntax error:
```javascript
test('Syntax error test', async ({ page }) => {
  await page.goto('https://example.com';  // Missing closing parenthesis
});
```
3. Execute tests and verify timeout handling
4. Check worker resource cleanup
5. Verify error reporting

**Expected Results**:
- Timeout tests terminated after limit
- Syntax errors caught and reported  
- Worker processes cleaned up
- Clear error messages provided
- Service remains stable
- Resource limits enforced

### Resource Management

#### TC-WORKER-004: Memory and Resource Management
**Objective**: Verify worker manages resources efficiently

**Test Steps**:
1. Create memory-intensive test:
```javascript
test('Memory intensive test', async ({ page }) => {
  // Navigate to page with large content
  await page.goto('https://example.com/large-page');
  
  // Take many screenshots
  for(let i = 0; i < 10; i++) {
    await page.screenshot({ path: `screenshot-${i}.png` });
    await page.reload();
  }
});
```
2. Execute test while monitoring:
   - Memory usage
   - CPU usage  
   - Disk space
   - Browser processes
3. Verify cleanup after execution

**Expected Results**:
- Memory usage stays within limits
- Temporary files cleaned up
- Browser processes terminated
- Resource monitoring accurate
- System remains stable

---

## Security Testing

### Input Validation and Sanitization

#### TC-SEC-001: SQL Injection Testing
**Objective**: Verify application is protected against SQL injection

**Test Steps**:
1. Test SQL injection in various input fields:
   - Test name: `'; DROP TABLE tests; --`
   - Monitor target: `' OR '1'='1`
   - User email: `admin'; DROP TABLE users; --`
2. Test API endpoints with SQL injection payloads
3. Monitor database logs for suspicious queries
4. Verify data integrity maintained

**Expected Results**:
- SQL injection attempts blocked
- Input properly sanitized
- Database queries parameterized
- No data corruption occurs
- Attacks logged for monitoring

#### TC-SEC-002: Cross-Site Scripting (XSS) Prevention
**Objective**: Verify application prevents XSS attacks

**Test Steps**:
1. Test XSS in user inputs:
   - Test description: `<script>alert('XSS')</script>`
   - Monitor name: `<img src="x" onerror="alert('XSS')">`
   - User name: `javascript:alert('XSS')`
2. Verify output encoding in UI
3. Test stored vs reflected XSS
4. Check Content Security Policy headers

**Expected Results**:
- Script tags rendered as text
- HTML encoded properly  
- No JavaScript execution
- CSP headers present
- User input sanitized

#### TC-SEC-003: Authentication Security
**Objective**: Verify authentication security measures

**Test Steps**:
1. Test password strength requirements
2. Test account lockout after failed attempts
3. Test session security:
   - Session fixation attacks
   - Session hijacking prevention
   - Secure cookie flags
4. Test password reset security
5. Verify multi-factor authentication (if enabled)

**Expected Results**:
- Strong passwords enforced
- Account lockout prevents brute force
- Sessions properly secured
- Password reset tokens secure
- MFA working if configured

### Authorization and Access Control

#### TC-SEC-004: Privilege Escalation Prevention
**Objective**: Verify users cannot escalate their privileges

**Test Steps**:
1. Login as project viewer
2. Attempt to access admin endpoints directly
3. Modify requests to try higher privilege actions:
   - Change role in form submissions
   - Modify user IDs in API calls
   - Access other organizations' data
4. Test horizontal privilege escalation
5. Verify proper error handling

**Expected Results**:
- Unauthorized access blocked
- Proper 403 Forbidden responses
- No data leakage in errors
- Privilege checks enforced
- Audit trail logs attempts

#### TC-SEC-005: Data Encryption and Protection
**Objective**: Verify sensitive data properly encrypted

**Test Steps**:
1. Check database for sensitive data:
   - Passwords should be hashed
   - API keys should be encrypted
   - Personal data protection
2. Verify HTTPS enforcement
3. Test data transmission security
4. Check file upload security
5. Verify secrets in environment variables

**Expected Results**:
- Passwords properly hashed (bcrypt/argon2)
- Sensitive data encrypted at rest
- HTTPS enforced for all traffic
- File uploads secured
- No secrets in client code

---

## Performance & Load Testing

### Application Performance

#### TC-PERF-001: Page Load Performance  
**Objective**: Verify application pages load within acceptable times

**Test Steps**:
1. Test key page load times:
   - Dashboard: < 2 seconds
   - Test list: < 3 seconds
   - Job results: < 4 seconds
   - Monitor details: < 2 seconds
2. Test with different network conditions
3. Monitor resource loading times
4. Check for memory leaks in browser
5. Test mobile performance

**Expected Results**:
- Pages load within target times
- Progressive loading implemented
- No memory leaks detected
- Mobile performance acceptable
- Resource optimization working

#### TC-PERF-002: API Response Performance
**Objective**: Verify API endpoints respond within acceptable times

**Test Steps**:
1. Test API endpoint response times:
   - GET /api/tests: < 500ms
   - POST /api/jobs/trigger: < 1s
   - GET /api/monitors: < 300ms
2. Test with large datasets
3. Monitor database query performance
4. Test concurrent API requests
5. Verify caching effectiveness

**Expected Results**:
- API responses within target times
- Database queries optimized
- Caching reduces response times
- Concurrent requests handled well
- No performance degradation

### Load Testing

#### TC-PERF-003: User Load Testing
**Objective**: Verify application handles expected user load

**Test Steps**:
1. Simulate concurrent users:
   - 10 concurrent users browsing
   - 5 users running tests simultaneously
   - 3 jobs executing concurrently
2. Monitor system resources:
   - CPU usage
   - Memory consumption
   - Database connections
   - Response times
3. Test peak load scenarios
4. Verify graceful degradation

**Expected Results**:
- System stable under normal load
- Resources within acceptable limits
- Response times remain reasonable
- Error rates stay low
- Graceful handling of overload

#### TC-PERF-004: Worker Service Load Testing
**Objective**: Verify worker service handles test execution load

**Test Steps**:
1. Execute multiple large test suites simultaneously
2. Monitor worker service:
   - Memory usage
   - CPU utilization
   - Browser process count
   - Test execution times
3. Test capacity limits
4. Verify queue management

**Expected Results**:
- Worker handles concurrent tests
- Resource limits enforced
- Queue system works properly
- Tests complete successfully
- System remains stable

---

## Data Integrity & Edge Cases

### Data Consistency

#### TC-DATA-001: Database Transaction Integrity
**Objective**: Verify database operations maintain data consistency

**Test Steps**:
1. Create complex job with multiple tests
2. Delete organization while job is running
3. Modify user permissions during test execution
4. Test concurrent data modifications
5. Simulate database connection failures
6. Verify transaction rollback on errors

**Expected Results**:
- Data remains consistent
- Orphaned records prevented
- Transaction rollbacks work
- Concurrent modifications handled
- Database integrity maintained

#### TC-DATA-002: File Upload and Storage
**Objective**: Verify file handling is secure and reliable

**Test Steps**:
1. Upload various file types:
   - Valid test scripts (.js, .ts)
   - Invalid file types (.exe, .php)
   - Large files (> 10MB)
   - Empty files
   - Files with special characters in names
2. Test file download functionality
3. Verify file virus scanning (if implemented)
4. Test file storage limits

**Expected Results**:
- Only allowed file types accepted
- File size limits enforced
- Special characters handled
- Downloads work securely
- Storage quotas enforced

### Edge Cases and Error Conditions

#### TC-EDGE-001: Network Failure Handling
**Objective**: Verify application handles network failures gracefully

**Test Steps**:
1. Simulate network failures:
   - Database connection loss
   - Redis connection failure
   - S3/MinIO unavailability
   - External service timeouts
2. Test application behavior during failures
3. Verify error messages to users
4. Test recovery when services return

**Expected Results**:
- Graceful error handling
- User-friendly error messages
- Service degradation vs complete failure
- Automatic recovery when possible
- No data corruption during failures

#### TC-EDGE-002: Resource Exhaustion Testing
**Objective**: Verify application handles resource exhaustion

**Test Steps**:
1. Fill disk space to capacity
2. Exhaust database connections
3. Consume all available memory
4. Create very large datasets
5. Test maximum concurrent users

**Expected Results**:
- System provides warnings before limits
- Graceful degradation under stress
- Critical functions remain available
- Clear error messages to users
- System recovers when resources available

---

## Cross-Browser & Device Testing

### Browser Compatibility

#### TC-BROWSER-001: Major Browser Support
**Objective**: Verify application works across major browsers

**Test Steps**:
1. Test core functionality in:
   - Chrome (latest)
   - Firefox (latest) 
   - Safari (latest)
   - Edge (latest)
2. Test key user workflows:
   - Login/logout
   - Test creation and execution
   - Monitor management
   - Job scheduling
3. Verify UI consistency
4. Test JavaScript functionality

**Expected Results**:
- All browsers supported
- UI renders correctly
- JavaScript features work
- Performance acceptable
- No browser-specific errors

#### TC-BROWSER-002: Mobile Responsiveness
**Objective**: Verify application is mobile-friendly

**Test Steps**:
1. Test responsive design on:
   - Smartphone (375px width)
   - Tablet (768px width)
   - Desktop (1200px+ width)
2. Test touch interactions
3. Verify navigation usability
4. Test form inputs on mobile
5. Check performance on mobile devices

**Expected Results**:
- Layout adapts to screen sizes
- Touch interactions work well
- Navigation remains usable
- Forms easy to complete
- Performance acceptable on mobile

---

## Test Execution Checklist

### Pre-Testing Setup

- [ ] All services running (app, worker, postgres, redis, minio)
- [ ] Test data prepared and seeded
- [ ] Environment variables configured
- [ ] External services accessible (email, webhooks)
- [ ] Test accounts created with different roles
- [ ] Monitoring tools available for performance testing

### Testing Process

- [ ] Execute tests in priority order (critical features first)
- [ ] Document all bugs found with reproduction steps
- [ ] Take screenshots/videos for UI issues
- [ ] Log all security issues with severity levels
- [ ] Performance metrics captured for baseline
- [ ] Cross-browser testing completed

### Post-Testing Activities  

- [ ] Test results compiled and reported
- [ ] Critical bugs triaged for immediate fixing
- [ ] Performance benchmarks established
- [ ] Security issues addressed
- [ ] Documentation updated based on findings
- [ ] Test environment cleaned up

---

## Conclusion

This comprehensive manual testing guide covers all aspects of the Supercheck platform. Regular execution of these test cases will help ensure:

- **Functionality**: All features work as designed
- **Security**: Application is protected against common threats  
- **Performance**: System performs well under expected load
- **Reliability**: Application handles edge cases gracefully
- **Usability**: User experience is smooth across all scenarios

The testing should be performed regularly during development cycles and before any production releases. Any failures should be documented, prioritized, and addressed promptly to maintain platform quality and user trust.