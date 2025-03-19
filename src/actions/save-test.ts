"use server";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  tests,
  testsInsertSchema,
  type TestPriority,
  type TestType,
} from "@/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Initialize the database client
const client = createClient({
  url: process.env.DB_FILE_NAME || "file:./dev.sqlite",
});

const db = drizzle(client);

// Create a schema for the save test action
const saveTestSchema = testsInsertSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SaveTestInput = z.infer<typeof saveTestSchema>;

/**
 * Server action to save a test to the database
 * @param data The test data to save
 * @returns The saved test ID
 */
export async function saveTest(
  data: SaveTestInput
): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    // Validate the input data
    const validatedData = saveTestSchema.parse(data);

    // Insert the test into the database with explicit type casting
    const insertedTests = await db
      .insert(tests)
      .values({
        title: validatedData.title,
        description: validatedData.description || null,
        script: validatedData.script,
        priority: validatedData.priority as TestPriority,
        type: validatedData.type as TestType,
      })
      .returning({ id: tests.id });

    // Revalidate the tests page to show the updated data
    revalidatePath("/tests");

    // Return success with the ID
    return {
      id: insertedTests[0].id,
      success: true,
    };
  } catch (error) {
    console.error("Error saving test:", error);
    return {
      id: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
