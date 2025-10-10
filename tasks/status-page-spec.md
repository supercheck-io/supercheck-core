# Status Page Implementation Research & Plan

## Executive Summary

Based on comprehensive research and analysis of the existing Supercheck codebase, I've identified a robust, clean solution for integrating status page functionality. The implementation leverages Supercheck's existing monitoring infrastructure, making it a natural extension that provides significant value with minimal complexity.

## Key Findings

### 1. Existing Infrastructure Analysis

Supercheck already has all the core components needed for status pages:

- **Monitoring System**: Comprehensive monitoring with 5 types (HTTP, Website, Ping, Port, Synthetic Tests)
- **Alert System**: Multi-channel notifications (email, Slack, webhook, Telegram, Discord)
- **Real-time Updates**: Server-Sent Events (SSE) for live status updates
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
- Real-time status updates via SSE
- Email/SMS subscriber notifications
- Custom domain support
- 90-day uptime display
- Component-based status organization
- Clean, mobile-responsive design

### 3. Technical Implementation Approach

**Recommended Architecture:**

```
Manual Incident Creation → Update Status Page → Notify Subscribers
```

**Database Schema (6 new tables):**

- `status_pages`: Page configuration, branding, and unique slug/subdomain
- `status_page_components`: Links monitors to page components
- `incidents`: Incident records with status and impact
- `incident_updates`: Timeline of incident updates
- `status_page_subscribers`: Email/SMS subscribers
- `status_page_metrics`: Daily uptime calculations

**Integration Points:**

- Build on existing [`monitor.service.ts`](worker/src/monitor/monitor.service.ts) for component status tracking
- Leverage [`notification.service.ts`](worker/src/notification/notification.service.ts) for subscriber notifications
- Use existing SSE infrastructure for real-time updates
- Build on current UI components for consistent design

## Implementation Plan

### Phase 1: Core Subdomain Infrastructure (Week 1)

1. **DNS and SSL Setup**

   - Configure wildcard DNS records for \*.supercheck.io
   - Set up wildcard SSL certificate with Let's Encrypt
   - Implement certificate auto-renewal system
   - Create DNS validation service

2. **Middleware and Routing**

   - Implement Next.js middleware for subdomain routing
   - Create subdomain validation service with format checking
   - Set up enhanced database schema for subdomains
   - Add reserved word protection and security constraints

3. **Database Schema & Migration**
   - Create enhanced status_pages table with subdomain support
   - Add custom_domain_verifications table for enterprise clients
   - Create proper indexes for subdomain lookups
   - Set up Row Level Security policies

### Phase 2: Subdomain Management (Week 2)

1. **Admin Interface**

   - Subdomain creation and validation dashboard
   - DNS configuration guide for customers
   - SSL certificate management interface
   - Subdomain availability checker

2. **Status Page Rendering**

   - Subdomain-based status page display
   - Theme customization per subdomain
   - Mobile-responsive design
   - Real-time updates via SSE

3. **Manual Incident Management**
   - Create incident management interface
   - Manual incident creation and updates
   - Manual incident resolution workflow
   - Component status management

### Phase 3: Enterprise Features (Week 3-4)

1. **Custom Domain Support**

   - Custom domain verification system (DNS/HTTP)
   - SSL provisioning for custom domains
   - Domain management interface
   - Enterprise-tier custom domain setup

2. **Advanced Security**

   - Content Security Policy implementation
   - Rate limiting and DDoS protection
   - Subdomain abuse prevention
   - Analytics and monitoring dashboard

3. **Email Notifications**
   - Extend existing email service
   - Create email templates for status updates
   - Implement subscriber verification
   - Custom domain notification handling

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

This implementation focuses exclusively on custom subdomains for status pages, providing an enterprise-ready, white-label solution that enhances brand value and professionalism. Custom subdomains create the appearance of a dedicated status monitoring infrastructure while leveraging Supercheck's robust backend.

### URL Structure

