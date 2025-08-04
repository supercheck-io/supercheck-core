import { NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { user } from '@/db/schema/schema';

export async function GET() {
  try {
    const users = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified
      })
      .from(user)
      .limit(10);
    
    return NextResponse.json({
      success: true,
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Debug users error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}