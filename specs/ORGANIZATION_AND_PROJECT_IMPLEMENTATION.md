# Organization and Project Implementation Plan

## Overview

This document outlines the implementation plan for adding default organization and project creation functionality to Supertest with comprehensive Role-Based Access Control (RBAC) and admin capabilities. The system will:

1. **Automatically create a default organization and project** for each user upon signup
2. **Scope ALL data by organization AND project** for complete multi-tenant isolation
3. **Implement granular RBAC** using Better Auth's organization and admin plugins
4. **Provide comprehensive admin functionality** for system-wide management

**CRITICAL**: Every piece of data (jobs, tests, monitors, notifications, API keys, etc.) must be scoped by both organization AND project for proper isolation.

## Current State Analysis

### ✅ What's Already Working
- **Database Schema**: Complete multi-tenant schema with organizations, projects, teams, members, invitations
- **Better Auth**: Organization and admin plugins are configured
- **Authentication**: User authentication and session management working
- **UI Foundation**: Project switcher component exists (currently static)

### ❌ What's Missing
- **API Integration**: No API routes for organizations/projects management
- **Data Scoping**: All APIs default to `organizationId: null` with NO project scoping
- **Default Creation**: No automatic organization/project creation on signup
- **RBAC Implementation**: Role-based access control not implemented
- **Admin Interface**: Admin functionality not implemented
- **Data Connection**: Project switcher uses hardcoded data
- **Teams Cleanup**: Teams table exists but won't be used - needs removal/migration plan

## Implementation Plan

### Phase 1: Core Organization API Routes

#### New Files to Create

1. **`/app/src/app/api/organizations/route.ts`**
   - GET: List user's organizations
   - POST: Create new organization (if allowed)

2. **`/app/src/app/api/organizations/[id]/route.ts`**
   - GET: Get organization details
   - PUT: Update organization
   - DELETE: Delete organization

3. **`/app/src/app/api/organizations/[id]/members/route.ts`**
   - GET: List organization members
   - POST: Invite member

4. **`/app/src/app/api/projects/route.ts`**
   - GET: List organization's projects
   - POST: Create new project

5. **`/app/src/app/api/projects/[id]/route.ts`**
   - GET: Get project details
   - PUT: Update project
   - DELETE: Delete project
   - POST: Set active project (project switching)

6. **`/app/src/app/api/projects/[id]/members/route.ts`**
   - GET: List project members
   - POST: Add member to project with role
   - PUT: Update member project role
   - DELETE: Remove member from project

#### Files to Modify

1. **`/app/src/lib/auth.ts`**
   - Add organization creation hooks
   - Implement default organization creation on signup
   - Configure admin permissions

2. **`/app/src/db/schema/schema.ts`**
   - Add projects table usage (currently defined but unused)
   - Ensure proper foreign key relationships

### Phase 2: Update Existing APIs for Organization Context

#### Files to Modify

1. **`/app/src/app/api/jobs/route.ts`**
   - Replace `organizationId: null` with active organization ID
   - Add organization-scoped job filtering

2. **`/app/src/app/api/tags/route.ts`**
   - Replace `organizationId: null` with active organization ID
   - Add organization-scoped tag management

3. **`/app/src/lib/monitor-service.ts`**
   - Update `organizationId: null` default to use session organization
   - Add organization context to monitor operations

4. **`/app/src/app/api/notification-providers/route.ts`**
   - Add organization context to notification providers
   - Scope providers to organization

5. **`/app/src/app/api/monitors/route.ts`**
   - Add organization scoping to monitor queries
   - Update create/update operations

6. **`/app/src/app/api/tests/route.ts`**
   - Add organization AND project context to test operations
   - Scope test queries to organization AND project

7. **`/app/src/app/api/runs/route.ts`**
   - Add organization AND project scoping to run queries
   - Update create/update operations with dual scoping

8. **`/app/src/app/api/api-keys/route.ts`**
   - Add organization AND project context to API key operations
   - Scope API key usage to specific projects

9. **ALL OTHER API ROUTES** requiring dual scoping:
   - `/app/src/app/api/alert-rules/route.ts`
   - `/app/src/app/api/notification-channels/route.ts`
   - Any other routes that handle data

