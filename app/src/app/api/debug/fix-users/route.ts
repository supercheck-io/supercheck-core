import { NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { user } from '@/db/schema/schema';

export async function POST() {
  try {
    // Update all users to have emailVerified = true
    const result = await db
      .update(user)
      .set({ emailVerified: true })
      .returning({ id: user.id, email: user.email });
    
    return NextResponse.json({
      success: true,
      message: `Updated ${result.length} users to have verified emails`,
      updatedUsers: result
    });
  } catch (error) {
    console.error('Fix users error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fix users' },
      { status: 500 }
    );
  }
}