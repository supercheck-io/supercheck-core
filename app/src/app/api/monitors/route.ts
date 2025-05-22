import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mockMonitors } from "./mock-data";

export async function GET(req: NextRequest) {
  // In a real implementation, this would fetch from the database
  return NextResponse.json(mockMonitors);
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    // In a real implementation, this would save to the database
    // For now, just return a mock successful response with a proper UUID
    return NextResponse.json({ 
      success: true, 
      id: randomUUID()
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: "Failed to create monitor" 
    }, { status: 400 });
  }
} 