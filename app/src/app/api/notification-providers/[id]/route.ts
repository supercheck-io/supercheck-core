import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { 
  notificationProviders, 
  notificationProvidersInsertSchema,
  monitorNotificationSettings,
  jobNotificationSettings,
  alertHistory
} from "@/db/schema/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const [provider] = await db
      .select()
      .from(notificationProviders)
      .where(eq(notificationProviders.id, id));

    if (!provider) {
      return NextResponse.json(
        { error: "Notification provider not found" },
        { status: 404 }
      );
    }

    // Get last used information from alert history
    const lastAlert = await db
      .select({ sentAt: alertHistory.sentAt })
      .from(alertHistory)
      .where(
        // Use LIKE to find provider type within comma-separated list
        sql`${alertHistory.provider} LIKE ${'%' + provider.type + '%'}`
      )
      .orderBy(desc(alertHistory.sentAt))
      .limit(1);

    const enhancedProvider = {
      ...provider,
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
    const rawData = await req.json();
    const validationResult = notificationProvidersInsertSchema.safeParse(rawData);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    const [updatedProvider] = await db
      .update(notificationProviders)
      .set({
        type: updateData.type!,
        config: updateData.config!,
        updatedAt: new Date(),
      })
      .where(eq(notificationProviders.id, id))
      .returning();

    if (!updatedProvider) {
      return NextResponse.json(
        { error: "Notification provider not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedProvider);
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

    // Check if provider is in use by any monitors or jobs
    const [monitorUsage, jobUsage] = await Promise.all([
      db
        .select({ count: monitorNotificationSettings.monitorId })
        .from(monitorNotificationSettings)
        .where(eq(monitorNotificationSettings.notificationProviderId, id)),
      db
        .select({ count: jobNotificationSettings.jobId })
        .from(jobNotificationSettings)
        .where(eq(jobNotificationSettings.notificationProviderId, id))
    ]);

    if (monitorUsage.length > 0 || jobUsage.length > 0) {
      return NextResponse.json(
        { 
          error: "Cannot delete notification provider",
          details: `This provider is currently used by ${monitorUsage.length} monitor(s) and ${jobUsage.length} job(s). Please remove it from all monitors and jobs before deleting.`
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
      message: "Notification provider deleted successfully" 
    });
  } catch (error) {
    console.error("Error deleting notification provider:", error);
    return NextResponse.json(
      { error: "Failed to delete notification provider" },
      { status: 500 }
    );
  }
} 