**Primary Format**: `https://[subdomain].supercheck.io`
**Custom Domain Format**: `https://status.[customer-domain].com` (Enterprise tier)

**Example URLs**:

- `https://status.acme.supercheck.io`
- `https://monitoring.techcorp.supercheck.io`
- `https://status.enterprise.customer.com` (Custom domain)

### Technical Architecture

#### 1. DNS Configuration Strategy

**Wildcard SSL Certificate Setup**:

```bash
# Generate wildcard certificate for supercheck.io
certbot certonly --manual --preferred-challenges dns \
  -d *.supercheck.io -d supercheck.io

# DNS TXT record required for validation
_acme-challenge.supercheck.io. 300 IN TXT "validation_token"
```

**DNS Records**:

```dns
; Wildcard A record for all status subdomains
*.supercheck.io. 300 IN A 192.168.1.100

; Separate record for the main platform
app.supercheck.io. 300 IN A 192.168.1.101

; Custom domain CNAME (Enterprise clients)
status.customer.com. 300 IN CNAME customer.supercheck.io.
```

#### 2. Next.js Middleware Implementation

```typescript
// File: middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl;

  // Extract subdomain and custom domain logic
  const subdomain = hostname.split(".")[0];
  const isCustomDomain = hostname.includes("supercheck.io") === false;

  // Handle custom domains (Enterprise tier)
  if (isCustomDomain) {
    const customDomain = await validateCustomDomain(hostname);
    if (customDomain) {
      return NextResponse.rewrite(
        new Request(
          `/status/custom/${customDomain.statusPageId}${url.pathname}`,
          request
        )
      );
    }
  }

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

#### 3. Database Schema for Enterprise Subdomains

```sql
-- Enhanced status_pages table for subdomain support
CREATE TABLE status_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  custom_domain VARCHAR(255) UNIQUE,  -- Enterprise feature
  custom_domain_ssl_expires_at TIMESTAMP,
  custom_domain_verification_token VARCHAR(255),
  custom_domain_verified BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  theme JSONB DEFAULT '{}',
  branding_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_subdomain CHECK (
    subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT valid_custom_domain CHECK (
    custom_domain IS NULL OR
    custom_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$'
  )
);

-- Indexes for performance
CREATE INDEX idx_status_pages_subdomain ON status_pages(subdomain);
CREATE INDEX idx_status_pages_custom_domain ON status_pages(custom_domain);
CREATE INDEX idx_status_pages_organization ON status_pages(organization_id);

-- Custom domain verification table
CREATE TABLE custom_domain_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id),
  domain VARCHAR(255) NOT NULL,
  verification_type VARCHAR(50) NOT NULL, -- 'DNS', 'HTTP', 'HTTPS'
  verification_token VARCHAR(255) NOT NULL,
  verification_string VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. Subdomain Validation and Management Service

