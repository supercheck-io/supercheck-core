# Better Auth RBAC System Documentation

## Overview

Supertest implements a **hybrid RBAC system** that combines Better Auth's built-in organization and admin plugins with custom role-based access control for project-level resources. The system supports user impersonation, multi-organization membership, and granular permissions across different contexts.

## Recent Updates (Current Implementation)

### Key Changes Made:
1. **Fixed Ban/Unban Functionality**: Now uses direct database operations instead of Better Auth admin plugin due to environment variable restrictions
2. **Enhanced Role Display**: Super admin interface shows highest role across all organizations with organization count for multi-org users
3. **Improved Permission System**: Unified approach using `useProjectContext()` for consistent permission checking across all UI components
4. **Role Mapping**: Comprehensive role conversion between database values and RBAC enum values
5. **Fixed Invited User Organization Creation**: Prevented invited users from getting unwanted default organizations

## Database Schema & Role Storage

### Role Tables and Context

The system uses multiple tables for different contexts:

1. **`user` table**: Stores system-level roles (e.g., for super admins)
2. **`member` table**: Organization-level roles for users in organizations
3. **`project_members` table**: Project-specific roles for users within projects

### Current Database Role Values

**Organization Roles (`member` table):**
- `owner` → ORG_OWNER (organization owner)
- `admin` → ORG_ADMIN (organization admin)  
- `member` → PROJECT_EDITOR (basic member with editing rights)
- `org_owner` → ORG_OWNER (normalized role name)
- `org_admin` → ORG_ADMIN (normalized role name)
- `project_editor` → PROJECT_EDITOR (explicit editor role)
- `project_viewer` → PROJECT_VIEWER (read-only role)

**Project Roles (`project_members` table):**
- `owner` → ORG_OWNER (project owner)
- `admin` → ORG_ADMIN (project admin)
- `member` → PROJECT_EDITOR (project member with edit access)
- `project_editor` → PROJECT_EDITOR (explicit editor role)
- `project_viewer` → PROJECT_VIEWER (read-only access)
- `viewer` → PROJECT_VIEWER (legacy viewer role)

### Role Conversion Logic

The `convertStringToRole()` function handles mapping between database strings and RBAC enum values:

```typescript
export function convertStringToRole(roleString: string): Role {
  switch (roleString) {
    case 'org_owner':
    case 'owner':
      return Role.ORG_OWNER;
    case 'org_admin':
    case 'admin':
      return Role.ORG_ADMIN;
    case 'project_editor':
    case 'editor':
      return Role.PROJECT_EDITOR;
    case 'project_viewer':
    case 'viewer':
      return Role.PROJECT_VIEWER;
    case 'member':
      return Role.PROJECT_EDITOR; // Default for project context
    case 'super_admin':
      return Role.SUPER_ADMIN;
    default:
      return Role.PROJECT_VIEWER;
  }
}
```

## Better Auth Integration

### Architecture Components

- **Better Auth Admin Plugin**: Handles system-level user management
- **Better Auth Organization Plugin**: Manages organization membership and roles
- **Custom Access Control**: Extends Better Auth with project-level resources
- **Unified Permission System**: Combines Better Auth permissions with custom resources

### Core Configuration

The system uses Better Auth's `createAccessControl` function with custom statements:

```typescript
export const statement = {
  // System-level resources (admin plugin)
  system: ["manage_users", "view_users", "impersonate_users", ...],
  
  // Organization resources (organization plugin)  
  organization: ["create", "update", "delete", "view"],
  member: ["create", "update", "delete", "view"],
  invitation: ["create", "cancel", "view"],
  
  // Custom project-level resources
  project: ["create", "update", "delete", "view", "manage_members"],
  test: ["create", "update", "delete", "view", "run"],
  job: ["create", "update", "delete", "view", "trigger"],
  monitor: ["create", "update", "delete", "view", "manage"],
  run: ["view", "delete", "export"],
  apiKey: ["create", "update", "delete", "view"],
  notification: ["create", "update", "delete", "view"],
  tag: ["create", "update", "delete", "view"]
} as const;
```

