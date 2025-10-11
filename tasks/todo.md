# Status Page Implementation Plan

## Overview

Implementing enterprise-grade status page functionality similar to statuspage.io with UUID-based subdomains, manual incident management, subscriber notifications, and comprehensive analytics.

## Implementation Tasks

### Phase 1: Database Schema & Core Infrastructure

#### 1.1 Database Schema Creation

- [ ] Create `status_pages` table with UUID subdomain support
- [ ] Create `status_page_component_groups` table for component organization
- [ ] Create `status_page_components` table with monitor linking
- [ ] Create `incidents` table with workflow support
- [ ] Create `incident_updates` table with notification controls
- [ ] Create `incident_components` table for affected components
- [ ] Create `incident_templates` table for common issues
- [ ] Create `incident_template_components` join table
- [ ] Create `status_page_subscribers` table with preferences
- [ ] Create `status_page_component_subscriptions` table
- [ ] Create `status_page_incident_subscriptions` table
- [ ] Create `status_page_metrics` table for uptime tracking
- [ ] Create `postmortems` table for incident analysis
- [ ] Add all necessary indexes for performance
- [ ] Generate database migration files
- [ ] Test migrations locally

#### 1.2 Backend Services

- [ ] Create `status-page.service.ts` for CRUD operations
- [ ] Create `component-group.service.ts` for component organization
- [ ] Create `component.service.ts` for component management
- [ ] Create `incident.service.ts` for incident workflow
- [ ] Create `incident-template.service.ts` for templates
- [ ] Create `subscriber.service.ts` for subscriber management
- [ ] Create `status-page-analytics.service.ts` for metrics and reporting
- [ ] Create `status-page-security.service.ts` for input validation and sanitization
- [ ] Create `subdomain.service.ts` for subdomain management

#### 1.3 Server Actions

- [ ] Create `status-page.actions.ts` for status page operations
- [ ] Create `incident.actions.ts` for incident operations
- [ ] Create `subscriber.actions.ts` for subscription operations
- [ ] Create `component.actions.ts` for component operations
- [ ] Add validation schemas using Zod

### Phase 2: API Routes

#### 2.1 Internal API Routes (Authenticated)

- [ ] Create `/api/status-pages` - List status pages
- [ ] Create `/api/status-pages/create` - Create new status page
- [ ] Create `/api/status-pages/[id]` - Get/Update/Delete status page
- [ ] Create `/api/status-pages/[id]/components` - Component management
- [ ] Create `/api/status-pages/[id]/component-groups` - Group management
- [ ] Create `/api/status-pages/[id]/incidents` - Incident management
- [ ] Create `/api/status-pages/[id]/incidents/[incidentId]` - Incident details
- [ ] Create `/api/status-pages/[id]/incidents/[incidentId]/updates` - Incident updates
- [ ] Create `/api/status-pages/[id]/templates` - Incident templates
- [ ] Create `/api/status-pages/[id]/subscribers` - Subscriber management
- [ ] Create `/api/status-pages/[id]/analytics` - Analytics data
- [ ] Create `/api/status-pages/[id]/metrics` - Uptime metrics

#### 2.2 Public API Routes (Unauthenticated)

- [ ] Create `/api/public/status-pages/[subdomain]` - Get public status page
- [ ] Create `/api/public/status-pages/[subdomain]/subscribe` - Subscribe to updates
- [ ] Create `/api/public/status-pages/[subdomain]/unsubscribe` - Unsubscribe
- [ ] Create `/api/public/status-pages/[subdomain]/verify` - Verify subscription
- [ ] Add rate limiting to public endpoints

### Phase 3: Frontend UI Components

#### 3.1 Status Page Management Components

- [ ] Create `/app/src/components/status-pages/StatusPageList.tsx` - List all status pages
- [ ] Create `/app/src/components/status-pages/StatusPageCard.tsx` - Status page card
- [ ] Create `/app/src/components/status-pages/CreateStatusPageDialog.tsx` - Create dialog
- [ ] Create `/app/src/components/status-pages/StatusPageSettings.tsx` - Settings panel
- [ ] Create `/app/src/components/status-pages/BrandingSettings.tsx` - Branding customization
- [ ] Create `/app/src/components/status-pages/SubdomainDisplay.tsx` - Subdomain info