### Phase 3: Session and Context Management

#### Files to Modify

1. **`/app/src/lib/session.ts`** (create if doesn't exist)
   - Helper functions for getting active organization from session
   - Organization switching utilities

2. **`/app/src/middleware.ts`** (if exists, or create)
   - Add organization context to requests
   - Handle organization switching

### Phase 4: Frontend Integration

#### Files to Modify

1. **`/app/src/components/project-switcher.tsx`**
   - Replace hardcoded projects with API calls
   - Implement project creation functionality
   - Add organization switching capability

2. **`/app/src/components/sidebar.tsx`** (if exists)
   - Update to show organization context
   - Add organization management options

#### New Components to Create

1. **`/app/src/components/organization-switcher.tsx`**
   - Organization selection and switching
   - New organization creation

2. **`/app/src/components/admin/`** (directory)
   - Admin dashboard components
   - User management interface
   - Organization oversight tools

### Phase 5: Admin Functionality

#### New Files to Create

1. **`/app/src/app/admin/page.tsx`**
   - Admin dashboard
   - User and organization overview

2. **`/app/src/app/admin/users/page.tsx`**
   - User management interface
   - User ban/unban functionality

3. **`/app/src/app/admin/organizations/page.tsx`**
   - Organization management
   - Organization statistics

4. **`/app/src/lib/admin.ts`**
   - Admin utility functions
   - Permission checking helpers

## Database Schema Considerations

### Projects Table Enhancement
The projects table already exists but needs activation with RBAC support:
```sql
-- Enhanced projects table
table: projects {
  id: string (primary key)
  name: string
  slug: string (unique per organization)
  description: string (optional)
  organizationId: string (foreign key)
  isDefault: boolean (for default project per org)
  metadata: json (project settings)
  createdAt: date
  updatedAt: date
}
```

### Project Members Table (NEW)
```sql
-- New table for project-level RBAC
table: projectMembers {
  id: string (primary key)
  userId: string (foreign key)
  projectId: string (foreign key)
  organizationId: string (foreign key, for faster queries)
  role: string (owner, admin, member, viewer)
  permissions: json (custom permissions)
  createdAt: date
}
```

### Teams Table - REMOVAL PLAN
Since teams won't be used:
1. **Drop teams and teamMember tables** after confirming no data exists
2. **Remove team-related fields** from invitation table
3. **Update Better Auth config** to disable teams

### Data Scoping Updates
ALL existing tables need project scoping:
```sql
-- Add projectId to ALL data tables
ALTER TABLE jobs ADD COLUMN projectId string REFERENCES projects(id);
ALTER TABLE tests ADD COLUMN projectId string REFERENCES projects(id);
ALTER TABLE monitors ADD COLUMN projectId string REFERENCES projects(id);
ALTER TABLE runs ADD COLUMN projectId string REFERENCES projects(id);
ALTER TABLE api_keys ADD COLUMN projectId string REFERENCES projects(id);
ALTER TABLE notification_channels ADD COLUMN projectId string REFERENCES projects(id);
ALTER TABLE alert_rules ADD COLUMN projectId string REFERENCES projects(id);
-- ... and any other data tables
```

### Session Enhancement
```sql
-- Add project context to sessions
ALTER TABLE session ADD COLUMN activeProjectId string REFERENCES projects(id);
```

## Role-Based Access Control (RBAC) Implementation

### 1. Multi-Level RBAC System

#### System-Level Roles (Better Auth Admin Plugin)
- **Super Admin**: Complete system access, user management, organization oversight
- **System Admin**: User management, limited organization access
- **Regular User**: Standard user with organization/project access

#### Organization-Level Roles (Better Auth Organization Plugin)
- **Owner**: Full organization control, billing, member management
- **Admin**: Organization management, invite members, create projects
- **Member**: Access assigned projects, limited organization visibility
- **Viewer**: Read-only access to assigned projects

#### Project-Level Roles (Custom Implementation)
- **Project Owner**: Full project control, member management, settings
- **Project Admin**: Project management, invite project members, configure settings
- **Project Member**: Create/edit tests, jobs, monitors within project
- **Project Viewer**: Read-only access to project data

### 2. Permission Matrix

#### System-Level Permissions
```typescript
const systemPermissions = {
  user: ["create", "list", "update", "delete", "ban", "impersonate"],
  organization: ["list", "create", "update", "delete", "transfer"],
  system: ["manage", "audit", "configure"]
};
```

#### Organization-Level Permissions
```typescript
const organizationPermissions = {
  organization: ["update", "delete", "billing"],
  member: ["invite", "remove", "update-role"],
  project: ["create", "list", "assign-members"],
  billing: ["view", "manage", "upgrade"]
};
```

#### Project-Level Permissions
```typescript
const projectPermissions = {
  project: ["update", "delete", "configure"],
  member: ["invite", "remove", "update-role"],
  test: ["create", "update", "delete", "execute"],
  job: ["create", "update", "delete", "trigger"],
  monitor: ["create", "update", "delete", "configure"],
  apiKey: ["create", "view", "delete", "rotate"],
  notification: ["configure", "test", "manage"]
};
```

### 3. RBAC Implementation Strategy

#### Access Control Files to Create
```typescript
// /app/src/lib/rbac/permissions.ts
import { createAccessControl } from "better-auth/plugins/access";

// System-level access control
const systemStatement = {
  user: ["create", "list", "update", "delete", "ban", "impersonate"],
  organization: ["list", "create", "update", "delete"],
  system: ["manage", "audit"]
} as const;

const systemAC = createAccessControl(systemStatement);

// Project-level access control
const projectStatement = {
  project: ["update", "delete", "configure"],
  test: ["create", "update", "delete", "execute"],
  job: ["create", "update", "delete", "trigger"],
  monitor: ["create", "update", "delete", "configure"],
  apiKey: ["create", "view", "delete"]
} as const;

const projectAC = createAccessControl(projectStatement);

// Define roles
export const systemAdmin = systemAC.newRole({
  user: ["create", "list", "update", "ban"],
  organization: ["list", "create", "update"],
  system: ["manage"]
});

export const projectOwner = projectAC.newRole({
  project: ["update", "delete", "configure"],
  test: ["create", "update", "delete", "execute"],
  job: ["create", "update", "delete", "trigger"],
  monitor: ["create", "update", "delete", "configure"],
  apiKey: ["create", "view", "delete"]
});

export const projectMember = projectAC.newRole({
  test: ["create", "update", "execute"],
  job: ["create", "update", "trigger"],
  monitor: ["create", "update"]
});

export const projectViewer = projectAC.newRole({
  // Read-only access (no create/update/delete permissions)
});
```

#### Permission Checking Middleware
```typescript
// /app/src/lib/rbac/middleware.ts
export async function checkProjectPermission(
  userId: string,
  projectId: string,
  resource: string,
  action: string
): Promise<boolean> {
  // 1. Get user's project role
  const projectMember = await getProjectMember(userId, projectId);
  if (!projectMember) return false;
  
  // 2. Check if role has permission
  return projectAC.checkRolePermission({
    role: projectMember.role,
    permissions: { [resource]: [action] }
  });
}

export async function requireProjectPermission(
  userId: string,
  projectId: string,
  resource: string,
  action: string
) {
  const hasPermission = await checkProjectPermission(userId, projectId, resource, action);
  if (!hasPermission) {
    throw new Error(`Insufficient permissions: ${resource}:${action}`);
  }
}
```

## Security and Best Practices

### 1. Dual-Scoped Data Isolation
- **Organization + Project Scoping**: ALL queries must filter by both organizationId AND projectId
- **API Validation**: Verify user has access to both organization AND project
- **Session Context**: Track both active organization and active project
- **Foreign Key Constraints**: Ensure data integrity with proper relationships

### 2. RBAC Security Implementation
```typescript
// Example API security pattern
export async function secureApiHandler(req: Request, resourceType: string, action: string) {
  // 1. Authenticate user
  const session = await getSession(req);
  if (!session) throw new UnauthorizedError();
  
  // 2. Get organization and project context
  const { organizationId, projectId } = await getRequestContext(req, session);
  
  // 3. Check system-level admin permissions first
  const isSystemAdmin = await checkSystemAdminPermission(session.userId);
  if (isSystemAdmin) return { organizationId, projectId }; // Allow all
  
  // 4. Check organization membership
  const orgMember = await getOrganizationMember(session.userId, organizationId);
  if (!orgMember) throw new ForbiddenError("Not an organization member");
  
  // 5. Check project-level permissions
  await requireProjectPermission(session.userId, projectId, resourceType, action);
  
  return { organizationId, projectId, session };
}
```

### 3. Admin Access Control Implementation
```typescript
// /app/src/lib/admin/permissions.ts
export const adminPermissions = {
  // Super admin - full system access
  superAdmin: {
    users: ["create", "list", "update", "delete", "ban", "impersonate"],
    organizations: ["create", "list", "update", "delete", "transfer"],
    system: ["configure", "audit", "monitor", "backup"]
  },
  
  // System admin - limited system access
  systemAdmin: {
    users: ["list", "update", "ban"],
    organizations: ["list", "update"],
    system: ["audit", "monitor"]
  }
};

// Admin role checking
export async function requireAdminRole(userId: string, minRole: 'systemAdmin' | 'superAdmin') {
  const userRoles = await getUserSystemRoles(userId);
  
  if (minRole === 'superAdmin' && !userRoles.includes('superAdmin')) {
    throw new ForbiddenError("Super admin access required");
  }
  
  if (!userRoles.includes('systemAdmin') && !userRoles.includes('superAdmin')) {
    throw new ForbiddenError("Admin access required");
  }
}
```

### 4. Default Creation Strategy with RBAC
```typescript
// On user signup
const defaultOrg = await createOrganization({
  name: `${user.name}'s Organization`,
  slug: generateSlug(user.name),
  creatorId: user.id
});

