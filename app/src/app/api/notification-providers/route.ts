import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { notificationProviders, notificationProvidersInsertSchema, alertHistory } from "@/db/schema/schema";
import { desc, sql } from "drizzle-orm";

export async function GET() {
  try {
    const providers = await db.query.notificationProviders.findMany({
      orderBy: [desc(notificationProviders.createdAt)],
    });

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
    const rawData = await req.json();
    const validationResult = notificationProvidersInsertSchema.safeParse(rawData);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const newProviderData = validationResult.data;

    const [insertedProvider] = await db
      .insert(notificationProviders)
      .values({
        type: newProviderData.type!,
        config: newProviderData.config!,
        organizationId: newProviderData.organizationId,
        createdByUserId: newProviderData.createdByUserId,
      })
      .returning();

    return NextResponse.json(insertedProvider, { status: 201 });
  } catch (error) {
    console.error("Error creating notification provider:", error);
    return NextResponse.json(
      { error: "Failed to create notification provider" },
      { status: 500 }
    );
  }
} 