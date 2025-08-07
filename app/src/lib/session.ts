/**
 * Session management utilities with unified RBAC support
 */

import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { db } from '@/utils/db';
import { organization, projects, member, session, user } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { getUserRole, getUserOrgRole } from './rbac/middleware';
import { Role } from './rbac/permissions';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: Role;
}

export interface OrganizationWithRole {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  createdAt: Date;
  role: Role;
  isActive: boolean;
}

export interface ProjectWithRole {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  organizationId: string;
  isDefault: boolean;
  status: 'active' | 'archived' | 'deleted';
  createdAt: Date;
  role: Role | null;
  isActive: boolean;
}

/**
 * Get current authenticated user with unified role
 * Handles impersonation by checking database session for impersonated user
 */
export async function getCurrentUser(): Promise<UserSession | null> {
  try {
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!authSession) {
      return null;
    }

    // Check database session for impersonation
    const [dbSession] = await db
      .select()
      .from(session)
      .where(eq(session.token, authSession.session.token))
      .limit(1);

    let currentUserId = authSession.user.id;
    let currentUserData = authSession.user;

    // If impersonation is active, get the impersonated user's data
    if (dbSession?.impersonatedBy) {
      currentUserId = dbSession.userId;
      
      // Get the impersonated user's full data from database
      const [impersonatedUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, currentUserId))
        .limit(1);

      if (impersonatedUser) {
        currentUserData = {
          id: impersonatedUser.id,
          name: impersonatedUser.name,
          email: impersonatedUser.email,
          emailVerified: impersonatedUser.emailVerified,
          createdAt: impersonatedUser.createdAt,
          updatedAt: impersonatedUser.updatedAt,
          image: impersonatedUser.image,
          banned: impersonatedUser.banned,
          role: impersonatedUser.role,
          banReason: impersonatedUser.banReason,
          banExpires: impersonatedUser.banExpires
        };
      }
    }

    const role = await getUserRole(currentUserId);

    return {
      id: currentUserId,
      name: currentUserData.name,
      email: currentUserData.email,
      image: currentUserData.image || undefined,
      role
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Get user's organization (single organization per user)
 */
export async function getActiveOrganization(): Promise<OrganizationWithRole | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    // Get the user's single organization
    const userOrgs = await getUserOrganizations(user.id);
    if (userOrgs.length === 0) {
      // User has no organizations - this suggests they need defaults created
      // We return null here and let the frontend handle calling setup-defaults
      return null;
    }
    
    // Return the first (and only) organization
    return { ...userOrgs[0], isActive: true };
  } catch (error) {
    console.error('Error getting active organization:', error);
    return null;
  }
}

/**
 * Get active project with unified role
 */
export async function getActiveProject(): Promise<ProjectWithRole | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const activeOrg = await getActiveOrganization();
    if (!activeOrg) return null;

    // Get the user's default project or first project
    const projectData = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
        organizationId: projects.organizationId,
        isDefault: projects.isDefault,
        status: projects.status,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(
        eq(projects.organizationId, activeOrg.id),
        eq(projects.status, 'active')
      ))
      .orderBy(projects.isDefault, projects.createdAt)
      .limit(1);

    if (projectData.length === 0) return null;

    const project = projectData[0];
    
    // Get the user's project-specific role (considers project assignments)
    const role = await getUserProjectRole(user.id, activeOrg.id, project.id);

    return {
      id: project.id,
      name: project.name,
      slug: project.slug || undefined,
      description: project.description || undefined,
      organizationId: project.organizationId,
      isDefault: project.isDefault,
      status: project.status as 'active' | 'archived' | 'deleted',
      createdAt: project.createdAt || new Date(),
      role,
      isActive: true
    };
  } catch (error) {
    console.error('Error getting active project:', error);
    return null;
  }
}

/**
 * Get all organizations for a user with unified roles
 */
export async function getUserOrganizations(userId: string): Promise<OrganizationWithRole[]> {
  try {
    const orgsData = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        memberRole: member.role,
      })
      .from(organization)
      .innerJoin(member, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId));

    return orgsData.map(org => ({
      id: org.id,
      name: org.name,
      slug: org.slug || undefined,
      logo: org.logo || undefined,
      createdAt: org.createdAt,
      role: convertRoleToUnified(org.memberRole),
      isActive: false
    }));
  } catch (error) {
    console.error('Error getting user organizations:', error);
    return [];
  }
}

/**
 * Get projects for a user in an organization with unified roles
 */
