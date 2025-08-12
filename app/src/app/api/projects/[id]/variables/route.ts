import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { projectVariables, projects } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from '@/lib/rbac/middleware';
import { canManageProjectVariables, canViewProjectVariables } from "@/lib/rbac/variable-permissions";
import { createVariableSchema } from "@/lib/validations/variable";
import { encryptValue, decryptValue } from "@/lib/encryption";
import { z } from "zod";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const resolvedParams = await params;
    const projectId = resolvedParams.id;

    // Check if user has access to view variables for this project
    const hasViewAccess = await canViewProjectVariables(userId, projectId);
    if (!hasViewAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if user has manage access (to see secret values)
    const hasManageAccess = await canManageProjectVariables(userId, projectId);

    // Fetch variables
    const variables = await db
      .select()
      .from(projectVariables)
      .where(eq(projectVariables.projectId, projectId))
      .orderBy(projectVariables.createdAt);

    // Process variables based on permissions
    const processedVariables = variables.map((variable) => {
      if (variable.isSecret && !hasManageAccess) {
        // Don't show secret values to non-managers
        return {
          ...variable,
          value: undefined,
          encryptedValue: undefined,
        };
      } else if (variable.isSecret && hasManageAccess) {
        // Decrypt secret values for managers
        try {
          const decryptedValue = decryptValue(variable.encryptedValue || '', projectId);
          return {
            ...variable,
            value: decryptedValue,
            encryptedValue: undefined, // Don't send encrypted value to client
          };
        } catch (error) {
          console.error('Failed to decrypt variable:', variable.key, error);
          return {
            ...variable,
            value: '[DECRYPTION_ERROR]',
            encryptedValue: undefined,
          };
        }
      } else {
        // Non-secret variables
        return {
          ...variable,
          encryptedValue: undefined,
        };
      }
    });

    return NextResponse.json({
      success: true,
      data: processedVariables,
      canManage: hasManageAccess,
    });
  } catch (error) {
    console.error("Error fetching project variables:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const resolvedParams = await params;
    const projectId = resolvedParams.id;

    // Check if user has permission to manage variables
    const hasManageAccess = await canManageProjectVariables(userId, projectId);
    if (!hasManageAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify project exists and user has access
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project.length) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = createVariableSchema.parse(body);

    // Check if variable key already exists for this project
    const existingVariable = await db
      .select()
      .from(projectVariables)
      .where(
        and(
          eq(projectVariables.projectId, projectId),
          eq(projectVariables.key, validatedData.key)
        )
      )
      .limit(1);

    if (existingVariable.length > 0) {
      return NextResponse.json(
        { error: "Variable with this name already exists" },
        { status: 400 }
      );
    }

    // Prepare variable data
    const variableData = {
      projectId,
      key: validatedData.key,
      isSecret: validatedData.isSecret,
      description: validatedData.description || null,
      createdByUserId: userId,
      value: '',
      encryptedValue: null as string | null,
    };

    if (validatedData.isSecret) {
      // Encrypt the value and store in encryptedValue field
      const encrypted = encryptValue(validatedData.value, projectId);
      variableData.encryptedValue = encrypted;
      variableData.value = '[ENCRYPTED]'; // Placeholder
    } else {
      variableData.value = validatedData.value;
      variableData.encryptedValue = null;
    }

    // Insert the variable
    const [newVariable] = await db
      .insert(projectVariables)
      .values(variableData)
      .returning();

    // Return the variable (without encrypted data)
    const responseVariable = {
      ...newVariable,
      encryptedValue: undefined,
      value: validatedData.isSecret ? '[ENCRYPTED]' : newVariable.value,
    };

    return NextResponse.json({
      success: true,
      data: responseVariable,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error creating project variable:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}