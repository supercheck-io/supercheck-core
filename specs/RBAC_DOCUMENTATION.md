# Role-Based Access Control (RBAC) and Super Admin Setup Guide

## Overview

This document provides comprehensive information about the RBAC system in Supertest, including both technical implementation details and user-facing setup instructions for super admin functionality.

## Role-Based Access Control (RBAC) System

Supertest implements a comprehensive RBAC system with three hierarchical levels:

### 1. System Level - Super Admin Privileges
- **SUPER_ADMIN**: Full system access, user management, organization oversight
- **ADMIN**: User management, limited organization access (deprecated, equivalent to SUPER_ADMIN)
- **USER**: Standard user with organization/project access

### 2. Organization Level - Organization Admin/Owner Privileges
- **OWNER**: Full control over the organization, billing, member management
- **ADMIN**: Organization management, invite members, create projects
- **MEMBER**: Access assigned projects, limited organization visibility
- **VIEWER**: Read-only access to assigned projects

### 3. Project Level - Project-Specific Permissions
- **OWNER**: Full project control, member management, settings
- **ADMIN**: Project management, invite project members, configure settings
- **EDITOR**: Create/edit tests, jobs, monitors within project
- **VIEWER**: Read-only access to project data

### Permission Inheritance Rules

- **Super Admins**: Have all permissions across all organizations and projects
- **Organization Owners/Admins**: Have all project permissions within their organization
- **Project Members**: Have permissions based on their project role
- **Cross-Organization Access**: Blocked by default (except for super admins)

## Super Admin Setup Guide

### Overview

Super admin users have the highest level of access in the system and can:
- Impersonate any user
- Manage all users and organizations
- Access system-wide statistics and settings
- Perform administrative actions across the entire platform
- Override all RBAC permissions

### Methods to Create Super Admin Users

There are **two ways** to grant super admin privileges to users:

#### Method 1: Environment Variable (Recommended for Initial Setup)

This method is ideal for setting up the first super admin during initial deployment.

##### Step 1: Create User Account

1. **Create a regular user account** through the normal signup process at `/sign-up`
2. **Note the email address** you used for registration

##### Step 2: Set Environment Variable

You can configure super admin access using either email addresses (preferred) or user IDs (legacy).

**Option A: Email-Based Configuration (Recommended)**

**For Docker Compose (.env file):**
```env
# Single super admin
SUPER_ADMIN_EMAILS=admin@example.com

# Multiple super admins (comma-separated)
SUPER_ADMIN_EMAILS=admin@example.com,admin2@example.com
```

**For Production Environment:**
```bash
export SUPER_ADMIN_EMAILS="admin@example.com"
```

**Option B: User ID-Based Configuration (Legacy)**

First, find the user ID using a database query:
```sql
-- Connect to your PostgreSQL database
SELECT id, name, email FROM "user" WHERE email = 'your-admin-email@example.com';
```

Then set the environment variable:
```env
# Single super admin
SUPER_ADMIN_USER_IDS=550e8400-e29b-41d4-a716-446655440000

# Multiple super admins (comma-separated)
SUPER_ADMIN_USER_IDS=550e8400-e29b-41d4-a716-446655440000,6ba7b810-9dad-11d1-80b4-00c04fd430c8
```

##### Step 3: Restart the Application

Restart your application for the environment variable changes to take effect:

```bash
# For Docker Compose
docker-compose restart app

# For local development
npm run dev
```

#### Method 2: Database Role Assignment (Recommended for Ongoing Management)

This method allows you to manage super admin privileges through the admin UI or database.

##### Step 1: Use the Admin UI (Preferred)

If you already have super admin access:

1. Go to the Super Admin Dashboard at `/super-admin`
2. Navigate to the "Users" tab
3. Find the user you want to promote
4. Click the dropdown menu (⋯) next to their name
5. Select "Change Role" → "Super Admin"

##### Step 2: Direct Database Update (Alternative)

