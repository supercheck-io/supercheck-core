import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { notificationProviders, notificationProvidersInsertSchema, alertHistory } from "@/db/schema/schema";
import { desc, sql, eq, and } from "drizzle-orm";
import { buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { ProjectPermission } from '@/lib/rbac/permissions';
import { requireProjectContext } from '@/lib/project-context';
import { logAuditEvent } from '@/lib/audit-logger';

export async function GET() {
  try {
    const { userId, project, organizationId } = await requireProjectContext();
    
    // Use current project and organization context
    const targetProjectId = project.id;
    const targetOrganizationId = organizationId;
    
    // Build permission context and check access
    const context = await buildPermissionContext(userId, 'project', targetOrganizationId, targetProjectId);
    const canView = await hasPermission(context, ProjectPermission.VIEW_MONITORS);
    
    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get notification providers scoped to the project
    const providers = await db
      .select()
      .from(notificationProviders)
      .where(and(
        eq(notificationProviders.organizationId, targetOrganizationId),
        eq(notificationProviders.projectId, targetProjectId)
      ))
      .orderBy(desc(notificationProviders.createdAt));

    // Enhance providers with last used information
    const enhancedProviders = await Promise.all(
      providers.map(async (provider) => {
        // Check for both exact match and partial match since alert history stores joined provider types
        const lastAlert = await db
          .select({ sentAt: alertHistory.sentAt })
          .from(alertHistory)
          .where(
            // Use LIKE to find provider type within comma-separated list
            sql`${alertHistory.provider} LIKE ${'%' + provider.type + '%'}`
          )
          .orderBy(desc(alertHistory.sentAt))
          .limit(1);

        return {
          ...provider,
          lastUsed: lastAlert[0]?.sentAt || null,
        };
      })
    );

    return NextResponse.json(enhancedProviders);
  } catch (error) {
    console.error("Error fetching notification providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification providers" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, project, organizationId } = await requireProjectContext();

    const rawData = await req.json();
    
    // Use current project and organization context
    const targetProjectId = project.id;
    const targetOrganizationId = organizationId;
    
    // Build permission context and check access
    const context = await buildPermissionContext(userId, 'project', targetOrganizationId, targetProjectId);
    const canCreate = await hasPermission(context, ProjectPermission.CREATE_MONITORS);
    
    if (!canCreate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create notification providers' },
        { status: 403 }
      );
    }
    
    // Transform the data to match the database schema
    // The frontend sends { type, config } but the database expects { name, type, config, organizationId, projectId, createdByUserId }
    const transformedData = {
      name: rawData.config?.name || "Unnamed Provider",
      type: rawData.type,
      config: rawData.config,
      organizationId: targetOrganizationId,
      projectId: targetProjectId,
      createdByUserId: userId,
    };

    const validationResult = notificationProvidersInsertSchema.safeParse(transformedData);

    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error.format());
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const newProviderData = validationResult.data;

    const [insertedProvider] = await db
      .insert(notificationProviders)
      .values({
        name: newProviderData.name!,
        type: newProviderData.type!,
        config: newProviderData.config!,
        organizationId: newProviderData.organizationId,
        projectId: newProviderData.projectId,
        createdByUserId: newProviderData.createdByUserId,
      })
      .returning();

    // Log the audit event for notification provider creation
    await logAuditEvent({
      userId,
      organizationId,
      action: 'notification_provider_created',
      resource: 'notification_provider',
      resourceId: insertedProvider.id,
      metadata: {
        providerName: insertedProvider.name,
        providerType: insertedProvider.type,
        projectId: project.id,
        projectName: project.name
      },
      success: true
    });

    return NextResponse.json(insertedProvider, { status: 201 });
  } catch (error) {
    console.error("Error creating notification provider:", error);
    return NextResponse.json(
      { error: "Failed to create notification provider" },
      { status: 500 }
    );
  }
} 