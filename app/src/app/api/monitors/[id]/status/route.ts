import { NextRequest, NextResponse } from "next/server";
import { mockMonitors } from "../../mock-data";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const data = await request.json();
    const { status } = data;

    if (!status || !["up", "down", "paused"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value. Must be 'up', 'down', or 'paused'." },
        { status: 400 }
      );
    }

    // Find monitor with matching ID (in a real app, this would query/update a database)
    const monitorIndex = mockMonitors.findIndex((monitor) => monitor.id === id);

    if (monitorIndex === -1) {
      return NextResponse.json(
        { error: "Monitor not found" },
        { status: 404 }
      );
    }

    // In a real app, this would update the database
    // For now, just return success
    return NextResponse.json({ 
      success: true,
      id,
      status,
    });
    
  } catch (error) {
    console.error("Error updating monitor status:", error);
    return NextResponse.json(
      { error: "Failed to update monitor status" },
      { status: 400 }
    );
  }
} 