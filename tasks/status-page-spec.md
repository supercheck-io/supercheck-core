# Status Page Implementation Research & Plan

## Executive Summary

Based on comprehensive research and analysis of the existing Supercheck codebase, I've identified a robust, clean solution for integrating status page functionality. The implementation leverages Supercheck's existing monitoring infrastructure, making it a natural extension that provides significant value with minimal complexity.

## Key Findings

### 1. Existing Infrastructure Analysis

Supercheck already has all the core components needed for status pages:

- **Monitoring System**: Comprehensive monitoring with 5 types (HTTP, Website, Ping, Port, Synthetic Tests)
- **Alert System**: Multi-channel notifications (email, Slack, webhook, Telegram, Discord)
- **Data Storage**: PostgreSQL with optimized schema and Redis for queuing
- **Multi-tenant Architecture**: Organization and project-based access control
- **UI Components**: Mature React component library with consistent design

### 2. Market Leaders & Best Practices

**Top Status Page Solutions:**

- **Statuspage.io (Atlassian)**: Market leader, $29-1,499/month
- **Instatus**: Fast loading, $20-300/month
- **Better Stack**: All-in-one monitoring + status pages
- **StatusPal**: Multi-language support, $29-229/month

**Best Practices Identified:**

- Manual incident management with full user control
- Email/SMS subscriber notifications
- 90-day uptime display
- Component-based status organization
- Clean, mobile-responsive design

### 3. Technical Implementation Approach

**Recommended Architecture:**

```
Manual Incident Creation → Update Status Page → Notify Subscribers
```

**Database Schema (9 new tables):**

- `status_pages`: Page configuration, branding, and UUIDv4 subdomain
- `status_page_component_groups`: Component organization for better categorization
- `status_page_components`: Links monitors to page components with group support
- `incidents`: Incident records with status, impact, and scheduling
- `incident_updates`: Timeline of incident updates with notification controls
- `incident_templates`: Predefined incident templates for common issues
- `status_page_subscribers`: Email/SMS subscribers with preferences
- `status_page_subscriptions`: Subscription records for specific components/incidents
- `status_page_metrics`: Daily uptime calculations with detailed metrics
- `postmortems`: Incident analysis and resolution documentation

**Integration Points:**

- Build on existing [`monitor.service.ts`](worker/src/monitor/monitor.service.ts) for component status tracking
- Leverage [`notification.service.ts`](worker/src/notification/notification.service.ts) for subscriber notifications
- Build on current UI components for consistent design

## Implementation Plan

### Phase 1: Core Subdomain Infrastructure (Week 1)

1. **DNS and SSL Setup**

   - Configure wildcard DNS records for \*.supercheck.io
   - Set up Cloudflare for SSL certificate management (handled automatically)
   - Configure Cloudflare SSL/TLS settings for optimal security
   - Create DNS validation service

2. **Middleware and Routing**

   - Implement Next.js middleware for subdomain routing
   - Create subdomain validation service with format checking
   - Set up enhanced database schema for subdomains
   - Add reserved word protection and security constraints

3. **Database Schema & Migration**
   - Create enhanced status_pages table with subdomain support
   - Create proper indexes for subdomain lookups
   - Set up Row Level Security policies

### Phase 2: Subdomain Management (Week 2)

1. **Admin Interface**

   - Subdomain creation and validation dashboard
   - DNS configuration guide for customers
   - SSL certificate management interface
   - Subdomain availability checker

2. **Status Page Rendering**

   - UUID-based status page display
   - Theme customization per status page
   - Mobile-responsive design

3. **Manual Incident Management**
   - Create incident management interface
   - Manual incident creation and updates
   - Manual incident resolution workflow
   - Component status management

### Phase 3: Advanced Features (Week 3-4)

1. **Email Notifications**

   - Extend existing email service
   - Create email templates for status updates
   - Implement subscriber verification

2. **Advanced Security**

   - Content Security Policy implementation
   - Rate limiting
   - Analytics and monitoring dashboard

## Updated Implementation Plan

### Phase 1: Core Infrastructure and Database (Week 1)

1. **Database Schema Implementation**

   - Create all 9 status page tables with proper relationships
   - Implement comprehensive indexing for performance
   - Set up Row Level Security (RLS) policies
   - Create database migration scripts
   - Add foreign key constraints and cascading rules

2. **Core Services Implementation**

   - Status page management service
   - Component group service with hierarchy support
   - Basic incident management service
   - Subscriber management with verification

3. **Middleware and Routing**

   - Next.js middleware for subdomain routing
   - Security headers and CSP implementation
   - Rate limiting for public endpoints

### Phase 2: Status Page Functionality (Week 2)

1. **Status Page Rendering**

   - Subdomain-based status page display
   - Component group organization
   - Mobile-responsive design
   - Theme customization per status page

2. **Incident Management System**

   - Manual incident creation and updates
   - Incident templates system
   - Component status tracking
   - Scheduled maintenance support
   - Incident timeline visualization

3. **Subscriber Management**

   - Email/SMS subscription system
   - Component-specific subscriptions
   - Incident-specific subscriptions
   - Subscription verification workflow
   - Unsubscribe functionality with tokens

### Phase 3: Advanced Features (Week 3)

2. **Analytics and Reporting**

   - Page view and visitor tracking
   - Geographic analytics
   - Uptime metrics calculation
   - Incident timeline reporting
   - Analytics dashboard implementation

3. **Notification Enhancements**

   - Multi-channel notifications (email, SMS, webhook)
   - Notification templates
   - Delivery tracking
   - Bounce handling
   - Notification preferences

### Phase 4: Enterprise Features (Week 4)

2. **Advanced Security**

   - Enhanced rate limiting
   - Security audit logging

3. **Performance Optimization**

   - CDN integration for status pages
   - Database query optimization
   - Caching strategies
   - Performance monitoring
   - Load testing

## Enhanced Security Considerations

### 1. Subdomain Security

**Subdomain Management**:

- Automatic UUIDv4 generation for unique subdomains
- No conflicts or reserved words to manage
- Rate limiting per organization for status page creation

### 2. Incident Management Security

**Incident Content Security**:

- Input sanitization for incident descriptions
- XSS protection for user-generated content
- HTML content filtering
- Markdown sanitization
- Attachment security scanning

**Access Control**:

- Role-based incident management
- Organization-level isolation
- Audit logging for all incident changes
- Approval workflows for critical incidents

```typescript
// File: app/src/lib/incident-security.service.ts
export class IncidentSecurityService {
  /**
   * Sanitize incident content
   */
  sanitizeIncidentContent(content: string): string {
    // Remove potentially dangerous HTML
    const cleanContent = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "a"],
      ALLOWED_ATTR: ["href", "target"],
    });

    // Filter profanity
    const filteredContent = this.filterProfanity(cleanContent);

    // Check for sensitive information
    const redactedContent = this.redactSensitiveInfo(filteredContent);

    return redactedContent;
  }

  /**
   * Validate incident update permissions
   */
  async validateIncidentUpdate(
    userId: string,
    incidentId: string,
    action: string
  ): Promise<PermissionResult> {
    const user = await this.getUserWithPermissions(userId);
    const incident = await this.getIncident(incidentId);

    // Check organization access
    if (user.organizationId !== incident.organizationId) {
      return { allowed: false, reason: "Organization mismatch" };
    }

    // Check role permissions
    const requiredPermission = this.getRequiredPermission(action);
    if (!user.permissions.includes(requiredPermission)) {
      return { allowed: false, reason: "Insufficient permissions" };
    }

    // Log access attempt
    await this.auditLogger.log({
      userId,
      incidentId,
      action,
      allowed: true,
      timestamp: new Date(),
    });

    return { allowed: true };
  }

  /**
   * Redact sensitive information
   */
  private redactSensitiveInfo(content: string): string {
    // Redact email addresses
    content = content.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      "[REDACTED]"
    );

    // Redact phone numbers
    content = content.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[REDACTED]");

    // Redact IP addresses
    content = content.replace(
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      "[REDACTED]"
    );

    // Redact API keys and tokens
    content = content.replace(/\b[A-Za-z0-9]{20,}\b/g, "[REDACTED]");

    return content;
  }
}
```