#### 3.2 Component Management Components

- [ ] Create `/app/src/components/status-pages/components/ComponentList.tsx` - Component list
- [ ] Create `/app/src/components/status-pages/components/ComponentGroup.tsx` - Component group
- [ ] Create `/app/src/components/status-pages/components/CreateComponentDialog.tsx` - Create component
- [ ] Create `/app/src/components/status-pages/components/CreateGroupDialog.tsx` - Create group
- [ ] Create `/app/src/components/status-pages/components/ComponentStatusBadge.tsx` - Status badge
- [ ] Create `/app/src/components/status-pages/components/MonitorLinker.tsx` - Link monitors

#### 3.3 Incident Management Components

- [ ] Create `/app/src/components/status-pages/incidents/IncidentList.tsx` - Incident list
- [ ] Create `/app/src/components/status-pages/incidents/IncidentCard.tsx` - Incident card
- [ ] Create `/app/src/components/status-pages/incidents/CreateIncidentDialog.tsx` - Create incident
- [ ] Create `/app/src/components/status-pages/incidents/IncidentTimeline.tsx` - Incident timeline
- [ ] Create `/app/src/components/status-pages/incidents/AddUpdateDialog.tsx` - Add incident update
- [ ] Create `/app/src/components/status-pages/incidents/ResolveIncidentDialog.tsx` - Resolve incident
- [ ] Create `/app/src/components/status-pages/incidents/IncidentTemplateSelector.tsx` - Template selector
- [ ] Create `/app/src/components/status-pages/incidents/AffectedComponentsSelector.tsx` - Select components
- [ ] Create `/app/src/components/status-pages/incidents/IncidentStatusBadge.tsx` - Status badge

#### 3.4 Subscriber Management Components

- [ ] Create `/app/src/components/status-pages/subscribers/SubscriberList.tsx` - Subscriber list
- [ ] Create `/app/src/components/status-pages/subscribers/SubscriberStats.tsx` - Subscriber stats
- [ ] Create `/app/src/components/status-pages/subscribers/ExportSubscribers.tsx` - Export functionality

#### 3.5 Analytics & Metrics Components

- [ ] Create `/app/src/components/status-pages/analytics/AnalyticsDashboard.tsx` - Main dashboard
- [ ] Create `/app/src/components/status-pages/analytics/MetricCard.tsx` - Metric cards
- [ ] Create `/app/src/components/status-pages/analytics/UptimeChart.tsx` - Uptime visualization
- [ ] Create `/app/src/components/status-pages/analytics/IncidentTimelineChart.tsx` - Timeline
- [ ] Create `/app/src/components/status-pages/analytics/SubscriberGrowthChart.tsx` - Growth chart
- [ ] Create `/app/src/components/status-pages/analytics/GeographicMap.tsx` - Geographic distribution
- [ ] Reuse `/app/src/components/monitors/AvailabilityBarChart.tsx` for component uptime

#### 3.6 Public Status Page Components

- [ ] Create `/app/src/components/public/status-page/PublicStatusPage.tsx` - Public view
- [ ] Create `/app/src/components/public/status-page/PublicHeader.tsx` - Branded header
- [ ] Create `/app/src/components/public/status-page/SystemStatus.tsx` - Overall status
- [ ] Create `/app/src/components/public/status-page/ComponentStatus.tsx` - Component display
- [ ] Create `/app/src/components/public/status-page/IncidentHistory.tsx` - Recent incidents
- [ ] Create `/app/src/components/public/status-page/SubscribeForm.tsx` - Subscription form
- [ ] Create `/app/src/components/public/status-page/UptimeDisplay.tsx` - Uptime percentage
- [ ] Create `/app/src/components/public/status-page/SubscribeVerification.tsx` - Verification page

