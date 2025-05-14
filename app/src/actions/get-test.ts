"use server";

declare const Buffer: {
  from(data: string, encoding: string): { toString(encoding: string): string };
};

import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";

/**
 * Helper function to decode base64-encoded test scripts
 * Works in both client and server environments
 */
export async function decodeTestScript(base64Script: string): Promise<string> {
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

/**
 * Server action to get a test from the database by ID
 * @param id The ID of the test to retrieve
 * @returns The test data or null if not found
 */
export async function getTest(id: string) {
  try {
    const db = await getDb();

    // Query the database for the test with the given ID
    const result = await db
      .select()
      .from(tests)
      .where(eq(tests.id, id))
      .limit(1);

    // If no test was found, return null
    if (result.length === 0) {
      return { success: false, error: "Test not found" };
    }

    const test = result[0];

    // Decode the base64 script before returning
    const decodedScript = await decodeTestScript(test.script || "");

    // Return the test data
    return {
      success: true,
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        script: decodedScript, // Return the decoded script
        priority: test.priority,
        type: test.type,
        updatedAt: test.updatedAt,
        createdAt: test.createdAt,
      },
    };
  } catch (error) {
    console.error("Error fetching test:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