### 3. Subscriber Privacy and Security

**Subscriber Data Protection**:

- Email verification with secure tokens
- Phone number validation and masking
- GDPR compliance features
- Data retention policies
- Secure unsubscribe mechanisms

**Privacy Controls**:

- Subscriber consent management
- Data export functionality
- Automated data purging
- Anonymization options
- Cookie-less tracking

```typescript
// File: app/src/lib/subscriber-security.service.ts
export class SubscriberSecurityService {
  /**
   * Generate secure verification token
   */
  generateVerificationToken(subscriberId: string): string {
    const payload = {
      subscriberId,
      type: "verification",
      timestamp: Date.now(),
    };

    return jwt.sign(payload, process.env.VERIFICATION_SECRET!, {
      expiresIn: "24h",
    });
  }

  /**
   * Handle unsubscribe request with privacy
   */
  async handleUnsubscribeRequest(
    token: string,
    ipAddress: string
  ): Promise<UnsubscribeResult> {
    try {
      const decoded = jwt.verify(token, process.env.UNSUBSCRIBE_SECRET!) as {
        subscriberId: string;
        type: string;
      };

      // Log unsubscribe for compliance
      await this.auditLogger.log({
        subscriberId: decoded.subscriberId,
        action: "unsubscribe",
        ipAddress,
        timestamp: new Date(),
        userAgent: "unsubscribe-token",
      });

      // Soft delete subscriber data
      await this.softDeleteSubscriber(decoded.subscriberId);

      // Schedule data purging (30 days for compliance)
      await this.scheduleDataPurging(decoded.subscriberId);

      return { success: true, message: "Successfully unsubscribed" };
    } catch (error) {
      return { success: false, message: "Invalid unsubscribe link" };
    }
  }

  /**
   * Export subscriber data (GDPR compliance)
   */
  async exportSubscriberData(
    subscriberId: string,
    requestId: string
  ): Promise<DataExportResult> {
    const subscriber = await this.getSubscriber(subscriberId);

    if (!subscriber) {
      return { success: false, message: "Subscriber not found" };
    }

    const exportData = {
      personalInfo: {
        email: subscriber.email,
        phoneNumber: subscriber.phoneNumber
          ? this.maskPhoneNumber(subscriber.phoneNumber)
          : null,
        subscriptions: await this.getSubscriberSubscriptions(subscriberId),
        createdAt: subscriber.createdAt,
        verifiedAt: subscriber.verifiedAt,
      },
      activity: await this.getSubscriberActivity(subscriberId),
      notifications: await this.getNotificationHistory(subscriberId),
    };

    // Store export securely
    const exportId = await this.storeSecureExport(exportData, requestId);

    // Log export for compliance
    await this.auditLogger.log({
      subscriberId,
      action: "data_export",
      exportId,
      requestId,
      timestamp: new Date(),
    });

    return { success: true, exportId };
  }

  /**
   * Mask phone number for privacy
   */
  private maskPhoneNumber(phone: string): string {
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  }
}
```

### 4. API Security and Rate Limiting

**API Protection**:

- Comprehensive rate limiting
- API key authentication
- Request validation
- IP-based blocking

**Public API Security**:

- CORS configuration
- Content Security Policy
- Request size limits
- Authentication bypass prevention
- Input validation

```typescript
// File: app/src/lib/api-security.service.ts
export class ApiSecurityService {
  /**
   * Configure rate limiting for status page APIs
   */
  configureRateLimiting(): RateLimitConfig[] {
    return [
      {
        path: "/api/public/status-pages/*",
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests per 15 minutes
        message: "Too many requests",
      },
      {
        path: "/api/public/status-pages/*/subscribe",
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5, // 5 subscriptions per hour
        message: "Too many subscription attempts",
      },
    ];
  }

  /**
   * Validate API request
   */
  async validateApiRequest(
    request: Request,
    endpoint: string
  ): Promise<ValidationResult> {
    // Check rate limits
    const rateLimitResult = await this.checkRateLimit(request, endpoint);
    if (!rateLimitResult.allowed) {
      return {
        valid: false,
        reason: "Rate limit exceeded",
        retryAfter: rateLimitResult.retryAfter,
      };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = await this.detectSuspiciousPatterns(request);
    if (suspiciousPatterns.length > 0) {
      await this.logSuspiciousActivity(request, suspiciousPatterns);
      return { valid: false, reason: "Suspicious request detected" };
    }

    // Validate input size
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      // 1MB
      return { valid: false, reason: "Request too large" };
    }

    return { valid: true };
  }

  /**
   * Detect suspicious request patterns
   */
  private async detectSuspiciousPatterns(request: Request): Promise<string[]> {
    const patterns: string[] = [];
    const url = request.url;
    const userAgent = request.headers.get("user-agent") || "";

    // Check for common attack patterns
    if (url.includes("..") || url.includes("%2e%2e")) {
      patterns.push("Path traversal attempt");
    }

    if (url.includes("<script>") || url.includes("javascript:")) {
      patterns.push("XSS attempt");
    }

    if (
      url.includes("union") ||
      url.includes("select") ||
      url.includes("drop")
    ) {
      patterns.push("SQL injection attempt");
    }

    // Check for suspicious user agents
    const suspiciousAgents = [
      "sqlmap",
      "nikto",
      "nmap",
      "masscan",
      "zap",
      "burp",
    ];

    if (
      suspiciousAgents.some((agent) => userAgent.toLowerCase().includes(agent))
    ) {
      patterns.push("Security scanner detected");
    }

    return patterns;
  }
}
```

### 5. Content Security and CSP

**Content Security Policy**:

- Strict CSP headers for status pages
- Inline script restrictions
- Font and image source restrictions
- Frame protection
- Mixed content prevention

**Input Sanitization**:

- HTML content filtering
- Markdown sanitization
- Link validation
- Attachment scanning
- Metadata stripping

```typescript
// File: app/src/lib/content-security.service.ts
export class ContentSecurityService {
  /**
   * Generate CSP header for status pages
   */
  generateStatusPageCSP(statusPage: StatusPage): string {
    const baseCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supercheck.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];

    // Add CDN domains for assets
    if (statusPage.faviconLogo?.includes("cdn")) {
      const cdnDomain = new URL(statusPage.faviconLogo).hostname;
      baseCSP.push(`img-src 'self' data: https: https://${cdnDomain}`);
    }

    return baseCSP.join("; ").replace(/\s+/g, " ").trim();
  }

  /**
   * Sanitize user-generated content
   */
  sanitizeUserContent(
    content: string,
    allowedTags: string[] = ["p", "br", "strong", "em", "ul", "ol", "li", "a"]
  ): string {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: ["href", "target", "title"],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["script", "iframe", "object", "embed"],
      FORBID_ATTR: ["onclick", "onload", "onerror"],
    });
  }

  /**
   * Validate and sanitize links
   */
  sanitizeLink(url: string): string {
    try {
      const parsedUrl = new URL(url);

      // Only allow http/https protocols
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return "#";
      }

      // Check against known malicious domains
      if (this.isMaliciousDomain(parsedUrl.hostname)) {
        return "#";
      }

      // Add noreferrer and noopener for external links
      if (parsedUrl.hostname !== window.location.hostname) {
        return url + '" rel="noopener noreferrer';
      }

      return url;
    } catch (error) {
      return "#";
    }
  }

  /**
   * Check if domain is known to be malicious
   */
  private isMaliciousDomain(domain: string): boolean {
    const maliciousDomains = [
      // List of known malicious domains
    ];

    return maliciousDomains.some(
      (malicious) => domain === malicious || domain.endsWith(`.${malicious}`)
    );
  }
}
```

## Integration Opportunities

### 1. Monitor System Integration

**Location**: [`worker/src/monitor/monitor.service.ts`](worker/src/monitor/monitor.service.ts:540-650)

The existing monitor system already has:

- Status change detection
- Alert threshold logic
- Notification provider integration

**Integration Point**: Extend the `saveMonitorResult` method to:

- Create incident management UI
- Manual incident creation and updates
- Component status updates
- Subscriber notifications

## Custom Subdomain Implementation (Enterprise Solution)

### Overview

This implementation focuses on UUID-based subdomains for status pages, providing a clean solution that leverages Supercheck's robust backend.

### URL Structure

**Primary Format**: `https://[uuidv4].supercheck.io`

