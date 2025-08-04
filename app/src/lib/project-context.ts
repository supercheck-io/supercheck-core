/**
 * Clean Session-Based Project Context
 * No URL parameters, pure server-side session management
 */

import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { db } from '@/utils/db';
import { projects, projectMembers, session as sessionTable } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { getActiveOrganization, getUserProjects, getCurrentUser } from './session';

export interface ProjectContext {
  id: string;
  name: string;
  slug?: string;
  organizationId: string;
  isDefault: boolean;
  userRole: string;
}

/**
 * Get current project context from session - single source of truth
 */
export async function getCurrentProjectContext(): Promise<ProjectContext | null> {
  try {
    const sessionData = await auth.api.getSession({
      headers: await headers(),
    });

    if (!sessionData?.session?.token || !sessionData?.user?.id) {
      return null;
    }

    // Query the session table directly to get the activeProjectId and check for impersonation
    const sessionRecord = await db
      .select({ 
        activeProjectId: sessionTable.activeProjectId,
        userId: sessionTable.userId,
        impersonatedBy: sessionTable.impersonatedBy
      })
      .from(sessionTable)
      .where(eq(sessionTable.token, sessionData.session.token))
      .limit(1);

    if (sessionRecord.length === 0) {
      return null;
    }

    const session = sessionRecord[0];
    
    // Use the impersonated user ID if impersonation is active, otherwise use the original user ID
    const currentUserId = session.impersonatedBy ? session.userId : sessionData.user.id;
    
    const activeProjectId = session.activeProjectId;
    
    if (!activeProjectId) {
      // No active project in session, try to set a default
      return await setDefaultProjectInSession();
    }

    // Get project details with user's role
    const projectData = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        organizationId: projects.organizationId,
        isDefault: projects.isDefault,
        userRole: projectMembers.role
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(and(
        eq(projects.id, activeProjectId),
        eq(projectMembers.userId, currentUserId),
        eq(projects.status, 'active')
      ))
      .limit(1);

    if (projectData.length === 0) {
      // Project not found or no access, try to set a default
      return await setDefaultProjectInSession();
    }

    return {
      id: projectData[0].id,
      name: projectData[0].name,
      slug: projectData[0].slug || undefined,
      organizationId: projectData[0].organizationId,
      isDefault: projectData[0].isDefault,
      userRole: projectData[0].userRole
    };
  } catch (error) {
    console.error('Error getting project context:', error);
    return null;
  }
}

/**
 * Set a default project in session when no active project exists
 */
async function setDefaultProjectInSession(): Promise<ProjectContext | null> {
  try {
    const sessionData = await auth.api.getSession({
      headers: await headers(),
    });

    if (!sessionData?.session?.token || !sessionData?.user?.id) {
      return null;
    }

    // Get current user (handles impersonation)
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return null;
    }

    const activeOrg = await getActiveOrganization();
    if (!activeOrg) {
      return null;
    }

    const userProjects = await getUserProjects(currentUser.id, activeOrg.id);
    if (userProjects.length === 0) {
      // User has no projects in this organization
      // Try to find any active project in the organization and request access
      const orgProjects = await db
        .select({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          organizationId: projects.organizationId,
          isDefault: projects.isDefault
        })
        .from(projects)
        .where(and(
          eq(projects.organizationId, activeOrg.id),
          eq(projects.status, 'active')
        ))
        .limit(1);

      if (orgProjects.length > 0) {
        // Auto-assign user to the first available project (usually the default)
        const projectToAssign = orgProjects[0];
        
        await db
          .insert(projectMembers)
          .values({
            userId: currentUser.id,
            projectId: projectToAssign.id,
            role: 'viewer', // Default to viewer role
            createdAt: new Date()
          });

        console.log(`✅ Auto-assigned user ${currentUser.email} to project "${projectToAssign.name}" in organization "${activeOrg.name}"`);

        // Update session with this project
        await db
          .update(sessionTable)
          .set({ activeProjectId: projectToAssign.id })
          .where(eq(sessionTable.token, sessionData.session.token));

        return {
          id: projectToAssign.id,
          name: projectToAssign.name,
          slug: projectToAssign.slug || undefined,
          organizationId: projectToAssign.organizationId,
          isDefault: projectToAssign.isDefault,
          userRole: 'viewer'
        };
      }

      return null;
    }

    // Find default project or use first project
    const defaultProject = userProjects.find(p => p.isDefault) || userProjects[0];
    
    // Update session with this project
    await db
      .update(sessionTable)
      .set({ activeProjectId: defaultProject.id })
      .where(eq(sessionTable.token, sessionData.session.token));

    return {
      id: defaultProject.id,
      name: defaultProject.name,
      slug: defaultProject.slug || undefined,
      organizationId: defaultProject.organizationId,
      isDefault: defaultProject.isDefault,
      userRole: defaultProject.role || 'viewer'
    };
  } catch (error) {
    console.error('Error setting default project:', error);
    return null;
  }
}

/**
 * Switch to a different project (updates session)
 */
export async function switchProject(projectId: string): Promise<{ success: boolean; message?: string; project?: ProjectContext }> {
  try {
    const sessionData = await auth.api.getSession({
      headers: await headers(),
    });

    if (!sessionData?.session?.token || !sessionData?.user?.id) {
      return { success: false, message: 'Not authenticated' };
    }

    // Get current user (handles impersonation)
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, message: 'Not authenticated' };
    }

    const activeOrg = await getActiveOrganization();
    if (!activeOrg) {
      return { success: false, message: 'No active organization' };
    }

    // Verify user has access to this project
    const userProjects = await getUserProjects(currentUser.id, activeOrg.id);
    const targetProject = userProjects.find(p => p.id === projectId);

    if (!targetProject) {
      return { success: false, message: 'Project not found or access denied' };
    }

    // Update session
    await db
      .update(sessionTable)
      .set({ activeProjectId: projectId })
      .where(eq(sessionTable.token, sessionData.session.token));

    const projectContext: ProjectContext = {
      id: targetProject.id,
      name: targetProject.name,
      slug: targetProject.slug || undefined,
      organizationId: targetProject.organizationId,
      isDefault: targetProject.isDefault,
      userRole: targetProject.role || 'viewer'
    };

    return { 
      success: true, 
      message: `Switched to ${targetProject.name}`,
      project: projectContext
    };
  } catch (error) {
    console.error('Error switching project:', error);
    return { success: false, message: 'Failed to switch project' };
  }
}

/**
 * Require project context middleware for API routes
 */
export async function requireProjectContext(): Promise<{
  userId: string;
  project: ProjectContext;
  organizationId: string;
}> {
  // Get current user (handles impersonation)
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('Authentication required');
  }

  const project = await getCurrentProjectContext();
  if (!project) {
    throw new Error('No active project found. Please ensure you have access to at least one project.');
  }

  return {
    userId: currentUser.id,
    project,
    organizationId: project.organizationId
  };
}