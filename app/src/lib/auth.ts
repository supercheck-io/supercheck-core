import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db"; 
import { apiKey, organization, admin } from "better-auth/plugins";
import {authSchema} from "@/db/schema/auth-schema";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
    emailAndPassword: {  
        enabled: true
    },
    database: drizzleAdapter(db, {
        provider: "pg", // PostgreSQL
        schema: authSchema
    }),
    plugins: [ 
        admin(),
        organization({
            // Enable organization features
            allowUserToCreateOrganization: true,
            organizationLimit: 5,
            creatorRole: "owner",
            membershipLimit: 100,
            // Enable team features
            teams: {
                enabled: true,
                allowRemovingAllTeams: false,
                teamLimit: 10,
            },
            // Custom invitation email
            sendInvitationEmail: async ({ invitation, organization, inviter }) => {
                console.log(`Invitation sent to ${invitation.email} for ${organization.name}`);
                // Implement your email sending logic here            
            },    
        }),
        apiKey(),
        nextCookies()
       
    ],
    session: {
        expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    }
});