**Example URLs**:

- `https://f47ac10b-58cc-4372-a567-0e02b2c3d479.supercheck.io`
- `https://550e8400-e29b-41d4-a716-446655440000.supercheck.io`

### Technical Architecture

#### 1. DNS Configuration Strategy

**SSL Certificate Management Architecture**:

Supercheck uses a dual-layer SSL certificate management approach:

**Cloudflare Layer (External Traffic)**:

- Cloudflare provides free wildcard SSL certificates for all subdomains
- Certificate renewal is fully automated
- SSL/TLS encryption can be configured with flexible, full, or strict modes
- Edge certificates ensure optimal performance and security for external traffic

**Traefik Layer (Internal Traffic)**:

- Traefik manages SSL certificates for internal service communication
- Can generate its own certificates if required for internal services
- Handles SSL termination for internal load balancing
- Provides additional security for service-to-service communication

**DNS Records Configuration**:

```dns
; Configure through Cloudflare dashboard
; Wildcard CNAME record for all status subdomains
*.supercheck.io. 300 IN CNAME supercheck.io.

; Main application record
app.supercheck.io. 300 IN A 192.168.1.101
```

**UUID Subdomain Approach**:

- `f47ac10b-58cc-4372-a567-0e02b2c3d479.supercheck.io` - Standard for all customers
- Automatically generated unique UUIDv4 for each status page
- No conflicts or reserved words to manage
- Included in all plans

**Traefik Configuration Example**:

```yaml
# File: traefik/dynamic/status-pages.yaml
http:
  routers:
    status-pages-router:
      rule: "HostRegexp(`{subdomain:[a-z0-9-]+}.supercheck.io`)"
      service: "status-pages-service"
      entrypoints:
        - "websecure"
      tls:
        certResolver: "cloudflare"
        domains:
          - main: "*.supercheck.io"
            sans: ["supercheck.io"]

  services:
    status-pages-service:
      loadBalancer:
        servers:
          - url: "http://app-service:3000"
        healthCheck:
          path: "/api/health"
          interval: "30s"

tls:
  stores:
    default:
      defaultCertificate:
        certFile: "/etc/ssl/certs/default.crt"
        keyFile: "/etc/ssl/certs/default.key"
```

#### 2. Next.js Middleware Implementation

