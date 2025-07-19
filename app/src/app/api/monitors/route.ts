import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorNotificationSettings } from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/utils/auth";
import { headers } from "next/headers";
import { createMonitorHandler, updateMonitorHandler, deleteMonitorHandler } from "@/lib/monitor-service";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const monitorsList = await db
      .select()
      .from(monitors)
      .where(eq(monitors.createdByUserId, session.user.id))
      .orderBy(desc(monitors.createdAt));

    return NextResponse.json(monitorsList);
  } catch (error) {
    console.error("Error fetching monitors:", error);
    return NextResponse.json({ error: "Failed to fetch monitors" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawData = await req.json();
    console.log("[MONITOR_CREATE] Raw data received:", rawData);

    // Validate required fields
    if (!rawData.name || !rawData.type || !rawData.target) {
      return NextResponse.json({ 
        error: "Missing required fields", 
        details: "name, type, and target are required" 
      }, { status: 400 });
    }

    // Validate target - all monitor types require a target
    if (!rawData.target) {
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
      createdByUserId: session.user.id,
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

    console.log("[MONITOR_CREATE] Successfully created monitor:", newMonitor.id);
    return NextResponse.json(newMonitor, { status: 201 });
  } catch (error) {
    console.error("[MONITOR_CREATE] Error creating monitor:", error);
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawData = await req.json();
    const { id, ...updateData } = rawData;
    
    if (!id) {
      return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
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

    return NextResponse.json(updatedMonitor);
  } catch (error) {
    console.error("Error updating monitor:", error);
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
} 