```sql
-- Connect to your PostgreSQL database
UPDATE "user" 
SET role = 'super_admin' 
WHERE email = 'new-admin@example.com';
```

## Permission Matrix

### System-Level Permissions (Super Admin Only)

| Permission | Super Admin | Admin | User |
|------------|-------------|-------|------|
| MANAGE_ALL_USERS | ✅ | ❌ | ❌ |
| VIEW_ALL_USERS | ✅ | ✅ | ❌ |
| IMPERSONATE_USERS | ✅ | ❌ | ❌ |
| MANAGE_ALL_ORGANIZATIONS | ✅ | ❌ | ❌ |
| VIEW_ALL_ORGANIZATIONS | ✅ | ✅ | ❌ |
| DELETE_ORGANIZATIONS | ✅ | ❌ | ❌ |
| VIEW_SYSTEM_STATS | ✅ | ✅ | ❌ |
| MANAGE_SYSTEM_SETTINGS | ✅ | ❌ | ❌ |
| VIEW_AUDIT_LOGS | ✅ | ❌ | ❌ |

### Organization-Level Permissions

| Permission | Owner | Admin | Member | Viewer |
|------------|-------|-------|--------|--------|
| MANAGE_ORGANIZATION | ✅ | ❌ | ❌ | ❌ |
| VIEW_ORGANIZATION | ✅ | ✅ | ✅ | ✅ |
| DELETE_ORGANIZATION | ✅ | ❌ | ❌ | ❌ |
| INVITE_MEMBERS | ✅ | ✅ | ❌ | ❌ |
| MANAGE_MEMBERS | ✅ | ✅ | ❌ | ❌ |
| VIEW_MEMBERS | ✅ | ✅ | ✅ | ✅ |
| CREATE_PROJECTS | ✅ | ✅ | ✅ | ❌ |
| MANAGE_ALL_PROJECTS | ✅ | ✅ | ❌ | ❌ |
| VIEW_ALL_PROJECTS | ✅ | ✅ | ✅ | ✅ |

### Project-Level Permissions

| Permission | Owner | Admin | Editor | Viewer |
|------------|-------|-------|--------|--------|
| MANAGE_PROJECT | ✅ | ❌ | ❌ | ❌ |
| VIEW_PROJECT | ✅ | ✅ | ✅ | ✅ |
| DELETE_PROJECT | ✅ | ❌ | ❌ | ❌ |
| CREATE_TESTS | ✅ | ✅ | ✅ | ❌ |
| EDIT_TESTS | ✅ | ✅ | ✅ | ❌ |
| DELETE_TESTS | ✅ | ✅ | ❌ | ❌ |
| VIEW_TESTS | ✅ | ✅ | ✅ | ✅ |
| RUN_TESTS | ✅ | ✅ | ✅ | ❌ |
| CREATE_JOBS | ✅ | ✅ | ✅ | ❌ |
| EDIT_JOBS | ✅ | ✅ | ✅ | ❌ |
| DELETE_JOBS | ✅ | ✅ | ❌ | ❌ |
| VIEW_JOBS | ✅ | ✅ | ✅ | ✅ |
| TRIGGER_JOBS | ✅ | ✅ | ✅ | ❌ |
| CREATE_MONITORS | ✅ | ✅ | ✅ | ❌ |
| EDIT_MONITORS | ✅ | ✅ | ✅ | ❌ |
| DELETE_MONITORS | ✅ | ✅ | ❌ | ❌ |
| VIEW_MONITORS | ✅ | ✅ | ✅ | ✅ |
| MANAGE_PROJECT_MEMBERS | ✅ | ✅ | ❌ | ❌ |

## Recent Security Fixes (December 2024)

### Permission Bypass Vulnerabilities Fixed

Several critical permission bypass vulnerabilities were identified and fixed:

#### 1. Job Management Security Issues ❌➜✅
- **Issue**: Viewers could manually trigger, create, edit, and delete jobs via API routes
- **Root Cause**: Server actions and API routes lacked proper permission validation
- **Files Fixed**: 
  - `src/actions/create-job.ts` - Added CREATE_JOBS permission check
  - `src/actions/update-job.ts` - Added EDIT_JOBS permission check  
  - `src/actions/delete-job.ts` - Added DELETE_JOBS permission check
  - `src/app/api/jobs/run/route.ts` - Added TRIGGER_JOBS permission check
  - **`src/app/api/jobs/[id]/route.ts`** - **CRITICAL**: Added missing authorization to PUT method

#### 2. Test Management Security Issues ❌➜✅
- **Issue**: Viewers could create, edit, and delete tests
- **Root Cause**: Server actions only checked authentication, not permissions
- **Files Fixed**:
  - `src/actions/save-test.ts` - Added CREATE_TESTS/EDIT_TESTS permission checks
  - `src/actions/delete-test.ts` - Added DELETE_TESTS permission check

#### 3. UI/UX Improvements ✅
- **Enhancement**: Buttons now show disabled state with explanatory tooltips instead of being hidden
- **Files Updated**:
  - `src/components/jobs/data-table-row-actions.tsx` - Added permission-aware disabled states
  - `src/components/jobs/columns.tsx` - Enhanced RunButton permission handling
  - `src/lib/rbac/client-permissions.ts` - New client-side permission utilities

#### 4. Admin Interface Modernization ✅
- **Enhancement**: Modernized admin tables with consistent UI/UX patterns
- **Files Updated**:
  - `src/components/org-admin/member-columns.tsx` - Professional member table with dropdown controls
  - `src/components/org-admin/members-table.tsx` - Unified member and invitation display
  - `src/components/admin/audit-columns.tsx` - **NEW**: Modern audit logs table columns
  - `src/components/admin/audit-logs-table.tsx` - **NEW**: Redesigned audit table with server-side pagination
  - `src/components/admin/audit-table-toolbar.tsx` - **NEW**: Enhanced filtering and search capabilities

### Security Implementation Pattern

All server actions now follow this security pattern:

```typescript
export async function secureAction(data: ActionData) {
  try {
    // 1. Authentication & Context
    const { userId, project, organizationId } = await requireProjectContext();

    // 2. Permission Check
    const permissionContext = await buildPermissionContext(
      userId, 'project', organizationId, project.id
    );
    
    const hasPermission = await hasPermission(permissionContext, RequiredPermission);
    
    if (!hasPermission) {
      console.warn(`User ${userId} attempted action without permission`);
      return { success: false, error: "Insufficient permissions" };
    }

    // 3. Business Logic
    // ... perform action
    
    return { success: true };
  } catch (error) {
    // 4. Error Handling
    return { success: false, error: error.message };
  }
}
```

### Client-Side Permission Utilities

New utilities for consistent client-side permission checking:

```typescript
// From src/lib/rbac/client-permissions.ts
import { canTriggerJobs, canEditJobs, canDeleteJobs } from '@/lib/rbac/client-permissions';

// Usage in components
const { currentProject } = useProjectContext();
const hasPermission = currentProject ? canTriggerJobs(currentProject.userRole) : false;

// UI state
<Button 
  disabled={!hasPermission}
  title={!hasPermission ? "Insufficient permissions" : "Trigger job"}
>
  Run Job
</Button>
```

### Audit Trail

All permission checks now include audit logging:

```typescript
// Permission denials are logged for security monitoring
console.warn(`User ${userId} attempted to ${action} ${resource} without ${permission} permission`);
```

### Testing Checklist

To verify the security fixes:

- [ ] **Viewer Role Testing**
  - [ ] Cannot trigger jobs manually (button disabled with tooltip)
  - [ ] Cannot create new jobs via server actions (returns permission error)
  - [ ] Cannot edit existing jobs via server actions (returns permission error)
  - [ ] Cannot delete jobs via server actions (returns permission error)
  - [ ] **Cannot update jobs via API PUT /api/jobs/[id]** (returns 403 permission error)
  - [ ] Cannot create tests (action returns permission error)
  - [ ] Cannot edit tests (action returns permission error)
  - [ ] Cannot delete tests (action returns permission error)
  - [ ] Can view all resources (no change to read permissions)

- [ ] **Editor Role Testing**
  - [ ] Can trigger jobs manually
  - [ ] Can create, edit jobs (but not delete)
  - [ ] Can create, edit tests (but not delete)
  - [ ] Cannot delete jobs or tests (reserved for admins)

- [ ] **Admin/Owner Role Testing**
  - [ ] Full access to all operations
  - [ ] Can delete jobs and tests
  - [ ] All buttons enabled with appropriate functionality

### Security Benefits

1. **Defense in Depth**: Both server-side validation and client-side UX improvements
2. **Consistent Experience**: Users understand why actions are unavailable
3. **Audit Trail**: All permission violations are logged for monitoring
4. **Future-Proof**: Pattern established for all new actions

### Admin Interface Improvements

#### Organization Admin Dashboard
- **Modern Member Management**: Redesigned member table with consistent UI/UX
- **Professional Styling**: Optimized row heights and spacing for better data density  
- **Unified Member Display**: All active members show consistently regardless of how they joined
- **Role Management**: Dropdown controls for all non-owner members with proper permission checks
- **Invitation Handling**: Clear separation between active members and pending invitations

#### System Admin Dashboard  
- **Modernized Audit Logs**: Complete redesign using consistent table components
- **Server-side Pagination**: Efficient handling of large audit log datasets
- **Enhanced Filtering**: Search across actions, users, and details with faceted filters
- **Professional Appearance**: Color-coded action badges and consistent typography
- **JSON Detail Viewer**: Expandable audit details with syntax highlighting

#### Security Enhancements
- **Permission-aware UI**: All admin interfaces respect RBAC permissions
- **Consistent Authorization**: Both org admin and system admin use same security patterns
- **Audit Integration**: All admin actions are logged with proper context

## Verification

To verify that super admin privileges are working:

### 1. Check Super Admin Dashboard Access

1. Login as the super admin user
2. Navigate to `/super-admin`
3. You should see:
   - System statistics
   - User management interface
   - Organization management
   - Impersonation capabilities

### 2. Test Impersonation

1. In the Super Admin Dashboard, go to the Users tab
2. Find any user and click their dropdown menu
3. Select "Impersonate"
4. You should be redirected to the main app as that user
5. Create a test to verify resources are created in the correct context

### 3. Check System Role

You can verify the role assignment through the admin API:

```bash
curl -X GET "http://localhost:3001/api/admin/users" \
     -H "Cookie: your-session-cookie" | jq '.[] | select(.email=="your-admin@example.com")'
```

## Security Considerations

### Environment Variable Method
- ✅ **Pros**: Immutable, can't be changed through UI
- ⚠️ **Cons**: Requires deployment to change, harder to manage multiple admins
- 🔒 **Security**: Highest security as it requires server access to modify

### Database Role Method
- ✅ **Pros**: Flexible, manageable through UI, auditable
- ⚠️ **Cons**: Can be modified by other super admins
- 🔒 **Security**: Good security with audit trail

### Best Practices

1. **Use Environment Variable for Bootstrap Admin**: Set one super admin via environment variable during initial setup
2. **Use Database Roles for Additional Admins**: Manage additional super admins through the UI
3. **Limit Super Admin Count**: Keep the number of super admins minimal (2-3 maximum)
4. **Regular Audits**: Periodically review who has super admin access
5. **Enable MFA**: Use multi-factor authentication for super admin accounts (framework is ready)

## Troubleshooting

### Issue: Super Admin Privileges Not Working