```typescript
// File: app/src/lib/subdomain.service.ts
export class SubdomainService {
  /**
   * Validate subdomain format and availability
   */
  async validateSubdomain(subdomain: string): Promise<ValidationResult> {
    // Check format
    const formatValid = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain);
    if (!formatValid) {
      return { valid: false, error: "Invalid subdomain format" };
    }

    // Check reserved words
    const reserved = [
      "www",
      "app",
      "api",
      "admin",
      "mail",
      "ftp",
      "ssl",
      "test",
      "dev",
    ];
    if (reserved.includes(subdomain)) {
      return { valid: false, error: "Subdomain is reserved" };
    }

    // Check availability
    const existing = await db.query.statusPages.findFirst({
      where: eq(statusPages.subdomain, subdomain),
    });

    if (existing) {
      return { valid: false, error: "Subdomain is already taken" };
    }

    return { valid: true };
  }

  /**
   * Provision subdomain with DNS validation
   */
  async provisionSubdomain(
    organizationId: string,
    subdomain: string,
    planType: "standard" | "enterprise"
  ): Promise<ProvisionResult> {
    // Validate subdomain
    const validation = await this.validateSubdomain(subdomain);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Create DNS record (if self-hosted DNS)
    if (process.env.DNS_PROVIDER === "cloudflare") {
      await this.createDnsRecord(subdomain);
    }

    // Create status page record
    const statusPage = await db
      .insert(statusPages)
      .values({
        organizationId,
        subdomain,
        isPublished: false,
      })
      .returning();

    // Set up SSL certificate
    await this.provisionSslCertificate(subdomain);

    return { success: true, statusPageId: statusPage[0].id };
  }

  /**
   * Handle custom domain verification (Enterprise)
   */
  async setupCustomDomain(
    statusPageId: string,
    domain: string
  ): Promise<CustomDomainResult> {
    // Generate verification tokens
    const dnsToken = this.generateVerificationToken();
    const httpToken = this.generateVerificationToken();

    // Create verification records
    await db.insert(customDomainVerifications).values([
      {
        statusPageId,
        domain,
        verificationType: "DNS",
        verificationToken: dnsToken,
        verificationString: `_supercheck-challenge=${dnsToken}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
      {
        statusPageId,
        domain,
        verificationType: "HTTP",
        verificationToken: httpToken,
        verificationString: `supercheck-verification=${httpToken}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    ]);

    return {
      dnsRequired: true,
      dnsRecord: `_supercheck-challenge.${domain} IN TXT "${dnsToken}"`,
      httpRequired: true,
      httpFile: `/.well-known/supercheck-verification`,
      httpContent: httpToken,
    };
  }
}
```

#### 5. SSL Certificate Management

```typescript
// File: app/src/lib/ssl.service.ts
export class SslService {
  /**
   * Provision SSL certificate for subdomain
   */
  async provisionSslCertificate(subdomain: string): Promise<CertificateResult> {
    const domain = `${subdomain}.supercheck.io`;

    if (process.env.SSL_PROVIDER === "letsencrypt") {
      return await this.provisionLetsEncrypt(domain);
    } else if (process.env.SSL_PROVIDER === "aws-acm") {
      return await this.provisionAwsAcm(domain);
    }

    throw new Error("SSL provider not configured");
  }

  private async provisionLetsEncrypt(
    domain: string
  ): Promise<CertificateResult> {
    // Use ACME client to generate certificate
    const cert = await acmeClient.getCertificate({
      domains: [domain, `*.${domain}`],
      challengeType: "dns-01",
    });

    // Store certificate in secure storage
    await this.storeCertificate(domain, cert);

    return {
      domain,
      expiresAt: cert.expiresAt,
      autoRenewal: true,
    };
  }

  /**
   * Auto-renew certificates before expiry
   */
  async scheduleRenewals(): Promise<void> {
    const expiringCerts = await db.query.statusPages.findMany({
      where: and(
        isNotNull(statusPages.customDomain),
        lt(
          statusPages.customDomainSslExpiresAt,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        )
      ),
    });

    for (const statusPage of expiringCerts) {
      await this.provisionSslCertificate(statusPage.customDomain);
    }
  }
}
```

#### 6. Enterprise Security Considerations

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

**Rate Limiting for Subdomain Creation**:

```typescript
// File: app/src/lib/rate-limit.ts
export const subdomainRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Limit each organization to 5 subdomains per day
  message: "Too many subdomain creation attempts",
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
   - Subdomain-based status page display
   - Theme customization per subdomain
   - Mobile-responsive design

#### Phase 3: Enterprise Features (Week 3-4)

1. **Custom Domain Support**

   - Custom domain verification system
   - SSL provisioning for custom domains
   - Domain management interface

2. **Advanced Security**
   - Content Security Policy implementation
   - Rate limiting and DDoS protection
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

This enterprise-ready implementation provides a robust, secure, and scalable custom subdomain solution that enhances brand value while maintaining high performance and security standards.

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

**Existing Infrastructure**: Supercheck already uses SSE for real-time updates

**Integration Point**: Create new SSE endpoints:

- `/api/public/status-pages/[slug]/events`
- Leverage existing Redis pub/sub infrastructure

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
