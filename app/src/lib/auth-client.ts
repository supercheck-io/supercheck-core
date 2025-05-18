import { createAuthClient } from "better-auth/client"
import { organizationClient } from "better-auth/client/plugins"

// Create the auth client for client-side authentication
export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: "/api/auth", // Base URL for auth API endpoints
    plugins: [
        // Organization client plugin for organization management
        organizationClient()
    ]
})

export const { signIn, signUp, useSession } = createAuthClient()