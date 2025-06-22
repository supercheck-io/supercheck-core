import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tests } from "@/db/schema/schema";

export async function GET(request: NextRequest) {
  try {
    // Get the database instance
    const db = await getDb();
    
    // In a real app, you'd get the organization ID from the user's session
    // For now, we'll fetch all tests
    const allTests = await db
      .select({
        id: tests.id,
        title: tests.title,
        description: tests.description,
        type: tests.type,
      })
      .from(tests)
      .orderBy(tests.title);

    // Return the tests, even if empty array
    return NextResponse.json(allTests);
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