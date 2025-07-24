import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/utils/db";
import { authSchema } from "../db/schema/schema";
import { apiKey, organization, admin } from "better-auth/plugins";

import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    emailAndPassword: {  
        enabled: true
    },
    database: drizzleAdapter(db, {
        provider: "pg", // PostgreSQL
        schema: authSchema
    }),
    plugins: [ 
        // openAPI(),
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
            sendInvitationEmail: async ({ invitation, organization }) => {
                console.log(`Invitation sent to ${invitation.email} for ${organization.name}`);
                // Implement your email sending logic here            
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
 
});

