import { NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { member, user as userTable } from '@/db/schema/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/rbac/middleware';
import { getActiveOrganization, getCurrentUser } from '@/lib/session';
import { getUserOrgRole } from '@/lib/rbac/middleware';
import { OrgRole } from '@/lib/rbac/permissions';

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const currentUser = await getCurrentUser();
    const activeOrg = await getActiveOrganization();
    
    if (!currentUser || !activeOrg) {
      return NextResponse.json(
        { error: 'No active organization found' },
        { status: 400 }
      );
    }

    // Check if user is org admin
    const orgRole = await getUserOrgRole(currentUser.id, activeOrg.id);
    const isOrgAdmin = orgRole === OrgRole.ADMIN || orgRole === OrgRole.OWNER;
    
    if (!isOrgAdmin) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get organization members
    const members = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: member.role,
        joinedAt: member.createdAt
      })
      .from(member)
      .innerJoin(userTable, eq(member.userId, userTable.id))
      .where(eq(member.organizationId, activeOrg.id))
      .orderBy(desc(member.createdAt));

    return NextResponse.json({
      success: true,
      data: members
    });
  } catch (error) {
    console.error('Error fetching organization members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organization members' },
      { status: 500 }
    );
  }
}