**Check 1: Environment Variable Format**
```bash
# Correct email format (preferred)
SUPER_ADMIN_EMAILS=admin@example.com

# Correct user ID format (legacy)
SUPER_ADMIN_USER_IDS=550e8400-e29b-41d4-a716-446655440000

# Incorrect formats
SUPER_ADMIN_EMAILS="admin@example.com"                        # Don't use quotes
SUPER_ADMIN_USER_IDS="550e8400-e29b-41d4-a716-446655440000"  # Don't use quotes
SUPER_ADMIN_USER_IDS=invalid-user-id                          # Must be valid UUID
```

**Check 2: Database Role Value**
```sql
-- Check current role
SELECT id, email, role FROM "user" WHERE email = 'your-admin@example.com';

-- Valid role values
role = 'super_admin'  -- Correct
role = 'admin'        -- Regular admin (not super admin)
role = 'user'         -- Regular user
role = NULL           -- Default user
```

**Check 3: Application Logs**
Check the application logs for RBAC-related errors:
```bash
docker-compose logs app | grep -i "admin\|rbac\|permission"
```

### Issue: Can't Access Super Admin Dashboard

1. **Verify Login**: Ensure you're logged in as the correct user
2. **Check Route**: Navigate to `/super-admin` exactly
3. **Clear Cache**: Clear browser cache and cookies
4. **Check Role**: Verify the user has super admin privileges using the verification steps above

### Issue: Impersonation Not Working

1. **Check Audit Logs**: Look for impersonation events in the database
   ```sql
   SELECT * FROM audit_logs WHERE action LIKE '%impersonation%' ORDER BY "createdAt" DESC LIMIT 10;
   ```

2. **Verify Target User**: Ensure the target user exists and has organization/project setup
3. **Check Rate Limits**: Verify you haven't exceeded impersonation rate limits (5 per 5 minutes)

## Development Setup

For local development, you can quickly set up a super admin:

### 1. Start the Application
```bash
cd app
npm run dev
```

### 2. Create a User Account
- Go to `http://localhost:3001/sign-up`
- Create an account with your email

### 3. Get User ID from Database
```bash
# Connect to local PostgreSQL
docker exec -it postgres-supercheck psql -U postgres -d supercheck

# Find your user ID
SELECT id, email FROM "user" WHERE email = 'your-email@example.com';
```

### 4. Set Environment Variable
```bash
# Add email to your .env file (preferred method)
echo "SUPER_ADMIN_EMAILS=your-email@example.com" >> .env

# Or add user ID (legacy method)
echo "SUPER_ADMIN_USER_IDS=YOUR_USER_ID_HERE" >> .env

# Restart development server
npm run dev
```

### 5. Verify Access
- Go to `http://localhost:3001/super-admin`
- You should see the super admin dashboard

## API Access for Super Admins

Super admins have access to all admin API endpoints:

```bash
# Get system statistics
GET /api/admin/stats

# List all users
GET /api/admin/users

# List all organizations  
GET /api/admin/organizations

# Impersonate user
POST /api/admin/users/{id}
Body: { "action": "impersonate" }

# Change user role
PUT /api/admin/users/{id}
Body: { "role": "super_admin" }

# Stop impersonation
POST /api/admin/stop-impersonation
```

## Organization and Project Context

### Default Creation
Upon signup, users automatically get:
1. **Default Organization**: Named "{User}'s Organization"
2. **Default Project**: Named "Default Project" 
3. **Proper Role Assignment**: User becomes OWNER of both organization and project

### Session-Based Context
- **Active Organization**: Stored in session, can be switched
- **Active Project**: Stored in session, can be switched
- **Impersonation Support**: Super admins can impersonate users while maintaining context

### Project Switching
Users can switch between projects within their organizations:
- **API**: `POST /api/projects/switch` with project ID
- **UI**: Project switcher in sidebar
- **Session Update**: Active project stored in session

## Migration from Old System

