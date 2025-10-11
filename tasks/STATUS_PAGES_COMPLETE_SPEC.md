# Status Pages - Complete Specification

**Version:** 1.0
**Last Updated:** 2025-10-11
**Status:** Phase 1 Complete ✅

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API & Server Actions](#api--server-actions)
5. [Frontend Components](#frontend-components)
6. [Routing & Navigation](#routing--navigation)
7. [Security & Permissions](#security--permissions)
8. [Implementation Phases](#implementation-phases)
9. [Technical Details](#technical-details)
10. [Testing Strategy](#testing-strategy)

---

## Overview

### Purpose
Status Pages provide a public-facing view of service health, allowing organizations to communicate system status, incidents, and scheduled maintenance to their users in real-time.

### Key Features
- **UUID-based Subdomains**: Unique, conflict-free identifiers (e.g., `f47ac10b-58cc-4372-a567-0e02b2c3d479.supercheck.io`)
- **Component Management**: Organize services into logical components
- **Incident Management**: Manual incident creation, updates, and resolution
- **Subscriber System**: Email/SMS/webhook notifications
- **Analytics**: Track page views, subscriber growth, and incident metrics
- **Customization**: Branding, themes, and custom domains

### Design Philosophy
- **Manual Control**: Users have full control over incident communication
- **Enterprise-Grade**: Built for reliability, security, and scalability
- **Consistency**: Follows existing Supercheck UI/UX patterns
- **Simplicity**: Easy to use, with sensible defaults

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│ │  Status Pages   │  │  Status Page    │  │  Public Status  │ │
│ │  List           │  │  Detail View    │  │  Page           │ │
│ │  /status-pages  │  │  /[id]          │  │  /[id]/public   │ │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      Server Actions Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  create-status-page  │  get-status-pages  │  delete-status-page│
│  get-status-page     │  update-status-page│  publish-page      │
├─────────────────────────────────────────────────────────────────┤
│                     Database Layer (PostgreSQL)                  │
├─────────────────────────────────────────────────────────────────┤
│  status_pages                    │  incidents                   │
│  status_page_components          │  incident_updates            │
│  status_page_component_groups    │  incident_templates          │
│  status_page_subscribers         │  status_page_metrics         │
│  postmortems                     │  + 5 more tables             │
└─────────────────────────────────────────────────────────────────┘
```

### URL Structure

**Development:**
- Internal Management: `http://localhost:3000/status-pages`
- Detail View: `http://localhost:3000/status-pages/[id]`
- Public Preview: `http://localhost:3000/status-pages/[id]/public`

**Production:**
- Internal Management: `https://app.supercheck.io/status-pages`
- Public Status Page: `https://[uuid].supercheck.io` (subdomain routing)

---

## Database Schema

### Core Tables (13 Total)

#### 1. `status_pages`
Primary table for status page configuration.

```sql
CREATE TABLE status_pages (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE NO ACTION,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(36) UNIQUE NOT NULL,  -- UUID v4 without dashes, generated in app
  status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft | published | archived
  headline VARCHAR(255),
  page_description TEXT,
  support_url VARCHAR(500),
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Subscriber Settings
  allow_page_subscribers BOOLEAN DEFAULT TRUE,
  allow_incident_subscribers BOOLEAN DEFAULT TRUE,
  allow_email_subscribers BOOLEAN DEFAULT TRUE,
  allow_sms_subscribers BOOLEAN DEFAULT TRUE,
  allow_rss_atom_feeds BOOLEAN DEFAULT TRUE,
  allow_webhook_subscribers BOOLEAN DEFAULT TRUE,

  -- Notification Settings
  notifications_from_email VARCHAR(255),
  notifications_email_footer TEXT,

  -- Display Settings
  hidden_from_search BOOLEAN DEFAULT FALSE,

  -- Branding & Customization (42 fields total)
  css_body_background_color VARCHAR(7) DEFAULT '#ffffff',
  css_font_color VARCHAR(7) DEFAULT '#333333',
  css_light_font_color VARCHAR(7) DEFAULT '#666666',
  css_greens VARCHAR(7) DEFAULT '#2ecc71',
  css_yellows VARCHAR(7) DEFAULT '#f1c40f',
  css_oranges VARCHAR(7) DEFAULT '#e67e22',
  css_blues VARCHAR(7) DEFAULT '#3498db',
  css_reds VARCHAR(7) DEFAULT '#e74c3c',
  css_border_color VARCHAR(7) DEFAULT '#ecf0f1',
  css_graph_color VARCHAR(7) DEFAULT '#3498db',
  css_link_color VARCHAR(7) DEFAULT '#3498db',
  css_no_data VARCHAR(7) DEFAULT '#bdc3c7',

  -- Logo Assets (S3 URLs)
  favicon_logo VARCHAR(500),
  transactional_logo VARCHAR(500),
  hero_cover VARCHAR(500),
  email_logo VARCHAR(500),
  twitter_logo VARCHAR(500),

  -- Additional Settings
  theme JSONB DEFAULT '{}',
  branding_settings JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_status_pages_subdomain ON status_pages(subdomain);
CREATE INDEX idx_status_pages_organization ON status_pages(organization_id);
```

**Key Fields:**
- `subdomain`: UUID v4 without dashes (e.g., `f47ac10b58cc4372a5670e02b2c3d479`)
- `status`: Controls visibility (`draft` = not public, `published` = public)
- `css_*`: Customizable colors for branding
- `allow_*`: Feature toggles for subscribers

#### 2. `status_page_component_groups`
Organize components into logical groups.

```sql
CREATE TABLE status_page_component_groups (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,  -- For drag-and-drop ordering
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_component_groups_status_page ON status_page_component_groups(status_page_id);
```

**Example Groups:**
- "Web Services" (API, Website, Admin Panel)
- "Infrastructure" (Database, Cache, CDN)
- "Third-Party Services" (Payment Gateway, Email Service)

#### 3. `status_page_components`
Individual service components with monitor linking.

```sql
CREATE TABLE status_page_components (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  component_group_id UUID REFERENCES status_page_component_groups(id) ON DELETE SET NULL,
  monitor_id UUID REFERENCES monitors(id) ON DELETE SET NULL,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'operational' NOT NULL,
  -- Status: operational | degraded_performance | partial_outage | major_outage | under_maintenance

  -- Display Settings
  showcase BOOLEAN DEFAULT TRUE,
  only_show_if_degraded BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  start_date DATE,  -- When component tracking started

  -- Automation (Future)
  automation_email VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_components_status_page ON status_page_components(status_page_id);
CREATE INDEX idx_components_monitor ON status_page_components(monitor_id);
```

**Component Status Values:**
- `operational`: All systems normal (green)
- `degraded_performance`: Slower than usual (yellow)
- `partial_outage`: Some features unavailable (orange)
- `major_outage`: Service down (red)
- `under_maintenance`: Scheduled maintenance (blue)

#### 4. `incidents`
Incident records with full workflow support.

```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  body TEXT,
  status VARCHAR(50) DEFAULT 'investigating' NOT NULL,
  -- Status: investigating | identified | monitoring | resolved | scheduled

  impact VARCHAR(50) DEFAULT 'minor' NOT NULL,
  -- Impact: none | minor | major | critical

  impact_override VARCHAR(50),  -- Manual override

  -- Scheduled Maintenance
  scheduled_for TIMESTAMP,
  scheduled_until TIMESTAMP,
  scheduled_remind_prior BOOLEAN DEFAULT TRUE,
  scheduled_auto_in_progress BOOLEAN DEFAULT TRUE,
  scheduled_auto_completed BOOLEAN DEFAULT TRUE,

  -- Automation Settings
  auto_transition_to_maintenance_state BOOLEAN DEFAULT TRUE,
  auto_transition_to_operational_state BOOLEAN DEFAULT TRUE,
  auto_transition_deliver_notifications_at_start BOOLEAN DEFAULT TRUE,
  auto_transition_deliver_notifications_at_end BOOLEAN DEFAULT TRUE,
  reminder_intervals VARCHAR(100) DEFAULT '[3, 6, 12, 24]',  -- Hours before

  -- Notification Settings
  deliver_notifications BOOLEAN DEFAULT TRUE,

  -- Social Media (Optional)
  auto_tweet_at_beginning BOOLEAN DEFAULT FALSE,
  auto_tweet_on_completion BOOLEAN DEFAULT FALSE,
  auto_tweet_on_creation BOOLEAN DEFAULT FALSE,
  auto_tweet_one_hour_before BOOLEAN DEFAULT FALSE,

  -- Additional Fields
  metadata JSONB DEFAULT '{}',
  shortlink VARCHAR(255),
  backfill_date TIMESTAMP,
  backfilled BOOLEAN DEFAULT FALSE,

  -- Tracking
  monitoring_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_incidents_status_page ON incidents(status_page_id);
CREATE INDEX idx_incidents_status ON incidents(status);
```

**Incident Workflow:**
1. **Investigating**: Issue detected, team investigating
2. **Identified**: Root cause found
3. **Monitoring**: Fix applied, monitoring for stability
4. **Resolved**: Issue completely resolved
5. **Scheduled**: For planned maintenance

#### 5. `incident_updates`
Timeline of incident updates.

```sql
CREATE TABLE incident_updates (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,

  body TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'investigating' NOT NULL,

  -- Notification Control
  deliver_notifications BOOLEAN DEFAULT TRUE,
  display_at TIMESTAMP DEFAULT NOW(),

  -- Social Media (Optional)
  custom_tweet TEXT,
  tweet_id VARCHAR(255),
  twitter_updated_at TIMESTAMP,
  wants_twitter_update BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_incident_updates_incident ON incident_updates(incident_id);
```

#### 6. `incident_components`
Links incidents to affected components.

```sql
CREATE TABLE incident_components (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 7. `incident_templates`
Predefined templates for common incidents.

```sql
CREATE TABLE incident_templates (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,

  component_group_id UUID REFERENCES status_page_component_groups(id),
  update_status VARCHAR(50) DEFAULT 'investigating',

  should_tweet BOOLEAN DEFAULT FALSE,
  should_send_notifications BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Example Templates:**
- "Database Connectivity Issue"
- "Scheduled Maintenance"
- "Third-Party Service Degradation"

#### 8. `incident_template_components`
Links templates to default affected components.

```sql
CREATE TABLE incident_template_components (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  template_id UUID NOT NULL REFERENCES incident_templates(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 9. `status_page_subscribers`
Email/SMS/webhook subscribers.

```sql
CREATE TABLE status_page_subscribers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,

  -- Contact Information
  email VARCHAR(255),
  phone_number VARCHAR(50),
  phone_country VARCHAR(2) DEFAULT 'US',
  endpoint VARCHAR(500),  -- For webhook subscribers

  mode VARCHAR(50) NOT NULL,  -- email | sms | webhook

  -- Verification & Status
  verified_at TIMESTAMP,
  skip_confirmation_notification BOOLEAN DEFAULT FALSE,
  quarantined_at TIMESTAMP,
  purge_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscribers_status_page ON status_page_subscribers(status_page_id);
```

#### 10. `status_page_component_subscriptions`
Component-specific subscriptions (only notify for specific components).

```sql
CREATE TABLE status_page_component_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  subscriber_id UUID NOT NULL REFERENCES status_page_subscribers(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 11. `status_page_incident_subscriptions`
Incident-specific subscriptions (follow a particular incident).

```sql
CREATE TABLE status_page_incident_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES status_page_subscribers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 12. `status_page_metrics`
Daily uptime metrics per component.

```sql
CREATE TABLE status_page_metrics (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  component_id UUID REFERENCES status_page_components(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  uptime_percentage DECIMAL(5,2),

  total_checks INTEGER DEFAULT 0,
  successful_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  average_response_time_ms INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_date ON status_page_metrics(date);
CREATE INDEX idx_metrics_component ON status_page_metrics(component_id);
```

#### 13. `postmortems`
Post-incident analysis documents.

```sql
CREATE TABLE postmortems (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,

  body TEXT NOT NULL,
  body_last_updated_at TIMESTAMP DEFAULT NOW(),

  ignored BOOLEAN DEFAULT FALSE,
  notified_subscribers BOOLEAN DEFAULT FALSE,
  notified_twitter BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_postmortems_incident ON postmortems(incident_id);
```

---

## API & Server Actions

### Server Actions (Current)

#### 1. `create-status-page.ts`
Creates a new status page with UUID subdomain.

```typescript
export async function createStatusPage(data: CreateStatusPageData) {
  // 1. Verify authentication and project context
  const { userId, project, organizationId } = await requireProjectContext();

  // 2. Check permissions
  await requireBetterAuthPermission({ status_page: ["create"] });

  // 3. Validate input
  const validatedData = createStatusPageSchema.parse(data);

  // 4. Generate unique subdomain
  const subdomain = randomUUID().replace(/-/g, '');

  // 5. Create status page
  const [statusPage] = await db.insert(statusPages).values({
    organizationId,
    projectId: project.id,
    name: validatedData.name,
    subdomain,
    headline: validatedData.headline || null,
    pageDescription: validatedData.pageDescription || null,
    status: "draft",
    createdByUserId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // 6. Log audit event
  await logAuditEvent({
    userId,
    action: "status_page_created",
    resource: "status_page",
    resourceId: statusPage.id,
    metadata: { /* ... */ },
    success: true,
  });

  // 7. Revalidate
  revalidatePath("/status-pages");

  return { success: true, statusPage };
}
```

#### 2. `get-status-pages.ts`
Retrieves all status pages for the current project.

```typescript
export async function getStatusPages() {
  const { project } = await requireProjectContext();

  const statusPages = await db.query.statusPages.findMany({
    where: eq(statusPages.projectId, project.id),
    orderBy: desc(statusPages.createdAt),
  });

  return { success: true, statusPages };
}
```

#### 3. `get-status-page.ts`
Retrieves a single status page by ID.

```typescript
export async function getStatusPage(id: string) {
  await requireProjectContext();

  const statusPage = await db.query.statusPages.findFirst({
    where: eq(statusPages.id, id),
  });

  if (!statusPage) {
    return { success: false, message: "Status page not found" };
  }

  return { success: true, statusPage };
}
```

#### 4. `delete-status-page.ts`
Deletes a status page and all related data (cascade).

```typescript
export async function deleteStatusPage(id: string) {
  const { userId } = await requireProjectContext();

  await requireBetterAuthPermission({ status_page: ["delete"] });

  await db.delete(statusPages).where(eq(statusPages.id, id));

  await logAuditEvent({
    userId,
    action: "status_page_deleted",
    resource: "status_page",
    resourceId: id,
    success: true,
  });

  revalidatePath("/status-pages");

  return { success: true };
}
```

### Future Server Actions (Phase 2+)

- `update-status-page.ts` - Update status page settings
- `publish-status-page.ts` - Publish/unpublish status page
- `create-component.ts` - Add component to status page
- `update-component.ts` - Update component status/details
- `delete-component.ts` - Remove component
- `create-incident.ts` - Create new incident
- `update-incident.ts` - Add update to incident
- `resolve-incident.ts` - Resolve incident
- `subscribe.ts` - Subscribe to notifications
- `unsubscribe.ts` - Unsubscribe from notifications

---

## Frontend Components

### 1. Status Pages List (`status-pages-list.tsx`)

**Location:** `/app/src/components/status-pages/status-pages-list.tsx`

**Features:**
- Grid layout (responsive: 1 col mobile, 2 cols tablet, 3 cols desktop)
- Create status page dialog
- Delete confirmation dialog
- Permission-based controls
- Empty state with CTA
- Loading skeleton

**UI Elements:**
- Status badge (draft/published/archived)
- Subdomain display
- Preview link
- Manage link
- Delete button (permission-required)

### 2. Create Status Page Form (`create-status-page-form.tsx`)

**Location:** `/app/src/components/status-pages/create-status-page-form.tsx`

**Fields:**
- **Name** (required): Internal name for the status page
- **Headline** (optional): Public headline displayed on status page
- **Description** (optional): Brief description of what the page is for

**Validation:**
- Name: 1-255 characters, required
- Headline: max 255 characters
- Description: unlimited text

**What Happens Next (Info Box):**
1. A unique subdomain will be automatically generated
2. Your status page will be created in draft mode
3. You can add components, customize branding, and manage incidents
4. Publish when you're ready to make it public

### 3. Status Page Detail (`status-page-detail.tsx`)

**Location:** `/app/src/components/status-pages/status-page-detail.tsx`

**Layout:**
- Header with name, status badge, headline, description
- Preview and Settings buttons
- Subdomain display (with local preview hint)
- Tabbed interface

**Tabs:**
1. **Overview** (Tally4 icon)
   - Quick stats: Components (0), Active Incidents (0), Subscribers (0)
   - Getting Started guide

2. **Components** (Settings icon)
   - List all service components
   - Add/edit/delete components
   - Link monitors
   - Group components

3. **Incidents** (AlertCircle icon)
   - List active and resolved incidents
   - Create incident button
   - Incident timeline

4. **Subscribers** (Globe icon)
   - List all subscribers
   - Subscriber stats
   - Export functionality

### 4. Public Status Page (`public-status-page.tsx`)

**Location:** `/app/src/components/status-pages/public-status-page.tsx`

**Sections:**
1. **Header**
   - Status page name/headline
   - Description

2. **Current Status**
   - Overall system status (operational/degraded/outage)
   - Large status indicator with icon
   - Status badge

3. **Service Components**
   - List of components with status
   - Component groups
   - Uptime percentage
   - Currently: "No components configured yet" placeholder

4. **Recent Incidents**
   - Last 30 days of incidents
   - Incident cards with timeline
   - Currently: "No incidents reported" placeholder

5. **Subscribe to Updates**
   - Email subscription form
   - SMS subscription option (future)
   - Webhook subscription option (future)

6. **Footer**
   - "Powered by Supercheck" link
   - Privacy policy (future)
   - Terms of service (future)

**Design:**
- Clean, professional appearance
- Mobile-responsive
- Accessible (WCAG 2.1 AA)
- Fast loading (<1 second)

---

## Routing & Navigation

### Internal Routes (Authenticated)

| Route | Component | Description |
|-------|-----------|-------------|
| `/status-pages` | `StatusPagesList` | List all status pages |
| `/status-pages/[id]` | `StatusPageDetail` | Status page management dashboard |
| `/status-pages/[id]/public` | `PublicStatusPage` | Local preview of public page |

### Public Routes (Production)

| Route | Component | Description |
|-------|-----------|-------------|
| `https://[uuid].supercheck.io` | `PublicStatusPage` | Public status page (subdomain routing) |
| `https://[uuid].supercheck.io/subscribe` | `SubscribeForm` | Subscription page |
| `https://[uuid].supercheck.io/unsubscribe` | `UnsubscribePage` | Unsubscribe page |

### Navigation

**Sidebar Integration:**
- **Section:** Communicate
- **Icon:** Tally4 (4 horizontal lines)
- **Label:** Status Pages
- **URL:** `/status-pages`

**Breadcrumbs:**
- Home > Status Pages
- Home > Status Pages > [Page Name]

---

## Security & Permissions

### RBAC Integration

**Resource:** `status_page`

**Actions:**
- `view` - View status pages
- `create` - Create new status pages
- `update` - Update status page settings
- `delete` - Delete status pages
- `manage` - Full management access

**Role Permissions:**

| Role | View | Create | Update | Delete | Manage |
|------|------|--------|--------|--------|--------|
| SUPER_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| ORG_OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| ORG_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| PROJECT_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| PROJECT_EDITOR | ✅ | ✅ | ✅ | ❌ | ❌ |
| PROJECT_VIEWER | ✅ | ❌ | ❌ | ❌ | ❌ |

**Permission Functions:**
```typescript
canCreateStatusPages(role: Role): boolean
canEditStatusPages(role: Role): boolean
canDeleteStatusPages(role: Role): boolean
canManageStatusPages(role: Role): boolean
```

### Public API Security (Future)

**Rate Limiting:**
- Public status page: 100 requests / 15 minutes per IP
- Subscribe endpoint: 5 requests / hour per IP
- API endpoints: 1000 requests / hour per API key

**Protection:**
- CSRF tokens for forms
- Email verification for subscribers
- Secure unsubscribe tokens (JWT, 30-day expiry)
- Input sanitization (DOMPurify)
- XSS protection
- SQL injection protection (Drizzle ORM parameterized queries)

---

## Implementation Phases

### ✅ Phase 1: Core Infrastructure (COMPLETE)

**Duration:** 1 week
**Status:** ✅ Complete

**Deliverables:**
- [x] Database schema (13 tables)
- [x] Migrations applied
- [x] Server actions (create, get, delete)
- [x] RBAC integration
- [x] Status pages list UI
- [x] Create status page form
- [x] Status page detail view
- [x] Public preview page
- [x] Sidebar navigation
- [x] All builds passing

### 🚧 Phase 2: Status Page Functionality (IN PROGRESS)

**Duration:** 2 weeks
**Status:** 🚧 Planned

**Week 1: Components**
- [ ] Component CRUD UI
- [ ] Monitor linking interface
- [ ] Component status management
- [ ] Component grouping
- [ ] Drag-and-drop reordering

**Week 2: Incidents & Subscribers**
- [ ] Incident creation form
- [ ] Incident update workflow
- [ ] Incident timeline
- [ ] Email subscription form
- [ ] Email verification
- [ ] Subscriber management

### 📋 Phase 3: Advanced Features (PLANNED)

**Duration:** 2 weeks
**Status:** 📋 Planned

**Week 1: Public Access**
- [ ] Subdomain routing middleware
- [ ] Public status page display
- [ ] Real-time status updates
- [ ] Uptime charts
- [ ] RSS/Atom feeds

**Week 2: Customization & Analytics**
- [ ] Branding settings UI
- [ ] Theme customization
- [ ] Analytics dashboard
- [ ] Metrics calculation
- [ ] Export functionality

### 🎯 Phase 4: Polish & Launch (PLANNED)

**Duration:** 1 week
**Status:** 📋 Planned

**Tasks:**
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation
- [ ] User guide
- [ ] Beta testing
- [ ] Production launch

---

## Technical Details

### UUID Subdomain Generation

**Decision:** Generate UUID v4 in application code instead of database default.

**Implementation:**
```typescript
import { randomUUID } from "crypto";

const subdomain = randomUUID().replace(/-/g, '');
// Result: f47ac10b58cc4372a5670e02b2c3d479 (32 characters)
```

**Rationale:**
1. Drizzle ORM doesn't include SQL defaults for varchar fields in migrations
2. Better error handling and logging in application code
3. More portable (works across different databases)
4. Easier to test and mock

**Storage:**
- Field: `subdomain VARCHAR(36)`
- Constraint: `UNIQUE NOT NULL`
- Index: B-tree index for fast lookups

### Subdomain Routing (Future)

**Production Implementation:**

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const subdomain = hostname.split(".")[0];

  if (subdomain && !["www", "app", "api"].includes(subdomain)) {
    // Check if subdomain exists
    const statusPage = await getStatusPageBySubdomain(subdomain);

    if (statusPage) {
      // Rewrite to internal route
      return NextResponse.rewrite(
        new URL(`/status/public/${subdomain}${url.pathname}`, request.url)
      );
    }

    // 404 for non-existent subdomains
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  return NextResponse.next();
}
```

**DNS Configuration:**
```dns
; Wildcard CNAME for all status page subdomains
*.supercheck.io. 300 IN CNAME supercheck.io.

; Main application
app.supercheck.io. 300 IN A 192.168.1.101
```

**SSL Certificates:**
- Cloudflare provides free wildcard SSL certificates
- Automatic renewal
- No manual certificate management needed

### Design Pattern

**Consistency with existing app:**

```typescript
// Pattern: PageBreadcrumbs + Card + Component

export default function StatusPagesPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Status Pages", isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 m-4">
        <CardContent>
          <StatusPagesList />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Component Structure:**
1. Client component for interactivity
2. Server actions for data mutations
3. Proper loading states
4. Error handling with toast notifications
5. Permission-based UI controls
6. Responsive design
7. Accessibility (ARIA labels, keyboard navigation)

### Local Development Access

**Challenge:** Subdomain routing doesn't work on localhost.

**Solution:** Provide alternative route for local testing.

**Routes:**
- Development: `http://localhost:3000/status-pages/[id]/public`
- Production: `https://[uuid].supercheck.io`

**Implementation:**
```typescript
// Both routes render the same component
<PublicStatusPage statusPage={statusPage} />
```

---

## Testing Strategy

### Unit Tests (Future)

**Database Operations:**
- Create status page with UUID subdomain
- Get status pages for organization
- Delete status page (cascade check)
- Permission checks

**Server Actions:**
- Valid input handling
- Invalid input validation
- Error handling
- Audit logging

**Components:**
- Render tests
- User interaction tests
- Permission-based rendering

### Integration Tests (Future)

**Workflows:**
1. Create status page → Verify database record
2. Create component → Link to monitor
3. Create incident → Update component status
4. Subscribe → Verify email → Receive notification
5. Unsubscribe → Verify no notifications

### End-to-End Tests (Future)

**User Flows:**
1. Sign in → Create status page → Add components → Publish
2. Visit public page → Subscribe → Verify email
3. Create incident → Verify notification sent
4. Resolve incident → Verify resolution notification

**Tools:**
- Playwright (already in project)
- Testing Library
- Jest

---

## Success Metrics

### Technical Metrics

**Performance:**
- ✅ Build time: <30 seconds
- ✅ ESLint: 0 errors, 0 warnings
- ✅ TypeScript: 100% type coverage
- [ ] API response time: <200ms (P95)
- [ ] Public page load time: <1 second
- [ ] Database query time: <50ms (P95)

**Reliability:**
- [ ] Uptime: 99.9%
- [ ] Error rate: <0.1%
- [ ] Failed deployments: <1%

### User Experience Metrics

**Adoption:**
- [ ] Status page creation rate: >50% of organizations
- [ ] Average time to first status page: <5 minutes
- [ ] Components per status page: average >3

**Engagement:**
- [ ] Subscriber growth rate: >10% week-over-week
- [ ] Incident creation rate: varies by usage
- [ ] Public page views: varies by traffic

### Business Metrics

**Revenue:**
- [ ] Conversion from free to paid: >20%
- [ ] ARPU increase: +$30-50/month
- [ ] Churn reduction: -5%

**Satisfaction:**
- [ ] NPS score: >50
- [ ] Feature satisfaction: >4/5 stars
- [ ] Support tickets: <2% of users

---

## Appendix

### Related Documents

- **Architecture Spec:** `/tasks/status-page-spec.md`
- **Progress Tracker:** `/tasks/status-pages-implementation-progress.md`
- **Schema File:** `/app/src/db/schema/schema.ts`
- **Migration:** `/app/src/db/migrations/0000_classy_sir_ram.sql`

### Key Files

**Server Actions:**
- `/app/src/actions/create-status-page.ts`
- `/app/src/actions/get-status-pages.ts`
- `/app/src/actions/get-status-page.ts`
- `/app/src/actions/delete-status-page.ts`

**Components:**
- `/app/src/components/status-pages/status-pages-list.tsx`
- `/app/src/components/status-pages/create-status-page-form.tsx`
- `/app/src/components/status-pages/status-page-detail.tsx`
- `/app/src/components/status-pages/public-status-page.tsx`

**Routes:**
- `/app/src/app/(main)/status-pages/page.tsx`
- `/app/src/app/(main)/status-pages/[id]/page.tsx`
- `/app/src/app/(main)/status-pages/[id]/public/page.tsx`

**Permissions:**
- `/app/src/lib/rbac/client-permissions.ts`

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-11 | Initial complete specification |
| 0.9 | 2025-10-11 | Phase 1 implementation complete |
| 0.5 | 2025-10-04 | Database schema created |

---

**Document Status:** ✅ Complete and Current
**Last Review:** 2025-10-11
**Next Review:** After Phase 2 completion
