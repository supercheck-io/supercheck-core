import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { ProjectPermission, ProjectRole } from '@/lib/rbac/permissions';
import { db } from '@/utils/db';
import { projects, projectMembers, user } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/members
 * List all members of a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const { userId } = await requireAuth();
    const projectId = resolvedParams.id;
    
    // Get project to determine organization
    const projectData = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (projectData.length === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const organizationId = projectData[0].organizationId;
    
    // Build permission context
    const context = await buildPermissionContext(userId, 'project', organizationId, projectId);
    
    // Check permission
    const canView = await hasPermission(context, ProjectPermission.VIEW_PROJECT_MEMBERS);
    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }
    
    // Get project members with user details
    const members = await db
      .select({
        id: projectMembers.id,
        userId: projectMembers.userId,
        role: projectMembers.role,
        createdAt: projectMembers.createdAt,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image
      })
      .from(projectMembers)
      .innerJoin(user, eq(user.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));
    
    return NextResponse.json({
      success: true,
      members: members.map(member => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: member.userId,
          name: member.userName,
          email: member.userEmail,
          image: member.userImage
        }
      }))
    });
    
  } catch (error) {
    console.error('Failed to get project members:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Authentication required') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch project members' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/members
 * Add a new member to the project
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const { userId } = await requireAuth();
    const projectId = resolvedParams.id;
    
    // Get project to determine organization
    const projectData = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (projectData.length === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const organizationId = projectData[0].organizationId;
    
    // Build permission context
    const context = await buildPermissionContext(userId, 'project', organizationId, projectId);
    
    // Check permission
    const canInvite = await hasPermission(context, ProjectPermission.INVITE_PROJECT_MEMBERS);
    if (!canInvite) {
      return NextResponse.json(
        { error: 'Insufficient permissions to add members' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { userId: targetUserId, role = 'viewer' } = body;
    
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Validate role
    const validRoles = Object.values(ProjectRole);
    if (!validRoles.includes(role as ProjectRole)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }
    
    // Check if user exists
    const targetUser = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);
    
    if (targetUser.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Check if user is already a member
    const existingMember = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId)
      ))
      .limit(1);
    
    if (existingMember.length > 0) {
      return NextResponse.json(
        { error: 'User is already a member of this project' },
        { status: 400 }
      );
    }
    
    // Add user to project
    const [newMember] = await db
      .insert(projectMembers)
      .values({
        projectId,
        userId: targetUserId,
        role,
        createdAt: new Date()
      })
      .returning();
    
    return NextResponse.json({
      success: true,
      member: {
        id: newMember.id,
        userId: newMember.userId,
        role: newMember.role,
        createdAt: newMember.createdAt,
        user: targetUser[0]
      }
    }, { status: 201 });
    
  } catch (error) {
    console.error('Failed to add project member:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Authentication required') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to add project member' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/members
 * Update a project member's role
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const { userId } = await requireAuth();
    const projectId = resolvedParams.id;
    
    // Get project to determine organization
    const projectData = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (projectData.length === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const organizationId = projectData[0].organizationId;
    
    // Build permission context
    const context = await buildPermissionContext(userId, 'project', organizationId, projectId);
    
    // Check permission
    const canManage = await hasPermission(context, ProjectPermission.MANAGE_PROJECT_MEMBERS);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage members' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { userId: targetUserId, role } = body;
    
    if (!targetUserId || !role) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      );
    }
    
    // Validate role
    const validRoles = Object.values(ProjectRole);
    if (!validRoles.includes(role as ProjectRole)) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }
    
    // Update member role
    const [updatedMember] = await db
      .update(projectMembers)
      .set({ role })
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId)
      ))
      .returning();
    
    if (!updatedMember) {
      return NextResponse.json(
        { error: 'Member not found in project' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      member: updatedMember
    });
    
  } catch (error) {
    console.error('Failed to update project member:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Authentication required') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to update project member' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/members
 * Remove a member from the project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  try {
    const { userId } = await requireAuth();
    const projectId = resolvedParams.id;
    
    // Get project to determine organization
    const projectData = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (projectData.length === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const organizationId = projectData[0].organizationId;
    
    // Build permission context
    const context = await buildPermissionContext(userId, 'project', organizationId, projectId);
    
    // Check permission
    const canManage = await hasPermission(context, ProjectPermission.MANAGE_PROJECT_MEMBERS);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Insufficient permissions to remove members' },
        { status: 403 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    // Prevent removing the last owner
    if (targetUserId !== userId) {
      const ownerCount = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.role, 'owner')
        ));
      
      const targetMember = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, targetUserId)
        ))
        .limit(1);
      
      if (targetMember.length > 0 && targetMember[0].role === 'owner' && ownerCount.length === 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner of the project' },
          { status: 400 }
        );
      }
    }
    
    // Remove member
    await db
      .delete(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId)
      ));
    
    return NextResponse.json({
      success: true,
      message: 'Member removed from project successfully'
    });
    
  } catch (error) {
    console.error('Failed to remove project member:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Authentication required') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to remove project member' },
      { status: 500 }
    );
  }
}