## Role System with Better Auth

### The 5 Unified Roles

1. **SUPER_ADMIN** (`super_admin`) - System-wide access using Better Auth admin plugin
2. **ORG_OWNER** (`owner`) - Full organization control via Better Auth organization plugin  
3. **ORG_ADMIN** (`admin`) - Organization management via Better Auth organization plugin
4. **PROJECT_EDITOR** (`project_editor`) - Custom role for project-specific editing
5. **PROJECT_VIEWER** (`project_viewer`) - Custom role for read-only access

### Better Auth Role Mapping

```typescript
export const roles = {
  [Role.SUPER_ADMIN]: superAdmin,    // Full system access
  [Role.ORG_OWNER]: orgOwner,        // Organization owner permissions
  [Role.ORG_ADMIN]: orgAdmin,        // Organization admin permissions
  [Role.PROJECT_EDITOR]: projectEditor,  // Project editing permissions
  [Role.PROJECT_VIEWER]: projectViewer   // Read-only permissions
};
```

### Role Hierarchy & Access Levels

```
SUPER_ADMIN (System-wide via Environment Variables + Custom Logic)
    ├── User management (ban/unban via direct DB operations)
    ├── System-wide impersonation
    ├── All organization and project permissions
    └── Access to super admin interface

ORG_OWNER (Organization-wide via Better Auth Organization Plugin)
    ├── Full organization control (including deletion)
    ├── All member management features
    ├── Full access to all projects in organization
    └── Can create/edit/delete jobs, tests, monitors

ORG_ADMIN (Organization-wide via Better Auth Organization Plugin)  
    ├── Organization management (cannot delete organization)
    ├── Member management features
    ├── Full access to all projects in organization
    └── Can create/edit/delete jobs, tests, monitors

PROJECT_EDITOR (Project-specific Role)
    ├── View organization info
    ├── Edit access to assigned projects only
    ├── Can create/edit/delete jobs, tests, monitors in assigned projects
    └── Cannot manage organization or members

PROJECT_VIEWER (Project-specific Role - Read Only)
    ├── View organization info
    ├── Read-only access to assigned projects
    ├── Can only VIEW jobs, tests, monitors, runs
    └── Cannot create, edit, or delete any resources
```

### Current Permission Matrix

| Resource | Super Admin | Org Owner | Org Admin | Project Editor | Project Viewer |
|----------|-------------|-----------|-----------|----------------|----------------|
| Users (ban/unban) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Organizations | ✅ | ✅ (own) | ✅ (own) | 👁️ (view) | 👁️ (view) |
| Organization Members | ✅ | ✅ | ✅ | 👁️ (view) | 👁️ (view) |
| Projects | ✅ | ✅ | ✅ | 👁️ (assigned) | 👁️ (assigned) |
| Jobs | ✅ | ✅ | ✅ | ✅ (assigned projects) | 👁️ (assigned projects) |
| Tests | ✅ | ✅ | ✅ | ✅ (assigned projects) | 👁️ (assigned projects) |
| Monitors | ✅ | ✅ | ✅ | ✅ (assigned projects) | 👁️ (assigned projects) |
| Runs | ✅ | ✅ | ✅ | ✅ (assigned projects) | 👁️ (assigned projects) |

Legend: ✅ = Full Access, 👁️ = View Only, ❌ = No Access

## Current Implementation Details

### Permission Checking Architecture

**UI Components use `useProjectContext()` approach:**
```typescript
// Consistent across all components
const { currentProject } = useProjectContext();
const userRole = currentProject?.userRole ? convertStringToRole(currentProject.userRole) : null;
const hasEditPermission = userRole ? canEditJobs(userRole) : false;
```

**Project Context Resolution:**
1. Gets active project from session table
2. Queries `project_members` table for user's role in that project
3. Returns role string (e.g., 'project_viewer', 'member', 'owner')
4. Role string gets converted to RBAC enum via `convertStringToRole()`

### Super Admin User Management

**Role Display Logic:**
- Calls `getUserHighestRole()` for each user
- Checks environment variables first (SUPER_ADMIN_USER_IDS, SUPER_ADMIN_EMAILS)
- Queries all organization memberships and returns highest role
- Shows organization count for multi-org users: "User Name (3 orgs)"