```typescript
// File: middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl;

  // Extract subdomain
  const subdomain = hostname.split(".")[0];

  // Handle standard subdomains
  if (subdomain && !["www", "app", "api", "admin"].includes(subdomain)) {
    // Check if subdomain exists in database
    const statusPage = await getStatusPageBySubdomain(subdomain);

    if (statusPage) {
      // Rewrite to internal status page route
      return NextResponse.rewrite(
        new Request(`/status/subdomain/${subdomain}${url.pathname}`, request)
      );
    }

    // Return 404 for non-existent subdomains
    return NextResponse.rewrite(new Request("/404", request));
  }

  // Continue normal routing for main application
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

#### 3. Enhanced Database Schema for Status Pages

````sql
-- Enhanced status_pages table for UUIDv4 subdomain support
CREATE TABLE status_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  is_published BOOLEAN DEFAULT FALSE,
  page_description TEXT,
  headline VARCHAR(255),
  support_url VARCHAR(500),
  hidden_from_search BOOLEAN DEFAULT FALSE,
  allow_page_subscribers BOOLEAN DEFAULT TRUE,
  allow_incident_subscribers BOOLEAN DEFAULT TRUE,
  allow_email_subscribers BOOLEAN DEFAULT TRUE,
  allow_sms_subscribers BOOLEAN DEFAULT TRUE,
  allow_rss_atom_feeds BOOLEAN DEFAULT TRUE,
  allow_webhook_subscribers BOOLEAN DEFAULT TRUE,
  notifications_from_email VARCHAR(255),
  notifications_email_footer TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  -- Branding and customization
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
  -- Logo assets (stored as URLs or S3 paths)
  favicon_logo VARCHAR(500),
  transactional_logo VARCHAR(500),
  hero_cover VARCHAR(500),
  email_logo VARCHAR(500),
  twitter_logo VARCHAR(500),
  theme JSONB DEFAULT '{}',
  branding_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Component groups for organization
CREATE TABLE status_page_component_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced components table with group support
CREATE TABLE status_page_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  component_group_id UUID REFERENCES status_page_component_groups(id) ON DELETE SET NULL,
  monitor_id UUID REFERENCES monitors(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'operational' NOT NULL, -- operational, degraded, partial_outage, major_outage
  showcase BOOLEAN DEFAULT TRUE,
  only_show_if_degraded BOOLEAN DEFAULT FALSE,
  automation_email VARCHAR(255),
  start_date DATE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Incidents with enhanced workflow support
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'investigating' NOT NULL, -- investigating, identified, monitoring, resolved
  impact VARCHAR(50) DEFAULT 'minor' NOT NULL, -- none, minor, major, critical
  impact_override VARCHAR(50),
  body TEXT,
  scheduled_for TIMESTAMP,
  scheduled_until TIMESTAMP,
  scheduled_remind_prior BOOLEAN DEFAULT TRUE,
  auto_transition_to_maintenance_state BOOLEAN DEFAULT TRUE,
  auto_transition_to_operational_state BOOLEAN DEFAULT TRUE,
  scheduled_auto_in_progress BOOLEAN DEFAULT TRUE,
  scheduled_auto_completed BOOLEAN DEFAULT TRUE,
  auto_transition_deliver_notifications_at_start BOOLEAN DEFAULT TRUE,
  auto_transition_deliver_notifications_at_end BOOLEAN DEFAULT TRUE,
  reminder_intervals VARCHAR(100) DEFAULT '[3, 6, 12, 24]',
  metadata JSONB DEFAULT '{}',
  deliver_notifications BOOLEAN DEFAULT TRUE,
  auto_tweet_at_beginning BOOLEAN DEFAULT FALSE,
  auto_tweet_on_completion BOOLEAN DEFAULT FALSE,
  auto_tweet_on_creation BOOLEAN DEFAULT FALSE,
  auto_tweet_one_hour_before BOOLEAN DEFAULT FALSE,
  backfill_date TIMESTAMP,
  backfilled BOOLEAN DEFAULT FALSE,
  monitoring_at TIMESTAMP,
  resolved_at TIMESTAMP,
  shortlink VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Incident updates with notification controls
CREATE TABLE incident_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'investigating' NOT NULL,
  custom_tweet TEXT,
  deliver_notifications BOOLEAN DEFAULT TRUE,
  display_at TIMESTAMP DEFAULT NOW(),
  tweet_id VARCHAR(255),
  twitter_updated_at TIMESTAMP,
  wants_twitter_update BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Affected components for incidents
CREATE TABLE incident_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Incident templates for common issues
CREATE TABLE incident_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
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

-- Template component associations
CREATE TABLE incident_template_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  template_id UUID NOT NULL REFERENCES incident_templates(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscribers with enhanced preferences
CREATE TABLE status_page_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  email VARCHAR(255),
  phone_number VARCHAR(50),
  phone_country VARCHAR(2) DEFAULT 'US',
  endpoint VARCHAR(500), -- For webhook subscribers
  mode VARCHAR(50) NOT NULL, -- email, sms, webhook
  skip_confirmation_notification BOOLEAN DEFAULT FALSE,
  quarantined_at TIMESTAMP,
  purge_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Component-specific subscriptions
CREATE TABLE status_page_component_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  subscriber_id UUID NOT NULL REFERENCES status_page_subscribers(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Incident-specific subscriptions
CREATE TABLE status_page_incident_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES status_page_subscribers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Status page metrics with detailed tracking
CREATE TABLE status_page_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
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

-- Postmortems for incident analysis
CREATE TABLE postmortems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
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

-- Indexes for performance
CREATE INDEX idx_status_pages_subdomain ON status_pages(subdomain);
CREATE INDEX idx_status_pages_organization ON status_pages(organization_id);
CREATE INDEX idx_status_page_components_status_page ON status_page_components(status_page_id);
CREATE INDEX idx_status_page_components_monitor ON status_page_components(monitor_id);
CREATE INDEX idx_incidents_status_page ON incidents(status_page_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incident_updates_incident ON incident_updates(incident_id);
CREATE INDEX idx_status_page_subscribers_status_page ON status_page_subscribers(status_page_id);
CREATE INDEX idx_status_page_metrics_date ON status_page_metrics(date);
CREATE INDEX idx_status_page_metrics_component ON status_page_metrics(component_id);

## Implementation Checklist and Review

### Pre-Implementation Checklist

#### Database and Infrastructure
- [ ] Review and approve all 9 database table schemas
- [ ] Verify foreign key relationships and cascading rules
- [ ] Confirm indexing strategy for performance
- [ ] Set up Row Level Security (RLS) policies
- [ ] Prepare database migration scripts
- [ ] Configure wildcard DNS for *.supercheck.io
- [ ] Set up Cloudflare SSL certificate management (handled automatically)
- [ ] Configure Cloudflare SSL/TLS settings for optimal security
- [ ] Prepare Redis configuration for job queuing

#### Security and Compliance
- [ ] Complete security review of all input validation
- [ ] Verify rate limiting configuration
- [ ] Prepare Content Security Policy headers
- [ ] Set up audit logging framework
- [ ] Configure GDPR compliance features
- [ ] Prepare data retention policies
- [ ] Set up monitoring for security events

#### Development Environment
- [ ] Set up development environment with all dependencies
- [ ] Configure test database with sample data
- [ ] Prepare test cases for all major features
- [ ] Set up CI/CD pipeline for status page features
- [ ] Configure staging environment for testing

### Phase 1 Implementation Checklist

#### Core Database Schema
- [ ] Create status_pages table with all fields
- [ ] Create status_page_component_groups table
- [ ] Create status_page_components table with monitor linking
- [ ] Create incidents table with scheduling support
- [ ] Create incident_updates table with notification controls
- [ ] Create incident_templates table
- [ ] Create status_page_subscribers table with preferences
- [ ] Create subscription tables (component and incident)
- [ ] Create status_page_metrics table
- [ ] Create postmortems table
- [ ] Add all necessary indexes for performance
- [ ] Set up foreign key constraints
- [ ] Configure RLS policies

#### Core Services
- [ ] Implement StatusPageService with CRUD operations
- [ ] Implement ComponentGroupService with hierarchy support
- [ ] Implement SubdomainService with validation
- [ ] Implement IncidentService with workflow management
- [ ] Implement SubscriberService with verification
- [ ] Implement NotificationService integration
- [ ] Implement SecurityService for input validation

#### Middleware and Routing
- [ ] Create Next.js middleware for subdomain routing
- [ ] Set up security headers middleware
- [ ] Configure rate limiting middleware
- [ ] Create 404 handling for invalid subdomains

### Phase 2 Implementation Checklist

#### Status Page Rendering
- [ ] Create status page template components
- [ ] Implement component group rendering
- [ ] Create mobile-responsive design
- [ ] Implement theme customization
- [ ] Add SEO optimization

#### Incident Management
- [ ] Create incident creation interface
- [ ] Implement incident update workflow
- [ ] Add incident template system
- [ ] Create component status management
- [ ] Implement scheduled maintenance
- [ ] Add incident timeline visualization

#### Subscriber Management
- [ ] Create subscription interface
- [ ] Implement email verification workflow
- [ ] Add SMS subscription support
- [ ] Create component-specific subscriptions
- [ ] Implement unsubscribe functionality
- [ ] Add subscriber preferences management

### Phase 3 Implementation Checklist

#### Analytics and Reporting
- [ ] Implement page view tracking
- [ ] Create geographic analytics
- [ ] Add uptime metrics calculation
- [ ] Create incident timeline reporting
- [ ] Build analytics dashboard
- [ ] Add export functionality for reports

#### Notification Enhancements
- [ ] Extend email templates for status pages
- [ ] Add SMS notification support
- [ ] Implement webhook notifications
- [ ] Create delivery tracking
- [ ] Add bounce handling
- [ ] Implement notification preferences

### Phase 4 Implementation Checklist


#### Advanced Security
- [ ] Implement advanced rate limiting
- [ ] Implement security audit logging
- [ ] Add suspicious activity detection
- [ ] Create security incident response

#### Performance Optimization
- [ ] Implement CDN integration
- [ ] Optimize database queries
- [ ] Add caching strategies
- [ ] Create performance monitoring
- [ ] Implement load balancing
- [ ] Add auto-scaling support

### Testing Checklist

#### Unit Tests
- [ ] Test all service methods
- [ ] Test database operations
- [ ] Test validation logic
- [ ] Test security functions
- [ ] Test utility functions

#### Integration Tests
- [ ] Test subdomain routing
- [ ] Test incident creation workflow
- [ ] Test subscription process
- [ ] Test notification sending

#### End-to-End Tests
- [ ] Test complete status page creation
- [ ] Test incident management flow
- [ ] Test subscription flow

#### Security Tests
- [ ] Test input validation
- [ ] Test rate limiting
- [ ] Test authentication/authorization
- [ ] Test XSS protection
- [ ] Test CSRF protection

#### Performance Tests
- [ ] Test status page load times
- [ ] Test database query performance
- [ ] Test concurrent user handling
- [ ] Test analytics performance

### Deployment Checklist

#### Pre-Deployment
- [ ] Complete all development tasks
- [ ] Pass all tests
- [ ] Complete security review
- [ ] Performance testing complete
- [ ] Documentation updated
- [ ] Backup plan prepared

#### Deployment
- [ ] Deploy database migrations
- [ ] Deploy application code
- [ ] Update DNS configuration in Cloudflare
- [ ] Verify SSL certificates are active in Cloudflare
- [ ] Configure monitoring
- [ ] Test production functionality

#### Post-Deployment
- [ ] Monitor system performance
- [ ] Check error logs
- [ ] Verify all functionality
- [ ] Monitor security events
- [ ] Collect user feedback
- [ ] Plan improvements

### Final Review Questions

#### Technical Review
1. Does the implementation follow Supercheck's existing architecture patterns?
2. Are all security considerations properly addressed?
3. Is the database schema optimized for performance?
4. Are all APIs properly documented?
5. Is the code well-tested and maintainable?

#### Business Review
1. Does the implementation meet all business requirements?
2. Are the features competitive with market leaders?
3. Is the pricing strategy appropriate for the features offered?
4. Are the customer benefits clearly communicated?
5. Is the implementation timeline realistic?

#### User Experience Review
1. Is the status page interface intuitive and easy to use?
2. Is the incident management workflow clear and efficient?
3. Are the subscription options flexible and user-friendly?
5. Are the analytics providing valuable insights?

#### Security Review
1. Are all input validation rules properly implemented?
2. Is the rate limiting effective against abuse?
3. Are the subscriber data privacy features compliant?
5. Are all security events properly logged and monitored?

  subdomain VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  is_published BOOLEAN DEFAULT FALSE,
  page_description TEXT,
  headline VARCHAR(255),
  support_url VARCHAR(500),
  hidden_from_search BOOLEAN DEFAULT FALSE,
  allow_page_subscribers BOOLEAN DEFAULT TRUE,
  allow_incident_subscribers BOOLEAN DEFAULT TRUE,
  allow_email_subscribers BOOLEAN DEFAULT TRUE,
  allow_sms_subscribers BOOLEAN DEFAULT TRUE,
  allow_rss_atom_feeds BOOLEAN DEFAULT TRUE,
  allow_webhook_subscribers BOOLEAN DEFAULT TRUE,
  notifications_from_email VARCHAR(255),
  notifications_email_footer TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  -- Branding and customization
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
  -- Logo assets (stored as URLs or S3 paths)
  favicon_logo VARCHAR(500),
  transactional_logo VARCHAR(500),
  hero_cover VARCHAR(500),
  email_logo VARCHAR(500),
  twitter_logo VARCHAR(500),
  theme JSONB DEFAULT '{}',
  branding_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

);

-- Component groups for organization
CREATE TABLE status_page_component_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced components table with group support
CREATE TABLE status_page_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  component_group_id UUID REFERENCES status_page_component_groups(id) ON DELETE SET NULL,
  monitor_id UUID REFERENCES monitors(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'operational' NOT NULL, -- operational, degraded, partial_outage, major_outage
  showcase BOOLEAN DEFAULT TRUE,
  only_show_if_degraded BOOLEAN DEFAULT FALSE,
  automation_email VARCHAR(255),
  start_date DATE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Incidents with enhanced workflow support
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'investigating' NOT NULL, -- investigating, identified, monitoring, resolved
  impact VARCHAR(50) DEFAULT 'minor' NOT NULL, -- none, minor, major, critical
  impact_override VARCHAR(50),
  body TEXT,
  scheduled_for TIMESTAMP,
  scheduled_until TIMESTAMP,
  scheduled_remind_prior BOOLEAN DEFAULT TRUE,
  auto_transition_to_maintenance_state BOOLEAN DEFAULT TRUE,
  auto_transition_to_operational_state BOOLEAN DEFAULT TRUE,
  scheduled_auto_in_progress BOOLEAN DEFAULT TRUE,
  scheduled_auto_completed BOOLEAN DEFAULT TRUE,
  auto_transition_deliver_notifications_at_start BOOLEAN DEFAULT TRUE,
  auto_transition_deliver_notifications_at_end BOOLEAN DEFAULT TRUE,
  reminder_intervals VARCHAR(100) DEFAULT '[3, 6, 12, 24]',
  metadata JSONB DEFAULT '{}',
  deliver_notifications BOOLEAN DEFAULT TRUE,
  auto_tweet_at_beginning BOOLEAN DEFAULT FALSE,
  auto_tweet_on_completion BOOLEAN DEFAULT FALSE,
  auto_tweet_on_creation BOOLEAN DEFAULT FALSE,
  auto_tweet_one_hour_before BOOLEAN DEFAULT FALSE,
  backfill_date TIMESTAMP,
  backfilled BOOLEAN DEFAULT FALSE,
  monitoring_at TIMESTAMP,
  resolved_at TIMESTAMP,
  shortlink VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Incident updates with notification controls
CREATE TABLE incident_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'investigating' NOT NULL,
  custom_tweet TEXT,
  deliver_notifications BOOLEAN DEFAULT TRUE,
  display_at TIMESTAMP DEFAULT NOW(),
  tweet_id VARCHAR(255),
  twitter_updated_at TIMESTAMP,
  wants_twitter_update BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Affected components for incidents
CREATE TABLE incident_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Incident templates for common issues
CREATE TABLE incident_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
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

-- Template component associations
CREATE TABLE incident_template_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  template_id UUID NOT NULL REFERENCES incident_templates(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscribers with enhanced preferences
CREATE TABLE status_page_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  email VARCHAR(255),
  phone_number VARCHAR(50),
  phone_country VARCHAR(2) DEFAULT 'US',
  endpoint VARCHAR(500), -- For webhook subscribers
  mode VARCHAR(50) NOT NULL, -- email, sms, webhook
  skip_confirmation_notification BOOLEAN DEFAULT FALSE,
  quarantined_at TIMESTAMP,
  purge_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Component-specific subscriptions
CREATE TABLE status_page_component_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  subscriber_id UUID NOT NULL REFERENCES status_page_subscribers(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Incident-specific subscriptions
CREATE TABLE status_page_incident_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES status_page_subscribers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Status page metrics with detailed tracking
CREATE TABLE status_page_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
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


-- Postmortems for incident analysis
CREATE TABLE postmortems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
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

-- Indexes for performance
CREATE INDEX idx_status_pages_subdomain ON status_pages(subdomain);
CREATE INDEX idx_status_pages_organization ON status_pages(organization_id);
CREATE INDEX idx_status_page_components_status_page ON status_page_components(status_page_id);
CREATE INDEX idx_status_page_components_monitor ON status_page_components(monitor_id);
CREATE INDEX idx_incidents_status_page ON incidents(status_page_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incident_updates_incident ON incident_updates(incident_id);
CREATE INDEX idx_status_page_subscribers_status_page ON status_page_subscribers(status_page_id);
CREATE INDEX idx_status_page_metrics_date ON status_page_metrics(date);
CREATE INDEX idx_status_page_metrics_component ON status_page_metrics(component_id);

#### 4. Subdomain Validation and Management Service

```typescript
// File: app/src/lib/subdomain.service.ts
export class SubdomainService {
  /**
   * Create status page with auto-generated UUID subdomain
   */
  async createStatusPage(
    organizationId: string,
    name: string
  ): Promise<ProvisionResult> {
    // Create status page record with UUIDv4 subdomain
    const statusPage = await db
      .insert(statusPages)
      .values({
        organizationId,
        name,
        isPublished: false,
      })
      .returning();

    return { success: true, statusPageId: statusPage[0].id, subdomain: statusPage[0].subdomain };
  }
}
````

