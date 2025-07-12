import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { tests, testTags, tags } from "@/db/schema/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/utils/auth";
import { headers } from "next/headers";

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
    // Verify user is authenticated
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all tests from the database
    const allTests = await db
      .select()
      .from(tests)
      .orderBy(desc(tests.createdAt));

    // Get tags for all tests
    const allTestTags = await db
      .select({
        testId: testTags.testId,
        tagId: tags.id,
        tagName: tags.name,
        tagColor: tags.color,
      })
      .from(testTags)
      .innerJoin(tags, eq(testTags.tagId, tags.id));

    // Group tags by test ID
    const testTagsMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
    allTestTags.forEach(({ testId, tagId, tagName, tagColor }) => {
      if (!testTagsMap.has(testId)) {
        testTagsMap.set(testId, []);
      }
      testTagsMap.get(testId)!.push({
        id: tagId,
        name: tagName,
        color: tagColor,
      });
    });

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
        tags: testTagsMap.get(test.id) || [], // Include tags
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