**Ban/Unban Implementation:**
```typescript
// Direct database operations (not Better Auth admin plugin)
await db.update(user).set({ 
  banned: true, 
  banReason: reason, 
  banExpires: expireDate 
}).where(eq(user.id, userId));
```

## User Organization Management

### Invited vs Sign-up Users

The system distinguishes between two types of users to prevent unwanted organization creation:

**Sign-up Users:**
- Users who register directly through the sign-up form
- Get a default organization with format: `{User Name}'s Organization`
- Automatically become `org_owner` of their default organization
- Get a default project within their organization

**Invited Users:**
- Users who join through organization invitations
- Only get membership in organizations they were invited to
- Do not get default organizations created
- Only have access to projects they were specifically invited to

### Default Organization Creation Logic

The system uses multiple safeguards to prevent invited users from getting default organizations:

1. **Better Auth Plugin Configuration**: `allowUserToCreateOrganization: false` disables automatic organization creation
2. **Setup Defaults API**: Checks for recent invitations within 24 hours before creating defaults
3. **Setup Checker Component**: Verifies organization membership before attempting to create defaults
4. **Impersonation Safeguard**: Removed automatic default creation during admin impersonation

### Implementation Details

**Setup Defaults Check:**
```typescript
// Check if user was recently invited (within last 24 hours)
const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
const [recentInvitation] = await db
  .select()
  .from(invitation)
  .where(
    and(
      eq(invitation.email, user.email),
      gte(invitation.createdAt, oneDayAgo)
    )
  )
  .orderBy(desc(invitation.createdAt))
  .limit(1);

if (recentInvitation) {
  console.log(`User ${user.email} was recently invited - not creating default organization`);
  return { success: true, message: 'User was recently invited - skipping default organization setup' };
}
```

**Setup Checker Enhancement:**
```typescript
// Check if user is a member of any organization
const membershipResponse = await fetch('/api/organizations');
const membershipData = await membershipResponse.json();

if (membershipData.success && membershipData.data && membershipData.data.length > 0) {
  // User is a member of organizations but has no projects
  // This is likely an invited user with restricted project access
  console.log('User has organization membership but no projects - likely invited user, skipping defaults setup');
  setIsSetupComplete(true);
  return;
}
```

## Known Issues & Troubleshooting

### Issue: Project Viewer Permissions Not Working During Impersonation

**Symptoms:**
- When impersonating a project_viewer user, edit/delete buttons remain enabled
- Console shows role conversion and permission checks but buttons not disabled

**Root Cause Analysis:**
1. Check what role string is returned from `currentProject?.userRole`
2. Verify `convertStringToRole()` is mapping correctly
3. Ensure permission functions (`canEditJobs`, etc.) return false for PROJECT_VIEWER

**Debugging Commands:**
```bash
# Check project_members table roles
node -e "
const postgres = require('postgres');
const client = postgres(process.env.DATABASE_URL);
client\`SELECT DISTINCT role FROM project_members\`.then(console.log);
"

# Check specific user's project role
node -e "
const postgres = require('postgres');
const client = postgres(process.env.DATABASE_URL);
client\`SELECT pm.role, p.name, u.email 
FROM project_members pm 
JOIN projects p ON pm.project_id = p.id 
JOIN users u ON pm.user_id = u.id 
WHERE u.email = 'user@example.com'\`.then(console.table);
"
```

**Debug Console Logs to Check:**
- Role conversion: "Converting role string: project_viewer"
- Permission matrix: "Direct permission test: { role: 4, canEdit: false, canDelete: false }"
- UI state: "Jobs Row Actions Debug: { hasEditPermission: false }"

### Issue: Role Values Inconsistency

**Database contains mixed role formats:**
- Legacy: `member`, `viewer`, `owner`, `admin`
- Modern: `project_viewer`, `project_editor`, `org_owner`, `org_admin`

**Solution:**
The `convertStringToRole()` function handles both formats, but ensure new roles use consistent naming.

