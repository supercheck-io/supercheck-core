# Status Pages Feature Implementation Plan

## Executive Summary

This document provides a comprehensive implementation plan for adding Status Pages functionality to Supercheck. The feature will enable customers to create public-facing status pages that automatically display service status, incident information, and uptime metrics based on their existing monitors.

### Key Features

- **Automated Incident Creation**: Direct integration with existing monitor system
- **Real-time Updates**: Server-Sent Events for live status updates
- **Email Notifications**: Subscriber management and incident notifications
- **Custom Branding**: Company branding and custom domain support
- **Uptime Metrics**: Automated calculation and display of uptime statistics

### Implementation Timeline

- **Total Duration**: 4 weeks
- **Approach**: Phased development with weekly deliverables
- **Team**: 2 developers, 0.5 DevOps, 0.5 QA

## 1. Database Schema Design

### 1.1 Core Tables

#### Status Pages Table

```sql
CREATE TABLE IF NOT EXISTS status_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    custom_domain VARCHAR(255),
    visibility VARCHAR(50) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    branding_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(organization_id, slug),
    UNIQUE(custom_domain) WHERE custom_domain IS NOT NULL
);
```

#### Status Page Components Table

```sql
CREATE TABLE IF NOT EXISTS status_page_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    monitor_id UUID REFERENCES monitors(id) ON DELETE SET NULL,
    current_status VARCHAR(50) NOT NULL DEFAULT 'operational' CHECK (current_status IN ('operational', 'degraded_performance', 'partial_outage', 'major_outage', 'under_maintenance')),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Incidents Table

```sql
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    impact VARCHAR(50) NOT NULL DEFAULT 'minor' CHECK (impact IN ('minor', 'major', 'critical')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    auto_created BOOLEAN DEFAULT false,
    monitor_id UUID REFERENCES monitors(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Incident Updates Table

```sql
CREATE TABLE IF NOT EXISTS incident_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    message TEXT NOT NULL,
    display_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Status Page Subscribers Table

```sql
CREATE TABLE IF NOT EXISTS status_page_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    subscribed_component_ids UUID[] DEFAULT '{}',
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    unsubscribe_token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(status_page_id, email)
);
```

#### Status Page Metrics Table

```sql
CREATE TABLE IF NOT EXISTS status_page_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    uptime_percentage DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    downtime_minutes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(component_id, date)
);
```

### 1.2 Indexes for Performance

```sql
-- Status pages indexes
CREATE INDEX IF NOT EXISTS idx_status_pages_organization_id ON status_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_status_pages_project_id ON status_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_status_pages_slug ON status_pages(slug);
CREATE INDEX IF NOT EXISTS idx_status_pages_is_published ON status_pages(is_published);

-- Components indexes
CREATE INDEX IF NOT EXISTS idx_status_page_components_status_page_id ON status_page_components(status_page_id);
CREATE INDEX IF NOT EXISTS idx_status_page_components_monitor_id ON status_page_components(monitor_id);
CREATE INDEX IF NOT EXISTS idx_status_page_components_display_order ON status_page_components(status_page_id, display_order);