// Create organization membership with owner role
const orgMembership = await createOrganizationMember({
  userId: user.id,
  organizationId: defaultOrg.id,
  role: 'owner'
});

// Create default project
const defaultProject = await createProject({
  name: "Default Project",
  slug: "default",
  organizationId: defaultOrg.id,
  isDefault: true
});

// Create project membership with owner role
const projectMembership = await createProjectMember({
  userId: user.id,
  projectId: defaultProject.id,
  organizationId: defaultOrg.id,
  role: 'owner'
});

// Set active organization and project in session
const session = await createSession({
  userId: user.id,
  activeOrganizationId: defaultOrg.id,
  activeProjectId: defaultProject.id
});
```

### 5. Migration Strategy for Dual Scoping
```typescript
// Migration script for existing data
async function migrateToProjectScoping() {
  // 1. Create default organizations for users without them
  const usersWithoutOrgs = await getUsersWithoutOrganizations();
  for (const user of usersWithoutOrgs) {
    await createDefaultOrganizationAndProject(user);
  }
  
  // 2. Create default projects for organizations without them
  const orgsWithoutProjects = await getOrganizationsWithoutProjects();
  for (const org of orgsWithoutProjects) {
    await createDefaultProject(org.id);
  }
  
  // 3. Migrate existing data to default projects
  await migrateJobsToDefaultProjects();
  await migrateTestsToDefaultProjects();
  await migrateMonitorsToDefaultProjects();
  // ... migrate all other data tables
  
  // 4. Add NOT NULL constraints after migration
  await addProjectIdConstraints();
}
```

### 6. Teams Table Cleanup Plan
```sql
-- Step 1: Verify no data exists
SELECT COUNT(*) FROM team;
SELECT COUNT(*) FROM teamMember;

