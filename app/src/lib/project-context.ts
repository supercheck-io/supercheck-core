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
import { getUserOrgRole } from './rbac/middleware';
import { Role } from './rbac/permissions';
import { roleToString } from './rbac/role-normalizer';

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
      console.log('🔍 [ProjectContext] No session found');
      return null;
    }

    console.log('🔍 [ProjectContext] Session found:', {
      userId: sessionData.user.id,
      userEmail: sessionData.user.email
    });

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
      console.log('🔍 [ProjectContext] No session record found in database');
      return null;
    }

    const session = sessionRecord[0];
    
    console.log('🔍 [ProjectContext] Session record:', {
      activeProjectId: session.activeProjectId,
      userId: session.userId,
      impersonatedBy: session.impersonatedBy,
      isImpersonating: !!session.impersonatedBy
    });
    
    // Use the impersonated user ID if impersonation is active, otherwise use the original user ID
    const currentUserId = session.impersonatedBy ? session.userId : sessionData.user.id;
    
    console.log('🔍 [ProjectContext] Current user ID:', currentUserId);
    
    const activeProjectId = session.activeProjectId;
    
    if (!activeProjectId) {
      // No active project in session, try to set a default
      return await setDefaultProjectInSession();
    }

    // Get project details first
    console.log('🔍 [ProjectContext] Querying project:', {
      activeProjectId,
      currentUserId
    });
    
    const projectData = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        organizationId: projects.organizationId,
        isDefault: projects.isDefault
      })
      .from(projects)
      .where(and(
        eq(projects.id, activeProjectId),
        eq(projects.status, 'active')
      ))
      .limit(1);

    if (projectData.length === 0) {
      console.log('🔍 [ProjectContext] Project not found, trying default');
      return await setDefaultProjectInSession();
    }

    const project = projectData[0];
    console.log('🔍 [ProjectContext] Project found:', project);

    // Get user's role using consistent role resolution
    // 1. First check organization role (primary source of truth)
    const orgRole = await getUserOrgRole(currentUserId, project.organizationId);
    console.log('🔍 [ProjectContext] Organization role:', orgRole);
    
    if (!orgRole) {
      console.log('🔍 [ProjectContext] No organization membership found');
      return await setDefaultProjectInSession();
    }

    // 2. For PROJECT_EDITOR, check if they have project-specific access
    const finalRole = orgRole;
    if (orgRole === Role.PROJECT_EDITOR) {
      console.log('🔍 [ProjectContext] Checking project-specific access for PROJECT_EDITOR');
      const projectMember = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, activeProjectId),
          eq(projectMembers.userId, currentUserId)
        ))
        .limit(1);
      
      if (projectMember.length === 0) {
        console.log('🔍 [ProjectContext] PROJECT_EDITOR has no project access');
        return await setDefaultProjectInSession();
      }
      
      console.log('🔍 [ProjectContext] Project membership found:', projectMember[0]);
      // Keep the org role as final role for PROJECT_EDITOR
    }

    // 3. Convert Role enum back to string using the normalizer
    const roleString = roleToString(finalRole);

    const result = {
      id: project.id,
      name: project.name,
      slug: project.slug || undefined,
      organizationId: project.organizationId,
      isDefault: project.isDefault,
      userRole: roleString
    };
    
    console.log('🔍 [ProjectContext] Returning consistent project context:', result);
    return result;
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
        // Check if user already has access to any project in this organization first
        const existingAccess = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(and(
            eq(projectMembers.userId, currentUser.id),
            eq(projects.organizationId, activeOrg.id),
            eq(projects.status, 'active')
          ))
          .limit(1);

        // If user already has project access, they might have been added via invitation
        // Don't auto-assign - wait for proper project context to be established
        if (existingAccess.length > 0) {
          console.log(`ℹ️ User ${currentUser.email} already has project access in organization "${activeOrg.name}" - skipping auto-assignment`);
          return null;
        }

        // Auto-assign user to the first available project (usually the default)
        const projectToAssign = orgProjects[0];
        
        try {
          await db
            .insert(projectMembers)
            .values({
              userId: currentUser.id,
              projectId: projectToAssign.id,
              role: 'project_viewer', // Default to project viewer role
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
            userRole: 'project_viewer'
          };
        } catch (error: unknown) {
          // Handle duplicate key constraint violation gracefully
          const dbError = error as { constraint?: string; code?: string; message?: string };
          if (dbError?.constraint === 'project_members_uniqueUserProject' || 
              dbError?.code === '23505' || 
              dbError?.message?.includes('duplicate key')) {
            console.log(`ℹ️ User ${currentUser.email} was already assigned to project "${projectToAssign.name}" (likely via invitation)`);
            
            // Update session anyway since they do have access
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
              userRole: 'project_viewer'
            };
          }
          
          console.error('Error auto-assigning user to project:', error);
          return null;
        }
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
      userRole: defaultProject.role || 'project_viewer'
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
      userRole: targetProject.role || 'project_viewer'
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