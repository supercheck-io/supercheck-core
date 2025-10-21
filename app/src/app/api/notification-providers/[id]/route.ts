import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import {
  notificationProviders,
  notificationProvidersInsertSchema,
  monitorNotificationSettings,
  jobNotificationSettings,
  alertHistory,
  type PlainNotificationProviderConfig,
} from "@/db/schema/schema";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac/middleware";
import { requireProjectContext } from "@/lib/project-context";
import { decryptNotificationProviderConfig, encryptNotificationProviderConfig, sanitizeConfigForClient } from "@/lib/notification-providers/crypto";
import { validateProviderConfig } from "@/lib/notification-providers/validation";
import type { NotificationProviderType } from "@/db/schema/schema";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { project, organizationId } = await requireProjectContext();
    
    // Check permission to view notification providers
    const canView = await hasPermission('monitor', 'view', {
      organizationId,
      projectId: project.id
    });
    
    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const [provider] = await db
      .select()
      .from(notificationProviders)
      .where(and(
        eq(notificationProviders.id, id),
        eq(notificationProviders.organizationId, organizationId),
        eq(notificationProviders.projectId, project.id)
      ));

    if (!provider) {
      return NextResponse.json(
        { error: "Notification provider not found" },
        { status: 404 }
      );
    }

    const decryptedConfig = decryptNotificationProviderConfig(
      provider.config,
      provider.projectId ?? undefined
    );
    const { sanitizedConfig, maskedFields } = sanitizeConfigForClient(
      provider.type as NotificationProviderType,
      decryptedConfig
    );

    // Get last used information from alert history
    const lastAlert = await db
      .select({ sentAt: alertHistory.sentAt })
      .from(alertHistory)
      .where(sql`alert_history.provider = ${provider.id}::text`)
      .orderBy(desc(alertHistory.sentAt))
      .limit(1);

    const enhancedProvider = {
      ...provider,
      config: sanitizedConfig,
      maskedFields,
      lastUsed: lastAlert[0]?.sentAt || null,
    };

    return NextResponse.json(enhancedProvider);
  } catch (error) {
    console.error("Error fetching notification provider:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification provider" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { userId, project, organizationId } = await requireProjectContext();

    const canUpdate = await hasPermission("monitor", "update", {
      organizationId,
      projectId: project.id,
    });

    if (!canUpdate) {
      return NextResponse.json(
        { error: "Insufficient permissions to update notification providers" },
        { status: 403 }
      );
    }

    const [existingProvider] = await db
      .select()
      .from(notificationProviders)
      .where(
        and(
          eq(notificationProviders.id, id),
          eq(notificationProviders.organizationId, organizationId),
          eq(notificationProviders.projectId, project.id)
        )
      );

    if (!existingProvider) {
      return NextResponse.json(
        { error: "Notification provider not found" },
        { status: 404 }
      );
    }

    const rawData = await req.json();
    const transformedData = {
      ...rawData,
      organizationId,
      projectId: project.id,
      createdByUserId: existingProvider.createdByUserId ?? userId,
    };

    const validationResult =
      notificationProvidersInsertSchema.safeParse(transformedData);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    const plainConfig = (updateData.config ??
      {}) as Record<string, unknown>;

    try {
      validateProviderConfig(
        updateData.type as NotificationProviderType,
        plainConfig
      );
    } catch (validationError) {
      return NextResponse.json(
        {
          error:
            validationError instanceof Error
              ? validationError.message
              : "Invalid notification provider configuration",
        },
        { status: 400 }
      );
    }

    const encryptedConfig = encryptNotificationProviderConfig(
      plainConfig as PlainNotificationProviderConfig,
      project.id
    );

    const [updatedProvider] = await db
      .update(notificationProviders)
      .set({
        name: updateData.name!,
        type: updateData.type!,
        config: encryptedConfig,
        updatedAt: new Date(),
      })
      .where(eq(notificationProviders.id, id))
      .returning();

    const decryptedConfig = decryptNotificationProviderConfig(
      updatedProvider.config,
      project.id
    );
    const { sanitizedConfig, maskedFields } = sanitizeConfigForClient(
      updatedProvider.type as NotificationProviderType,
      decryptedConfig
    );

    return NextResponse.json({
      ...updatedProvider,
      config: sanitizedConfig,
      maskedFields,
    });
  } catch (error) {
    console.error("Error updating notification provider:", error);
    return NextResponse.json(
      { error: "Failed to update notification provider" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { project, organizationId } = await requireProjectContext();

    const canDelete = await hasPermission("monitor", "delete", {
      organizationId,
      projectId: project.id,
    });

    if (!canDelete) {
      return NextResponse.json(
        { error: "Insufficient permissions to delete notification providers" },
        { status: 403 }
      );
    }

    const [existingProvider] = await db
      .select()
      .from(notificationProviders)
      .where(
        and(
          eq(notificationProviders.id, id),
          eq(notificationProviders.organizationId, organizationId),
          eq(notificationProviders.projectId, project.id)
        )
      );

    if (!existingProvider) {
      return NextResponse.json(
        { error: "Notification provider not found" },
        { status: 404 }
      );
    }

    // Check if provider is in use by any monitors or jobs
    const [monitorUsage, jobUsage] = await Promise.all([
      db
        .select({ usageCount: count() })
        .from(monitorNotificationSettings)
        .where(eq(monitorNotificationSettings.notificationProviderId, id)),
      db
        .select({ usageCount: count() })
        .from(jobNotificationSettings)
        .where(eq(jobNotificationSettings.notificationProviderId, id)),
    ]);

    const monitorUsageCount = monitorUsage[0]?.usageCount ?? 0;
    const jobUsageCount = jobUsage[0]?.usageCount ?? 0;

    if (monitorUsageCount > 0 || jobUsageCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete notification provider",
          details: `This provider is currently used by ${monitorUsageCount} monitor(s) and ${jobUsageCount} job(s). Please remove it from all monitors and jobs before deleting.`,
        },
        { status: 400 }
      );
    }

    const [deletedProvider] = await db
      .delete(notificationProviders)
      .where(eq(notificationProviders.id, id))
      .returning();

    if (!deletedProvider) {
      return NextResponse.json(
        { error: "Notification provider not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification provider deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification provider:", error);
    return NextResponse.json(
      { error: "Failed to delete notification provider" },
      { status: 500 }
    );
  }
} 