-- Step 2: Remove foreign key references
ALTER TABLE invitation DROP COLUMN teamId;
ALTER TABLE session DROP COLUMN activeTeamId;

-- Step 3: Drop tables
DROP TABLE teamMember;
DROP TABLE team;
```

```typescript
// Better Auth config update
organization({
  teams: {
    enabled: false // Disable teams feature
  }
})
```

## API Endpoints Summary

### Organizations
- `GET /api/organizations` - List user's organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/[id]` - Get organization
- `PUT /api/organizations/[id]` - Update organization
- `DELETE /api/organizations/[id]` - Delete organization
- `POST /api/organizations/[id]/switch` - Set active organization

### Projects
- `GET /api/projects` - List organization projects (with RBAC filtering)
- `POST /api/projects` - Create project (requires org permissions)
- `GET /api/projects/[id]` - Get project (requires project access)
- `PUT /api/projects/[id]` - Update project (requires project admin)
- `DELETE /api/projects/[id]` - Delete project (requires project owner)
- `POST /api/projects/[id]/switch` - Set active project
- `GET /api/projects/[id]/members` - List project members
- `POST /api/projects/[id]/members` - Add project member with role
- `PUT /api/projects/[id]/members/[userId]` - Update member role
- `DELETE /api/projects/[id]/members/[userId]` - Remove project member

