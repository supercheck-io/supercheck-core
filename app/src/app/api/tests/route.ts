import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { tests } from "@/db/schema/schema";
import { desc } from "drizzle-orm";

declare const Buffer: {
  from(data: string, encoding: string): { toString(encoding: string): string };
};

/**
 * Helper function to decode base64-encoded test scripts
 * Works in both client and server environments
 */
async function decodeTestScript(base64Script: string): Promise<string> {
  // Check if the string is base64 encoded
  // A valid base64 string should only contain these characters
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  const isBase64 = base64Regex.test(base64Script);

  if (!isBase64) {
    // If it's not base64, return as is
    return base64Script;
  }

  try {
    // In Node.js environment (server-side)
    if (typeof window === "undefined") {
      const decoded = Buffer.from(base64Script, "base64").toString("utf-8");
      return decoded;
    }
    // Fallback for browser environment
    return base64Script;
  } catch (error) {
    console.error("Error decoding base64:", error);
    // Return original if decoding fails
    return base64Script;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Fetch all tests from the database
    const allTests = await db
      .select()
      .from(tests)
      .orderBy(desc(tests.createdAt));

    // Map the database results to the expected format
    const formattedTests = await Promise.all(allTests.map(async (test) => {
      // Decode the script if it exists
      const decodedScript = test.script ? await decodeTestScript(test.script) : "";
      
      return {
        id: test.id,
        title: test.title,
        description: test.description,
        priority: test.priority,
        type: test.type,
        script: decodedScript, // Include the decoded script
        createdAt: test.createdAt ? new Date(test.createdAt).toISOString() : null,
        updatedAt: test.updatedAt ? new Date(test.updatedAt).toISOString() : null,
      };
    }));

    return NextResponse.json(formattedTests);
  } catch (error) {
    console.error("Error fetching tests:", error);
    
    // Return more detailed error information in development
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return NextResponse.json(
      { 
        error: "Failed to fetch tests",
        details: isDevelopment ? (error as Error).message : undefined
      },
      { status: 500 }
    );
  }
} 