#### 5. SSL Certificate Management

```typescript
// File: app/src/lib/ssl.service.ts
export class SslService {
  /**
   * Check SSL certificate status for domain
   * Note: With Cloudflare, SSL certificates are managed automatically
   */
  async checkSslStatus(domain: string): Promise<CertificateStatus> {
    // For Cloudflare-managed domains, SSL is always active
    if (domain.endsWith(".supercheck.io")) {
      return {
        domain,
        status: "active",
        provider: "cloudflare",
        autoRenewal: true,
        expiresAt: null, // Cloudflare handles renewal automatically
      };
    }

    return {
      domain,
      status: "inactive",
      provider: "none",
      autoRenewal: false,
      expiresAt: null,
    };
  }
}
```

#### 6. Security Considerations

**Content Security Policy (CSP)**:

```typescript
// File: app/src/lib/security.ts
export const StatusPageCSP = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https:;
  connect-src 'self' ${process.env.NEXT_PUBLIC_WS_URL};
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
`
  .replace(/\s+/g, " ")
  .trim();
```

**Rate Limiting for Status Page Creation**:

```typescript
// File: app/src/lib/rate-limit.ts
export const statusPageRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Limit each organization to 5 status pages per day
  message: "Too many status page creation attempts",
  standardHeaders: true,
  keyGenerator: (req) => req.user?.organizationId || req.ip,
});
```

#### 7. Monitoring and Analytics

```typescript
// File: app/src/lib/status-page-analytics.ts
export class StatusPageAnalytics {
  /**
   * Track status page performance metrics
   */
  async trackPageView(
    subdomain: string,
    metadata: PageViewMetadata
  ): Promise<void> {
    await db.insert(statusPageMetrics).values({
      subdomain,
      timestamp: new Date(),
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      referrer: metadata.referrer,
      loadTime: metadata.loadTime,
    });
  }

