import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { apikey } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/utils/auth";
import { headers } from "next/headers";

// GET /api/jobs/[id]/api-keys - List API keys for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Verify user is authenticated
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get API keys that belong to this job
    const jobKeys = await db
      .select({
        id: apikey.id,
        name: apikey.name,
        start: apikey.start,
        enabled: apikey.enabled,
        createdAt: apikey.createdAt,
        expiresAt: apikey.expiresAt,
        jobId: apikey.jobId,
      })
      .from(apikey)
      .where(eq(apikey.jobId, jobId));

    return NextResponse.json({
      success: true,
      apiKeys: jobKeys.map((key) => ({
        id: key.id,
        name: key.name,
        enabled: key.enabled,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        start: key.start,
        jobId: key.jobId,
      })),
    });
  } catch (error) {
    console.error("Error fetching job API keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 }
    );
  }
}

// POST /api/jobs/[id]/api-keys - Create API key for job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { name, expiresIn } = await request.json();

    // Verify user is authenticated
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // Enforce max 10 keys per job
    const existingKeys = await db
      .select({ id: apikey.id })
      .from(apikey)
      .where(eq(apikey.jobId, jobId));
    if (existingKeys.length >= 10) {
      return NextResponse.json(
        { error: "Maximum of 10 API keys per job reached" },
        { status: 400 }
      );
    }

    // Create API key directly in database with job association
    const apiKeyId = crypto.randomUUID();
    const apiKeyValue = `job_${crypto.randomUUID().replace(/-/g, '')}`;
    const apiKeyStart = apiKeyValue.substring(0, 8);
    
    const now = new Date();
    const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;
    
    const newApiKey = await db.insert(apikey).values({
      id: apiKeyId,
      name: name.trim(),
      start: apiKeyStart,
      prefix: "job",
      key: apiKeyValue,
      userId: session.user.id,
      jobId: jobId,
      enabled: true,
      expiresAt: expiresAt,
      createdAt: now,
      updatedAt: now,
    }).returning();

    const apiKey = newApiKey[0];

    return NextResponse.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        start: apiKey.start,
        enabled: apiKey.enabled,
        expiresAt: apiKey.expiresAt,
        jobId: apiKey.jobId,
      },
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
} 