-- Incidents indexes
CREATE INDEX IF NOT EXISTS idx_incidents_status_page_id ON incidents(status_page_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id ON incidents(monitor_id);

-- Incident updates indexes
CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_id ON incident_updates(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_updates_display_at ON incident_updates(display_at);

-- Subscribers indexes
CREATE INDEX IF NOT EXISTS idx_status_page_subscribers_status_page_id ON status_page_subscribers(status_page_id);
CREATE INDEX IF NOT EXISTS idx_status_page_subscribers_email ON status_page_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_status_page_subscribers_is_verified ON status_page_subscribers(is_verified);
CREATE INDEX IF NOT EXISTS idx_status_page_subscribers_unsubscribe_token ON status_page_subscribers(unsubscribe_token);

-- Metrics indexes
CREATE INDEX IF NOT EXISTS idx_status_page_metrics_component_id ON status_page_metrics(component_id);
CREATE INDEX IF NOT EXISTS idx_status_page_metrics_date ON status_page_metrics(date);
```

### 1.3 Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_metrics ENABLE ROW LEVEL SECURITY;

-- Status pages policies
CREATE POLICY "Users can view status pages in their organization" ON status_pages
    FOR SELECT USING (organization_id IN (SELECT id FROM organizations WHERE id = current_setting('app.current_organization_id')::uuid));

CREATE POLICY "Users can create status pages in their organization" ON status_pages
    FOR INSERT WITH CHECK (organization_id IN (SELECT id FROM organizations WHERE id = current_setting('app.current_organization_id')::uuid));

CREATE POLICY "Users can update status pages in their organization" ON status_pages
    FOR UPDATE USING (organization_id IN (SELECT id FROM organizations WHERE id = current_setting('app.current_organization_id')::uuid));

CREATE POLICY "Users can delete status pages in their organization" ON status_pages
    FOR DELETE USING (organization_id IN (SELECT id FROM organizations WHERE id = current_setting('app.current_organization_id')::uuid));
```

## 2. API Endpoints Design

### 2.1 Status Pages CRUD API

#### GET /api/status-pages

```typescript
// app/src/app/api/status-pages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams));

    const offset = (query.page - 1) * query.limit;

    let whereConditions = ["organization_id = $1"];
    let params = [user.organizationId];
    let paramIndex = 2;

    if (query.search) {
      whereConditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${query.search}%`);
      paramIndex++;
    }

    if (query.visibility) {
      whereConditions.push(`visibility = $${paramIndex}`);
      params.push(query.visibility);
      paramIndex++;
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM status_pages
      WHERE ${whereConditions.join(" AND ")}
    `;

    const dataQuery = `
      SELECT sp.*, 
             COUNT(DISTINCT spc.id) as component_count,
             COUNT(DISTINCT i.id) as incident_count
      FROM status_pages sp
      LEFT JOIN status_page_components spc ON sp.id = spc.status_page_id
      LEFT JOIN incidents i ON sp.id = i.status_page_id AND i.status != 'resolved'
      WHERE ${whereConditions.join(" AND ")}
      GROUP BY sp.id
      ORDER BY sp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(query.limit, offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params),
      db.query(dataQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const pages = Math.ceil(total / query.limit);

    return NextResponse.json({
      data: dataResult.rows,
      meta: {
        total,
        pages,
        page: query.page,
        limit: query.limit,
      },
    });
  } catch (error) {
    console.error("Failed to fetch status pages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

#### POST /api/status-pages

```typescript
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = validateStatusPageInput(body);

    // Check if slug is unique within organization
    const existingSlug = await db.query(
      "SELECT id FROM status_pages WHERE organization_id = $1 AND slug = $2",
      [user.organizationId, validatedData.slug]
    );

    if (existingSlug.rows.length > 0) {
      return NextResponse.json(
        { error: "Slug already exists" },
        { status: 409 }
      );
    }

    const statusPageId = generateId();

    const result = await db.query(
      `
      INSERT INTO status_pages (
        id, organization_id, project_id, name, slug, visibility, 
        branding_config, settings, is_published, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      ) RETURNING *
    `,
      [
        statusPageId,
        user.organizationId,
        user.projectId,
        validatedData.name,
        validatedData.slug,
        validatedData.visibility,
        JSON.stringify(validatedData.brandingConfig),
        JSON.stringify(validatedData.settings),
        validatedData.isPublished,
      ]
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Failed to create status page:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 2.2 Component Management API

#### GET /api/status-pages/[id]/components

```typescript
// app/src/app/api/status-pages/[id]/components/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceStatusPageAccess } from "@/lib/security/status-page-security";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this status page
    await enforceStatusPageAccess(params.id, user.id, "read");

    const result = await db.query(
      `
      SELECT spc.*, m.name as monitor_name, m.type as monitor_type
      FROM status_page_components spc
      LEFT JOIN monitors m ON spc.monitor_id = m.id
      WHERE spc.status_page_id = $1
      ORDER BY spc.display_order ASC
    `,
      [params.id]
    );

    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error("Failed to fetch components:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

#### POST /api/status-pages/[id]/components

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this status page
    await enforceStatusPageAccess(params.id, user.id, "write");

    const body = await request.json();
    const validatedData = validateComponentInput(body);

    // Get next display order
    const maxOrderResult = await db.query(
      "SELECT MAX(display_order) as max_order FROM status_page_components WHERE status_page_id = $1",
      [params.id]
    );

    const displayOrder = (maxOrderResult.rows[0].max_order || 0) + 1;

    const componentId = generateId();

    const result = await db.query(
      `
      INSERT INTO status_page_components (
        id, status_page_id, name, description, monitor_id, 
        current_status, display_order, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
      ) RETURNING *
    `,
      [
        componentId,
        params.id,
        validatedData.name,
        validatedData.description,
        validatedData.monitorId,
        "operational",
        displayOrder,
      ]
    );

    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Failed to create component:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 2.3 Public Status Page API

#### GET /api/public/status-pages/[slug]

```typescript
// app/src/app/api/public/status-pages/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyRateLimit } from "@/lib/security/rate-limiting";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Apply rate limiting for public API
    await applyRateLimit(params.slug, "public");

    const result = await db.query(
      `
      SELECT sp.*, 
             json_agg(
               json_build_object(
                 'id', spc.id,
                 'name', spc.name,
                 'description', spc.description,
                 'currentStatus', spc.current_status,
                 'displayOrder', spc.display_order
               ) ORDER BY spc.display_order
             ) as components
      FROM status_pages sp
      LEFT JOIN status_page_components spc ON sp.id = spc.status_page_id
      WHERE sp.slug = $1 AND sp.is_published = true AND sp.visibility = 'public'
      GROUP BY sp.id
    `,
      [params.slug]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Status page not found" },
        { status: 404 }
      );
    }

    const statusPage = result.rows[0];

    // Get active incidents
    const incidentsResult = await db.query(
      `
      SELECT i.*, 
             json_agg(
               json_build_object(
                 'id', iu.id,
                 'status', iu.status,
                 'message', iu.message,
                 'displayAt', iu.display_at
               ) ORDER BY iu.display_at DESC
             ) as updates
      FROM incidents i
      LEFT JOIN incident_updates iu ON i.id = iu.incident_id
      WHERE i.status_page_id = $1 AND i.status != 'resolved'
      GROUP BY i.id
      ORDER BY i.started_at DESC
    `,
      [statusPage.id]
    );

    statusPage.activeIncidents = incidentsResult.rows;

    return NextResponse.json({ data: statusPage });
  } catch (error) {
    console.error("Failed to fetch public status page:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## 3. Public Status Page Implementation

### 3.1 Status Page Display Component

```typescript
// app/src/components/status-pages/public/StatusPageDisplay.tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubscribeModal } from "./SubscribeModal";
import { IncidentTimeline } from "./IncidentTimeline";
import { StatusIndicator } from "./StatusIndicator";
import { useEventSource } from "@/hooks/useEventSource";

interface StatusPageDisplayProps {
  statusPage: any;
}

export function StatusPageDisplay({ statusPage }: StatusPageDisplayProps) {
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(statusPage);
  const searchParams = useSearchParams();
  const subscribeModal = searchParams.get("subscribe") === "true";

  // Real-time updates via Server-Sent Events
  const { data: sseData } = useEventSource(
    `/api/public/status-pages/${statusPage.slug}/events`
  );

  useEffect(() => {
    if (sseData) {
      const update = JSON.parse(sseData);
      setCurrentStatus((prev) => ({
        ...prev,
        components: prev.components.map((comp: any) =>
          comp.id === update.componentId ? { ...comp, ...update } : comp
        ),
        activeIncidents: update.incidents || prev.activeIncidents,
      }));
    }
  }, [sseData]);

  useEffect(() => {
    if (subscribeModal) {
      setShowSubscribeModal(true);
    }
  }, [subscribeModal]);

  const overallStatus = getOverallStatus(currentStatus.components);
  const branding = statusPage.brandingConfig || {};

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: branding.backgroundColor || "#ffffff",
        color: branding.textColor || "#000000",
      }}
    >
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          {branding.companyLogo && (
            <img
              src={branding.companyLogo}
              alt={branding.companyName || "Company Logo"}
              className="h-12 mx-auto mb-4"
            />
          )}
          <h1 className="text-3xl font-bold mb-2">
            {branding.companyName || statusPage.name} Status
          </h1>
          <div className="flex items-center justify-center space-x-2">
            <StatusIndicator status={overallStatus} />
            <span className="text-lg font-medium">
              {getStatusText(overallStatus)}
            </span>
          </div>
        </header>

        {/* Components */}
        <div className="grid gap-4 mb-8">
          {currentStatus.components?.map((component: any) => (
            <Card key={component.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{component.name}</h3>
                    {component.description && (
                      <p className="text-sm text-muted-foreground">
                        {component.description}
                      </p>
                    )}
                  </div>
                  <StatusIndicator status={component.currentStatus} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Incidents */}
        {currentStatus.activeIncidents?.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Active Incidents</h2>
            <div className="space-y-4">
              {currentStatus.activeIncidents.map((incident: any) => (
                <Card key={incident.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {incident.title}
                      </CardTitle>
                      <Badge variant={getImpactVariant(incident.impact)}>
                        {incident.impact}
                      </Badge>
                    </div>
                    <CardDescription>
                      Started {new Date(incident.startedAt).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <IncidentTimeline updates={incident.updates} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Subscribe Button */}
        {statusPage.settings?.enableSubscriptions && (
          <div className="text-center">
            <Button
              onClick={() => setShowSubscribeModal(true)}
              style={{ backgroundColor: branding.primaryColor }}
            >
              Subscribe to Updates
            </Button>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center mt-12 text-sm text-muted-foreground">
          {branding.showSupercheckBranding !== false && (
            <p>
              Powered by{" "}
              <a
                href="https://supercheck.io"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Supercheck
              </a>
            </p>
          )}
        </footer>
      </div>

      {/* Subscribe Modal */}
      {showSubscribeModal && (
        <SubscribeModal
          statusPageId={statusPage.id}
          onClose={() => setShowSubscribeModal(false)}
        />
      )}
    </div>
  );
}

function getOverallStatus(components: any[]): string {
  if (!components || components.length === 0) return "operational";

  const statuses = components.map((c) => c.currentStatus);

  if (statuses.includes("major_outage")) return "major_outage";
  if (statuses.includes("partial_outage")) return "partial_outage";
  if (statuses.includes("degraded_performance")) return "degraded_performance";
  if (statuses.includes("under_maintenance")) return "under_maintenance";

  return "operational";
}

function getStatusText(status: string): string {
  const statusTexts = {
    operational: "All Systems Operational",
    degraded_performance: "Degraded Performance",
    partial_outage: "Partial Outage",
    major_outage: "Major Outage",
    under_maintenance: "Under Maintenance",
  };

  return statusTexts[status] || "Unknown Status";
}

function getImpactVariant(impact: string): string {
  const variants = {
    minor: "default",
    major: "secondary",
    critical: "destructive",
  };

  return variants[impact] || "default";
}
```

### 3.2 Server-Sent Events Implementation

```typescript
// app/src/app/api/public/status-pages/[slug]/events/route.ts
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { applyRateLimit } from "@/lib/security/rate-limiting";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Apply rate limiting
  await applyRateLimit(params.slug, "public");

  // Verify status page exists and is public
  const statusPageResult = await db.query(
    "SELECT id FROM status_pages WHERE slug = $1 AND is_published = true AND visibility = 'public'",
    [params.slug]
  );

  if (statusPageResult.rows.length === 0) {
    return new Response("Status page not found", { status: 404 });
  }

  const statusPageId = statusPageResult.rows[0].id;

  // Create Server-Sent Events response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      // Set up Redis subscription for real-time updates
      const redis = require("@/lib/redis");
      const channel = `status-page-updates:${statusPageId}`;

      const subscriber = redis.duplicate();
      subscriber.subscribe(channel);

      subscriber.on("message", (channel: string, message: string) => {
        try {
          const update = JSON.parse(message);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(update)}\n\n`)
          );
        } catch (error) {
          console.error("Failed to parse update message:", error);
        }
      });

      // Clean up on disconnect
      request.signal.addEventListener("abort", () => {
        subscriber.unsubscribe(channel);
        subscriber.quit();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

## 4. Automated Incident Creation

### 4.1 Status Page Incident Service

```typescript
// worker/src/monitor/services/status-page-incident.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { MonitorService } from "../monitor.service";
import { DbService } from "@/db/db.service";
import { MonitorResult } from "../types/monitor-result.type";

@Injectable()
export class StatusPageIncidentService {
  private readonly logger = new Logger(StatusPageIncidentService.name);

  constructor(
    private readonly monitorService: MonitorService,
    private readonly dbService: DbService
  ) {}

  /**
   * Process monitor result and create/update incidents if needed
   */
  async processMonitorResult(monitorResult: MonitorResult): Promise<void> {
    const { monitorId, status, responseTime, checkedAt } = monitorResult;

    try {
      // Find all status page components linked to this monitor
      const components = await this.findComponentsByMonitorId(monitorId);

      if (components.length === 0) {
        return; // No status page components linked to this monitor
      }

      // Process each component
      for (const component of components) {
        await this.processComponentStatus(component, monitorResult);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process monitor result for monitor ${monitorId}:`,
        error
      );
    }
  }

  /**
   * Process status change for a specific component
   */
  private async processComponentStatus(
    component: any,
    monitorResult: MonitorResult
  ): Promise<void> {
    const { status, checkedAt } = monitorResult;
    const previousStatus = component.current_status;
    const newStatus = this.mapMonitorStatusToComponentStatus(status);

    // Update component status
    await this.updateComponentStatus(component.id, newStatus, checkedAt);

    // Handle status change logic
    if (previousStatus !== newStatus) {
      if (
        this.isFailureStatus(newStatus) &&
        !this.isFailureStatus(previousStatus)
      ) {
        // Status changed from operational to failure - create incident
        await this.createIncidentFromMonitorFailure(component, monitorResult);
      } else if (
        !this.isFailureStatus(newStatus) &&
        this.isFailureStatus(previousStatus)
      ) {
        // Status changed from failure to operational - resolve incident
        await this.resolveIncidentFromMonitorRecovery(component, monitorResult);
      }
    }
  }

  /**
   * Map monitor status to component status
   */
  private mapMonitorStatusToComponentStatus(monitorStatus: string): string {
    const statusMapping = {
      success: "operational",
      failure: "major_outage",
      timeout: "major_outage",
      error: "major_outage",
      warning: "degraded_performance",
    };

    return statusMapping[monitorStatus] || "operational";
  }

  /**
   * Check if status indicates a failure
   */
  private isFailureStatus(status: string): boolean {
    return ["major_outage", "partial_outage", "degraded_performance"].includes(
      status
    );
  }

  /**
   * Create incident from monitor failure
   */
  private async createIncidentFromMonitorFailure(
    component: any,
    monitorResult: MonitorResult
  ): Promise<void> {
    const { monitorId, status, responseTime, checkedAt } = monitorResult;

    try {
      // Check if there's already an active incident for this component
      const existingIncident = await this.findActiveIncidentForComponent(
        component.id
      );

      if (existingIncident) {
        this.logger.log(
          `Active incident already exists for component ${component.id}`
        );
        return;
      }

      // Get monitor details for incident title
      const monitor = await this.monitorService.findById(monitorId);
      if (!monitor) {
        this.logger.error(`Monitor ${monitorId} not found`);
        return;
      }

      // Determine impact based on monitor type and status
      const impact = this.determineIncidentImpact(status, monitor.type);

      // Create incident
      const incidentId = await this.createIncident({
        statusPageId: component.status_page_id,
        title: this.generateIncidentTitle(monitor, status),
        status: "investigating",
        impact,
        startedAt: checkedAt,
        autoCreated: true,
        monitorId,
      });

      // Create initial incident update
      await this.createIncidentUpdate({
        incidentId,
        status: "investigating",
        message: this.generateIncidentMessage(monitor, status, responseTime),
        displayAt: checkedAt,
      });

      // Update component status to reflect incident
      await this.updateComponentStatusForIncident(component.id, impact);

      // Notify subscribers
      await this.notifySubscribers(
        component.status_page_id,
        incidentId,
        "created"
      );

      // Send real-time update via SSE
      await this.sendRealtimeUpdate(component.status_page_id, {
        type: "incident_created",
        componentId: component.id,
        incidentId,
        status: "investigating",
        impact,
      });

      this.logger.log(
        `Created incident ${incidentId} for component ${component.id}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to create incident for component ${component.id}:`,
        error
      );
    }
  }

  /**
   * Resolve incident from monitor recovery
   */
  private async resolveIncidentFromMonitorRecovery(
    component: any,
    monitorResult: MonitorResult
  ): Promise<void> {
    const { monitorId, checkedAt } = monitorResult;

    try {
      // Find active incident for this component
      const activeIncident = await this.findActiveIncidentForComponent(
        component.id
      );

      if (!activeIncident) {
        this.logger.log(
          `No active incident found for component ${component.id}`
        );
        return;
      }

      // Get monitor details for resolution message
      const monitor = await this.monitorService.findById(monitorId);
      if (!monitor) {
        this.logger.error(`Monitor ${monitorId} not found`);
        return;
      }

      // Resolve incident
      await this.resolveIncident(activeIncident.id, checkedAt);

      // Create resolution update
      await this.createIncidentUpdate({
        incidentId: activeIncident.id,
        status: "resolved",
        message: this.generateResolutionMessage(monitor),
        displayAt: checkedAt,
      });

      // Update component status to operational
      await this.updateComponentStatus(component.id, "operational", checkedAt);

      // Notify subscribers
      await this.notifySubscribers(
        component.status_page_id,
        activeIncident.id,
        "resolved"
      );

      // Send real-time update via SSE
      await this.sendRealtimeUpdate(component.status_page_id, {
        type: "incident_resolved",
        componentId: component.id,
        incidentId: activeIncident.id,
        status: "resolved",
      });

      this.logger.log(
        `Resolved incident ${activeIncident.id} for component ${component.id}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to resolve incident for component ${component.id}:`,
        error
      );
    }
  }

  /**
   * Send real-time update via Redis pub/sub
   */
  private async sendRealtimeUpdate(
    statusPageId: string,
    update: any
  ): Promise<void> {
    const redis = require("@/lib/redis");
    const channel = `status-page-updates:${statusPageId}`;

    await redis.publish(channel, JSON.stringify(update));
  }

  // ... Additional helper methods for database operations
}
```

### 4.2 Monitor Service Integration

```typescript
// worker/src/monitor/monitor.service.ts (modified)
import { Injectable, Logger } from "@nestjs/common";
import { StatusPageIncidentService } from "./services/status-page-incident.service";
import { MonitorResult } from "./types/monitor-result.type";

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private readonly statusPageIncidentService: StatusPageIncidentService
  ) // ... other dependencies
  {}

  /**
   * Save monitor result and trigger status page incident processing
   */
  async saveMonitorResult(monitorResult: MonitorResult): Promise<void> {
    // Existing logic to save monitor result
    await this.saveResultToDatabase(monitorResult);

    // Process status page incidents
    await this.statusPageIncidentService.processMonitorResult(monitorResult);

    // Continue with existing alert processing
    await this.processAlerts(monitorResult);
  }

  // ... rest of the existing MonitorService methods
}
```

## 5. Email Notification System

### 5.1 Email Service Extension

```typescript
// app/src/lib/email-service.ts (extended)
import { render } from "@react-email/render";
import { StatusPageIncidentEmail } from "@/emails/status-page-incident-email";
import { StatusPageResolvedEmail } from "@/emails/status-page-resolved-email";
import { StatusPageVerificationEmail } from "@/emails/status-page-verification-email";

export class EmailService {
  // ... existing methods

  /**
   * Send incident notification to subscribers
   */
  async sendIncidentNotification(
    to: string[],
    statusPage: any,
    incident: any,
    update?: any
  ): Promise<void> {
    const emailHtml = render(
      StatusPageIncidentEmail({
        statusPage,
        incident,
        update,
        unsubscribeUrl: this.generateUnsubscribeUrl(to[0], statusPage.id),
      })
    );

    await this.sendEmail({
      to,
      subject: `[${statusPage.name}] ${incident.title}`,
      html: emailHtml,
      text: this.generateIncidentTextEmail(statusPage, incident, update),
    });
  }

  /**
   * Send incident resolution notification
   */
  async sendIncidentResolutionNotification(
    to: string[],
    statusPage: any,
    incident: any,
    update: any
  ): Promise<void> {
    const emailHtml = render(
      StatusPageResolvedEmail({
        statusPage,
        incident,
        update,
        unsubscribeUrl: this.generateUnsubscribeUrl(to[0], statusPage.id),
      })
    );

    await this.sendEmail({
      to,
      subject: `[Resolved] ${statusPage.name} - ${incident.title}`,
      html: emailHtml,
      text: this.generateResolutionTextEmail(statusPage, incident, update),
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(
    to: string,
    statusPage: any,
    verificationToken: string
  ): Promise<void> {
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;

    const emailHtml = render(
      StatusPageVerificationEmail({
        statusPage,
        verificationUrl,
      })
    );

    await this.sendEmail({
      to,
      subject: `Verify your subscription to ${statusPage.name}`,
      html: emailHtml,
      text: `Please verify your subscription to ${statusPage.name} by visiting: ${verificationUrl}`,
    });
  }

  /**
   * Generate unsubscribe URL
   */
  private generateUnsubscribeUrl(email: string, statusPageId: string): string {
    const token = this.generateUnsubscribeToken(email, statusPageId);
    return `${process.env.APP_URL}/unsubscribe?token=${token}`;
  }

  /**
   * Generate unsubscribe token
   */
  private generateUnsubscribeToken(
    email: string,
    statusPageId: string
  ): string {
    const crypto = require("crypto");
    const payload = { email, statusPageId, timestamp: Date.now() };
    const token = crypto
      .createHash("sha256")
      .update(JSON.stringify(payload) + process.env.UNSUBSCRIBE_SECRET)
      .digest("hex");
    return token;
  }

  // ... other helper methods
}
```

### 5.2 Email Templates

```typescript
// app/emails/status-page-incident-email.tsx
import * as React from "react";
import { Html } from "@react-email/html";
import { Head } from "@react-email/head";
import { Body } from "@react-email/body";
import { Container } from "@react-email/container";
import { Section } from "@react-email/section";
import { Text } from "@react-email/text";
import { Button } from "@react-email/button";
import { Link } from "@react-email/link";

interface StatusPageIncidentEmailProps {
  statusPage: any;
  incident: any;
  update?: any;
  unsubscribeUrl: string;
}

export const StatusPageIncidentEmail: React.FC<
  StatusPageIncidentEmailProps
> = ({ statusPage, incident, update, unsubscribeUrl }) => {
  const branding = statusPage.brandingConfig || {};

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={title}>
              {branding.companyName || statusPage.name} Status Update
            </Text>
          </Section>

          <Section style={content}>
            <Text style={heading}>{incident.title}</Text>

            <Text style={text}>
              <strong>Status:</strong> {incident.status}
            </Text>

            <Text style={text}>
              <strong>Impact:</strong> {incident.impact}
            </Text>

            <Text style={text}>
              <strong>Started:</strong>{" "}
              {new Date(incident.startedAt).toLocaleString()}
            </Text>

            {update && (
              <div style={updateBox}>
                <Text style={updateTitle}>Latest Update</Text>
                <Text style={updateMessage}>{update.message}</Text>
                <Text style={updateTime}>
                  {new Date(update.displayAt).toLocaleString()}
                </Text>
              </div>
            )}

            <Button
              style={{
                ...button,
                backgroundColor: branding.primaryColor || "#10b981",
              }}
              href={`${process.env.APP_URL}/status/${statusPage.slug}`}
            >
              View Status Page
            </Button>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              You're receiving this email because you subscribed to updates for{" "}
              {statusPage.name}.
            </Text>
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Unsubscribe
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px",
  maxWidth: "600px",
  borderRadius: "8px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
};

const header = {
  borderBottom: "1px solid #e5e7eb",
  paddingBottom: "20px",
  marginBottom: "20px",
};

const title = {
  fontSize: "24px",
  fontWeight: "bold",
  margin: "0",
  color: "#1f2937",
};

const content = {
  marginBottom: "20px",
};

const heading = {
  fontSize: "20px",
  fontWeight: "bold",
  margin: "0 0 16px 0",
  color: "#1f2937",
};

const text = {
  fontSize: "16px",
  lineHeight: "1.5",
  margin: "0 0 16px 0",
  color: "#4b5563",
};

const updateBox = {
  backgroundColor: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0",
};

const updateTitle = {
  fontSize: "14px",
  fontWeight: "bold",
  margin: "0 0 8px 0",
  color: "#1f2937",
};

const updateMessage = {
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 8px 0",
  color: "#4b5563",
};

const updateTime = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0",
};

const button = {
  padding: "12px 24px",
  borderRadius: "6px",
  color: "#ffffff",
  textDecoration: "none",
  display: "inline-block",
  fontWeight: "bold",
};

const footer = {
  borderTop: "1px solid #e5e7eb",
  paddingTop: "20px",
  marginTop: "20px",
};

const footerText = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0 0 8px 0",
};

const unsubscribeLink = {
  fontSize: "12px",
  color: "#6b7280",
  textDecoration: "underline",
};
```

## 6. Security Implementation

### 6.1 Rate Limiting Configuration

```typescript
// app/src/lib/security/rate-limiting.ts
import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisClient } from "@/lib/redis";

// Create rate limiters for different endpoints
const statusPageApiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "status_page_api",
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
  blockDuration: 60, // Block for 60 seconds if limit exceeded
});

const publicStatusPageLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "public_status_page",
  points: 1000, // Higher limit for public pages
  duration: 60,
  blockDuration: 60,
});

const subscriptionLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "status_page_subscription",
  points: 5, // Limit subscription attempts
  duration: 300, // Per 5 minutes
  blockDuration: 900, // Block for 15 minutes
});

/**
 * Apply rate limiting to API requests
 */
export async function applyRateLimit(
  identifier: string,
  type: "api" | "public" | "subscription"
): Promise<void> {
  const limiter = {
    api: statusPageApiLimiter,
    public: publicStatusPageLimiter,
    subscription: subscriptionLimiter,
  }[type];

  try {
    await limiter.consume(identifier);
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    throw new Error(`Rate limit exceeded. Try again in ${secs} seconds.`);
  }
}
```

### 6.2 Input Validation and Sanitization

```typescript
// app/src/lib/validations/status-page.ts
import { z } from "zod";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Create a DOMPurify instance
const window = new JSDOM("").window;
const purify = DOMPurify(window);

/**
 * Sanitize user-generated content
 */
function sanitizeHtml(content: string): string {
  return purify.sanitize(content, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "a", "ul", "ol", "li"],
    ALLOWED_ATTR: ["href", "target"],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Sanitize custom CSS
 */
function sanitizeCSS(css: string): string {
  const dangerousPatterns = [
    /javascript:/gi,
    /expression\s*\(/gi,
    /import\s+/gi,
    /behavior\s*:/gi,
    /binding\s*:/gi,
  ];

  let sanitized = css;
  dangerousPatterns.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "");
  });

  return sanitized;
}

export const statusPageSchema = z.object({
  name: z.string().min(1).max(255).transform(sanitizeHtml),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, "Invalid slug format")
    .transform(sanitizeHtml),
  visibility: z.enum(["public", "private"]),
  settings: z.object({
    showUptimeGraphs: z.boolean().default(true),
    showIncidentHistory: z.boolean().default(true),
    enableSubscriptions: z.boolean().default(true),
    autoCreateIncidents: z.boolean().default(true),
  }),
  brandingConfig: z.object({
    companyName: z.string().max(255).optional().transform(sanitizeHtml),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    backgroundColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    textColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    customCSS: z.string().max(10000).optional().transform(sanitizeCSS),
  }),
});

export const incidentSchema = z.object({
  title: z.string().min(1).max(255).transform(sanitizeHtml),
  impact: z.enum(["minor", "major", "critical"]),
  status: z.enum(["investigating", "identified", "monitoring"]),
  message: z.string().min(1).max(2000).transform(sanitizeHtml),
});

export const componentSchema = z.object({
  name: z.string().min(1).max(255).transform(sanitizeHtml),
  description: z.string().max(1000).optional().transform(sanitizeHtml),
  monitorId: z.string().uuid().optional(),
});
```

## 7. Implementation Timeline

### Phase 1: Foundation & Database (Week 1)

#### Day 1: Database Schema & Migration

- Create migration file `0004_add_status_pages.sql`
- Implement all tables with proper constraints
- Add indexes for performance
- Set up RLS policies
- Test migration in development

#### Day 2: Core Data Models & Types

- Create TypeScript interfaces in `app/src/types/status-page.ts`
- Implement Zod validation schemas
- Create database service layer
- Set up error handling

#### Day 3: Basic API Endpoints

- Implement CRUD operations for status pages
- Add authentication and authorization
- Implement input validation
- Add error handling

#### Day 4: Component Management API

- Create component CRUD endpoints
- Implement monitor linking
- Add component ordering
- Test API endpoints

#### Day 5: Testing & Integration

- Write unit tests for all endpoints
- Test database operations
- Verify security policies
- Integration testing

### Phase 2: Core UI & Management (Week 2)

#### Day 6: Status Pages List & Dashboard

- Implement status pages list view
- Add data table with sorting/filtering
- Implement basic CRUD operations
- Add status page preview

#### Day 7: Status Page Editor

- Create status page creation/editing form
- Add basic settings configuration
- Implement branding options
- Add form validation

#### Day 8: Component Management UI

- Implement component management interface
- Add monitor linking functionality
- Implement drag-and-drop reordering
- Add component status display

#### Day 9: Incident Management UI

- Implement incident creation and management
- Add incident status tracking
- Implement incident updates
- Add incident history display

#### Day 10: UI Testing & Polish

- Write component tests
- Test user workflows
- Fix UI bugs
- Improve accessibility

### Phase 3: Public Status Pages & Automation (Week 3)

#### Day 11: Public Status Page Rendering

- Implement public status page routes
- Create responsive design
- Add real-time updates via SSE
- Implement caching

#### Day 12: Automated Incident Creation

- Implement monitor integration service
- Add automatic incident creation
- Implement incident resolution
- Add status mapping

#### Day 13: Email Notification System

- Implement email notification service
- Create email templates
- Add subscriber management
- Implement email verification

#### Day 14: Metrics & Uptime Calculation

- Implement metrics aggregation
- Add daily uptime calculation
- Create metrics storage
- Implement metrics API

#### Day 15: Integration Testing

- Test end-to-end workflows
- Verify monitor integration
- Test email notifications
- Performance testing

### Phase 4: Polish & Launch Preparation (Week 4)

#### Day 16: Advanced Features

- Implement custom domain support
- Add status page customization
- Implement subscriber management UI
- Add status page analytics

#### Day 17: Security & Performance

- Implement security best practices
- Add rate limiting
- Optimize database queries
- Implement caching

#### Day 18: Documentation & Guides

- Write user documentation
- Create developer guides
- Add API documentation
- Create troubleshooting guides

#### Day 19: Testing & QA

- Comprehensive testing
- Bug fixes and improvements
- User acceptance testing
- Performance testing

#### Day 20: Launch Preparation

- Prepare deployment scripts
- Create launch checklist
- Prepare monitoring
- Final code review

## 8. Success Metrics

### Technical Metrics

- API response time < 200ms
- Page load time < 1 second
- 99.9% uptime for status pages
- Email delivery rate > 98%

### User Metrics

- Time to create first status page < 5 minutes
- Successful incident creation rate > 95%
- User satisfaction score > 8/10
- Status page adoption rate > 80%

### Business Metrics

- Increased ARPU by $50-200/month
- Reduced churn by 40%
- 30% conversion from Starter to Professional
- 45% add-on revenue potential

## 9. Conclusion

This comprehensive implementation plan provides a detailed roadmap for adding enterprise-grade Status Pages functionality to Supercheck. The plan focuses on:

1. **Seamless Integration**: Leveraging existing monitoring infrastructure
2. **Automation**: Reducing manual incident management overhead
3. **Security**: Implementing enterprise-grade security measures
4. **Performance**: Ensuring fast, reliable status pages
5. **User Experience**: Creating intuitive, easy-to-use interfaces

The phased approach allows for iterative development and testing, reducing risks and ensuring a successful launch. The 4-week timeline is realistic and achievable with proper resource allocation and project management.

This feature will significantly enhance Supercheck's value proposition by providing customers with a complete incident communication solution, increasing customer satisfaction and reducing churn.
