import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;

  try {
    const data = await request.json();
    const { status } = data;

    if (!status || !["up", "down", "paused", "pending", "maintenance", "error"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value. Must be 'up', 'down', 'paused', 'pending', 'maintenance', or 'error'." },
        { status: 400 }
      );
    }

    // Update the monitor status in the database
    const [updatedMonitor] = await db
      .update(monitors)
      .set({
        status: status,
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, id))
      .returning();

    if (!updatedMonitor) {
      return NextResponse.json(
        { error: "Monitor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true,
      id,
      status: updatedMonitor.status,
      updatedAt: updatedMonitor.updatedAt,
    });
    
  } catch (error) {
    console.error("Error updating monitor status:", error);
    return NextResponse.json(
      { error: "Failed to update monitor status" },
      { status: 500 }
    );
  }
} 