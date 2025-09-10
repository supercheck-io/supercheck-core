import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorNotificationSettings } from "@/db/schema/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, hasPermission } from '@/lib/rbac/middleware';
import { requireProjectContext } from '@/lib/project-context';
import { createMonitorHandler, updateMonitorHandler } from "@/lib/monitor-service";
import { logAuditEvent } from "@/lib/audit-logger";

export async function GET(request: Request) {
  try {
    await requireAuth();
    
    // Get URL parameters for optional filtering and pagination
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const organizationId = url.searchParams.get('organizationId');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    
    // For backward compatibility, if no pagination params are provided, return all
    const usePagination = url.searchParams.has('page') || url.searchParams.has('limit');
    
    if (usePagination) {
      // Validate pagination parameters
      if (page < 1 || limit < 1) {
        return NextResponse.json({ 
          error: "Invalid pagination parameters. Page and limit must be >= 1" 
        }, { status: 400 });
      }
      
      const offset = (page - 1) * limit;
      
      // Build where condition
      const whereCondition = projectId && organizationId 
        ? and(
            eq(monitors.projectId, projectId),
            eq(monitors.organizationId, organizationId)
          )
        : undefined;
      
      // Get total count
      const countQuery = db.select({ count: monitors.id }).from(monitors);
      const totalResults = whereCondition 
        ? await countQuery.where(whereCondition)
        : await countQuery;
      const total = totalResults.length;
      
      // Get paginated results
      const baseQuery = db
        .select()
        .from(monitors)
        .orderBy(desc(monitors.createdAt))
        .limit(limit)
        .offset(offset);
      
      const monitorsList = whereCondition 
        ? await baseQuery.where(whereCondition)
        : await baseQuery;
      
      const totalPages = Math.ceil(total / limit);
      
      return NextResponse.json({
        data: monitorsList,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } else {
      // Original behavior for backward compatibility
      const baseQuery = db
        .select()
        .from(monitors);
      
      let monitorsList;
      if (projectId && organizationId) {
        monitorsList = await baseQuery
          .where(and(
            eq(monitors.projectId, projectId),
            eq(monitors.organizationId, organizationId)
          ))
          .orderBy(desc(monitors.createdAt));
      } else {
        monitorsList = await baseQuery.orderBy(desc(monitors.createdAt));
      }

      return NextResponse.json(monitorsList);
    }
  } catch (error) {
    console.error("Error fetching monitors:", error);
    return NextResponse.json({ error: "Failed to fetch monitors" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, project, organizationId } = await requireProjectContext();

    const rawData = await req.json();
    console.log("[MONITOR_CREATE] Raw data received:", rawData);
    
    // Special logging for heartbeat monitors
    if (rawData.type === "heartbeat") {
      console.log("[MONITOR_CREATE] Processing heartbeat monitor with config:", rawData.config);
    }

    // Validate required fields
    if (!rawData.name || !rawData.type) {
      return NextResponse.json({ 
        error: "Missing required fields", 
        details: "name and type are required" 
      }, { status: 400 });
    }

    // Validate target - all monitor types require a target except heartbeat (where it's auto-generated)
    if (rawData.type !== "heartbeat" && !rawData.target) {
      return NextResponse.json({ error: "Target is required for this monitor type" }, { status: 400 });
    }

    // Prepare alert configuration - ensure it's properly structured and saved to alertConfig column
    let alertConfig = null;
    if (rawData.alertConfig) {
      alertConfig = {
        enabled: Boolean(rawData.alertConfig.enabled),
        notificationProviders: Array.isArray(rawData.alertConfig.notificationProviders) 
          ? rawData.alertConfig.notificationProviders 
          : [],
        alertOnFailure: rawData.alertConfig.alertOnFailure !== undefined 
          ? Boolean(rawData.alertConfig.alertOnFailure) 
          : true,
        alertOnRecovery: rawData.alertConfig.alertOnRecovery !== undefined 
          ? Boolean(rawData.alertConfig.alertOnRecovery) 
          : true,
        alertOnSslExpiration: rawData.alertConfig.alertOnSslExpiration !== undefined 
          ? Boolean(rawData.alertConfig.alertOnSslExpiration) 
          : false,
        failureThreshold: typeof rawData.alertConfig.failureThreshold === 'number' 
          ? rawData.alertConfig.failureThreshold 
          : 1,
        recoveryThreshold: typeof rawData.alertConfig.recoveryThreshold === 'number' 
          ? rawData.alertConfig.recoveryThreshold 
          : 1,
        customMessage: typeof rawData.alertConfig.customMessage === 'string' 
          ? rawData.alertConfig.customMessage 
          : "",
      };
      console.log("[MONITOR_CREATE] Processed alert config:", alertConfig);
    }

    // Construct the config object (for monitor-specific settings, not alerts)
    const finalConfig = rawData.config || {};
    console.log("[MONITOR_CREATE] Final config:", finalConfig);

    // Use current project context
    const targetProjectId = project.id;
    
    // Check permission to create monitors
    const canCreate = await hasPermission('monitor', 'create', { organizationId, projectId: targetProjectId });
    
    if (!canCreate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create monitors' },
        { status: 403 }
      );
    }

    // Use the monitor service to create the monitor
    const monitorData = {
      name: rawData.name,
      description: rawData.description,
      type: rawData.type,
      target: rawData.target,
      frequencyMinutes: rawData.frequencyMinutes || 5,
      enabled: rawData.enabled !== false, // Default to true
      config: finalConfig,
      alertConfig: alertConfig,
      createdByUserId: userId,
      projectId: targetProjectId,
      organizationId: organizationId,
    };

    // Validate alert configuration if enabled
    if (alertConfig?.enabled) {
      // Check if at least one notification provider is selected
      if (!alertConfig.notificationProviders || alertConfig.notificationProviders.length === 0) {
        return NextResponse.json(
          { error: "At least one notification channel must be selected when alerts are enabled" },
          { status: 400 }
        );
      }

      // Check notification channel limit
      const maxMonitorChannels = parseInt(process.env.NEXT_PUBLIC_MAX_MONITOR_NOTIFICATION_CHANNELS || '10', 10);
      if (alertConfig.notificationProviders.length > maxMonitorChannels) {
        return NextResponse.json(
          { error: `You can only select up to ${maxMonitorChannels} notification channels` },
          { status: 400 }
        );
      }

      // Check if at least one alert type is selected
      const alertTypesSelected = [
        alertConfig.alertOnFailure,
        alertConfig.alertOnRecovery,
        alertConfig.alertOnSslExpiration
      ].some(Boolean);

      if (!alertTypesSelected) {
        return NextResponse.json(
          { error: "At least one alert type must be selected when alerts are enabled" },
          { status: 400 }
        );
      }
    }

    const newMonitor = await createMonitorHandler(monitorData);

    // Link notification providers if alert config is enabled
    if (newMonitor && alertConfig?.enabled && Array.isArray(alertConfig.notificationProviders)) {
      console.log("[MONITOR_CREATE] Linking notification providers:", alertConfig.notificationProviders);
      
      const providerLinks = await Promise.allSettled(
        alertConfig.notificationProviders.map(providerId =>
          db.insert(monitorNotificationSettings).values({
            monitorId: newMonitor.id,
            notificationProviderId: providerId,
          })
        )
      );

      const successfulLinks = providerLinks.filter(result => result.status === 'fulfilled').length;
      const failedLinks = providerLinks.filter(result => result.status === 'rejected').length;
      
      console.log(`[MONITOR_CREATE] Notification provider links: ${successfulLinks} successful, ${failedLinks} failed`);
      
      if (failedLinks > 0) {
        console.warn("[MONITOR_CREATE] Some notification provider links failed:", 
          providerLinks.filter(result => result.status === 'rejected')
        );
      }
    }

    // Log the audit event for monitor creation
    await logAuditEvent({
      userId,
      organizationId,
      action: 'monitor_created',
      resource: 'monitor',
      resourceId: newMonitor.id,
      metadata: {
        monitorName: monitorData.name,
        monitorType: monitorData.type,
        target: monitorData.target,
        frequencyMinutes: monitorData.frequencyMinutes,
        projectId: project.id,
        projectName: project.name,
        alertsEnabled: alertConfig?.enabled || false,
        notificationProvidersCount: alertConfig?.notificationProviders?.length || 0
      },
      success: true
    });

    console.log("[MONITOR_CREATE] Successfully created monitor:", newMonitor.id);
    return NextResponse.json(newMonitor, { status: 201 });
  } catch (error) {
    console.error("[MONITOR_CREATE] Error creating monitor:", error);
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId, project, organizationId } = await requireProjectContext();

    const rawData = await req.json();
    const { id, ...updateData } = rawData;
    
    if (!id) {
      return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
    }
    
    // Verify monitor belongs to current project context
    const monitorData = await db
      .select({ projectId: monitors.projectId, organizationId: monitors.organizationId })
      .from(monitors)
      .where(and(
        eq(monitors.id, id),
        eq(monitors.projectId, project.id),
        eq(monitors.organizationId, organizationId)
      ))
      .limit(1);
    
    if (monitorData.length === 0) {
      return NextResponse.json(
        { error: 'Monitor not found or access denied' },
        { status: 404 }
      );
    }
    
    // Check permission to manage monitors
    const canManage = await hasPermission('monitor', 'manage', { organizationId, projectId: project.id });
    
    if (!canManage) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update monitors' },
        { status: 403 }
      );
    }

    // Prepare alert configuration - ensure it's properly structured
    let alertConfig = null;
    if (rawData.alertConfig) {
      alertConfig = {
        enabled: Boolean(rawData.alertConfig.enabled),
        notificationProviders: Array.isArray(rawData.alertConfig.notificationProviders) 
          ? rawData.alertConfig.notificationProviders 
          : [],
        alertOnFailure: rawData.alertConfig.alertOnFailure !== undefined 
          ? Boolean(rawData.alertConfig.alertOnFailure) 
          : true,
        alertOnRecovery: rawData.alertConfig.alertOnRecovery !== undefined 
          ? Boolean(rawData.alertConfig.alertOnRecovery) 
          : true,
        alertOnSslExpiration: rawData.alertConfig.alertOnSslExpiration !== undefined 
          ? Boolean(rawData.alertConfig.alertOnSslExpiration) 
          : false,
        failureThreshold: typeof rawData.alertConfig.failureThreshold === 'number' 
          ? rawData.alertConfig.failureThreshold 
          : 1,
        recoveryThreshold: typeof rawData.alertConfig.recoveryThreshold === 'number' 
          ? rawData.alertConfig.recoveryThreshold 
          : 1,
        customMessage: typeof rawData.alertConfig.customMessage === 'string' 
          ? rawData.alertConfig.customMessage 
          : "",
      };
    }

    // Use the monitor service to update the monitor
    const monitorUpdateData = {
      name: updateData.name,
      description: updateData.description,
      type: updateData.type,
      target: updateData.target,
      frequencyMinutes: updateData.frequencyMinutes,
      enabled: updateData.enabled,
      config: updateData.config,
      alertConfig: alertConfig,
    };

    // Validate alert configuration if enabled
    if (alertConfig?.enabled) {
      // Check if at least one notification provider is selected
      if (!alertConfig.notificationProviders || alertConfig.notificationProviders.length === 0) {
        return NextResponse.json(
          { error: "At least one notification channel must be selected when alerts are enabled" },
          { status: 400 }
        );
      }

      // Check notification channel limit
      const maxMonitorChannels = parseInt(process.env.NEXT_PUBLIC_MAX_MONITOR_NOTIFICATION_CHANNELS || '10', 10);
      if (alertConfig.notificationProviders.length > maxMonitorChannels) {
        return NextResponse.json(
          { error: `You can only select up to ${maxMonitorChannels} notification channels` },
          { status: 400 }
        );
      }

      // Check if at least one alert type is selected
      const alertTypesSelected = [
        alertConfig.alertOnFailure,
        alertConfig.alertOnRecovery,
        alertConfig.alertOnSslExpiration
      ].some(Boolean);

      if (!alertTypesSelected) {
        return NextResponse.json(
          { error: "At least one alert type must be selected when alerts are enabled" },
          { status: 400 }
        );
      }
    }

    const updatedMonitor = await updateMonitorHandler(id, monitorUpdateData);

    // Update notification provider links if alert config is enabled
    if (updatedMonitor && alertConfig?.enabled && Array.isArray(alertConfig.notificationProviders)) {
      // First, delete existing links
      await db.delete(monitorNotificationSettings).where(eq(monitorNotificationSettings.monitorId, id));
      
      // Then, create new links
      await Promise.all(
        alertConfig.notificationProviders.map(providerId =>
          db.insert(monitorNotificationSettings).values({
            monitorId: id,
            notificationProviderId: providerId,
          })
        )
      );
    }

    // Log the audit event for monitor update
    await logAuditEvent({
      userId,
      organizationId,
      action: 'monitor_updated',
      resource: 'monitor',
      resourceId: id,
      metadata: {
        monitorName: monitorUpdateData.name,
        monitorType: monitorUpdateData.type,
        target: monitorUpdateData.target,
        frequencyMinutes: monitorUpdateData.frequencyMinutes,
        enabled: monitorUpdateData.enabled,
        projectId: project.id,
        projectName: project.name,
        alertsEnabled: alertConfig?.enabled || false,
        notificationProvidersCount: alertConfig?.notificationProviders?.length || 0
      },
      success: true
    });

    return NextResponse.json(updatedMonitor);
  } catch (error) {
    console.error("Error updating monitor:", error);
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
} 