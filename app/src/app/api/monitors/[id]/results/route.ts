import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { requireAuth, hasPermission, getUserOrgRole } from '@/lib/rbac/middleware';
import { isSuperAdmin } from '@/lib/admin';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;
  
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const dateFilter = searchParams.get('date'); // YYYY-MM-DD format

  // Validate pagination parameters
  if (page < 1 || limit < 1 || limit > 100) {
    return NextResponse.json({ 
      error: "Invalid pagination parameters. Page must be >= 1, limit must be 1-100" 
    }, { status: 400 });
  }

  try {
    const { userId } = await requireAuth();
    
    // First, find the monitor to check permissions
    const monitor = await db.query.monitors.findFirst({
      where: eq(monitors.id, id),
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    // Check if user has access to this monitor
    const userIsSuperAdmin = await isSuperAdmin();
    
    if (!userIsSuperAdmin && monitor.organizationId && monitor.projectId) {
      // First, check if user is a member of the organization
      const orgRole = await getUserOrgRole(userId, monitor.organizationId);
      
      if (!orgRole) {
        return NextResponse.json(
          { error: 'Access denied: Not a member of this organization' },
          { status: 403 }
        );
      }

      // Then check if they have permission to view monitors
      try {
        const canView = await hasPermission('monitor', 'view', { 
          organizationId: monitor.organizationId, 
          projectId: monitor.projectId 
        });
        
        if (!canView) {
          return NextResponse.json(
            { error: 'Insufficient permissions to view this monitor' },
            { status: 403 }
          );
        }
      } catch (permissionError) {
        // If permission check fails but user is org member, allow view access
        console.log('Permission check failed, but user is org member:', permissionError);
      }
    }

    // Get the maximum number of results to consider from environment variable
    const maxResults = process.env.NEXT_PUBLIC_RECENT_MONITOR_RESULTS_LIMIT ? parseInt(process.env.NEXT_PUBLIC_RECENT_MONITOR_RESULTS_LIMIT) : 10000;
    
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where condition
    const whereCondition = dateFilter 
      ? and(
          eq(monitorResults.monitorId, id),
          gte(monitorResults.checkedAt, new Date(dateFilter + 'T00:00:00.000Z')),
          lte(monitorResults.checkedAt, new Date(dateFilter + 'T23:59:59.999Z'))
        )
      : eq(monitorResults.monitorId, id);

    // First, get the most recent results up to the limit (this gives us the "window" of results to paginate through)
    const recentResults = await db
      .select({ id: monitorResults.id })
      .from(monitorResults)
      .where(whereCondition)
      .orderBy(desc(monitorResults.checkedAt))
      .limit(maxResults);

    const total = recentResults.length;
    
    // If requesting beyond available results, return empty
    if (offset >= total) {
      return NextResponse.json({
        data: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: false,
          hasPrevPage: page > 1,
        },
      });
    }

    // Get the specific page of results from our limited set
    const results = await db
      .select()
      .from(monitorResults)
      .where(whereCondition)
      .orderBy(desc(monitorResults.checkedAt))
      .limit(Math.min(limit, total - offset)) // Don't go beyond available results
      .offset(offset);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error(`Error fetching paginated monitor results for ${id}:`, error);
    return NextResponse.json({ error: "Failed to fetch monitor results" }, { status: 500 });
  }
}