### Phase 4: Frontend Routes/Pages

#### 4.1 Internal Status Page Routes

- [ ] Create `/app/src/app/(main)/status-pages/page.tsx` - Status pages list
- [ ] Create `/app/src/app/(main)/status-pages/[id]/page.tsx` - Status page dashboard
- [ ] Create `/app/src/app/(main)/status-pages/[id]/components/page.tsx` - Component management
- [ ] Create `/app/src/app/(main)/status-pages/[id]/incidents/page.tsx` - Incident management
- [ ] Create `/app/src/app/(main)/status-pages/[id]/incidents/create/page.tsx` - Create incident
- [ ] Create `/app/src/app/(main)/status-pages/[id]/incidents/[incidentId]/page.tsx` - Incident details
- [ ] Create `/app/src/app/(main)/status-pages/[id]/subscribers/page.tsx` - Subscriber management
- [ ] Create `/app/src/app/(main)/status-pages/[id]/analytics/page.tsx` - Analytics dashboard
- [ ] Create `/app/src/app/(main)/status-pages/[id]/settings/page.tsx` - Settings page

#### 4.2 Public Status Page Routes

- [ ] Create `/app/src/app/(public)/status/[subdomain]/page.tsx` - Public status page
- [ ] Create `/app/src/app/(public)/status/[subdomain]/verify/page.tsx` - Email verification
- [ ] Create `/app/src/app/(public)/status/[subdomain]/unsubscribe/page.tsx` - Unsubscribe page
- [ ] Create `/app/src/app/(public)/status/[subdomain]/incidents/[id]/page.tsx` - Incident detail

### Phase 5: Navigation & UI Integration

#### 5.1 Update Sidebar Navigation

- [ ] Update `/app/src/components/app-sidebar.tsx` to add Status navigation item
- [ ] Add collapsible Status menu item below Alerts
- [ ] Add sub-items: "All Status Pages", "Create Status Page", "Analytics"
- [ ] Add appropriate icon (use Activity or Signal icon from lucide-react)
- [ ] Test navigation and routing

#### 5.2 Quick Create Integration

- [ ] Add "Status Page" option to `/app/src/app/(main)/create/page.tsx`
- [ ] Create quick create flow for status pages

### Phase 6: Middleware & Routing

#### 6.1 Subdomain Routing

- [ ] Create or update `/app/middleware.ts` for subdomain routing
- [ ] Implement subdomain extraction and validation
- [ ] Add rewriting to public status page routes
- [ ] Add 404 handling for invalid subdomains
- [ ] Add security headers (CSP, X-Frame-Options, etc.)

#### 6.2 DNS & SSL Configuration

- [ ] Document wildcard DNS setup for \*.supercheck.io
- [ ] Document Cloudflare SSL certificate setup
- [ ] Create setup guide for production deployment

### Phase 7: Security & Validation

#### 7.1 Input Validation & Sanitization

- [ ] Create Zod schemas for all input types
- [ ] Implement DOMPurify for HTML sanitization
- [ ] Add XSS protection for user-generated content
- [ ] Add SQL injection protection (already covered by Drizzle ORM)
- [ ] Implement rate limiting for public endpoints
- [ ] Add CSRF protection

#### 7.2 Access Control

- [ ] Implement RLS policies for status page tables
- [ ] Add organization-level access control
- [ ] Add role-based permissions for status page management
- [ ] Implement audit logging for status page changes

### Phase 8: Notifications & Integrations

#### 8.1 Notification System Integration

- [ ] Extend existing notification service for status page alerts
- [ ] Create email templates for incident notifications
- [ ] Create email templates for subscriber verification
- [ ] Create email templates for subscription confirmation
- [ ] Implement SMS notifications (optional)
- [ ] Implement webhook notifications for subscribers

#### 8.2 Monitor Integration

- [ ] Add automatic incident creation option for monitor failures (optional)
- [ ] Link status page components to monitors
- [ ] Sync component status with monitor status (optional)
- [ ] Add status page link in monitor details