### Admin (System-Level)
- `GET /api/admin/users` - List all users (with pagination, search, filters)
- `POST /api/admin/users` - Create user (super admin only)
- `GET /api/admin/users/[id]` - Get user details with organizations/projects
- `PUT /api/admin/users/[id]` - Update user (change email, name, etc.)
- `POST /api/admin/users/[id]/ban` - Ban user with reason and duration
- `POST /api/admin/users/[id]/unban` - Unban user
- `POST /api/admin/users/[id]/impersonate` - Impersonate user (super admin only)
- `POST /api/admin/users/[id]/sessions/revoke` - Revoke all user sessions
- `POST /api/admin/users/[id]/password/reset` - Force password reset

### Admin - Organizations
- `GET /api/admin/organizations` - List all organizations with stats
- `GET /api/admin/organizations/[id]` - Get organization details
- `PUT /api/admin/organizations/[id]` - Update organization
- `DELETE /api/admin/organizations/[id]` - Delete organization (super admin only)
- `POST /api/admin/organizations/[id]/transfer` - Transfer ownership
- `GET /api/admin/organizations/[id]/members` - List organization members
- `GET /api/admin/organizations/[id]/projects` - List organization projects
- `GET /api/admin/organizations/[id]/usage` - Get usage statistics

### Admin - System
- `GET /api/admin/stats` - System-wide statistics
- `GET /api/admin/audit-logs` - System audit logs
- `POST /api/admin/maintenance` - Trigger maintenance tasks
- `GET /api/admin/health` - System health check
- `POST /api/admin/notifications/broadcast` - Send system-wide notifications

## Implementation Order

1. **Setup Organization API Routes** (Phase 1)
2. **Implement Default Organization Creation** (Signup hooks)
3. **Update Existing APIs for Organization Context** (Phase 2)
4. **Connect Frontend Components** (Phase 4)
5. **Add Admin Interface** (Phase 5)
6. **Testing and Migration** (Data migration for existing records)

## Configuration Changes

### Better Auth Configuration with RBAC
```typescript
// app/src/lib/auth.ts
import { systemAC, systemAdmin, superAdmin } from './rbac/permissions';

// Admin plugin configuration
admin({
  adminRoles: ["systemAdmin", "superAdmin"],
  adminUserIds: process.env.SUPER_ADMIN_USER_IDS?.split(',') || [],
  impersonationSessionDuration: 60 * 60, // 1 hour
  ac: systemAC,
  roles: {
    systemAdmin,
    superAdmin
  }
}),

// Organization plugin configuration
organization({
  allowUserToCreateOrganization: async (user) => {
    // Check if user has reached organization limit or is banned
    const orgCount = await getUserOrganizationCount(user.id);
    const userBanned = await isUserBanned(user.id);
    return !userBanned && orgCount < 5;
  },
  organizationLimit: 5,
  membershipLimit: 100,
  teams: {
    enabled: false // Disable teams - we're using projects instead
  },
  organizationCreation: {
    beforeCreate: async ({ organization, user }) => {
      // Validate organization data and user permissions
      await validateOrganizationCreation(organization, user);
      return { data: organization };
    },
    afterCreate: async ({ organization, member, user }) => {
      // Create default project with proper RBAC
      const defaultProject = await createProject({
        name: "Default Project",
        slug: "default",
        organizationId: organization.id,
        isDefault: true
      });
      
      // Create project membership for organization owner
      await createProjectMember({
        userId: user.id,
        projectId: defaultProject.id,
        organizationId: organization.id,
        role: 'owner'
      });
      
      // Set active organization and project in session
      await updateSessionContext(user.id, {
        activeOrganizationId: organization.id,
        activeProjectId: defaultProject.id
      });
    }
  }
})
```

