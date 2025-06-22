import { NextResponse } from 'next/server';
import { db } from "@/lib/db";
import { runs, reports } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

// Enable CORS for all origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// Options handler for CORS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Delete run handler
export async function DELETE(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const params = await context.params;
  try {
    const runId = params.runId;
    console.log(`Attempting to delete run with ID: ${runId}`);
    
    if (!runId) {
      console.error('Missing run ID');
      return NextResponse.json(
        { success: false, error: "Missing run ID" },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const dbInstance = await db();
    
    // First check if the run exists
    const existingRun = await dbInstance
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
      
    if (!existingRun.length) {
      console.error(`Run with ID ${runId} not found`);
      return NextResponse.json(
        { success: false, error: "Run not found" },
        { 
          status: 404,
          headers: corsHeaders,
        }
      );
    }
    
    console.log(`Deleting reports for run: ${runId}`);
    // First delete any associated reports
    await dbInstance
      .delete(reports)
      .where(
        eq(reports.entityId, runId)
      );
    
    console.log(`Deleting run: ${runId}`);
    // Then delete the run itself
    await dbInstance
      .delete(runs)
      .where(
        eq(runs.id, runId)
      );
    
    console.log(`Successfully deleted run: ${runId}`);
    return NextResponse.json(
      { success: true },
      { 
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error deleting run: ${errorMessage}`, error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
} 