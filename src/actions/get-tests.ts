"use server";

import { tests } from "@/db/schema";
import { getDb } from "@/db/client";
import { desc } from "drizzle-orm";
import { decodeTestScript } from "./get-test";

/**
 * Server action to get all tests from the database
 * @returns All tests with decoded scripts
 */
export async function getTests() {
  try {
    const db = await getDb();
    
    // Query the database for all tests, ordered by creation date (newest first)
    const result = await db
      .select()
      .from(tests)
      .orderBy(desc(tests.createdAt));

    // Decode all scripts before returning
    const testsWithDecodedScripts = await Promise.all(
      result.map(async (test) => {
        const decodedScript = await decodeTestScript(test.script || "");
        
        return {
          id: test.id,
          title: test.title,
          description: test.description,
          script: decodedScript,
          priority: test.priority,
          type: test.type,
          createdAt: test.createdAt,
          updatedAt: test.updatedAt,
        };
      })
    );

    // Return the test data
    return {
      success: true,
      tests: testsWithDecodedScripts,
    };
  } catch (error) {
    console.error("Error fetching tests:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      tests: [],
    };
  }
}