If you're upgrading from a previous version:

1. **Identify Current Admins**: Check who currently has admin access
2. **Choose Bootstrap Method**: Use environment variable for primary admin
3. **Convert Others**: Use database roles for additional admins
4. **Test Thoroughly**: Verify all admin functions work correctly
5. **Update Documentation**: Document which users are super admins for your team

## Technical Implementation Details

### Core Files

#### RBAC Core
- `/app/src/lib/rbac/permissions.ts` - Permission definitions and role mappings
- `/app/src/lib/rbac/middleware.ts` - Permission checking logic and middleware
- `/app/src/lib/rbac/client-permissions.ts` - Client-side permission utilities
- `/app/src/lib/session.ts` - Session and context management
- `/app/src/lib/project-context.ts` - Project context utilities
- `/app/src/lib/admin.ts` - Admin privilege checking

#### Admin Interface Components
- `/app/src/components/admin/admin-data-table.tsx` - Shared admin table component
- `/app/src/components/admin/user-columns.tsx` - System admin user table columns
- `/app/src/components/admin/audit-columns.tsx` - Audit logs table columns
- `/app/src/components/admin/audit-logs-table.tsx` - Modern audit logs table
- `/app/src/components/admin/audit-table-toolbar.tsx` - Audit table filtering toolbar
- `/app/src/components/org-admin/member-columns.tsx` - Organization member table columns
- `/app/src/components/org-admin/members-table.tsx` - Organization member management table

### Permission Context Structure

```typescript
interface PermissionContext {
  type: 'system' | 'organization' | 'project';
  userId: string;
  systemRole: SystemRole;
  organizationId?: string;
  orgRole?: OrgRole;
  projectId?: string;
  projectRole?: ProjectRole;
}
```

### Role Definitions

#### System Roles
```typescript
export enum SystemRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',        // Deprecated, equivalent to SUPER_ADMIN
  USER = 'user'
}
```

#### Organization Roles
```typescript
export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin', 
  MEMBER = 'member',
  VIEWER = 'viewer'
}
```

#### Project Roles
```typescript
export enum ProjectRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',      // Note: Implementation uses EDITOR, not MEMBER
  VIEWER = 'viewer'
}
```

## Permission Checking Implementation

### Middleware Functions

```typescript
// Check if user has permission
export async function hasPermission(
  context: PermissionContext,
  permission: Permission
): Promise<boolean>

// Require permission (throws error if not authorized)
export async function requirePermission(
  context: PermissionContext,
  permission: Permission
): Promise<void>

// Build permission context
export async function buildPermissionContext(
  userId: string,
  type: 'system' | 'organization' | 'project',
  organizationId?: string,
  projectId?: string
): Promise<PermissionContext>
```

### API Route Protection

```typescript
// Example: Protect a project-scoped API route
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    
    // Get project context from session
    const projectContext = await requireProjectContext();
    
    // Build permission context
    const context = await buildPermissionContext(
      userId, 
      'project', 
      projectContext.organizationId, 
      projectContext.id
    );
    
    // Check permission
    await requirePermission(context, ProjectPermission.VIEW_TESTS);
    
    // Proceed with API logic...
  } catch (error) {
    // Handle permission errors
  }
}
```

## Session and Context Management

### Project Context Implementation

The system uses session-based project context for seamless user experience:

```typescript
// Get current project context from session
export async function getCurrentProjectContext(): Promise<ProjectContext | null>

// Switch to different project
export async function switchProject(projectId: string): Promise<{ success: boolean; message?: string; project?: ProjectContext }>

// Require project context for API routes
export async function requireProjectContext(): Promise<{
  userId: string;
  project: ProjectContext;
  organizationId: string;
}>
```

### Session Schema