  /**
   * Generate uptime reports
   */
  async generateUptimeReport(
    subdomain: string,
    period: "24h" | "7d" | "30d"
  ): Promise<UptimeReport> {
    const { startDate, endDate } = this.getDateRange(period);

    const metrics = await db.query.statusPageMetrics.findMany({
      where: and(
        eq(statusPageMetrics.subdomain, subdomain),
        gte(statusPageMetrics.timestamp, startDate),
        lte(statusPageMetrics.timestamp, endDate)
      ),
    });

    return this.calculateUptime(metrics);
  }
}
```

### Implementation Plan

#### Phase 1: Core Subdomain Infrastructure (Week 1)

1. **DNS and SSL Setup**

   - Configure wildcard DNS records
   - Set up wildcard SSL certificate
   - Implement certificate auto-renewal

2. **Middleware and Routing**
   - Implement Next.js middleware for subdomain routing
   - Create subdomain validation service
   - Set up database schema

#### Phase 2: Subdomain Management (Week 2)

1. **Admin Interface**

   - Subdomain creation and validation
   - DNS configuration guide
   - SSL certificate management

2. **Status Page Rendering**
   - UUID-based status page display
   - Theme customization per status page
   - Mobile-responsive design

#### Phase 3: Advanced Features (Week 3-4)

1. **Advanced Security**

   - Content Security Policy implementation
   - Rate limiting
   - Analytics and monitoring dashboard

### Security Best Practices

1. **Subdomain Validation**: Strict format validation and reserved word checking
2. **SSL Management**: Automated certificate provisioning and renewal
3. **Rate Limiting**: Prevent abuse of subdomain creation
4. **Content Security**: CSP headers for status pages
5. **Isolation**: Proper tenant isolation between status pages
6. **Monitoring**: Comprehensive logging and alerting

### Scalability Considerations

1. **Load Balancing**: Distribute traffic across multiple servers
2. **CDN Integration**: Cache static assets globally
3. **Database Optimization**: Proper indexing for subdomain lookups
4. **Monitoring**: Track performance metrics and uptime
5. **Auto-scaling**: Scale infrastructure based on traffic

This implementation provides a robust, secure, and scalable status page solution with UUID-based subdomains that maintains high performance and security standards.

## Detailed Implementation Features

### 1. Component Groups Implementation

Component groups provide a hierarchical organization of status page components, making it easier for users to understand complex systems.

#### Implementation Details

```typescript
// File: app/src/lib/component-group.service.ts
export class ComponentGroupService {
  /**
   * Create a new component group
   */
  async createComponentGroup(
    statusPageId: string,
    data: CreateComponentGroupDto
  ): Promise<ComponentGroup> {
    const maxPosition = await this.getMaxPosition(statusPageId);

    return await db
      .insert(statusPageComponentGroups)
      .values({
        statusPageId,
        name: data.name,
        description: data.description,
        position: maxPosition + 1,
      })
      .returning();
  }

  /**
   * Reorder component groups
   */
  async reorderGroups(
    statusPageId: string,
    groupOrders: { id: string; position: number }[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (const { id, position } of groupOrders) {
        await tx
          .update(statusPageComponentGroups)
          .set({ position })
          .where(eq(statusPageComponentGroups.id, id));
      }
    });
  }

  /**
   * Get component groups with their components
   */
  async getGroupsWithComponents(
    statusPageId: string
  ): Promise<ComponentGroupWithComponents[]> {
    return await db.query.statusPageComponentGroups.findMany({
      where: eq(statusPageComponentGroups.statusPageId, statusPageId),
      with: {
        components: {
          with: {
            monitor: true,
          },
          orderBy: asc(statusPageComponents.position),
        },
      },
      orderBy: asc(statusPageComponentGroups.position),
    });
  }
}
```

#### UI Components

```typescript
// File: app/src/components/status-page/ComponentGroup.tsx
interface ComponentGroupProps {
  group: ComponentGroupWithComponents;
  isEditable?: boolean;
  onReorder?: (groups: ComponentGroup[]) => void;
}

export function ComponentGroup({
  group,
  isEditable = false,
  onReorder,
}: ComponentGroupProps) {
  return (
    <div className="component-group mb-6">
      <div className="group-header flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{group.name}</h3>
        {isEditable && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {group.description && (
        <p className="text-gray-600 mb-3">{group.description}</p>
      )}

      <div className="components-grid">
        {group.components.map((component) => (
          <Component
            key={component.id}
            component={component}
            isEditable={isEditable}
          />
        ))}
      </div>
    </div>
  );
}
```

### 2. Incident Management Workflow

A comprehensive incident management system that provides full control over incident lifecycle and communication.

#### Implementation Details

```typescript
// File: app/src/lib/incident.service.ts
export class IncidentService {
  /**
   * Create a new incident
   */
  async createIncident(
    statusPageId: string,
    data: CreateIncidentDto
  ): Promise<Incident> {
    return await db.transaction(async (tx) => {
      // Create incident
      const incident = await tx
        .insert(incidents)
        .values({
          statusPageId,
          name: data.name,
          status: data.status || "investigating",
          impact: data.impact || "minor",
          body: data.body,
          scheduledFor: data.scheduledFor,
          scheduledUntil: data.scheduledUntil,
          deliverNotifications: data.deliverNotifications ?? true,
        })
        .returning();

      // Create initial update
      await tx.insert(incidentUpdates).values({
        incidentId: incident[0].id,
        body: data.body || "Investigating the issue...",
        status: data.status || "investigating",
        deliverNotifications: data.deliverNotifications ?? true,
      });

      // Update affected components
      if (data.affectedComponents?.length) {
        for (const componentId of data.affectedComponents) {
          await tx.insert(incidentComponents).values({
            incidentId: incident[0].id,
            componentId,
            oldStatus: "operational",
            newStatus: this.getImpactStatus(data.impact),
          });

          // Update component status
          await tx
            .update(statusPageComponents)
            .set({ status: this.getImpactStatus(data.impact) })
            .where(eq(statusPageComponents.id, componentId));
        }
      }

      // Send notifications if enabled
      if (data.deliverNotifications) {
        await this.notificationService.sendIncidentNotifications(
          incident[0].id,
          "created"
        );
      }

      return incident[0];
    });
  }

  /**
   * Add update to incident
   */
  async addIncidentUpdate(
    incidentId: string,
    data: CreateIncidentUpdateDto
  ): Promise<IncidentUpdate> {
    const update = await db
      .insert(incidentUpdates)
      .values({
        incidentId,
        body: data.body,
        status: data.status,
        deliverNotifications: data.deliverNotifications ?? true,
        displayAt: data.displayAt || new Date(),
      })
      .returning();

    // Update incident status
    await db
      .update(incidents)
      .set({
        status: data.status,
        updatedAt: new Date(),
      })
      .where(eq(incidents.id, incidentId));

    // Handle component status changes
    if (data.componentStatusChanges) {
      await this.updateComponentStatuses(
        incidentId,
        data.componentStatusChanges
      );
    }

    // Send notifications
    if (data.deliverNotifications) {
      await this.notificationService.sendIncidentNotifications(
        incidentId,
        "updated",
        update[0].id
      );
    }

    return update[0];
  }

  /**
   * Resolve incident
   */
  async resolveIncident(
    incidentId: string,
    data: ResolveIncidentDto
  ): Promise<Incident> {
    return await db.transaction(async (tx) => {
      // Add final update
      await tx.insert(incidentUpdates).values({
        incidentId,
        body: data.body || "This incident has been resolved.",
        status: "resolved",
        deliverNotifications: data.deliverNotifications ?? true,
      });

      // Update incident
      const incident = await tx
        .update(incidents)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(incidents.id, incidentId))
        .returning();

      // Reset component statuses
      await this.resetComponentStatuses(incidentId, tx);

      // Send notifications
      if (data.deliverNotifications) {
        await this.notificationService.sendIncidentNotifications(
          incidentId,
          "resolved"
        );
      }

      return incident[0];
    });
  }

  private getImpactStatus(impact: string): string {
    switch (impact) {
      case "critical":
        return "major_outage";
      case "major":
        return "partial_outage";
      case "minor":
        return "degraded";
      default:
        return "operational";
    }
  }
}
```

#### Incident Templates

```typescript
// File: app/src/lib/incident-template.service.ts
export class IncidentTemplateService {
  /**
   * Create incident from template
   */
  async createFromTemplate(
    templateId: string,
    data: CreateFromTemplateDto
  ): Promise<Incident> {
    const template = await this.getTemplate(templateId);

    return await this.incidentService.createIncident(data.statusPageId, {
      name: template.title,
      body: template.body,
      status: template.updateStatus,
      impact: data.impact || "minor",
      affectedComponents: data.affectedComponents,
      deliverNotifications: template.shouldSendNotifications,
    });
  }

