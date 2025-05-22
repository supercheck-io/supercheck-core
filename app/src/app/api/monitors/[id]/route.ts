import { NextRequest, NextResponse } from "next/server";
import { mockMonitors } from "../../monitors/mock-data";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Find monitor with matching ID (in a real app, this would query a database)
  const monitor = mockMonitors.find((monitor) => monitor.id === id);

  if (!monitor) {
    return NextResponse.json(
      { error: "Monitor not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(monitor);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const data = await request.json();

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
    });
    
  } catch (error) {
    console.error("Error updating monitor:", error);
    return NextResponse.json(
      { error: "Failed to update monitor" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Find monitor with matching ID (in a real app, this would query/delete from a database)
  const monitorIndex = mockMonitors.findIndex((monitor) => monitor.id === id);

  if (monitorIndex === -1) {
    return NextResponse.json(
      { error: "Monitor not found" },
      { status: 404 }
    );
  }

  // In a real app, this would delete from the database
  // For now, just return success
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const data = await request.json();

    // Find monitor with matching ID (in a real app, this would query/update a database)
    const monitorIndex = mockMonitors.findIndex((monitor) => monitor.id === id);

    if (monitorIndex === -1) {
      return NextResponse.json(
        { error: "Monitor not found" },
        { status: 404 }
      );
    }

    // In a real app, this would update the database
    // For partial updates (like status changes)
    return NextResponse.json({ 
      success: true,
      id,
    });
    
  } catch (error) {
    console.error("Error updating monitor status:", error);
    return NextResponse.json(
      { error: "Failed to update monitor status" },
      { status: 400 }
    );
  }
} 