import { createAuthClient } from "better-auth/react"

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

// Create the auth client for client-side authentication
const auth = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: `${appUrl}/api/auth`, // Base URL for auth API endpoints
})

export const { signIn, signUp, useSession, signOut } = auth