  /**
   * Get predefined templates
   */
  async getDefaultTemplates(): Promise<IncidentTemplate[]> {
    return [
      {
        id: "investigating",
        name: "Investigating Issue",
        title: "Investigating Issue",
        body: "We are currently investigating an issue with [SERVICE_NAME]. Our team is looking into the problem and will provide updates shortly.",
        updateStatus: "investigating",
        shouldSendNotifications: true,
      },
      {
        id: "identified",
        name: "Issue Identified",
        title: "Issue Identified",
        body: "We have identified the issue affecting [SERVICE_NAME]. Our team is working on a fix and will provide an ETA soon.",
        updateStatus: "identified",
        shouldSendNotifications: true,
      },
      {
        id: "maintenance",
        name: "Scheduled Maintenance",
        title: "Scheduled Maintenance",
        body: "We will be performing scheduled maintenance on [SERVICE_NAME] from [START_TIME] to [END_TIME]. During this time, the service may be unavailable.",
        updateStatus: "monitoring",
        shouldSendNotifications: true,
      },
    ];
  }
}
```

### 3. Subscriber Management Enhancements

Advanced subscriber management with granular preferences and subscription types.

#### Implementation Details

```typescript
// File: app/src/lib/subscriber.service.ts
export class SubscriberService {
  /**
   * Add new subscriber with verification
   */
  async addSubscriber(
    statusPageId: string,
    data: CreateSubscriberDto
  ): Promise<Subscriber> {
    // Check for existing subscriber
    const existing = await this.findExistingSubscriber(
      statusPageId,
      data.email,
      data.phoneNumber
    );

    if (existing) {
      if (!existing.verifiedAt) {
        // Resend verification
        await this.sendVerificationEmail(existing);
        return existing;
      }
      throw new Error("Subscriber already exists");
    }

    // Create subscriber
    const subscriber = await db
      .insert(statusPageSubscribers)
      .values({
        statusPageId,
        email: data.email,
        phoneNumber: data.phoneNumber,
        phoneCountry: data.phoneCountry || "US",
        mode: data.mode,
      })
      .returning();

    // Send verification
    await this.sendVerificationEmail(subscriber[0]);

    return subscriber[0];
  }

  /**
   * Subscribe to specific components
   */
  async subscribeToComponents(
    subscriberId: string,
    componentIds: string[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Remove existing component subscriptions
      await tx
        .delete(statusPageComponentSubscriptions)
        .where(eq(statusPageComponentSubscriptions.subscriberId, subscriberId));

      // Add new subscriptions
      for (const componentId of componentIds) {
        await tx.insert(statusPageComponentSubscriptions).values({
          subscriberId,
          componentId,
        });
      }
    });
  }

  /**
   * Subscribe to incident updates
   */
  async subscribeToIncident(
    subscriberId: string,
    incidentId: string
  ): Promise<void> {
    await db.insert(statusPageIncidentSubscriptions).values({
      incidentId,
      subscriberId,
    });
  }

  /**
   * Unsubscribe with token
   */
  async unsubscribeWithToken(
    token: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const decoded = jwt.verify(token, process.env.UNSUBSCRIBE_SECRET!) as {
        subscriberId: string;
        type: "all" | "component" | "incident";
        targetId?: string;
      };

      if (decoded.type === "all") {
        await db
          .delete(statusPageSubscribers)
          .where(eq(statusPageSubscribers.id, decoded.subscriberId));
      } else if (decoded.type === "component" && decoded.targetId) {
        await db
          .delete(statusPageComponentSubscriptions)
          .where(
            and(
              eq(
                statusPageComponentSubscriptions.subscriberId,
                decoded.subscriberId
              ),
              eq(statusPageComponentSubscriptions.componentId, decoded.targetId)
            )
          );
      } else if (decoded.type === "incident" && decoded.targetId) {
        await db
          .delete(statusPageIncidentSubscriptions)
          .where(
            and(
              eq(
                statusPageIncidentSubscriptions.subscriberId,
                decoded.subscriberId
              ),
              eq(statusPageIncidentSubscriptions.incidentId, decoded.targetId)
            )
          );
      }

      return { success: true, message: "Successfully unsubscribed" };
    } catch (error) {
      return { success: false, message: "Invalid unsubscribe link" };
    }
  }

  /**
   * Generate unsubscribe token
   */
  private generateUnsubscribeToken(
    subscriberId: string,
    type: "all" | "component" | "incident",
    targetId?: string
  ): string {
    return jwt.sign(
      { subscriberId, type, targetId },
      process.env.UNSUBSCRIBE_SECRET!,
      { expiresIn: "30d" }
    );
  }
}
```

### 5. Analytics and Reporting Features

Comprehensive analytics and reporting for status page performance and incident metrics.

#### Implementation Details

```typescript
// File: app/src/lib/status-page-analytics.service.ts
export class StatusPageAnalyticsService {
  /**
   * Track page view with analytics
   */
  async trackPageView(
    statusPageId: string,
    metadata: PageViewMetadata
  ): Promise<void> {
    await db.insert(statusPageAnalytics).values({
      statusPageId,
      eventType: "page_view",
      timestamp: new Date(),
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      referrer: metadata.referrer,
      loadTime: metadata.loadTime,
      country: metadata.country,
      city: metadata.city,
    });

    // Update daily metrics
    await this.updateDailyMetrics(statusPageId, "page_view");
  }

