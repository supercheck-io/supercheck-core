import { NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { runs } from '@/db/schema/schema';

export async function GET() {
  try {
    const runsList = await db
      .select({
        id: runs.id,
        status: runs.status,
        artifactPaths: runs.artifactPaths,
        errorDetails: runs.errorDetails,
        logs: runs.logs,
        startedAt: runs.startedAt,
        completedAt: runs.completedAt
      })
      .from(runs)
      .limit(10);
    
    return NextResponse.json({
      success: true,
      runs: runsList,
      count: runsList.length
    });
  } catch (error) {
    console.error('Debug runs error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch runs' },
      { status: 500 }
    );
  }
}