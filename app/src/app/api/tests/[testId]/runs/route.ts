import { NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { reports } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export async function GET(request: Request) {
  // Extract testId from the URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const testId = pathParts[pathParts.length - 2]; // Get the second-to-last segment (before "runs")

  if (!testId) {
    return NextResponse.json({ error: 'Test ID is required' }, { status: 400 });
  }

  try {
    console.log(`[API /tests/${testId}/runs] Fetching runs for test ID: ${testId}`);

    const databaseClient = await db(); // Call db as a function and await its result
    const testRuns = await databaseClient
      .select({
        id: reports.id,
        status: reports.status,
        s3Url: reports.s3Url,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
      })
      .from(reports)
      .where(
        and(
          eq(reports.entityId, testId),
          eq(reports.entityType, 'test') // Ensure we only get test runs
        )
      )
      .orderBy(desc(reports.createdAt)) // Show the most recent runs first
      .limit(50); // Limit the number of runs returned for performance

    console.log(`[API /tests/${testId}/runs] Found ${testRuns.length} runs.`);

    return NextResponse.json(testRuns);
  } catch (error) {
    console.error(`[API /tests/${testId}/runs] Error fetching test runs:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to fetch test runs', details: errorMessage }, { status: 500 });
  }
} 