export async function getUserProjects(userId: string, organizationId: string): Promise<ProjectWithRole[]> {
  try {
    // Get user's organization role first
    const orgRole = await getUserOrgRole(userId, organizationId);
    if (!orgRole) {
      return [];
    }

    // Get all projects in the organization
    const projectsData = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
        organizationId: projects.organizationId,
        isDefault: projects.isDefault,
        status: projects.status,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, 'active')
      ));

    // For PROJECT_ADMIN and PROJECT_EDITOR - check which projects they have specific access to
    if (orgRole === Role.PROJECT_ADMIN || orgRole === Role.PROJECT_EDITOR) {
      const { projectMembers } = await import('@/db/schema/schema');
      
      const assignedProjectIds = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, userId));
      
      const assignedIds = new Set(assignedProjectIds.map(p => p.projectId));

      return projectsData.map(project => ({
        id: project.id,
        name: project.name,
        slug: project.slug || undefined,
        description: project.description || undefined,
        organizationId: project.organizationId,
        isDefault: project.isDefault,
        status: project.status as 'active' | 'archived' | 'deleted',
        createdAt: project.createdAt || new Date(),
        // PROJECT_ADMIN/PROJECT_EDITOR gets viewer access to all projects, admin/editor access to assigned ones
        role: assignedIds.has(project.id) ? orgRole : Role.PROJECT_VIEWER,
        isActive: false
      }));
    }

    // For other roles (ORG_OWNER, ORG_ADMIN, PROJECT_VIEWER) - use their org role for all projects
    return projectsData.map(project => ({
      id: project.id,
      name: project.name,
      slug: project.slug || undefined,
      description: project.description || undefined,
      organizationId: project.organizationId,
      isDefault: project.isDefault,
      status: project.status as 'active' | 'archived' | 'deleted',
      createdAt: project.createdAt || new Date(),
      role: orgRole,
      isActive: false
    }));

    return [];
  } catch (error) {
    console.error('Error getting user projects:', error);
    return [];
  }
}

/**
 * Convert role strings to unified roles
 */
function convertRoleToUnified(roleString: string | null): Role {
  if (!roleString) return Role.PROJECT_VIEWER;
  
  switch (roleString) {
    case 'org_owner':
      return Role.ORG_OWNER;
    case 'org_admin':
      return Role.ORG_ADMIN;
    case 'project_admin':
      return Role.PROJECT_ADMIN;
    case 'project_editor':
      return Role.PROJECT_EDITOR;
    case 'project_viewer':
      return Role.PROJECT_VIEWER;
    case 'super_admin':
      return Role.SUPER_ADMIN;
    default:
      return Role.PROJECT_VIEWER;
  }
}

/**
 * Get user's role for a specific project (takes into account project-specific assignments)
 */
export async function getUserProjectRole(userId: string, organizationId: string, projectId: string): Promise<Role> {
  try {
    // Get user's organization role first
    const orgRole = await getUserOrgRole(userId, organizationId);
    if (!orgRole) {
      return Role.PROJECT_VIEWER;
    }

    // For PROJECT_ADMIN and PROJECT_EDITOR, check if they're assigned to this specific project
    if (orgRole === Role.PROJECT_ADMIN || orgRole === Role.PROJECT_EDITOR) {
      const { projectMembers } = await import('@/db/schema/schema');
      
      const assignment = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.userId, userId),
          eq(projectMembers.projectId, projectId)
        ))
        .limit(1);
      
      // If they're assigned to this project, they have their full role
      // If not assigned, they have viewer access (project_admin is NOT org admin)
      return assignment.length > 0 ? orgRole : Role.PROJECT_VIEWER;
    }

    // For other roles (ORG_OWNER, ORG_ADMIN, PROJECT_VIEWER) - use their org role
    return orgRole;
  } catch (error) {
    console.error('Error getting user project role:', error);
    return Role.PROJECT_VIEWER;
  }
}

/**
 * Switch user to a different project
 */
export async function switchProject(projectId: string): Promise<{ success: boolean; message?: string; project?: ProjectWithRole }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: 'Not authenticated' };
    }

    const activeOrg = await getActiveOrganization();
    if (!activeOrg) {
      return { success: false, message: 'No active organization' };
    }

    // Get the specific project
    const [projectData] = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.id, projectId),
        eq(projects.organizationId, activeOrg.id)
      ))
      .limit(1);

    if (!projectData) {
      return { success: false, message: 'Project not found' };
    }

    // For PROJECT_ADMIN and PROJECT_EDITOR, permissions will be determined dynamically
    // based on project assignments, so no need to block access here

    // Update session with new active project
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (authSession) {
      await db
        .update(session)
        .set({ activeProjectId: projectId })
        .where(eq(session.token, authSession.session.token));
    }

    // Get the user's project-specific role
    const projectRole = await getUserProjectRole(user.id, activeOrg.id, projectId);

    const project: ProjectWithRole = {
      id: projectData.id,
      name: projectData.name,
      slug: projectData.slug || undefined,
      description: projectData.description || undefined,
      organizationId: projectData.organizationId,
      isDefault: projectData.isDefault,
      status: projectData.status as 'active' | 'archived' | 'deleted',
      createdAt: projectData.createdAt || new Date(),
      role: projectRole,
      isActive: true
    };

    return { success: true, project };
  } catch (error) {
    console.error('Error switching project:', error);
    return { success: false, message: 'Internal error' };
  }
}