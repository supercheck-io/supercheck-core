# Organization & Project Implementation - Task List

## Phase 1: Database & Schema Setup (Week 1)

### 1.1 Teams Table Cleanup
- [ ] Verify no data exists in `team` and `teamMember` tables
- [ ] Remove `teamId` column from `invitation` table
- [ ] Remove `activeTeamId` column from `session` table  
- [ ] Drop `teamMember` table
- [ ] Drop `team` table
- [ ] Update Better Auth config to disable teams

### 1.2 Database Schema Updates
- [ ] Add `projectId` column to `jobs` table
- [ ] Add `projectId` column to `tests` table
- [ ] Add `projectId` column to `monitors` table
- [ ] Add `projectId` column to `runs` table
- [ ] Add `projectId` column to `api_keys` table
- [ ] Add `projectId` column to `notification_channels` table
- [ ] Add `alert_rules` table with `projectId` column
- [ ] Add `activeProjectId` column to `session` table
- [ ] Create `projectMembers` table for project-level RBAC
- [ ] Update `projects` table with additional fields (slug, description, isDefault)

### 1.3 Database Migration Script
- [ ] Create migration script to add all projectId columns
- [ ] Create migration script for new tables
- [ ] Create migration script to clean up teams tables
- [ ] Test migration script on development database

### 1.4 Foreign Key Constraints
- [ ] Add foreign key constraints for all new `projectId` columns
- [ ] Add foreign key constraints for `projectMembers` table
- [ ] Update existing foreign key constraints as needed

## Phase 2: Authentication & RBAC Setup (Week 1-2)

### 2.1 Better Auth Configuration
- [ ] Update auth config with admin plugin settings
- [ ] Configure organization plugin with proper settings
- [ ] Disable teams in organization plugin
- [ ] Set up admin user IDs in environment variables
- [ ] Configure organization creation hooks

### 2.2 RBAC System Implementation  
- [ ] Create `/app/src/lib/rbac/permissions.ts` with access control definitions
- [ ] Create `/app/src/lib/rbac/middleware.ts` with permission checking functions
- [ ] Create system-level role definitions (super admin, system admin)
- [ ] Create project-level role definitions (owner, admin, member, viewer)
- [ ] Create permission checking utilities

### 2.3 Session Management
- [ ] Create `/app/src/lib/session.ts` with session helper functions
- [ ] Update session handling to include organization and project context
- [ ] Create organization/project switching functionality
- [ ] Update middleware to handle dual scoping

## Phase 3: Core API Routes (Week 2)

### 3.1 Organization Management APIs
- [ ] Create `/app/src/app/api/organizations/route.ts` (GET, POST)
- [ ] Create `/app/src/app/api/organizations/[id]/route.ts` (GET, PUT, DELETE)
- [ ] Create `/app/src/app/api/organizations/[id]/members/route.ts` (GET, POST)
- [ ] Create `/app/src/app/api/organizations/[id]/switch/route.ts` (POST)

### 3.2 Project Management APIs
- [ ] Create `/app/src/app/api/projects/route.ts` (GET, POST)
- [ ] Create `/app/src/app/api/projects/[id]/route.ts` (GET, PUT, DELETE)
- [ ] Create `/app/src/app/api/projects/[id]/switch/route.ts` (POST)
- [ ] Create `/app/src/app/api/projects/[id]/members/route.ts` (GET, POST, PUT, DELETE)

### 3.3 Default Organization/Project Creation
- [ ] Implement signup hook to create default organization
- [ ] Implement default project creation for new organizations
- [ ] Create project membership for organization creators
- [ ] Set active organization/project in new user sessions

## Phase 4: Update Existing APIs for Dual Scoping (Week 2-3)

### 4.1 Core Data APIs - Add Project Scoping
- [ ] Update `/app/src/app/api/jobs/route.ts` - replace organizationId null with dual scoping
- [ ] Update `/app/src/app/api/tests/route.ts` - add organization and project scoping
- [ ] Update `/app/src/app/api/monitors/route.ts` - add organization and project scoping
- [ ] Update `/app/src/app/api/runs/route.ts` - add organization and project scoping
- [ ] Update `/app/src/app/api/tags/route.ts` - add organization and project scoping

### 4.2 Configuration APIs - Add Project Scoping
- [ ] Update `/app/src/app/api/notification-providers/route.ts` - add project scoping
- [ ] Update `/app/src/app/api/alert-rules/route.ts` - add project scoping (if exists)
- [ ] Update API key routes - add project scoping to API keys

### 4.3 Service Layer Updates
- [ ] Update `/app/src/lib/monitor-service.ts` - replace organizationId null with dual scoping
- [ ] Update job scheduler service - add project context
- [ ] Update queue service - add project context  
- [ ] Update all database queries to include both organizationId AND projectId

### 4.4 API Security Implementation
- [ ] Add RBAC middleware to all existing API routes
- [ ] Implement organization membership validation
- [ ] Implement project permission validation
- [ ] Add audit logging for sensitive operations

## Phase 5: Admin Functionality (Week 3)

### 5.1 Admin API Routes - System Level
- [ ] Create `/app/src/app/api/admin/users/route.ts` - list, create users
- [ ] Create `/app/src/app/api/admin/users/[id]/route.ts` - get, update, delete user
- [ ] Create `/app/src/app/api/admin/users/[id]/ban/route.ts` - ban user
- [ ] Create `/app/src/app/api/admin/users/[id]/unban/route.ts` - unban user
- [ ] Create `/app/src/app/api/admin/users/[id]/impersonate/route.ts` - impersonate user

