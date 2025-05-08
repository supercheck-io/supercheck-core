import { NextResponse } from 'next/server';
import { getQueueStats } from '@/lib/queue-stats';

export async function GET() {
  try {
    // Use the queue-stats utility to get statistics
    const stats = await getQueueStats();    
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error('Queue stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue statistics' },
      { status: 500 }
    );
  }
} 