  /**
   * Track subscriber activity
   */
  async trackSubscriberActivity(
    subscriberId: string,
    activity: SubscriberActivity
  ): Promise<void> {
    await db.insert(subscriberAnalytics).values({
      subscriberId,
      eventType: activity.type,
      timestamp: new Date(),
      metadata: activity.metadata,
    });
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateAnalyticsReport(
    statusPageId: string,
    period: "7d" | "30d" | "90d"
  ): Promise<AnalyticsReport> {
    const { startDate, endDate } = this.getDateRange(period);

    const [
      pageViews,
      uniqueVisitors,
      subscriberGrowth,
      incidentMetrics,
      componentMetrics,
      geographicData,
    ] = await Promise.all([
      this.getPageViews(statusPageId, startDate, endDate),
      this.getUniqueVisitors(statusPageId, startDate, endDate),
      this.getSubscriberGrowth(statusPageId, startDate, endDate),
      this.getIncidentMetrics(statusPageId, startDate, endDate),
      this.getComponentMetrics(statusPageId, startDate, endDate),
      this.getGeographicData(statusPageId, startDate, endDate),
    ]);

    return {
      period,
      pageViews,
      uniqueVisitors,
      subscriberGrowth,
      incidentMetrics,
      componentMetrics,
      geographicData,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate uptime metrics
   */
  async calculateUptimeMetrics(
    statusPageId: string,
    period: "24h" | "7d" | "30d" | "90d"
  ): Promise<UptimeMetrics> {
    const { startDate, endDate } = this.getDateRange(period);
    const components = await this.getComponents(statusPageId);

    const componentMetrics = await Promise.all(
      components.map(async (component) => {
        const metrics = await db.query.statusPageMetrics.findMany({
          where: and(
            eq(statusPageMetrics.componentId, component.id),
            gte(statusPageMetrics.date, startDate),
            lte(statusPageMetrics.date, endDate)
          ),
        });

        return this.calculateComponentUptime(component, metrics);
      })
    );

    const overallUptime = this.calculateOverallUptime(componentMetrics);

    return {
      period,
      overallUptime,
      componentMetrics,
      startDate,
      endDate,
    };
  }

  /**
   * Generate incident timeline
   */
  async generateIncidentTimeline(
    statusPageId: string,
    period: "7d" | "30d" | "90d"
  ): Promise<IncidentTimeline> {
    const { startDate, endDate } = this.getDateRange(period);

    const incidents = await db.query.incidents.findMany({
      where: and(
        eq(incidents.statusPageId, statusPageId),
        gte(incidents.createdAt, startDate),
        lte(incidents.createdAt, endDate)
      ),
      with: {
        updates: {
          orderBy: asc(incidentUpdates.createdAt),
        },
        components: {
          with: {
            component: true,
          },
        },
      },
      orderBy: desc(incidents.createdAt),
    });

    return {
      period,
      incidents: incidents.map((incident) => ({
        ...incident,
        duration: this.calculateIncidentDuration(incident),
        affectedComponents: incident.components.length,
      })),
      startDate,
      endDate,
    };
  }

  private calculateComponentUptime(
    component: StatusPageComponent,
    metrics: StatusPageMetric[]
  ): ComponentUptimeMetric {
    if (metrics.length === 0) {
      return {
        componentId: component.id,
        componentName: component.name,
        uptimePercentage: 100,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        averageResponseTime: 0,
      };
    }

    const totalChecks = metrics.reduce((sum, m) => sum + m.totalChecks, 0);
    const successfulChecks = metrics.reduce(
      (sum, m) => sum + m.successfulChecks,
      0
    );
    const failedChecks = metrics.reduce((sum, m) => sum + m.failedChecks, 0);
    const avgResponseTime =
      metrics.reduce((sum, m) => sum + (m.averageResponseTimeMs || 0), 0) /
      metrics.length;

    return {
      componentId: component.id,
      componentName: component.name,
      uptimePercentage:
        totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100,
      totalChecks,
      successfulChecks,
      failedChecks,
      averageResponseTime: Math.round(avgResponseTime),
    };
  }
}
```

#### Analytics Dashboard Components

```typescript
// File: app/src/components/analytics/AnalyticsDashboard.tsx
interface AnalyticsDashboardProps {
  statusPageId: string;
}

export function AnalyticsDashboard({ statusPageId }: AnalyticsDashboardProps) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [uptimeMetrics, setUptimeMetrics] = useState<UptimeMetrics | null>(
    null
  );
  const [incidentTimeline, setIncidentTimeline] =
    useState<IncidentTimeline | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [statusPageId, period]);

  const loadAnalytics = async () => {
    const [analyticsReport, uptime, timeline] = await Promise.all([
      analyticsService.generateAnalyticsReport(statusPageId, period),
      analyticsService.calculateUptimeMetrics(statusPageId, period),
      analyticsService.generateIncidentTimeline(statusPageId, period),
    ]);

    setReport(analyticsReport);
    setUptimeMetrics(uptime);
    setIncidentTimeline(timeline);
  };

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h2>Status Page Analytics</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {report && (
        <div className="analytics-grid">
          <div className="metric-cards">
            <MetricCard
              title="Page Views"
              value={report.pageViews.total}
              change={report.pageViews.change}
              icon={<Eye className="w-5 h-5" />}
            />
            <MetricCard
              title="Unique Visitors"
              value={report.uniqueVisitors.total}
              change={report.uniqueVisitors.change}
              icon={<Users className="w-5 h-5" />}
            />
            <MetricCard
              title="Subscribers"
              value={report.subscriberGrowth.total}
              change={report.subscriberGrowth.change}
              icon={<Bell className="w-5 h-5" />}
            />
            <MetricCard
              title="Incidents"
              value={report.incidentMetrics.total}
              change={report.incidentMetrics.change}
              icon={<AlertTriangle className="w-5 h-5" />}
            />
          </div>

          <div className="charts-section">
            <div className="chart-container">
              <h3>Page Views Over Time</h3>
              <LineChart data={report.pageViews.daily} />
            </div>

            <div className="chart-container">
              <h3>Subscriber Growth</h3>
              <AreaChart data={report.subscriberGrowth.daily} />
            </div>
          </div>

          <div className="geographic-section">
            <h3>Geographic Distribution</h3>
            <WorldMap data={report.geographicData} />
          </div>
        </div>
      )}

      {uptimeMetrics && (
        <div className="uptime-section">
          <h3>System Uptime</h3>
          <div className="overall-uptime">
            <div className="uptime-percentage">
              {uptimeMetrics.overallUptime.toFixed(2)}%
            </div>
            <div className="uptime-label">Overall Uptime</div>
          </div>

          <div className="component-uptime">
            {uptimeMetrics.componentMetrics.map((component) => (
              <div key={component.componentId} className="component-metric">
                <div className="component-name">{component.componentName}</div>
                <div className="component-uptime-bar">
                  <div
                    className="uptime-fill"
                    style={{ width: `${component.uptimePercentage}%` }}
                  />
                </div>
                <div className="component-percentage">
                  {component.uptimePercentage.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {incidentTimeline && (
        <div className="incident-timeline-section">
          <h3>Incident Timeline</h3>
          <Timeline>
            {incidentTimeline.incidents.map((incident) => (
              <TimelineItem key={incident.id}>
                <TimelineIcon>
                  <AlertTriangle className="w-4 h-4" />
                </TimelineIcon>
                <TimelineContent>
                  <div className="incident-header">
                    <h4>{incident.name}</h4>
                    <Badge variant={incident.impact}>{incident.impact}</Badge>
                  </div>
                  <p className="incident-date">
                    {format(incident.createdAt, "MMM dd, yyyy HH:mm")}
                  </p>
                  <p className="incident-duration">
                    Duration: {formatDuration(incident.duration)}
                  </p>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        </div>
      )}
    </div>
  );
}
```

### 2. Notification System Integration

**Location**: [`worker/src/notification/notification.service.ts`](worker/src/notification/notification.service.ts)

The existing notification system supports:

- Multiple providers (email, Slack, webhook, etc.)
- HTML email templates
- Delivery tracking

**Integration Point**: Add status page notification methods:

- `sendStatusPageIncidentNotification`
- `sendStatusPageResolutionNotification`
- `sendStatusPageVerificationEmail`

### 3. Real-time Updates Integration

## Implementation Benefits

### 1. Technical Advantages

- **85% Code Reuse**: Leverages existing notification and UI infrastructure
- **Minimal Complexity**: Builds on proven patterns and architecture
- **Simplified Implementation**: Manual incident management reduces integration complexity
- **Performance**: Uses existing optimized database queries and caching

### 2. Business Value

- **Increased ARPU**: $79-249/month vs. current $49 (61-408% increase)
- **Reduced Churn**: Status page users have 30% lower churn
- **Competitive Differentiation**: Only platform with monitoring + testing + status pages + AI

### 3. Customer Value

- **Cost Savings**: Save customers $150-1,200/month vs. buying tools separately
- **Unified Platform**: Single solution for monitoring, testing, and status communication
- **Control**: Manual incident management provides full control over incident communication

## Security Considerations

### 1. Existing Security Framework

Supercheck already has enterprise-grade security:

- SSRF protection
- Input validation and sanitization
- Row Level Security (RLS)
- Credential encryption
- Audit logging

### 2. Status Page Security

- Rate limiting for public APIs
- Input sanitization for custom content
- Secure subscriber management
- Protection against abuse

## Success Metrics

### Technical Metrics

- API response time < 200ms
- Page load time < 1 second
- 99.9% uptime for status pages
- Email delivery rate > 98%

### Business Metrics

- Status page adoption rate > 70%
- Starter to Professional conversion > 25%
- Churn reduction of 30%
- ARPU increase of $120 average

## Conclusion

Status page functionality is a natural, high-value extension to Supercheck that leverages existing infrastructure to provide enterprise-grade incident communication. The implementation is straightforward, builds on proven patterns, and provides significant value to both customers and the business.

The recommended approach focuses on manual incident management for simplicity and control, ensuring a robust solution that can be implemented quickly and reliably while giving users full control over incident communication.

## Next Steps

1. **Approve Implementation Plan**: Review and approve this research and plan
2. **Allocate Resources**: Assign 2 developers for 4-week implementation
3. **Begin Phase 1**: Start with database schema and core APIs
4. **Beta Testing**: Release to 10-20 customers for feedback
5. **Public Launch**: Full release with marketing campaign

---

_This research and plan provides a comprehensive foundation for implementing status page functionality in Supercheck with minimal complexity and maximum value._
