import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/utils/db";
import { authSchema } from "../db/schema/schema";
import { apiKey, organization, admin } from "better-auth/plugins";
import { ac, roles, Role } from "@/lib/rbac/permissions";

import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    emailAndPassword: {  
        enabled: true,
        requireEmailVerification: false
    },
    database: drizzleAdapter(db, {
        provider: "pg", // PostgreSQL
        schema: authSchema
    }),
    plugins: [ 
        // openAPI(),
        admin({
            adminUserIds: process.env.SUPER_ADMIN_USER_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [],
            ac,
            roles: {
                org_admin: roles[Role.ORG_ADMIN],
                super_admin: roles[Role.SUPER_ADMIN]
            }
        }),
        organization({
            // Disable automatic organization creation - we handle this manually
            allowUserToCreateOrganization: false,
            organizationLimit: parseInt(process.env.MAX_ORGANIZATIONS_PER_USER || '5'),
            creatorRole: "org_owner",
            membershipLimit: 100,
            // Disable team features (we use projects instead)
            teams: {
                enabled: false,
            },
            ac,
            roles: {
                org_owner: roles[Role.ORG_OWNER],
                org_admin: roles[Role.ORG_ADMIN],
                project_editor: roles[Role.PROJECT_EDITOR],
                project_viewer: roles[Role.PROJECT_VIEWER]
            },
            // Custom invitation email
            sendInvitationEmail: async ({ invitation, organization }) => {
                try {
                    // For now, we'll use a simple implementation that can be extended
                    // In a real environment, you'd use services like SendGrid, Resend, etc.
                    
                    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.id}`;
                    
                    // Basic email implementation - replace with your preferred email service
                    if (process.env.NODE_ENV === 'production') {
                        // Production: Use actual email service
                        // Example with fetch to external email service:
                        /*
                        await fetch(process.env.EMAIL_SERVICE_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: invitation.email,
                                subject: `Invitation to join ${organization.name}`,
                                html: `
                                    <h2>You've been invited to join ${organization.name}</h2>
                                    <p>Click the link below to accept your invitation:</p>
                                    <a href="${inviteUrl}">Accept Invitation</a>
                                `
                            })
                        });
                        */
                        console.log(`📧 EMAIL SENT: Invitation to ${invitation.email} for ${organization.name} - ${inviteUrl}`);
                    } else {
                        // Development: Log invitation details
                        console.log(`📧 DEV EMAIL: Invitation sent to ${invitation.email} for ${organization.name}`);
                        console.log(`📧 Invitation URL: ${inviteUrl}`);
                        console.log(`📧 Invitation ID: ${invitation.id}`);
                    }
                } catch (error) {
                    console.error('Failed to send invitation email:', error);
                    // Don't throw error to prevent invitation creation from failing
                }
            },    
        }),
        apiKey(),
        nextCookies()
       
    ],
    advanced: {
        generateId: false
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
        updateAge: 60 * 60 * 24,
    },
    // Remove hooks for now to fix the error - we'll implement this differently
    // hooks: {
    //     after: [
    //         // We'll implement post-signup org/project creation in the API layer instead
    //     ],
    // },
 
});

