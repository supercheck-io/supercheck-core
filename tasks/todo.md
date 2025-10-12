# Status Pages - Remaining Implementation Tasks

## Overview
Complete the remaining status page functionality with enterprise-grade quality, consistent UI/UX, and full dark/light mode support.

**Current Status**: Phase 1 & 2 Complete (90% done)
- ✅ Database schema (13 tables)
- ✅ Core CRUD operations
- ✅ Basic UI for management
- ✅ Public status page (basic)
- ✅ Subdomain routing

**Remaining Work**: Phase 3 - Advanced Features

---

## Phase 3A: Subscriber Management System (Priority 1)

### 1. Email Subscription Form on Public Page
- [ ] Create `SubscribeDialog.tsx` component
  - Email input with validation
  - Component-specific subscription checkboxes (optional)
  - Terms acceptance checkbox
  - Loading and success states
  - Error handling with clear messages
  - Dark/light mode support
- [ ] Add "Subscribe to Updates" button to public status page
- [ ] Create server action `subscribe-to-status-page.ts`
  - Validate email format
  - Check if email already subscribed
  - Generate verification token (crypto.randomBytes)
  - Generate unsubscribe token
  - Store subscriber in database (verified_at = null)
  - Send verification email
  - Return success/error response

### 2. Email Verification System
- [ ] Create verification email template
  - Professional design
  - Clear verification button/link
  - Includes status page name
  - Dark/light compatible HTML email
- [ ] Create verification route `/status-pages/verify/[token]`
  - Validate token
  - Check token expiry (24 hours)
  - Mark subscriber as verified (set verified_at)
  - Show success page
  - Redirect to status page
- [ ] Handle verification errors
  - Expired token
  - Invalid token
  - Already verified

### 3. Subscriber Management UI (Admin Tab)
- [ ] Create `SubscribersTab.tsx` component
  - Data table with columns: Email, Mode, Verified, Subscribed Components, Date
  - Filter by verification status
  - Search functionality
  - Export to CSV button
  - Bulk actions (delete, resend verification)
  - Pagination
- [ ] Create server action `get-status-page-subscribers.ts`
  - Fetch all subscribers for status page
  - Include related component subscriptions
  - Include verification status
  - Support filtering and pagination
- [ ] Create server action `delete-subscriber.ts`
  - Permission check
  - Delete subscriber and related subscriptions (cascade)
  - Audit log
- [ ] Create server action `resend-verification-email.ts`
  - Generate new token
  - Update database
  - Send email
  - Rate limiting (1 per 5 minutes per email)

### 4. Unsubscribe Functionality
- [ ] Create unsubscribe page `/status-pages/unsubscribe/[token]`
  - Validate token
  - Show subscriber info (email, components)
  - Confirm unsubscribe button
  - Feedback form (optional - "Why are you unsubscribing?")
  - Success message
- [ ] Create server action `unsubscribe.ts`
  - Validate unsubscribe token
  - Soft delete or mark as unsubscribed
  - Set purge_at timestamp (30 days)
  - Return success response
- [ ] Include unsubscribe link in all notification emails

---

## Phase 3B: Notification System (Priority 2)

### 5. Email Notification Infrastructure
- [ ] Create email service `/lib/email/status-page-notifications.ts`
  - Use existing notification provider system
  - Support HTML templates
  - Handle email errors gracefully
  - Queue emails for bulk sends
- [ ] Create email templates
  - New incident notification
  - Incident update notification
  - Incident resolved notification
  - Verification email
  - Welcome email (post-verification)

### 6. Incident Notifications
- [ ] Add notification trigger to `create-incident.ts`
  - Check if `deliverNotifications` is true
  - Get all verified subscribers
  - Filter by component subscriptions
  - Queue notification emails
  - Log notification in audit
- [ ] Add notification trigger to `update-incident-status.ts`
  - Same logic as create
  - Include update details
- [ ] Add notification trigger when incident resolved
  - Special "resolved" template
  - Include resolution time
  - Thank subscribers