### Phase 9: Testing & Documentation

#### 9.1 Testing

- [ ] Test database migrations
- [ ] Test all API endpoints
- [ ] Test public status page rendering
- [ ] Test subdomain routing
- [ ] Test email notifications
- [ ] Test subscriber workflow (subscribe, verify, unsubscribe)
- [ ] Test incident creation and updates
- [ ] Test component management
- [ ] Test analytics calculations
- [ ] Test security measures (XSS, SQL injection, rate limiting)
- [ ] Test mobile responsiveness

#### 9.2 Documentation

- [ ] Create user guide for status page setup
- [ ] Document API endpoints
- [ ] Create incident management guide
- [ ] Document branding customization
- [ ] Create deployment guide
- [ ] Document security best practices
- [ ] Add troubleshooting section

### Phase 10: Deployment & Launch

#### 10.1 Production Preparation

- [ ] Review all security measures
- [ ] Configure production DNS and SSL
- [ ] Set up monitoring for status page service
- [ ] Configure rate limiting
- [ ] Set up error tracking
- [ ] Prepare rollback plan

#### 10.2 Launch

- [ ] Deploy to staging environment
- [ ] Conduct user acceptance testing
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Gather user feedback
- [ ] Plan improvements based on feedback

## Implementation Notes

### Key Design Decisions

1. **UUID-based Subdomains**: Using UUIDv4 for unique, conflict-free subdomains
2. **Manual Incident Management**: Full user control over incident lifecycle
3. **Existing Component Reuse**: Leveraging AvailabilityBarChart for uptime display
4. **Security First**: Comprehensive input validation, rate limiting, and CSP headers
5. **Mobile-First**: Responsive design for all components
6. **Accessibility**: WCAG 2.1 AA compliance for public status pages

### Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL 18+ with Drizzle ORM, UUIDv7 for IDs
- **Queue**: Redis with BullMQ (for future background jobs)
- **Email**: Existing notification service
- **Validation**: Zod schemas
- **Sanitization**: DOMPurify

### Complexity Management

- Each task should be as simple as possible
- Minimal code changes per task
- Reuse existing components and services where possible
- Follow existing project patterns and conventions
- Avoid complex abstractions

### Security Checklist

- [ ] All user inputs are validated and sanitized
- [ ] Rate limiting on public endpoints
- [ ] CSP headers for public status pages
- [ ] XSS protection for user-generated content
- [ ] CSRF protection on all forms
- [ ] Secure token generation for subscriptions
- [ ] Email verification for subscribers
- [ ] Audit logging for all changes
- [ ] No sensitive data in frontend
- [ ] Proper error handling (no stack traces to users)

## Review Section

### Changes Summary

Enhanced the public status page to display daily incident history with the following improvements:

1. **Extended Incident History**: The past incidents section now shows entries for each of the last 90 days (increased from 30), providing a comprehensive view of system status over three months.

2. **Professional UI Improvements**:

   - Enhanced card-based design with shadows and rounded corners for incident days
   - Added incident count badges for days with incidents
   - Improved typography with better font weights and spacing
   - Added visual indicators (checkmark icons) for days without incidents
   - Implemented a border-left accent for incident items

3. **Interactive Uptime Bars**:

   - Increased bar height from h-8 to h-10 for better visibility
   - Increased spacing between bars from gap-[1px] to gap-1 for clearer separation
   - Added hover state transitions with duration-200 for smooth interactions
   - Implemented interactive tooltips that appear on hover

4. **Advanced Tooltip System**:

   - Added detailed tooltips showing the full date in "MMMM d, yyyy" format
   - For days with incidents: displays incident names with their impact levels
   - For days without incidents: shows "No incidents recorded" message
   - For new pages: shows "No data available" message
   - Tooltips include a pointer arrow for better visual connection

5. **Pagination Framework**:

   - Added pagination controls at both top and bottom of the incident history
   - Professional button design with chevron icons
   - Currently disabled but ready for future implementation of actual pagination

