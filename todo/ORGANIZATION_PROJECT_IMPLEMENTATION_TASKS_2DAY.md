# Organization & Project Implementation - 2-Day Sprint

**FRESH START**: All existing data will be deleted - no migration needed!  
**TIMELINE**: 2 days for complete implementation  
**STRATEGY**: Focus on core functionality, admin features, minimal viable product

---

## Day 1: Database & Core Backend (8-10 hours)

### 1.1 Database Reset & Schema Setup (2 hours)
- [ ] Reset database (drop all data - fresh start)
- [ ] Remove teams tables (`team`, `teamMember`) from schema completely
- [ ] Remove `teamId` from `invitation` table schema
- [ ] Remove `activeTeamId` from `session` table schema
- [ ] Add `projectId` to ALL data tables in schema (jobs, tests, monitors, runs, api_keys, notification_channels)
- [ ] Add `activeProjectId` to `session` table schema
- [ ] Create `projectMembers` table in schema
- [ ] Update `projects` table schema (slug, description, isDefault)
- [ ] Generate new migration with complete schema

### 1.2 Authentication Setup (1 hour)
- [ ] Update Better Auth config - disable teams completely
- [ ] Configure admin plugin with admin user IDs
- [ ] Configure organization plugin with hooks for default org/project creation
- [ ] Set up environment variables for admin users and limits

### 1.3 RBAC System (1.5 hours)
- [ ] Create `/app/src/lib/rbac/permissions.ts` - all access control definitions
- [ ] Create `/app/src/lib/rbac/middleware.ts` - permission checking functions
- [ ] Create `/app/src/lib/session.ts` - session helpers with org/project context
- [ ] Create permission utilities for system/organization/project levels

### 1.4 Core API Routes (3 hours)
- [ ] Create `/app/src/app/api/organizations/route.ts` (GET, POST)
- [ ] Create `/app/src/app/api/organizations/[id]/route.ts` (GET, PUT, DELETE, switch)
- [ ] Create `/app/src/app/api/projects/route.ts` (GET, POST)
- [ ] Create `/app/src/app/api/projects/[id]/route.ts` (GET, PUT, DELETE, switch)
- [ ] Create `/app/src/app/api/projects/[id]/members/route.ts` (CRUD for project members)

### 1.5 Update Existing APIs - Dual Scoping (2-3 hours)
- [ ] Update `/app/src/app/api/jobs/route.ts` - add org+project scoping, remove null org
- [ ] Update `/app/src/app/api/tests/route.ts` - add org+project scoping
- [ ] Update `/app/src/app/api/monitors/route.ts` - add org+project scoping
- [ ] Update `/app/src/app/api/runs/route.ts` - add org+project scoping
- [ ] Update `/app/src/app/api/tags/route.ts` - add org+project scoping
- [ ] Update `/app/src/app/api/notification-providers/route.ts` - add project scoping
- [ ] Update `/app/src/lib/monitor-service.ts` - remove org null, add dual scoping
- [ ] Add RBAC middleware to ALL API routes

---

## Day 2: Admin + Frontend (8-10 hours)

### 2.1 Admin API Routes (2-3 hours)
- [ ] Create `/app/src/app/api/admin/users/route.ts` - list, create, ban, unban users
- [ ] Create `/app/src/app/api/admin/users/[id]/route.ts` - get, update, delete, impersonate
- [ ] Create `/app/src/app/api/admin/organizations/route.ts` - list all orgs with stats
- [ ] Create `/app/src/app/api/admin/organizations/[id]/route.ts` - manage specific org
- [ ] Create `/app/src/app/api/admin/stats/route.ts` - system statistics
- [ ] Create `/app/src/lib/admin.ts` - admin utility functions

### 2.2 Admin Frontend Components (2-3 hours)
- [ ] Create `/app/src/components/admin/` directory with admin components
- [ ] Create `/app/src/app/admin/page.tsx` - admin dashboard
- [ ] Create `/app/src/app/admin/users/page.tsx` - user management interface
- [ ] Create `/app/src/app/admin/organizations/page.tsx` - organization management
- [ ] Add admin navigation section (show only for admin users)