### 7. Notification Preferences
- [ ] Add "Manage Preferences" link in emails
  - Leads to preferences page with token
- [ ] Create preferences page `/status-pages/preferences/[token]`
  - Component-specific notifications toggle
  - Notification frequency (immediate, daily digest, weekly)
  - Update email address
  - Save preferences button
- [ ] Create server action `update-subscriber-preferences.ts`
  - Validate token
  - Update component subscriptions
  - Update notification settings
  - Return success

---

## Phase 3C: Settings Tab (Priority 3)

### 8. Status Page Settings Implementation
- [ ] Create `SettingsTab.tsx` component with sections:
  - **General Settings**
    - Name (internal)
    - Headline (public)
    - Description
    - Support URL
    - Timezone selector
  - **Subscriber Settings**
    - Toggle: Allow page subscribers
    - Toggle: Allow email subscribers
    - Toggle: Allow SMS subscribers (disabled for now)
    - Toggle: Allow webhook subscribers
    - Toggle: Allow incident-specific subscriptions
  - **Notification Settings**
    - Notifications from email (validated)
    - Email footer text
  - **Branding Settings**
    - Color pickers for all CSS variables
    - Logo uploads (favicon, hero, email)
    - Custom domain (input only, not functional yet)
    - Theme preview
  - **Danger Zone**
    - Archive status page
    - Delete status page (confirmation required)

- [ ] Create server action `update-status-page-settings.ts`
  - Validate all inputs
  - Update database
  - Revalidate paths
  - Audit log

### 9. Branding Customization
- [ ] Add color picker component
  - Preview in real-time
  - Reset to defaults
  - Predefined themes (light, dark, custom)
- [ ] Logo upload functionality
  - Use existing S3/MinIO infrastructure
  - Image validation (size, format)
  - Preview before save
  - Delete/replace options

---

## Phase 3D: UI/UX Polish (Priority 4)

### 10. Dark Mode Support for Public Pages
- [ ] Update `PublicStatusPage.tsx` to support dark mode
  - Use Tailwind dark: classes throughout
  - Respect system preference
  - Theme toggle button (optional)
  - Use branding colors from settings
- [ ] Ensure all components have dark mode variants
  - Status badges
  - Incident cards
  - Uptime bars
  - Subscribe dialog
  - Footer
- [ ] Test in both light and dark modes
  - Check contrast ratios (WCAG AA)
  - Verify all colors are readable
  - Test hover states

### 11. Responsive Design Improvements
- [ ] Test on all breakpoints (mobile, tablet, desktop)
- [ ] Optimize layout for mobile
  - Stack components vertically
  - Adjust font sizes
  - Touch-friendly buttons (min 44px)
- [ ] Optimize for tablet
  - 2-column layouts where appropriate
  - Collapsible sidebar

### 12. Loading States and Skeletons
- [ ] Add loading skeletons for:
  - Public page initial load
  - Components list
  - Incidents list
  - Subscribers tab
- [ ] Add optimistic updates where appropriate
  - Subscribe form
  - Settings save
  - Component status changes

---

## Phase 3E: Analytics Dashboard (Priority 5)

### 13. Analytics Overview Tab
- [ ] Create `AnalyticsTab.tsx` component
  - Total subscribers count
  - Subscriber growth chart (last 30 days)
  - Page views chart (last 30 days)
  - Average uptime by component
  - Total incidents by month
  - Most affected components
- [ ] Add page view tracking
  - Track unique visitors (IP-based or cookie)
  - Track page views
  - Store in database or analytics service
  - Privacy-conscious (GDPR compliant)

### 14. Uptime Calculations
- [ ] Create service to calculate component uptime
  - Based on monitor results
  - Calculate daily uptime percentage
  - Store in `status_page_metrics` table
  - Aggregate for 7-day, 30-day, 90-day views
- [ ] Display uptime on components
  - Show percentage on public page
  - Show detailed breakdown in admin

### 15. Incident Metrics
- [ ] Track incident metrics
  - Mean time to resolution (MTTR)
  - Incident frequency by component
  - Impact distribution (minor vs major vs critical)
  - Time of day analysis
