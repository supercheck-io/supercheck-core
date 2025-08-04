/**
 * RBAC Middleware for permission checking and enforcement
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { db } from '@/utils/db';
import { member, projectMembers, user } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import {
  Permission,
  PermissionContext,
  SystemRole,
  OrgRole,
  ProjectRole,
  SystemPermission,
  OrgPermission,
  ProjectPermission,
  SYSTEM_ROLE_PERMISSIONS,
  ORG_ROLE_PERMISSIONS,
  PROJECT_ROLE_PERMISSIONS
} from './permissions';

/**
 * Check if a user has a specific permission in the given context
 */
export async function hasPermission(
  context: PermissionContext,
  permission: Permission
): Promise<boolean> {
  try {
    switch (context.type) {
      case 'system':
        return hasSystemPermission(context, permission as SystemPermission);
      
      case 'organization':
        return hasOrgPermission(context, permission as OrgPermission);
      
      case 'project':
        return hasProjectPermission(context, permission as ProjectPermission);
      
      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check system-level permissions
 */
function hasSystemPermission(
  context: PermissionContext,
  permission: SystemPermission
): boolean {
  if (context.type !== 'system') return false;
  
  const userPermissions = SYSTEM_ROLE_PERMISSIONS[context.systemRole] || [];
  return userPermissions.includes(permission);
}

/**
 * Check organization-level permissions
 */
function hasOrgPermission(
  context: PermissionContext,
  permission: OrgPermission
): boolean {
  // System admins have all organization permissions
  if (context.systemRole === SystemRole.SUPER_ADMIN) {
    return true;
  }
  
  if (context.type !== 'organization') return false;
  
  const userPermissions = ORG_ROLE_PERMISSIONS[context.orgRole] || [];
  return userPermissions.includes(permission);
}

/**
 * Check project-level permissions
 */
function hasProjectPermission(
  context: PermissionContext,
  permission: ProjectPermission
): boolean {
  // System admins have all project permissions
  if (context.systemRole === SystemRole.SUPER_ADMIN) {
    return true;
  }
  
  // Organization owners/admins have all project permissions in their org
  if (context.type !== 'system' && (context.orgRole === OrgRole.OWNER || context.orgRole === OrgRole.ADMIN)) {
    return true;
  }
  
  if (context.type !== 'project') return false;
  
  // Ensure we have a valid project role
  const projectRole = context.projectRole || ProjectRole.VIEWER;
  const userPermissions = PROJECT_ROLE_PERMISSIONS[projectRole] || [];
  return userPermissions.includes(permission);
}

/**
 * Require a specific permission - throws error if not authorized
 */
export async function requirePermission(
  context: PermissionContext,
  permission: Permission
): Promise<void> {
  const hasAccess = await hasPermission(context, permission);
  
  if (!hasAccess) {
    throw new Error(`Access denied: Missing permission ${permission}`);
  }
}

/**
 * Get user's system role
 */
export async function getUserSystemRole(userId: string): Promise<SystemRole> {
  // First get user data to check against email-based admin list
  const userRecord = await db.select({ 
    id: user.id, 
    email: user.email, 
    role: user.role 
  })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  
  if (userRecord.length === 0) {
    return SystemRole.USER;
  }
  
  const userData = userRecord[0];
  
  // Check if user is in admin list from environment (supports both email and user ID)
  const adminUserIds = process.env.SUPER_ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
  const adminEmails = process.env.SUPER_ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
  
  // Check by user ID (legacy support)
  if (adminUserIds.includes(userId)) {
    return SystemRole.SUPER_ADMIN;
  }
  
  // Check by email (new preferred method)
  if (userData.email && adminEmails.includes(userData.email)) {
    return SystemRole.SUPER_ADMIN;
  }
  
  // Check user role from database
  if (userData.role) {
    switch (userData.role) {
      case 'admin':
        return SystemRole.ADMIN;
      case 'super_admin':
        return SystemRole.SUPER_ADMIN;
      default:
        return SystemRole.USER;
    }
  }
  
  return SystemRole.USER;
}

/**
 * Get user's organization role
 */
export async function getUserOrgRole(userId: string, organizationId: string): Promise<OrgRole | null> {
  const memberRecord = await db
    .select({ role: member.role })
    .from(member)
    .where(and(
      eq(member.userId, userId),
      eq(member.organizationId, organizationId)
    ))
    .limit(1);
  
  if (memberRecord.length === 0) {
    return null;
  }
  
  const role = memberRecord[0].role;
  switch (role) {
    case 'owner':
      return OrgRole.OWNER;
    case 'admin':
      return OrgRole.ADMIN;
    case 'member':
      return OrgRole.MEMBER;
    case 'viewer':
      return OrgRole.VIEWER;
    default:
      return OrgRole.MEMBER;
  }
}

/**
 * Get user's project role
 */
export async function getUserProjectRole(
  userId: string, 
  projectId: string
): Promise<ProjectRole | null> {
  const projectMemberRecord = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.userId, userId),
      eq(projectMembers.projectId, projectId)
    ))
    .limit(1);
  
  if (projectMemberRecord.length === 0) {
    return null;
  }
  
  const role = projectMemberRecord[0].role;
  switch (role) {
    case 'owner':
      return ProjectRole.OWNER;
    case 'admin':
      return ProjectRole.ADMIN;
    case 'editor':
      return ProjectRole.EDITOR;
    case 'viewer':
      return ProjectRole.VIEWER;
    default:
      return ProjectRole.VIEWER;
  }
}

