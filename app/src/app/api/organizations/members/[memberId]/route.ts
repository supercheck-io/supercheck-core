import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { member, user as userTable } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/rbac/middleware';
import { getActiveOrganization, getCurrentUser } from '@/lib/session';
import { getUserOrgRole } from '@/lib/rbac/middleware';
import { Role } from '@/lib/rbac/permissions';
import { logAuditEvent } from '@/lib/audit-logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const resolvedParams = await params;
  try {
    await requireAuth();
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
    const isOrgAdmin = orgRole === Role.ORG_ADMIN || orgRole === Role.ORG_OWNER;
    
    if (!isOrgAdmin) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update member roles' },
        { status: 403 }
      );
    }

    const { role } = await request.json();

    if (!role || !['project_viewer', 'project_editor', 'org_admin', 'org_owner'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role provided' },
        { status: 400 }
      );
    }

    // Prevent changing owner role
    const existingMember = await db
      .select({
        id: member.userId,
        role: member.role,
        userName: userTable.name,
        userEmail: userTable.email
      })
      .from(member)
      .innerJoin(userTable, eq(member.userId, userTable.id))
      .where(and(
        eq(member.userId, resolvedParams.memberId),
        eq(member.organizationId, activeOrg.id)
      ))
      .limit(1);

    if (existingMember.length === 0) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    if (existingMember[0].role === 'org_owner') {
      return NextResponse.json(
        { error: 'Cannot change owner role' },
        { status: 403 }
      );
    }

    // Prevent users from changing their own role
    if (resolvedParams.memberId === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 403 }
      );
    }

    const oldRole = existingMember[0].role;

    // No role conversion needed - store new RBAC roles directly

    // Update member role
    await db
      .update(member)
      .set({ 
        role: role
      })
      .where(and(
        eq(member.userId, resolvedParams.memberId),
        eq(member.organizationId, activeOrg.id)
      ));

    // Log the audit event
    await logAuditEvent({
      userId: currentUser.id,
      organizationId: activeOrg.id,
      action: 'member_role_updated',
      resource: 'member',
      resourceId: resolvedParams.memberId,
      metadata: {
        targetUserName: existingMember[0].userName,
        targetUserEmail: existingMember[0].userEmail,
        oldRole,
        newRole: role,
        organizationName: activeOrg.name
      },
      success: true
    });

    return NextResponse.json({
      success: true,
      message: `Member role updated to ${role}`,
      data: {
        memberId: resolvedParams.memberId,
        newRole: role,
        oldRole
      }
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: 'Failed to update member role' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const resolvedParams = await params;
  try {
    await requireAuth();
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
    const isOrgAdmin = orgRole === Role.ORG_ADMIN || orgRole === Role.ORG_OWNER;
    
    if (!isOrgAdmin) {
      return NextResponse.json(
        { error: 'Insufficient permissions to remove members' },
        { status: 403 }
      );
    }

    // Get member details for audit
    const existingMember = await db
      .select({
        id: member.userId,
        role: member.role,
        userName: userTable.name,
        userEmail: userTable.email
      })
      .from(member)
      .innerJoin(userTable, eq(member.userId, userTable.id))
      .where(and(
        eq(member.userId, resolvedParams.memberId),
        eq(member.organizationId, activeOrg.id)
      ))
      .limit(1);

    if (existingMember.length === 0) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    if (existingMember[0].role === 'org_owner') {
      return NextResponse.json(
        { error: 'Cannot remove organization owner' },
        { status: 403 }
      );
    }

    // Prevent users from removing themselves
    if (resolvedParams.memberId === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot remove yourself from the organization' },
        { status: 403 }
      );
    }

    // Remove member from organization
    await db
      .delete(member)
      .where(and(
        eq(member.userId, resolvedParams.memberId),
        eq(member.organizationId, activeOrg.id)
      ));

    // Log the audit event
    await logAuditEvent({
      userId: currentUser.id,
      organizationId: activeOrg.id,
      action: 'member_removed',
      resource: 'member',
      resourceId: resolvedParams.memberId,
      metadata: {
        removedUserName: existingMember[0].userName,
        removedUserEmail: existingMember[0].userEmail,
        removedUserRole: existingMember[0].role,
        organizationName: activeOrg.name
      },
      success: true
    });

    return NextResponse.json({
      success: true,
      message: 'Member removed from organization',
      data: {
        memberId: resolvedParams.memberId,
        removedRole: existingMember[0].role
      }
    });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}