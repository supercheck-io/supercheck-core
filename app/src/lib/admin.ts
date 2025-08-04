import { db } from '@/utils/db';
import { user, organization, projects, jobs, tests, monitors, runs } from '@/db/schema/schema';
import { count, eq, desc, sql } from 'drizzle-orm';
import { getCurrentUser, getActiveOrganization } from './session';
import { getUserSystemRole, getUserOrgRole } from './rbac/middleware';
import { SystemRole, OrgRole } from './rbac/permissions';

export async function isAdmin(): Promise<boolean> {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) return false;
    
    // Use RBAC system to check admin privileges - SUPER_ADMIN only
    const systemRole = await getUserSystemRole(currentUser.id);
    return systemRole === SystemRole.SUPER_ADMIN;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

export async function isSuperAdmin(): Promise<boolean> {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) return false;
    
    // Use RBAC system to check super admin privileges
    const systemRole = await getUserSystemRole(currentUser.id);
    return systemRole === SystemRole.SUPER_ADMIN;
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
}

export async function isOrgAdmin(): Promise<boolean> {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) return false;
    
    // Check if user is admin or owner of current organization
    const activeOrg = await getActiveOrganization();
    if (!activeOrg) return false;
    
    const orgRole = await getUserOrgRole(currentUser.id, activeOrg.id);
    return orgRole === OrgRole.ADMIN || orgRole === OrgRole.OWNER;
  } catch (error) {
    console.error('Error checking org admin status:', error);
    return false;
  }
}

export async function requireAdmin() {
  const isUserAdmin = await isAdmin();
  if (!isUserAdmin) {
    throw new Error('Admin privileges required');
  }
}

export interface UserStats {
  totalUsers: number;
  newUsersThisMonth: number;
  activeUsers: number;
  bannedUsers: number;
}

export async function getUserStats(): Promise<UserStats> {
  await requireAdmin();
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const [totalUsersResult] = await db.select({ count: count() }).from(user);
  
  const [newUsersResult] = await db
    .select({ count: count() })
    .from(user)
    .where(sql`${user.createdAt} >= ${thirtyDaysAgo.toISOString()}`);
  
  const [activeUsersResult] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.banned, false));
  
  const [bannedUsersResult] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.banned, true));
  
  return {
    totalUsers: totalUsersResult.count,
    newUsersThisMonth: newUsersResult.count,
    activeUsers: activeUsersResult.count,
    bannedUsers: bannedUsersResult.count,
  };
}

export interface OrgStats {
  totalOrganizations: number;
  totalProjects: number;
  totalJobs: number;
  totalTests: number;
  totalMonitors: number;
  totalRuns: number;
}

export async function getOrgStats(): Promise<OrgStats> {
  await requireAdmin();
  
  const [totalOrgsResult] = await db.select({ count: count() }).from(organization);
  const [totalProjectsResult] = await db.select({ count: count() }).from(projects);
  const [totalJobsResult] = await db.select({ count: count() }).from(jobs);
  const [totalTestsResult] = await db.select({ count: count() }).from(tests);
  const [totalMonitorsResult] = await db.select({ count: count() }).from(monitors);
  const [totalRunsResult] = await db.select({ count: count() }).from(runs);
  
  return {
    totalOrganizations: totalOrgsResult.count,
    totalProjects: totalProjectsResult.count,
    totalJobs: totalJobsResult.count,
    totalTests: totalTestsResult.count,
    totalMonitors: totalMonitorsResult.count,
    totalRuns: totalRunsResult.count,
  };
}

export interface SystemStats {
  users: UserStats;
  organizations: OrgStats;
}

export async function getSystemStats(): Promise<SystemStats> {
  await requireAdmin();
  
  const [userStats, orgStats] = await Promise.all([
    getUserStats(),
    getOrgStats(),
  ]);
  
  return {
    users: userStats,
    organizations: orgStats,
  };
}

export async function getAllUsers(limit = 50, offset = 0) {
  await requireAdmin();
  
  return await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllOrganizations(limit = 50, offset = 0) {
  await requireAdmin();
  
  return await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      createdAt: organization.createdAt,
      metadata: organization.metadata,
    })
    .from(organization)
    .orderBy(desc(organization.createdAt))
    .limit(limit)
    .offset(offset);
}