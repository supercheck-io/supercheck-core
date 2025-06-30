"use server";

import { tests } from "@/db/schema/schema";
import { desc } from "drizzle-orm";
import { db } from "../utils/db";
import { decodeTestScript } from "./get-test";

/**
 * Server action to get all tests from the database
 * @returns All tests with minimal data needed for selection
 */
export async function getTests() {
  try {
    // Fetch all tests from the database
    const result = await db.select().from(tests)
      .orderBy(desc(tests.createdAt));
    
    // Map the database results to the expected format
    const formattedTests = await Promise.all(result.map(async (test) => {
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
    
    return { success: true, tests: formattedTests };
  } catch (error) {
    console.error("Error fetching tests:", error);
    return { 
      success: false, 
      tests: null, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}
