import { NextRequest, NextResponse } from "next/server";
import { alertService } from "@/lib/alert-service";

export async function POST(req: NextRequest) {
  try {
    const alertContext = await req.json();
    
    // Validate required fields
    if (!alertContext.monitorId || !alertContext.status) {
      return NextResponse.json(
        { error: "Missing required fields: monitorId, status" },
        { status: 400 }
      );
    }

    // Process the alert
    await alertService.processMonitorAlert(alertContext);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing alert:", error);
    return NextResponse.json(
      { error: "Failed to process alert" },
      { status: 500 }
    );
  }
} 