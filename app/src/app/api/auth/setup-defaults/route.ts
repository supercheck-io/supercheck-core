import { NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { organization as orgTable, projects, member, projectMembers, session } from '@/db/schema/schema';
import { getCurrentUser } from '@/lib/session';
import { eq } from 'drizzle-orm';
import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check if user already has an organization
    const [existingMember] = await db
      .select()
      .from(member)
      .where(eq(member.userId, user.id))
      .limit(1);

    if (existingMember) {
      return NextResponse.json({
        success: true,
        message: 'User already has organization setup'
      });
    }

    // Create default organization
    const [newOrg] = await db.insert(orgTable).values({
      name: `${user.name}'s Organization`,
      slug: randomUUID(),
      createdAt: new Date(),
    }).returning();

    // Add user as owner of the organization
    await db.insert(member).values({
      organizationId: newOrg.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });

    // Create default project
    const [newProject] = await db.insert(projects).values({
      organizationId: newOrg.id,
      name: process.env.DEFAULT_PROJECT_NAME || 'Default Project',
      slug: randomUUID(),
      description: 'Your default project for getting started',
      isDefault: true,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Add user as owner of the project
    await db.insert(projectMembers).values({
      userId: user.id,
      projectId: newProject.id,
      role: 'owner',
      createdAt: new Date(),
    });

    // Set the new project as active in the user's session
    const sessionData = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (sessionData?.session?.token) {
      await db
        .update(session)
        .set({ activeProjectId: newProject.id })
        .where(eq(session.token, sessionData.session.token));
    }

    console.log(`✅ Created default org "${newOrg.name}" and project "${newProject.name}" for user ${user.email}`);

    return NextResponse.json({
      success: true,
      data: {
        organization: newOrg,
        project: newProject
      }
    });
  } catch (error) {
    console.error('❌ Failed to create default org/project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to setup defaults' },
      { status: 500 }
    );
  }
}