- [ ] Display in analytics tab
  - Charts and graphs
  - Exportable reports

---

## Phase 3F: Advanced Features (Priority 6 - Future)

### 16. Incident Templates System
- [ ] Create `IncidentTemplatesTab.tsx`
  - List all templates
  - Create/edit/delete templates
  - Assign default components
  - Set default impact and status
- [ ] Add "Use Template" button in incident creation
  - Select template
  - Pre-fill form
  - Allow customization

### 17. Scheduled Maintenance
- [ ] Enhance incident form for scheduled maintenance
  - Date/time picker for scheduled_for and scheduled_until
  - Auto-transition toggles
  - Reminder settings
- [ ] Create scheduled maintenance workflow
  - Auto-transition to "under_maintenance" at start time
  - Auto-transition to "operational" at end time
  - Send reminder notifications

### 18. Real-time Updates (SSE)
- [ ] Implement Server-Sent Events for public page
  - Push incident updates in real-time
  - Update component statuses live
  - Show "Live" indicator
- [ ] Create SSE endpoint `/api/status-pages/[subdomain]/events`
  - Stream incident updates
  - Stream component changes
  - Handle disconnections gracefully

---

## Cross-cutting Concerns

### Security
- [ ] Input validation on all forms
- [ ] Rate limiting on public endpoints (subscribe, unsubscribe)
- [ ] CSRF protection for all forms
- [ ] Email verification required before notifications
- [ ] Secure token generation (crypto.randomBytes)
- [ ] No sensitive data in frontend
- [ ] SQL injection prevention (Drizzle ORM handles this)
- [ ] XSS prevention (React handles this, but sanitize HTML in emails)

### Performance
- [ ] Database query optimization
  - Add indexes where needed
  - Use pagination
  - Avoid N+1 queries
- [ ] Caching strategy
  - Cache public status pages (Redis, 1 minute)
  - Cache component statuses
  - Invalidate on updates
- [ ] Image optimization
  - Compress logos
  - Use Next.js Image component
  - Lazy load images

### Accessibility
- [ ] WCAG 2.1 AA compliance
  - Color contrast ratios
  - Keyboard navigation
  - Screen reader support
  - ARIA labels
- [ ] Test with screen readers
- [ ] Test keyboard-only navigation

### Testing
- [ ] Unit tests for server actions
- [ ] Integration tests for workflows
- [ ] E2E tests with Playwright
  - Subscribe flow
  - Verification flow
  - Unsubscribe flow
  - Admin management

---

## Implementation Order (Recommended)

1. **Week 1: Subscriber System (Tasks 1-4)**
   - Day 1-2: Subscribe form and server action
   - Day 3: Email verification
   - Day 4-5: Subscribers tab UI

2. **Week 2: Notifications (Tasks 5-7)**
   - Day 1-2: Email service and templates
   - Day 3-4: Incident notifications
   - Day 5: Preferences page

3. **Week 3: Settings & UI Polish (Tasks 8-12)**
   - Day 1-2: Settings tab
   - Day 3: Branding customization
   - Day 4-5: Dark mode and responsive design

4. **Week 4: Analytics & Advanced (Tasks 13-18)**
   - Day 1-2: Analytics dashboard
   - Day 3: Uptime calculations
   - Day 4-5: Incident templates and scheduled maintenance

---

## Review Checklist

Before marking as complete:
- [ ] All builds passing (npm run build)
- [ ] No ESLint errors
- [ ] No TypeScript errors
- [ ] All tests passing
- [ ] Manual testing complete
- [ ] Dark mode tested
- [ ] Mobile responsive tested
- [ ] Security review complete
- [ ] Performance benchmarks met
- [ ] Accessibility audit passed
- [ ] Documentation updated

---

## Notes
- Follow existing patterns in the codebase
- Use existing UI components (shadcn/ui)
- Maintain consistency with rest of app
- Keep changes simple and focused
- Security first approach
- Enterprise-grade quality