## Better Auth Permission System

### Server-Side Permission Checking

**Using Better Auth's Built-in APIs:**

```typescript
// Organization/Admin permissions use Better Auth APIs
export async function hasPermission(
  resource: keyof typeof statement,
  action: string,
  context?: Partial<PermissionContext>
): Promise<boolean> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (['organization', 'member', 'invitation'].includes(resource)) {
    // Use Better Auth's hasPermission API
    const result = await auth.api.hasPermission({
      headers: await headers(),
      body: {
        permissions: {
          [resource]: [action]
        }
      }
    });
    return result.success;
  }

  // For custom resources, use our permission logic
  return checkPermission(permissionContext, resource, action);
}
```

**Using Better Auth Middleware:**

```typescript
export async function requireBetterAuthPermission(
  permissions: Record<string, string[]>
): Promise<{ userId: string; user: SessionUser }> {
  const authResult = await requireAuth();
  
  for (const [resource, actions] of Object.entries(permissions)) {
    if (['organization', 'member', 'invitation', 'user', 'session'].includes(resource)) {
      const result = await auth.api.hasPermission({
        headers: await headers(),
        body: {
          permissions: { [resource]: actions }
        }
      });
      
      if (!result.success) {
        throw new Error(`Access denied: Missing ${resource} permissions`);
      }
    } else {
      // Check custom permissions
      for (const action of actions) {
        const hasAccess = await hasPermission(resource as keyof typeof statement, action);
        if (!hasAccess) {
          throw new Error(`Access denied: Missing ${resource}:${action} permission`);
        }
      }
    }
  }
  
  return authResult;
}
```

### Client-Side Permission Checking

**Better Auth Client Hooks:**

```typescript
// Organization permissions using Better Auth client
export function useHasPermission(permissions: Record<string, string[]>) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const { data: session } = useSession();

  useEffect(() => {
    if (permissions.organization || permissions.member || permissions.invitation) {
      const checkPermissions = async () => {
        const result = await authClient.organization.hasPermission({
          permissions
        });
        setHasPermission(result.success);
      };
      checkPermissions();
    }
  }, [session, JSON.stringify(permissions)]);

  return { hasPermission, isLoading: hasPermission === null };
}

// Role-based permission checking
export function useCheckRolePermission(role: string, permissions: Record<string, string[]>) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    const result = authClient.organization.checkRolePermission({
      role,
      permissions
    });
    setHasPermission(result);
  }, [role, JSON.stringify(permissions)]);

  return hasPermission;
}
```

**Component Usage:**

```typescript
import { useHasPermission, useCanEditJobs } from '@/hooks/use-better-auth-permissions';

export function JobActions() {
  // Better Auth organization permissions
  const { hasPermission: canManageOrg } = useHasPermission({
    organization: ['update'],
    member: ['create', 'update', 'delete']
  });

  // Custom permission hooks
  const canEditJobs = useCanEditJobs();
  const canDeleteJobs = useCanDeleteJobs();

  return (
    <div>
      {canManageOrg && <Button>Manage Organization</Button>}
      {canEditJobs && <Button>Edit Job</Button>}
      {canDeleteJobs && <Button>Delete Job</Button>}
    </div>
  );
}
```

## Admin Plugin Integration

### System Administration Features

Better Auth's admin plugin provides comprehensive system-level administration:

**Available Features:**
- ✅ User creation and management (`auth.api.createUser`, `auth.api.listUsers`)
- ✅ User role assignment (`auth.api.setRole`)  
- ✅ User banning and unbanning (`auth.api.banUser`, `auth.api.unbanUser`)
- ✅ User impersonation (`auth.api.impersonateUser`)
- ✅ Session management (`auth.api.listUserSessions`, `auth.api.revokeUserSession`)
- ✅ Password management (`auth.api.setUserPassword`)

**Super Admin Setup:**

```typescript
admin({
  adminUserIds: process.env.SUPER_ADMIN_USER_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [],
  ac,
  roles: {
    admin: roles[Role.ORG_ADMIN],
    super_admin: roles[Role.SUPER_ADMIN]
  }
})
```