### 2.3 Organization/Project Switchers (2-3 hours)
- [ ] Create `/app/src/components/organization-switcher.tsx` - organization selection & switching
- [ ] Update `/app/src/components/project-switcher.tsx` - connect to real API, remove hardcoded data
- [ ] Add organization switcher to sidebar/navigation
- [ ] Add project creation functionality to project switcher
- [ ] Update navigation to show current org/project context

### 2.4 Final Testing & Validation (1 hour)
- [ ] Test complete user signup flow (creates default org/project)
- [ ] Test organization/project switching
- [ ] Test dual-scoped data access (all APIs work with org+project)
- [ ] Test admin functionality (user management, org oversight)
- [ ] Test RBAC permissions (users can only access their data)
- [ ] Verify no data leakage between orgs/projects
- [ ] Quick smoke test of all major features

---

## Critical Success Factors for 2-Day Timeline

### Must-Have Core Features (Day 1 Priority)
1. **Database schema with dual scoping** (org + project)
2. **Default org/project creation on signup**
3. **Basic RBAC middleware** for API security
4. **Core APIs updated** with dual scoping
5. **Organization/project switching** functionality

### Should-Have Features (Day 2 Priority)
1. **Admin interface** for user/org management
2. **Frontend switchers** connected to real data
3. **Project-level member management**
4. **Basic audit logging**

### Nice-to-Have (If Time Permits)
1. **Advanced admin features** (detailed stats, audit logs)
2. **Comprehensive error handling**
3. **UI polish and refinements**

---

## Environment Setup Required

```bash
# Add to .env file
SUPER_ADMIN_USER_IDS="your-user-id-here"
MAX_ORGANIZATIONS_PER_USER=5
MAX_PROJECTS_PER_ORG=10
DEFAULT_PROJECT_NAME="Default Project"
ENABLE_PROJECT_LEVEL_RBAC=true
ALLOW_CROSS_PROJECT_ACCESS=false
STRICT_ORGANIZATION_ISOLATION=true
```

---

## Final Validation Checklist

### ✅ Security Verification (CRITICAL)
- [ ] All data properly scoped by org AND project
- [ ] No data leakage between organizations/projects  
- [ ] RBAC permissions working at all levels
- [ ] Admin functions require proper permissions
- [ ] Session includes org/project context

### ✅ Functional Verification (MUST-HAVE)
- [ ] User signup creates default org/project
- [ ] Organization/project switching works
- [ ] All existing features work with new scoping
- [ ] Admin interface functional
- [ ] Project member management works

### ✅ Basic Quality (MINIMUM)
- [ ] No TypeScript errors
- [ ] Basic linting passes
- [ ] Database schema migration works
- [ ] Core user flows work end-to-end

---

## Implementation Strategy

**Hour-by-Hour Breakdown:**

**Day 1 (Backend Focus):**
- Hours 1-2: Database schema overhaul
- Hours 3-4: Auth setup + RBAC foundation
- Hours 5-7: Core API routes (org/project management)
- Hours 8-10: Update existing APIs with dual scoping

**Day 2 (Admin + Frontend):**
- Hours 1-3: Admin API routes + utilities
- Hours 4-6: Admin frontend interface
- Hours 7-9: Organization/project switchers
- Hour 10: Testing + validation

**Key Success Metrics:**
1. ✅ Fresh user can sign up → gets default org/project
2. ✅ User can create jobs/tests/monitors → scoped to their project
3. ✅ Admin can see all users/orgs → manage system
4. ✅ No data leaks between different users' orgs/projects
5. ✅ Organization/project switching works seamlessly

---

**REVISED PLAN:**
- **Total Tasks: ~40 focused tasks** (reduced from 120+)
- **Timeline: 2 days (16-20 hours total)**  
- **Strategy: Fresh database + core features only**
- **Success Metric: Working multi-tenant system with admin functionality**

**Ready to start when you give the go-ahead! 🚀**