# Supertest Organization and Project Structure Analysis

## Current Database Structure

### Organizations and Users
The database schema shows a well-structured multi-tenant architecture:

**Core Tables:**
- `user` - User authentication table with UUID primary keys
- `organization` - Company/organization accounts with name, slug, logo
- `team` - Teams within organizations (optional hierarchy)
- `member` - User-to-organization mappings with roles
- `invitation` - Pending organization invitations with expiration
- `session` - User sessions with `activeOrganizationId` field
- `projects` - Projects within organizations (exists but unused)

**Key Findings:**
1. **Better Auth Integration**: Uses better-auth with organization plugin enabled
   - `allowUserToCreateOrganization: true` 
   - `organizationLimit: 5`
   - `membershipLimit: 100`
   - Teams feature enabled with `teamLimit: 10`

2. **Session Management**: Sessions track `activeOrganizationId` for context switching

3. **Existing Projects Table**: 
   - Already exists in schema with `organizationId` foreign key
   - Status field supports "active", "archived", "deleted"
   - Not currently used in the application

## Current Organization Implementation

### Null Organization Handling
Most entities currently default to `organizationId: null`:

**Files with null organization handling:**
- `/app/src/app/api/jobs/route.ts` - `organizationId: jobData.organizationId || null`
- `/app/src/lib/monitor-service.ts` - `organizationId: validatedData.organizationId || null`
- `/app/src/app/api/tags/route.ts` - `organizationId: null // No organization scoping`
- `/app/src/app/api/notification-providers/route.ts` - `organizationId: null`

**Current Behavior:**
- All resources are created without organization scoping
- No organization context is passed from frontend
- API routes accept but ignore organization parameters

## Authentication and Session Management

### Current Auth Setup (`/app/src/utils/auth.ts`):
- Better-auth with Drizzle adapter
- Organization plugin configured with proper limits
- Admin plugin enabled (currently unused)
- API key plugin for programmatic access

### Current Session Usage:
- Main layout checks authentication and redirects to sign-in if needed
- Nav-user component displays user info and logout
- Middleware handles API key authentication for job triggers
- No organization context is currently used in session

## UI Components Analysis

### Project Switcher (`/app/src/components/project-switcher.tsx`):
- **Currently Static**: Uses hardcoded project list
- **Mock Projects**: ["ABC", "DEF", "GHI", "JKL", "MNO", "PQR", "STU"]
- **Search Functionality**: Already implemented for filtering projects
- **Add Project Button**: UI exists but not functional
- **Context Storage**: Uses local state, no backend integration

### App Sidebar (`/app/src/components/app-sidebar.tsx`):
- References project switcher in header
- No dynamic project data integration
- Hardcoded navigation structure

### Nav Projects (`/app/src/components/nav-projects.tsx`):
- Generic component for displaying project lists
- Includes dropdown actions (View, Share, Delete)
- Not currently used in main sidebar

## Missing Implementation

### API Routes:
- **No `/api/projects` endpoint** - Need CRUD operations for projects
- **No `/api/organizations` endpoint** - Need organization management
- **No organization context** in existing API routes

### Organization Context:
- No middleware for organization scoping
- No session organization switching logic
- No organization-based access control

### Admin Features:
- Admin plugin enabled but no admin UI
- No organization management interface
- No user/organization administration

## Required Changes Summary

### Database Changes:
✅ **No changes needed** - Schema already supports full multi-tenant architecture

### Backend Changes:
1. **Create API Routes:**
   - `/api/projects` - CRUD operations for projects
   - `/api/organizations` - Organization management
   - `/api/organizations/[id]/members` - Member management

2. **Update Existing APIs:**
   - Add organization context to all resource APIs
   - Implement organization-based filtering
   - Update null checks to use session organization

3. **Session Management:**
   - Implement organization switching logic
   - Add organization context to session data
   - Update middleware for organization scoping

### Frontend Changes:
1. **Project Switcher:**
   - Connect to real project API
   - Implement add/create project functionality
   - Add organization switching capability

2. **Organization Management:**
   - Admin interface for organization management
   - Member invitation and management
   - Organization settings pages

3. **Resource Scoping:**
   - Update all resource lists to show organization-scoped data
   - Add organization filters and context

### Security Considerations:
- Implement proper organization-based authorization
- Ensure resources are scoped to user's organizations
- Add organization switching permissions
- Implement admin role checks

## Technical Debt:
- All existing resources have `organizationId: null` - need migration strategy
- Hardcoded project data needs to be replaced
- Organization context not implemented despite schema support
- Admin functionality exists but unused

## Next Steps Priority:
1. Implement organization context in session management
2. Create project API endpoints  
3. Connect project switcher to real data
4. Update existing APIs to use organization scoping
5. Add organization management interface
6. Implement admin features