**Usage Examples:**

```typescript
// Server-side admin operations
export async function adminCreateUser(userData: CreateUserData) {
  try {
    await requireBetterAuthPermission({
      user: ['create']
    });
    
    const result = await auth.api.createUser({
      body: {
        email: userData.email,
        password: userData.password,
        name: userData.name,
        role: userData.role || 'project_viewer'
      }
    });
    
    return { success: true, user: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Client-side admin UI
export function AdminUserList() {
  const { hasPermission } = useHasPermission({
    user: ['view', 'create', 'update', 'delete']
  });
  
  if (!hasPermission) return null;
  
  return <UserManagementInterface />;
}
```

## Organization Plugin Integration

### Organization Management Features

Better Auth's organization plugin handles multi-tenancy:

**Available Features:**
- ✅ Organization creation and management
- ✅ Member invitation and management
- ✅ Role-based organization permissions
- ✅ Active organization switching
- ✅ Organization-scoped permissions

**Configuration:**

```typescript
organization({
  // Disable automatic organization creation - we handle this manually
  allowUserToCreateOrganization: false,
  organizationLimit: parseInt(process.env.MAX_ORGANIZATIONS_PER_USER || '5'),
  creatorRole: "owner",
  membershipLimit: 100,
  ac,
  roles: {
    owner: roles[Role.ORG_OWNER],
    admin: roles[Role.ORG_ADMIN],
    project_editor: roles[Role.PROJECT_EDITOR],
    project_viewer: roles[Role.PROJECT_VIEWER]
  },
  sendInvitationEmail: async ({ invitation, organization }) => {
    // Custom email implementation
  }
})
```

**Server-Side Organization Operations:**

```typescript
// Using Better Auth organization permissions
export async function inviteMember(inviteData: InviteData) {
  try {
    await requireBetterAuthPermission({
      invitation: ['create'],
      member: ['create']
    });
    
    const result = await auth.api.inviteMember({
      body: {
        email: inviteData.email,
        role: inviteData.role,
        organizationId: inviteData.organizationId
      }
    });
    
    return { success: true, invitation: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

**Client-Side Organization Management:**

```typescript
export function OrganizationMemberList() {
  const { hasPermission } = useHasPermission({
    member: ['view', 'create', 'update', 'delete'],
    invitation: ['create', 'cancel']
  });

  if (!hasPermission) return <AccessDenied />;

  return (
    <div>
      <MemberList />
      <InvitationForm />
    </div>
  );
}
```

## API Integration Patterns

### Server Actions with Better Auth

**Updated Server Action Pattern:**

```typescript
// Before (Custom RBAC)
export async function createJob(data: CreateJobData) {
  const { userId, project, organizationId } = await requireProjectContext();
  
  const permissionContext = await buildUnifiedPermissionContext(
    userId, 'project', organizationId, project.id
  );
  
  const canCreateJobs = await hasPermission(permissionContext, ProjectPermission.CREATE_JOBS);
  if (!canCreateJobs) {
    return { success: false, message: "Insufficient permissions" };
  }
  
  // Create job logic...
}