6. **Color-Coded Incident Bars**: Uptime bars display different colors based on incident impact:

   - Critical incidents: Red (bg-red-600)
   - Major incidents: Orange (bg-orange-500)
   - Minor incidents: Yellow (bg-yellow-500)
   - No incidents: Green (bg-green-500)
   - No data (for newly created pages): Gray (bg-gray-400)

7. **New Status Page Handling**: When a status page is created on the same day, all historical bars display in gray to indicate that no historical data exists.

8. **Chronological Incident Grouping**: Incidents are grouped by date and sorted chronologically (newest first) within each day, with enhanced visual separation between days.

### Issues Encountered

- Minor TypeScript errors were encountered and fixed:
  - Added missing useState import from React
  - Fixed type definitions for the dayIncidents property in the uptime data structure

### Improvements Made

- Improved user experience by providing a complete 90-day view of system status
- Enhanced visual communication through interactive tooltips and color-coded bars
- Better organization of incident information with professional card-based design
- Clearer visual hierarchy with proper spacing, typography, and visual indicators
- Added interactive elements that make the status page more engaging and informative

### Security Considerations

- All existing security measures remain in place
- No sensitive information is exposed on the public status page
- Input validation continues to be handled by the existing backend actions
- Tooltip content is safely rendered and does not expose any sensitive data

### Next Steps

- Implement actual pagination functionality to handle large numbers of incidents efficiently
- Consider adding a legend to explain the color coding of the uptime bars
- Potentially add filters to view incidents by impact level or status
- Consider adding a "Show more" button to load additional days beyond 90 if needed

## Updated Review Section (Latest Changes)

### Changes Summary

Based on user feedback, the public status page has been refined with the following improvements:

1. **Simplified Incident Display**:

   - Removed card-based design for a cleaner, simpler layout
   - Changed from showing 90 days of daily entries to showing only the 5 most recent incidents
   - Simplified the past incidents section to focus on actual incidents rather than daily entries
   - Added a centered message with icon when no incidents exist

2. **Improved Pagination**:

   - Removed pagination controls from the top of the incidents section
   - Added pagination only at the bottom, shown only when there are more than 5 incidents
   - Pagination displays "Showing 1-5 of X incidents" for better context
   - Maintains clean design while providing navigation for larger incident lists

3. **Enhanced Uptime Bars**:

   - Increased bar height from h-8 to h-10 for better visibility
   - Maintained proper spacing between bars (gap-1) for clear separation
   - Fixed color coding to properly show incident colors when incidents are detected
   - Bars now correctly display colors based on the highest impact incident for that day

4. **Improved Tooltip System**:

   - Fixed tooltip positioning to appear below the bar instead of above
   - Made tooltip background color match the bar color for visual consistency
   - Added proper positioning logic to center tooltip under the hovered bar
   - Tooltips now have a pointer arrow pointing up to the bar

5. **Color-Coded Incident Bars**: Uptime bars display different colors based on incident impact:

   - Critical incidents: Red (bg-red-600)
   - Major incidents: Orange (bg-orange-500)
   - Minor incidents: Yellow (bg-yellow-500)
   - No incidents: Green (bg-green-500)
   - No data (for newly created pages): Gray (bg-gray-400)

6. **New Status Page Handling**: When a status page is created on the same day, all historical bars display in gray to indicate that no historical data exists.

7. **Chronological Incident Display**: Incidents are now shown in chronological order (newest first) with a simplified layout that focuses on the most important information.

### Issues Fixed

- Fixed tooltip positioning issue where tooltips appeared above bars instead of below
- Resolved bar color issue where gray was shown instead of incident colors
- Simplified the UI based on user feedback to remove unnecessary card designs
- Improved pagination placement to be less intrusive

### Security Considerations

- All existing security measures remain in place
- No sensitive information is exposed on the public status page
- Input validation continues to be handled by the existing backend actions
- Tooltip content is safely rendered and does not expose any sensitive data
