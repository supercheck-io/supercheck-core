import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notificationProviders, notificationProvidersInsertSchema } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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

    return NextResponse.json(provider);
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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
        type: updateData.type,
        config: updateData.config,
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification provider:", error);
    return NextResponse.json(
      { error: "Failed to delete notification provider" },
      { status: 500 }
    );
  }
} 