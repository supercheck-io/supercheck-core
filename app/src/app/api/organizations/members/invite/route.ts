import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { invitation, user as userTable, member, projects } from '@/db/schema/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/rbac/middleware';
import { getActiveOrganization, getCurrentUser } from '@/lib/session';
import { getUserOrgRole } from '@/lib/rbac/middleware';
import { Role } from '@/lib/rbac/permissions';
import { EmailService } from '@/lib/email-service';
import { inviteMemberSchema } from '@/lib/validations/member';
import { logAuditEvent } from '@/lib/audit-logger';

// Simple rate limiting - max 10 invites per hour per user
const inviteRateLimit = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  
  const userLimit = inviteRateLimit.get(userId);
  if (!userLimit || now > userLimit.resetTime) {
    inviteRateLimit.set(userId, { count: 1, resetTime: now + hourInMs });
    return true;
  }
  
  if (userLimit.count >= 10) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

export async function POST(request: NextRequest) {
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

    // Check rate limit
    if (!checkRateLimit(currentUser.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 10 invitations per hour.' },
        { status: 429 }
      );
    }

    // Check if user is org admin
    const orgRole = await getUserOrgRole(currentUser.id, activeOrg.id);
    const isOrgAdmin = orgRole === Role.ORG_ADMIN || orgRole === Role.ORG_OWNER;
    
    if (!isOrgAdmin) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, role, selectedProjects } = body;

    // Validate request data using Zod schema
    try {
      inviteMemberSchema.parse({ email, role, selectedProjects });
    } catch (error) {
      if (error instanceof Error) {
        const zodError = error as { errors?: { message: string }[] };
        if (zodError.errors && zodError.errors.length > 0) {
          return NextResponse.json(
            { error: zodError.errors[0].message },
            { status: 400 }
          );
        }
      }
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Check if user already exists and is a member
    const existingUser = await db
      .select({ id: userTable.id, role: userTable.role, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      const user = existingUser[0];
      
      // Block cross-organization admin invitations
      // Check if user has admin privileges (system-wide or organization-level)
      const isSystemAdmin = user.role === 'super_admin';
      
      // Check if they're in super admin environment list
      const adminEmails = process.env.SUPER_ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
      const adminUserIds = process.env.SUPER_ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
      const isEnvAdmin = adminEmails.includes(user.email) || adminUserIds.includes(user.id);
      
      // Check if they're an admin in any other organization
      const adminMemberships = await db
        .select({ 
          orgId: member.organizationId, 
          role: member.role 
        })
        .from(member)
        .where(eq(member.userId, user.id));

      const hasAdminRole = adminMemberships.some(m => 
        m.role === 'org_owner' || 
        m.role === 'org_admin'
      );

      if (isSystemAdmin || isEnvAdmin || hasAdminRole) {
        return NextResponse.json(
          { error: 'Cannot invite users with administrative privileges from other organizations. Admins should manage their own organizations independently.' },
          { status: 400 }
        );
      }

      // Check if already a member of current organization
      const existingMember = await db
        .select({ id: member.userId })
        .from(member)
        .where(and(
          eq(member.userId, user.id),
          eq(member.organizationId, activeOrg.id)
        ))
        .limit(1);

      if (existingMember.length > 0) {
        return NextResponse.json(
          { error: 'User is already a member of this organization' },
          { status: 400 }
        );
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(and(
        eq(invitation.email, email),
        eq(invitation.organizationId, activeOrg.id),
        eq(invitation.status, 'pending')
      ))
      .limit(1);

    if (existingInvitation.length > 0) {
      return NextResponse.json(
        { error: 'Invitation already sent to this email' },
        { status: 400 }
      );
    }

    // Create invitation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const [newInvitation] = await db
      .insert(invitation)
      .values({
        organizationId: activeOrg.id,
        email,
        role,
        status: 'pending',
        expiresAt,
        inviterId: currentUser.id,
        selectedProjects: JSON.stringify(selectedProjects)
      })
      .returning();

    // Get selected projects info for the email
    const selectedProjectDetails = await db
      .select({
        id: projects.id,
        name: projects.name
      })
      .from(projects)
      .where(and(
        inArray(projects.id, selectedProjects),
        eq(projects.status, 'active')
      ));

    // Send email invitation
    const emailService = EmailService.getInstance();
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${newInvitation.id}`;
    
    let projectInfo = '';
    if (selectedProjectDetails.length > 0) {
      const projectNames = selectedProjectDetails.map(p => p.name);
      if (projectNames.length === 1) {
        projectInfo = ` You'll have access to the <strong>${projectNames[0]}</strong> project.`;
      } else {
        projectInfo = ` You'll have access to the following projects: <strong>${projectNames.join(', ')}</strong>.`;
      }
    }
    
    const emailResult = await emailService.sendEmail({
      to: email,
      subject: `You're invited to join ${activeOrg.name} on Supercheck`,
      text: `You've been invited to join ${activeOrg.name} as a ${role}.${projectInfo}\n\nClick here to accept: ${inviteUrl}\n\nThis invitation expires in 7 days.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #333; margin-bottom: 20px;">You're invited to join ${activeOrg.name}</h1>
            <p style="color: #666; font-size: 16px; line-height: 1.5;">
              You've been invited to join <strong>${activeOrg.name}</strong> as a <strong>${role}</strong> on Supercheck.${projectInfo}
            </p>
            <div style="margin: 30px 0;">
              <a href="${inviteUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #999; font-size: 14px;">
              This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              This email was sent by Supercheck. If you have any questions, please contact the person who invited you.
            </p>
          </div>
        </div>
      `
    });

    if (!emailResult.success) {
      console.error(`Failed to send invitation email to ${email}:`, emailResult.error);
      // Still return success since the invitation was created, just log the email error
      console.log(`📧 Email failed, but invitation created. Manual link: ${inviteUrl}`);
    } else {
      console.log(`📧 Email invitation sent successfully to ${email} for organization ${activeOrg.name}`);
    }

    // Log the audit event for member invitation
    await logAuditEvent({
      userId: currentUser.id,
      organizationId: activeOrg.id,
      action: 'member_invited',
      resource: 'invitation',
      resourceId: newInvitation.id,
      metadata: {
        invitedEmail: email,
        role: role,
        selectedProjectsCount: selectedProjects.length,
        selectedProjects: selectedProjectDetails.map(p => ({ id: p.id, name: p.name })),
        organizationName: activeOrg.name,
        emailSent: emailResult.success,
        expiresAt: newInvitation.expiresAt?.toISOString()
      },
      success: true
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newInvitation.id,
        email: newInvitation.email,
        role: newInvitation.role,
        status: newInvitation.status,
        expiresAt: newInvitation.expiresAt,
        inviteLink: inviteUrl,
        emailSent: emailResult.success,
        emailError: emailResult.success ? undefined : emailResult.error
      }
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    return NextResponse.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}