// After (Better Auth Integration)
export async function createJob(data: CreateJobData) {
  const { userId, project, organizationId } = await requireProjectContext();
  
  try {
    await requireBetterAuthPermission({
      job: ['create']
    });
  } catch (error) {
    return { success: false, message: "Insufficient permissions" };
  }
  
  // Create job logic...
}
```

### API Routes with Better Auth

**API Route Pattern:**

```typescript
export async function POST(request: NextRequest) {
  return withBetterAuthPermission(
    async (req, context, auth) => {
      // Handler logic with authenticated user context
      return NextResponse.json({ success: true });
    },
    {
      // Required permissions
      test: ['create'],
      project: ['view']
    }
  )(request);
}
```

## Permission Matrix with Better Auth

### System-Level Permissions (Better Auth Admin Plugin)

| Permission | SUPER_ADMIN |
|------------|-------------|
| **User Management** |
| user:create | ✅ |
| user:update | ✅ |
| user:delete | ✅ |
| user:view | ✅ |
| user:impersonate | ✅ |
| **Session Management** |
| session:list | ✅ |
| session:revoke | ✅ |
| session:delete | ✅ |

### Organization-Level Permissions (Better Auth Organization Plugin)

| Permission | SUPER_ADMIN | ORG_OWNER | ORG_ADMIN | PROJECT_EDITOR | PROJECT_VIEWER |
|------------|-------------|-----------|-----------|----------------|----------------|
| **Organization Management** |
| organization:create | ✅ | ✅ | ❌ | ❌ | ❌ |
| organization:update | ✅ | ✅ | ✅ | ❌ | ❌ |
| organization:delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| organization:view | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Member Management** |
| member:create | ✅ | ✅ | ✅ | ❌ | ❌ |
| member:update | ✅ | ✅ | ✅ | ❌ | ❌ |
| member:delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| member:view | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Invitation Management** |
| invitation:create | ✅ | ✅ | ✅ | ❌ | ❌ |
| invitation:cancel | ✅ | ✅ | ✅ | ❌ | ❌ |
| invitation:view | ✅ | ✅ | ✅ | ✅ | ✅ |

### Custom Resource Permissions

| Permission | SUPER_ADMIN | ORG_OWNER | ORG_ADMIN | PROJECT_EDITOR* | PROJECT_VIEWER |
|------------|-------------|-----------|-----------|-----------------|----------------|
| **Project Management** |
| project:create | ✅ | ✅ | ✅ | ❌ | ❌ |
| project:update | ✅ | ✅ | ✅ | ❌ | ❌ |
| project:delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| project:view | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Test Management** |
| test:create | ✅ | ✅ | ✅ | ✅ | ❌ |
| test:update | ✅ | ✅ | ✅ | ✅ | ❌ |
| test:delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| test:view | ✅ | ✅ | ✅ | ✅ | ✅ |
| test:run | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Job Management** |
| job:create | ✅ | ✅ | ✅ | ✅ | ❌ |
| job:update | ✅ | ✅ | ✅ | ✅ | ❌ |
| job:delete | ✅ | ✅ | ✅ | ❌ | ❌ |
| job:view | ✅ | ✅ | ✅ | ✅ | ✅ |
| job:trigger | ✅ | ✅ | ✅ | ✅ | ❌ |

*\* PROJECT_EDITOR permissions apply only to their assigned projects*

## Implementation Files

### Core Better Auth Integration
- `/app/src/utils/auth.ts` - Better Auth server configuration with plugins
- `/app/src/utils/auth-client.ts` - Better Auth client configuration  
- `/app/src/lib/rbac/permissions.ts` - Access control statements and roles
- `/app/src/lib/rbac/middleware.ts` - Server-side permission checking
- `/app/src/hooks/use-better-auth-permissions.ts` - Client-side permission hooks

### Better Auth Configuration Files
```typescript
// Server Configuration (/app/src/utils/auth.ts)
export const auth = betterAuth({
  plugins: [
    admin({
      adminUserIds: process.env.SUPER_ADMIN_USER_IDS?.split(',') || [],
      ac,
      roles: {
        admin: roles[Role.ORG_ADMIN],
        super_admin: roles[Role.SUPER_ADMIN]
      }
    }),
    organization({
      ac,
      roles: {
        owner: roles[Role.ORG_OWNER],
        admin: roles[Role.ORG_ADMIN],
        project_editor: roles[Role.PROJECT_EDITOR],
        project_viewer: roles[Role.PROJECT_VIEWER]
      }
    }),
    apiKey(),
    nextCookies()
  ]
});

// Client Configuration (/app/src/utils/auth-client.ts)
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: {
        owner: roles[Role.ORG_OWNER],
        admin: roles[Role.ORG_ADMIN],
        project_editor: roles[Role.PROJECT_EDITOR],
        project_viewer: roles[Role.PROJECT_VIEWER]
      }
    }),
    adminClient({
      ac,
      roles: {
        admin: roles[Role.ORG_ADMIN],
        super_admin: roles[Role.SUPER_ADMIN]
      }
    }),
    apiKeyClient()
  ]
});
```

## Migration from Custom RBAC

### Key Changes

**Before (Custom RBAC System):**
```typescript
// Old permission checking
const context = await buildUnifiedPermissionContext(userId, 'project', orgId, projectId);
const hasAccess = await hasPermission(context, ProjectPermission.CREATE_TESTS);

