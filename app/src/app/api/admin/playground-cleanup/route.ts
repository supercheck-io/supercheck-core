import { NextRequest, NextResponse } from 'next/server';
import { getPlaygroundCleanupService } from '@/lib/playground-cleanup';

/**
 * GET /api/admin/playground-cleanup - Get playground cleanup status
 */
export async function GET(request: NextRequest) {
  try {
    const playgroundCleanup = getPlaygroundCleanupService();
    
    if (!playgroundCleanup) {
      return NextResponse.json({
        enabled: false,
        message: 'Playground cleanup service is not initialized or disabled'
      });
    }

    const status = await playgroundCleanup.getCleanupStatus();
    
    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('[API] Error getting playground cleanup status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get playground cleanup status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/playground-cleanup - Trigger manual cleanup
 */
export async function POST(request: NextRequest) {
  try {
    const playgroundCleanup = getPlaygroundCleanupService();
    
    if (!playgroundCleanup) {
      return NextResponse.json(
        {
          success: false,
          error: 'Playground cleanup service is not initialized or disabled'
        },
        { status: 503 }
      );
    }

    console.log('[API] Triggering manual playground cleanup...');
    const result = await playgroundCleanup.triggerManualCleanup();
    
    return NextResponse.json({
      success: true,
      message: 'Manual playground cleanup completed',
      result: {
        attempted: result.totalAttempted,
        deleted: result.deletedObjects.length,
        failed: result.failedObjects.length,
        success: result.success,
        errors: result.failedObjects.slice(0, 10), // Limit error details in response
      },
    });
  } catch (error) {
    console.error('[API] Error triggering manual playground cleanup:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to trigger playground cleanup',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}