import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac/middleware';
import { getUserProjectRole } from '@/lib/session';
import { db } from '@/utils/db';
import { monitors } from '@/db/schema/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const { userId } = await requireAuth();

    // Find the monitor to get project and organization IDs
    const monitor = await db.query.monitors.findFirst({
      where: eq(monitors.id, id),
      columns: {
        projectId: true,
        organizationId: true
      }
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    if (!monitor.organizationId || !monitor.projectId) {
      return NextResponse.json(
        { error: "Monitor data incomplete" },
        { status: 500 }
      );
    }

    // Get the user's actual role for this project
    const userRole = await getUserProjectRole(userId, monitor.organizationId, monitor.projectId);

    return NextResponse.json({
      success: true,
      data: {
        userRole,
        projectId: monitor.projectId,
        organizationId: monitor.organizationId
      }
    });

  } catch (error) {
    console.error('Error fetching monitor permissions:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Authentication required') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Resource not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}