// Old client permissions
const canEdit = canEditTests(userRole, projectId, assignedProjects);
```

**After (Better Auth Integration):**
```typescript
// New permission checking
await requireBetterAuthPermission({
  test: ['create']
});

// New client permissions
const canEdit = useCanEditTests();
```

### Migration Benefits

1. **Better Auth Features**: Access to admin and organization plugin functionality
2. **Standardized APIs**: Use industry-standard permission checking patterns
3. **Client-Server Consistency**: Unified permission system across all layers
4. **Enhanced Security**: Built-in protection against common auth vulnerabilities
5. **Better Developer Experience**: Type-safe permission checking with excellent TypeScript support

## Testing Better Auth Integration

### Admin Plugin Testing
```typescript
// Test super admin user management
const result = await auth.api.createUser({
  body: {
    email: 'test@example.com',
    password: 'secure-password',
    name: 'Test User',
    role: 'project_editor'
  }
});

// Test user impersonation
const impersonation = await auth.api.impersonateUser({
  body: { userId: 'user-id' }
});

// Test user banning
await auth.api.banUser({
  body: { 
    userId: 'user-id',
    banReason: 'Terms violation',
    banExpiresIn: 60 * 60 * 24 * 7 // 7 days
  }
});
```

### Organization Plugin Testing
```typescript
// Test organization creation
const org = await authClient.organization.create({
  name: 'Test Organization',
  slug: 'test-org'
});

// Test member invitation
const invitation = await authClient.organization.inviteMember({
  email: 'member@example.com',
  role: 'project_editor',
  organizationId: org.id
});

// Test permission checking
const hasPermission = await authClient.organization.hasPermission({
  permissions: {
    member: ['create', 'update'],
    organization: ['update']
  }
});
```

### Role Permission Testing
```typescript
// Test role-based permission checking
const canManageMembers = authClient.organization.checkRolePermission({
  role: 'admin',
  permissions: {
    member: ['create', 'update', 'delete']
  }
});
```

## Security Benefits

### 1. Industry-Standard Security
- **Proven Security Model**: Leverages Better Auth's battle-tested security patterns
- **Built-in Protections**: CSRF protection, session management, and security headers
- **Regular Updates**: Benefits from Better Auth's security updates and patches

### 2. Enhanced Permission System
- **Granular Control**: Fine-grained permissions for all resources
- **Type Safety**: Full TypeScript support with compile-time permission checking
- **Consistent API**: Unified permission checking across client and server

### 3. Better Admin Security
- **Secure Impersonation**: Built-in user impersonation with audit trails
- **Session Management**: Comprehensive session control and monitoring
- **User Management**: Secure user creation, modification, and deletion

### 4. Organization Security
- **Multi-tenancy**: Secure organization isolation and member management
- **Invitation System**: Secure member invitation with email verification
- **Role Management**: Dynamic role assignment with permission validation

## Conclusion

The Better Auth RBAC integration provides a robust, scalable, and secure permission system that combines the power of Better Auth's admin and organization plugins with custom project-level permissions. This hybrid approach offers:

**Key Advantages:**
- **Standards Compliance**: Uses industry-standard authentication and authorization patterns
- **Enhanced Security**: Built-in protection against common vulnerabilities
- **Developer Experience**: Excellent TypeScript support and intuitive APIs
- **Scalability**: Supports complex permission hierarchies and multi-tenant architectures
- **Maintainability**: Reduced custom code with standardized permission checking
- **Feature Rich**: Access to comprehensive admin and organization management features
- **Future Proof**: Easy to extend with additional Better Auth plugins and features

The system successfully bridges Better Auth's built-in features with custom business logic, providing a comprehensive RBAC solution that meets the complex requirements of a modern SaaS application while maintaining security best practices and developer productivity.