```sql
-- Session table includes project context
CREATE TABLE session (
  id uuid PRIMARY KEY,
  token text UNIQUE NOT NULL,
  userId uuid NOT NULL,
  activeOrganizationId uuid REFERENCES organization(id),
  activeProjectId uuid REFERENCES projects(id),  -- Added for project context
  impersonatedBy text,                          -- For admin impersonation
  -- ... other fields
);
```

## Database Schema

### Current Implementation Status

✅ **Implemented:**
- User roles and permissions
- Organization membership with roles
- Project membership with roles
- Session-based context management
- Admin impersonation support

⚠️ **Pending Cleanup:**
- Teams table still exists but should be removed
- Team references in member and invitation tables

### Teams Table Cleanup Plan

The teams table exists but is not used. Cleanup required:

```sql
-- Step 1: Remove team references
ALTER TABLE member DROP COLUMN teamId;
ALTER TABLE invitation DROP COLUMN teamId;

-- Step 2: Drop teams table
DROP TABLE team;
```

### Project Context in Data Tables

All data tables are scoped by both organization and project:

```sql
-- Example: Jobs table with dual scoping
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  organizationId uuid NOT NULL REFERENCES organization(id),
  projectId uuid NOT NULL REFERENCES projects(id),  -- Added for project scoping
  -- ... other fields
);
```

## API Route Protection Patterns

### 1. Project-Scoped Routes

```typescript
// Pattern for project-scoped resources (tests, jobs, monitors)
export async function GET(request: NextRequest) {
  const { userId } = await requireAuth();
  const projectContext = await requireProjectContext();
  
  const context = await buildPermissionContext(
    userId, 'project', 
    projectContext.organizationId, 
    projectContext.id
  );
  
  await requirePermission(context, ProjectPermission.VIEW_TESTS);
  // ... API logic
}
```

### 2. Organization-Scoped Routes

```typescript
// Pattern for organization-scoped resources
export async function GET(request: NextRequest) {
  const { userId } = await requireAuth();
  const activeOrg = await getActiveOrganization();
  
  const context = await buildPermissionContext(
    userId, 'organization', activeOrg.id
  );
  
  await requirePermission(context, OrgPermission.VIEW_MEMBERS);
  // ... API logic
}
```

### 3. System-Level Routes

```typescript
// Pattern for admin-only routes
export async function GET(request: NextRequest) {
  const { userId } = await requireAuth();
  
  const context = await buildPermissionContext(userId, 'system');
  
  await requirePermission(context, SystemPermission.VIEW_SYSTEM_STATS);
  // ... API logic
}
```

## Environment Variables

### RBAC Configuration

```bash
# Super Admin Configuration
SUPER_ADMIN_EMAILS=admin@example.com,admin2@example.com
SUPER_ADMIN_USER_IDS=user_id_1,user_id_2  # Legacy support

# Organization & Project Limits
MAX_PROJECTS_PER_ORG=50
MAX_ORGANIZATIONS_PER_USER=5
MAX_MEMBERS_PER_ORGANIZATION=100
MAX_MEMBERS_PER_PROJECT=25

# Security Settings
ENABLE_PROJECT_LEVEL_RBAC=true
ALLOW_CROSS_PROJECT_ACCESS=false
STRICT_ORGANIZATION_ISOLATION=true
```

## Security Features

### 1. Permission Caching Strategy

- **No Cached Permissions**: Permissions are checked dynamically to prevent stale access
- **Real-time Validation**: Every request validates current permissions
- **Context-Aware**: Permissions are checked in the context of the current organization/project

### 2. Resource Scoping

```typescript
// All database queries include proper scoping
const jobs = await db
  .select()
  .from(jobsTable)
  .where(and(
    eq(jobsTable.organizationId, organizationId),
    eq(jobsTable.projectId, projectId)
  ));
```

### 3. Audit Trail

```typescript
// Permission checks are logged for audit
await logAuditEvent({
  userId: context.userId,
  action: 'permission_check',
  resource: 'test',
  resourceId: testId,
  permission: ProjectPermission.VIEW_TESTS,
  granted: hasPermission,
  context: {
    organizationId: context.organizationId,
    projectId: context.projectId
  }
});
```

