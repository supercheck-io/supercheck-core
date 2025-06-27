import { NextResponse } from "next/server";
import { sampleAlertHistory } from "@/components/alerts/data";

export async function GET() {
  try {
    // For now, return sample data to demonstrate the table
    // TODO: Replace with actual database query when alert system is fully implemented
    const history = sampleAlertHistory;

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching alert history:", error);
    return NextResponse.json(
      { error: "Failed to fetch alert history" },
      { status: 500 }
    );
  }
} 