### Environment Variables
```bash
# Organization & Project Settings
DEFAULT_ORG_PROJECT_NAME="Default Project"
MAX_PROJECTS_PER_ORG=50
MAX_ORGANIZATIONS_PER_USER=5
MAX_MEMBERS_PER_ORGANIZATION=100
MAX_MEMBERS_PER_PROJECT=25

# Admin Configuration
SUPER_ADMIN_USER_IDS="user_123,user_456" # Comma-separated super admin user IDs
SYSTEM_ADMIN_USER_IDS="user_789,user_101" # Comma-separated system admin user IDs
ADMIN_IMPERSONATION_DURATION=3600 # 1 hour in seconds

# RBAC Settings
ENABLE_PROJECT_LEVEL_RBAC=true
ALLOW_CROSS_PROJECT_ACCESS=false
STRICT_ORGANIZATION_ISOLATION=true

# Security Settings
SESSION_TIMEOUT=86400 # 24 hours
REQUIRE_PROJECT_PERMISSION_FOR_API_KEYS=true
AUDIT_LOG_RETENTION_DAYS=90
```

## Implementation Priority

### Phase 1: Critical Foundation (Week 1)
1. **Database Migration**: Add projectId to all data tables
2. **Teams Cleanup**: Remove unused teams tables and references
3. **Session Enhancement**: Add activeProjectId to sessions
4. **Default Creation**: Implement org/project creation on signup

### Phase 2: API Security (Week 2)
1. **RBAC Middleware**: Implement permission checking system
2. **API Route Updates**: Add dual scoping to ALL existing APIs
3. **Organization/Project APIs**: Create management endpoints
4. **Session Context**: Implement organization/project switching

### Phase 3: Admin Interface (Week 3)
1. **Admin Dashboard**: System overview and statistics
2. **User Management**: CRUD operations with RBAC
3. **Organization Management**: Admin oversight of organizations
4. **Audit Logging**: Track all admin and system actions

### Phase 4: Frontend Integration (Week 4)
1. **Project Switcher**: Connect to real data with permissions
2. **Organization Switcher**: Add organization switching UI
3. **Permission-Based UI**: Show/hide features based on user roles
4. **Admin Interface**: Complete admin dashboard implementation

## Data Migration Script Example

```sql
-- 1. Add project columns to all data tables
ALTER TABLE jobs ADD COLUMN projectId VARCHAR(255);
ALTER TABLE tests ADD COLUMN projectId VARCHAR(255);
ALTER TABLE monitors ADD COLUMN projectId VARCHAR(255);
ALTER TABLE runs ADD COLUMN projectId VARCHAR(255);
ALTER TABLE api_keys ADD COLUMN projectId VARCHAR(255);
ALTER TABLE notification_channels ADD COLUMN projectId VARCHAR(255);
ALTER TABLE alert_rules ADD COLUMN projectId VARCHAR(255);

-- 2. Create default organizations and projects for existing users
-- (This would be done via application code, not SQL)

-- 3. Update existing data to use default projects
UPDATE jobs SET projectId = (
  SELECT p.id FROM projects p 
  JOIN organizations o ON p.organizationId = o.id 
  WHERE o.id = jobs.organizationId AND p.isDefault = true
) WHERE projectId IS NULL;

-- Repeat for all data tables...

-- 4. Add foreign key constraints
ALTER TABLE jobs ADD CONSTRAINT fk_jobs_project 
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Add NOT NULL constraints after migration
ALTER TABLE jobs MODIFY COLUMN projectId VARCHAR(255) NOT NULL;
```

This comprehensive implementation plan provides:
- **Complete dual-scoped data isolation** (organization + project)
- **Granular RBAC system** with multiple permission levels
- **Robust admin functionality** for system management
- **Secure migration path** for existing data
- **Scalable architecture** following Better Auth best practices
- **Clean teams table removal** since it won't be used