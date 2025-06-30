import { NextResponse, NextRequest } from "next/server";
import { db } from "@/utils/db";
import { alertHistory } from "@/db/schema/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const dbInstance = await db();
    
    // Fetch real alert history from database
    const history = await dbInstance
      .select({
        id: alertHistory.id,
        targetType: alertHistory.targetType,
        monitorId: alertHistory.monitorId,
        jobId: alertHistory.jobId,
        targetName: alertHistory.target,
        type: alertHistory.type,
        message: alertHistory.message,
        status: alertHistory.status,
        timestamp: alertHistory.sentAt,
        notificationProvider: alertHistory.provider,
        errorMessage: alertHistory.errorMessage,
      })
      .from(alertHistory)
      .orderBy(desc(alertHistory.sentAt))
      .limit(100);

    // Transform the data to match the expected format
    const transformedHistory = history.map(item => ({
      id: item.id,
      targetType: item.targetType,
      targetId: item.monitorId || item.jobId || '',
      targetName: item.targetName || 'Unknown',
      type: item.type,
      title: item.message,
      message: item.message,
      status: item.status,
      severity: item.type?.includes('failure') || item.type?.includes('failed') ? 'error' : 
               item.type?.includes('recovery') || item.type?.includes('success') ? 'success' : 
               item.type?.includes('timeout') || item.type?.includes('ssl_expiring') ? 'warning' : 'info',
      timestamp: item.timestamp,
      notificationProvider: item.notificationProvider,
      metadata: {
        errorMessage: item.errorMessage,
      },
    }));

    return NextResponse.json(transformedHistory);
  } catch (error) {
    console.error("Error fetching alert history:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert history" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const dbInstance = await db();
    
    // Validate required fields
    if (!body.type || !body.message || !body.target || !body.targetType || !body.provider) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate target type
    if (!['monitor', 'job'].includes(body.targetType)) {
      return NextResponse.json(
        { error: "Invalid target type" },
        { status: 400 }
      );
    }

    // Validate status
    if (!['sent', 'failed', 'pending'].includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Validate alert type
    const validAlertTypes = [
      'monitor_failure',
      'monitor_recovery',
      'job_failed',
      'job_success',
      'job_timeout',
      'ssl_expiring'
    ];
    if (!validAlertTypes.includes(body.type)) {
      return NextResponse.json(
        { error: "Invalid alert type" },
        { status: 400 }
      );
    }

    // Insert new alert history entry
    const [result] = await dbInstance
      .insert(alertHistory)
      .values({
        type: body.type,
        message: body.message,
        target: body.target,
        targetType: body.targetType,
        monitorId: body.monitorId || null,
        jobId: body.jobId || null,
        provider: body.provider,
        status: body.status,
        errorMessage: body.errorMessage || null,
        sentAt: new Date(),
      })
      .returning();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving alert history:", error);
    return NextResponse.json(
      { error: "Failed to save alert history" },
      { status: 500 }
    );
  }
} 