## Performance Considerations

### 1. Permission Context Building

- **Efficient Queries**: Permission contexts are built with optimized database queries
- **Minimal Overhead**: Permission checking adds <10ms to request time
- **Caching Strategy**: User roles are cached in session, not permissions

### 2. Database Optimization

```sql
-- Indexes for efficient permission checking
CREATE INDEX idx_project_members_user_project ON project_members(user_id, project_id);
CREATE INDEX idx_member_user_org ON member(user_id, organization_id);
CREATE INDEX idx_session_token ON session(token);
```

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Check user's role assignments in database
   - Verify project/organization membership
   - Check permission matrix for required permissions

2. **Missing Project Context**
   - Ensure user has access to at least one project
   - Check session has activeProjectId set
   - Verify project is active and user is member

3. **Cross-Organization Access**
   - Verify user is member of target organization
   - Check organization role permissions
   - Ensure proper session context

### Debug Commands

```sql
-- Check user roles
SELECT u.email, u.role, m.role as org_role, pm.role as project_role
FROM "user" u
LEFT JOIN member m ON u.id = m.user_id
LEFT JOIN project_members pm ON u.id = pm.user_id
WHERE u.email = 'user@example.com';

-- Check session context
SELECT s.token, s.active_organization_id, s.active_project_id, s.impersonated_by
FROM session s
JOIN "user" u ON s.user_id = u.id
WHERE u.email = 'user@example.com';
```

## Migration and Deployment

### 1. Database Migration

```sql
-- Add project context to existing data
ALTER TABLE jobs ADD COLUMN project_id uuid REFERENCES projects(id);
ALTER TABLE tests ADD COLUMN project_id uuid REFERENCES projects(id);
ALTER TABLE monitors ADD COLUMN project_id uuid REFERENCES projects(id);

-- Update existing data to use default projects
UPDATE jobs SET project_id = (
  SELECT p.id FROM projects p 
  WHERE p.organization_id = jobs.organization_id AND p.is_default = true
) WHERE project_id IS NULL;
```

### 2. Environment Setup

```bash
# Set up super admin
echo "SUPER_ADMIN_EMAILS=admin@example.com" >> .env

# Configure RBAC limits
echo "MAX_PROJECTS_PER_ORG=50" >> .env
echo "MAX_MEMBERS_PER_ORGANIZATION=100" >> .env
```

### 3. Testing Checklist

#### Core RBAC Functionality
- [ ] Super admin can access all resources
- [ ] Organization admins can manage their org
- [ ] Project members can access their projects
- [ ] Cross-organization access is blocked
- [ ] Impersonation works correctly
- [ ] Permission inheritance works as expected

#### Admin Interface Testing
- [ ] **Organization Admin Dashboard** (`/org-admin`)
  - [ ] Member table shows all active members with consistent UI
  - [ ] Role dropdowns work for all non-owner members
  - [ ] Pending invitations show separately with clear status
  - [ ] Invitation acceptance removes from pending list
  - [ ] Member removal and role changes work correctly
  
- [ ] **System Admin Dashboard** (`/super-admin`)
  - [ ] User management table shows all users with proper controls
  - [ ] Organization management shows all orgs with statistics
  - [ ] Audit logs table loads with server-side pagination
  - [ ] Audit log filtering and search work correctly
  - [ ] Audit log details modal shows full JSON data
  - [ ] User impersonation functions properly

## Conclusion

The RBAC system provides comprehensive access control while maintaining performance and security. The session-based context management ensures a seamless user experience while enforcing proper data isolation.

Super admin setup is straightforward with either method. For new deployments, start with the environment variable method for the initial admin, then use the UI for additional admins. Always follow security best practices and maintain an audit trail of administrative actions.

For questions or issues, check the troubleshooting section above or review the application logs for specific error messages.