/**
 * Build permission context from request parameters
 */
export async function buildPermissionContext(
  userId: string,
  type: 'system'
): Promise<PermissionContext>;
export async function buildPermissionContext(
  userId: string,
  type: 'organization',
  organizationId: string
): Promise<PermissionContext>;
export async function buildPermissionContext(
  userId: string,
  type: 'project',
  organizationId: string,
  projectId: string
): Promise<PermissionContext>;
export async function buildPermissionContext(
  userId: string,
  type: 'system' | 'organization' | 'project',
  organizationId?: string,
  projectId?: string
): Promise<PermissionContext> {
  const systemRole = await getUserSystemRole(userId);
  
  switch (type) {
    case 'system':
      return {
        type: 'system',
        userId,
        systemRole
      };
    
    case 'organization':
      if (!organizationId) throw new Error('Organization ID required for organization context');
      
      const orgRole = await getUserOrgRole(userId, organizationId);
      if (!orgRole) throw new Error('User not found in organization');
      
      return {
        type: 'organization',
        userId,
        organizationId,
        orgRole,
        systemRole
      };
    
    case 'project':
      if (!organizationId || !projectId) {
        throw new Error('Organization ID and Project ID required for project context');
      }
      
      console.log('Getting project role for userId:', userId, 'projectId:', projectId);
      const projRole = await getUserProjectRole(userId, projectId);
      console.log('Project role result:', projRole);
      
      console.log('Getting org role for userId:', userId, 'organizationId:', organizationId);
      const orgRoleForProject = await getUserOrgRole(userId, organizationId);
      console.log('Org role result:', orgRoleForProject);
      
      if (!projRole && !orgRoleForProject) {
        throw new Error('User not found in project or organization');
      }
      
      const context = {
        type: 'project' as const,
        userId,
        organizationId,
        projectId,
        projectRole: projRole || ProjectRole.VIEWER,
        orgRole: orgRoleForProject || undefined,
        systemRole
      };
      
      console.log('Built context:', JSON.stringify(context, null, 2));
      return context;
    
    default:
      throw new Error('Invalid permission context type');
  }
}

/**
 * User session type for authentication
 */
interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
}

/**
 * Middleware to check authentication and basic authorization
 */
export async function requireAuth(): Promise<{ userId: string; user: SessionUser }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  
  if (!session) {
    throw new Error('Authentication required');
  }
  
  return {
    userId: session.user.id,
    user: session.user
  };
}

/**
 * API middleware wrapper for permission checking
 */
export function withPermission<T = Record<string, unknown>>(
  handler: (req: NextRequest, context: T) => Promise<NextResponse>,
  permission: Permission,
  getContext: (req: NextRequest, userId: string) => Promise<PermissionContext>
) {
  return async (req: NextRequest, routeContext?: T): Promise<NextResponse> => {
    try {
      // Check authentication
      const authResult = await requireAuth();
      
      // Build permission context
      const permissionContext = await getContext(req, authResult.userId);
      
      // Check permission
      const hasAccess = await hasPermission(permissionContext, permission);
      
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
      
      // Call the actual handler
      return handler(req, routeContext!);
      
    } catch (error) {
      console.error('Permission middleware error:', error);
      
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
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Helper to check if user is admin (system or organization level)
 */
export async function isAdmin(userId: string, organizationId?: string): Promise<boolean> {
  const systemRole = await getUserSystemRole(userId);
  
  if (systemRole === SystemRole.SUPER_ADMIN || systemRole === SystemRole.ADMIN) {
    return true;
  }
  
  if (organizationId) {
    const orgRole = await getUserOrgRole(userId, organizationId);
    return orgRole === OrgRole.OWNER || orgRole === OrgRole.ADMIN;
  }
  
  return false;
}