### 5.2 Admin API Routes - Organizations
- [ ] Create `/app/src/app/api/admin/organizations/route.ts` - list all organizations
- [ ] Create `/app/src/app/api/admin/organizations/[id]/route.ts` - get, update, delete org
- [ ] Create `/app/src/app/api/admin/organizations/[id]/members/route.ts` - list org members
- [ ] Create `/app/src/app/api/admin/organizations/[id]/projects/route.ts` - list org projects
- [ ] Create `/app/src/app/api/admin/organizations/[id]/usage/route.ts` - usage stats

### 5.3 Admin API Routes - System Management
- [ ] Create `/app/src/app/api/admin/stats/route.ts` - system statistics
- [ ] Create `/app/src/app/api/admin/audit-logs/route.ts` - audit log access
- [ ] Create `/app/src/app/api/admin/health/route.ts` - system health check

### 5.4 Admin Utilities
- [ ] Create `/app/src/lib/admin.ts` with admin utility functions
- [ ] Create admin permission checking helpers
- [ ] Create audit logging system
- [ ] Create system statistics collection

## Phase 6: Frontend Updates (Week 4)

### 6.1 Organization Switcher Component
- [ ] Create `/app/src/components/organization-switcher.tsx`
- [ ] Implement organization selection UI
- [ ] Implement organization switching functionality
- [ ] Add new organization creation dialog

### 6.2 Project Switcher Enhancement
- [ ] Update `/app/src/components/project-switcher.tsx` to use real data
- [ ] Connect to project API endpoints
- [ ] Implement project creation functionality
- [ ] Add project switching functionality
- [ ] Remove hardcoded project list

### 6.3 Admin Interface Components
- [ ] Create `/app/src/components/admin/` directory structure
- [ ] Create admin dashboard components
- [ ] Create user management interface
- [ ] Create organization management interface
- [ ] Create system statistics components

### 6.4 Admin Pages
- [ ] Create `/app/src/app/admin/page.tsx` - admin dashboard
- [ ] Create `/app/src/app/admin/users/page.tsx` - user management
- [ ] Create `/app/src/app/admin/organizations/page.tsx` - organization management
- [ ] Create `/app/src/app/admin/system/page.tsx` - system management

### 6.5 Navigation Updates
- [ ] Update sidebar to show organization/project context
- [ ] Add organization switcher to navigation
- [ ] Add admin section to navigation (for admin users)
- [ ] Update breadcrumb system for organization/project context

## Phase 7: Data Migration & Testing (Week 4)

### 7.1 Data Migration for Existing Records
- [ ] Create migration script for existing users without organizations
- [ ] Create default organizations for existing users
- [ ] Create default projects for existing organizations
- [ ] Migrate existing jobs to default projects
- [ ] Migrate existing tests to default projects
- [ ] Migrate existing monitors to default projects
- [ ] Migrate existing runs to default projects
- [ ] Migrate existing API keys to default projects

### 7.2 Database Constraints
- [ ] Add NOT NULL constraints to projectId columns (after migration)
- [ ] Verify all foreign key constraints are working
- [ ] Test cascading deletes work properly
- [ ] Verify data integrity across all tables

### 7.3 Testing & Validation
- [ ] Test organization creation and management
- [ ] Test project creation and management
- [ ] Test user signup with default org/project creation
- [ ] Test dual-scoped data access (org + project)
- [ ] Test RBAC permissions at all levels
- [ ] Test admin functionality
- [ ] Test API key project scoping
- [ ] Test organization/project switching

### 7.4 Environment Configuration
- [ ] Set up all required environment variables
- [ ] Configure admin user IDs
- [ ] Set organization and project limits
- [ ] Configure RBAC settings
- [ ] Set up audit logging configuration

## Phase 8: Documentation & Deployment (Week 4)

### 8.1 Code Documentation
- [ ] Add inline documentation for RBAC functions
- [ ] Document API endpoint permissions
- [ ] Document database schema changes
- [ ] Document migration procedures

### 8.2 User Documentation
- [ ] Create user guide for organization management
- [ ] Create user guide for project management
- [ ] Create admin user documentation
- [ ] Update API documentation

### 8.3 Deployment Preparation
- [ ] Test migration script on staging environment
- [ ] Verify all environment variables are set
- [ ] Test backup and rollback procedures
- [ ] Prepare deployment checklist

## Completion Checklist

### Security Verification
- [ ] All data is properly scoped by organization AND project
- [ ] No data leakage between organizations/projects
- [ ] RBAC permissions working correctly at all levels
- [ ] Admin functions require proper permissions
- [ ] API keys are project-scoped
- [ ] Session management includes dual context

### Functional Verification  
- [ ] User signup creates default org/project automatically
- [ ] Organization/project switching works correctly
- [ ] Project member management works
- [ ] Admin interface fully functional
- [ ] All existing features still work with new scoping
- [ ] Performance is acceptable with new queries

### Quality Assurance
- [ ] All tests pass
- [ ] Linting passes
- [ ] Type checking passes
- [ ] No security vulnerabilities
- [ ] Database migrations tested
- [ ] Rollback procedures tested

---

**Total Tasks: 120+**  
**Estimated Timeline: 4 weeks**  
**Critical Path: Database setup → API scoping → Admin functionality → Frontend**