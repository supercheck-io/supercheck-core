import { db } from "@/utils/db";
import { member, projectMembers, projects } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";

/**
 * Check if user can view project variables (all roles can view variable names and non-secret values)
 */
export async function canViewProjectVariables(userId: string, projectId: string): Promise<boolean> {
  try {
    // First, get the project and check organization ownership
    const project = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return false;
    }

    // Check organization role first - org members can view all project variables
    const orgAccess = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, project[0].organizationId)
        )
      )
      .limit(1);

    if (orgAccess.length > 0) {
      // All organization members can view project variables
      return true;
    }

    // Check project-level membership as fallback
    const projectAccess = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.userId, userId),
          eq(projectMembers.projectId, projectId)
        )
      )
      .limit(1);

    // All project members can view variables
    return projectAccess.length > 0;
  } catch (error) {
    console.error('Error checking variable view permissions:', error);
    return false;
  }
}

/**
 * Check if user can manage project variables (create, update, delete, view secrets)
 * Only org_owner, org_admin, and project_admin can manage variables
 */
export async function canManageProjectVariables(userId: string, projectId: string): Promise<boolean> {
  try {
    // First, get the project and check organization ownership
    const project = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return false;
    }

    // Check organization role first
    const orgAccess = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, project[0].organizationId)
        )
      )
      .limit(1);

    if (orgAccess.length > 0) {
      const { role: orgRole } = orgAccess[0];
      // Org owners and admins can manage all project variables
      if (orgRole === 'org_owner' || orgRole === 'org_admin') {
        return true;
      }
    }

    // Check project-level membership
    const projectAccess = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.userId, userId),
          eq(projectMembers.projectId, projectId)
        )
      )
      .limit(1);

    if (projectAccess.length > 0) {
      const { role } = projectAccess[0];
      // Project admins can manage project variables
      if (role === 'project_admin') {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking variable manage permissions:', error);
    return false;
  }
}

/**
 * Check if user can view secret values
 * Only org_owner, org_admin, and project_admin can view secret values
 */
export async function canViewSecretVariables(userId: string, projectId: string): Promise<boolean> {
  return canManageProjectVariables(userId, projectId);
}

/**
 * Get user's role in a project
 */
export async function getUserProjectRole(userId: string, projectId: string): Promise<{ projectRole: string | null, orgRole: string | null }> {
  try {
    const access = await db
      .select({ role: projectMembers.role, orgRole: member.role })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .innerJoin(member, eq(member.userId, projectMembers.userId))
      .where(
        and(
          eq(projectMembers.userId, userId),
          eq(projectMembers.projectId, projectId)
        )
      )
      .limit(1);

    if (access.length === 0) {
      return { projectRole: null, orgRole: null };
    }

    return { projectRole: access[0].role, orgRole: access[0].orgRole };
  } catch (error) {
    console.error('Error getting user project role:', error);
    return { projectRole: null, orgRole: null };
  }
}