import { NextRequest, NextResponse } from "next/server";
import { db as getDbInstance } from "@/lib/db";
import { notificationProviders, notificationProvidersInsertSchema } from "@/db/schema/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const db = await getDbInstance();

    const providers = await db.query.notificationProviders.findMany({
      orderBy: [desc(notificationProviders.createdAt)],
    });

    return NextResponse.json(providers);
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
    const db = await getDbInstance();

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