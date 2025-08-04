/**
 * Session management utilities with organization and project context
 */

import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { db } from '@/utils/db';
import { organization, projects, member, projectMembers, session, user } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { getUserSystemRole, getUserOrgRole } from './rbac/middleware';
import { SystemRole, OrgRole, ProjectRole } from './rbac/permissions';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  image?: string;
  systemRole: SystemRole;
}

export interface OrganizationWithRole {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  createdAt: Date;
  role: OrgRole;
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
  role: ProjectRole | null;
  isActive: boolean;
}

/**
 * Get current authenticated user with system role
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
          image: impersonatedUser.image
        };
      }
    }

    const systemRole = await getUserSystemRole(currentUserId);

    return {
      id: currentUserId,
      name: currentUserData.name,
      email: currentUserData.email,
      image: currentUserData.image || undefined,
      systemRole
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
 * Get active project from session
 */
export async function getActiveProject(): Promise<ProjectWithRole | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    // Get active project from session
    const sessionData = await auth.api.getSession({
      headers: await headers(),
    });

    if (!(sessionData?.session as { activeProjectId?: string })?.activeProjectId) {
      // If no active project, get the default project from active organization
      const activeOrg = await getActiveOrganization();
      if (!activeOrg) return null;
      
      const userProjects = await getUserProjects(user.id, activeOrg.id);
      const defaultProject = userProjects.find(p => p.isDefault) || userProjects[0];
      
      return defaultProject || null;
    }

    const activeProjectId = (sessionData?.session as { activeProjectId?: string })?.activeProjectId;
    
    // Get project details with user's role
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
        projectRole: projectMembers.role
      })
      .from(projects)
      .leftJoin(projectMembers, and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, user.id)
      ))
      .where(eq(projects.id, activeProjectId!))
      .limit(1);

    if (projectData.length === 0) return null;

    const project = projectData[0];
    
    // Check if user has access through organization membership
    let role: ProjectRole | null = null;
    if (project.projectRole) {
      role = getUserProjectRoleFromString(project.projectRole);
    } else {
      // Check organization role as fallback
      const orgRole = await getUserOrgRole(user.id, project.organizationId);
      if (orgRole === OrgRole.OWNER || orgRole === OrgRole.ADMIN) {
        role = ProjectRole.ADMIN;
      } else if (orgRole === OrgRole.MEMBER) {
        role = ProjectRole.VIEWER;
      }
    }

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
 * Get all organizations for a user
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
        userRole: member.role
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
      role: getUserOrgRoleFromString(org.userRole),
      isActive: false // Will be set by caller if needed
    }));
  } catch (error) {
    console.error('Error getting user organizations:', error);
    return [];
  }
}

/**
 * Get all projects for a user in an organization
 */
export async function getUserProjects(userId: string, organizationId: string): Promise<ProjectWithRole[]> {
  try {
    // Get projects where user is a direct member
    const directProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
        organizationId: projects.organizationId,
        isDefault: projects.isDefault,
        status: projects.status,
        createdAt: projects.createdAt,
        projectRole: projectMembers.role
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(and(
        eq(projects.organizationId, organizationId),
        eq(projectMembers.userId, userId),
        eq(projects.status, 'active')
      ));

    // Get organization role to check for additional project access
    const orgRole = await getUserOrgRole(userId, organizationId);
    
    // If user is org owner/admin, they get access to all projects
    let allProjects = directProjects;
    if (orgRole === OrgRole.OWNER || orgRole === OrgRole.ADMIN) {
      const orgProjects = await db
        .select({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          description: projects.description,
          organizationId: projects.organizationId,
          isDefault: projects.isDefault,
          status: projects.status,
          createdAt: projects.createdAt
        })
        .from(projects)
        .where(and(
          eq(projects.organizationId, organizationId),
          eq(projects.status, 'active')
        ));

      // Merge and deduplicate
      const projectMap = new Map();
      
      // Add direct projects first
      directProjects.forEach(p => {
        projectMap.set(p.id, {
          ...p,
          role: getUserProjectRoleFromString(p.projectRole)
        });
      });
      
      // Add org projects (if not already present)
      orgProjects.forEach(p => {
        if (!projectMap.has(p.id)) {
          projectMap.set(p.id, {
            ...p,
            projectRole: null,
            role: ProjectRole.ADMIN // Org admins get admin access
          });
        }
      });
      
      allProjects = Array.from(projectMap.values());
    }

    return allProjects.map(project => ({
      id: project.id,
      name: project.name,
      slug: project.slug || undefined,
      description: project.description || undefined,
      organizationId: project.organizationId,
      isDefault: project.isDefault,
      status: project.status as 'active' | 'archived' | 'deleted',
      createdAt: project.createdAt || new Date(),
      role: getUserProjectRoleFromString(project.projectRole),
      isActive: false // Will be set by caller if needed
    }));
  } catch (error) {
    console.error('Error getting user projects:', error);
    return [];
  }
}

/**
 * Organization switching is disabled - users have a single fixed organization
 */

/**
 * Switch active project
 */
export async function switchActiveProject(projectId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const activeOrg = await getActiveOrganization();
    
    if (!user || !activeOrg) return false;

    // Verify user has access to this project
    const userProjects = await getUserProjects(user.id, activeOrg.id);
    const targetProject = userProjects.find(proj => proj.id === projectId);
    
    if (!targetProject) return false;

    // Update session - this would need to be implemented based on your session strategy
    // You might need to call Better Auth API to update the session
    
    return true;
  } catch (error) {
    console.error('Error switching project:', error);
    return false;
  }
}

/**
 * Helper to convert string role to OrgRole enum
 */
function getUserOrgRoleFromString(roleString: string): OrgRole {
  switch (roleString) {
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
 * Helper to convert string role to ProjectRole enum
 */
function getUserProjectRoleFromString(roleString: string | null): ProjectRole | null {
  if (!roleString) return null;
  
  switch (roleString) {
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