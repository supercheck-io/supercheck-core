import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/utils/db";
import { auth } from "@/utils/auth";
import { projectVariables, projects } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import {
  canCreateVariableInProject,
  canDeleteVariableInProject,
  canViewSecretVariableInProject,
} from "@/lib/rbac/middleware";
import { createVariableSchema } from "@/lib/validations/variable";
import { encryptValue } from "@/lib/encryption";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const url = new URL(request.url);
    const projectId =
      url.pathname.split("/projects/")[1]?.split("/")[0] || "";

    // Verify project exists
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project.length) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Check permissions using centralized functions
    const canCreate = await canCreateVariableInProject(userId, projectId);
    const canDelete = await canDeleteVariableInProject(userId, projectId);
    const canViewSecrets = await canViewSecretVariableInProject(userId, projectId);

    // Fetch variables
    // Using ID ordering instead of createdAt since UUIDv7 is time-ordered (PostgreSQL 18+)
    const variables = await db
      .select()
      .from(projectVariables)
      .where(eq(projectVariables.projectId, projectId))
      .orderBy(projectVariables.id);

    // Process variables - never send secret values in list API
    const processedVariables = variables.map((variable) => {
      if (variable.isSecret) {
        return {
          ...variable,
          value: undefined,
          encryptedValue: undefined,
        };
      } else {
        return {
          ...variable,
          encryptedValue: undefined,
        };
      }
    });

    return NextResponse.json({
      success: true,
      data: processedVariables,
      // New names
      canCreate,
      canDelete,
      canViewSecrets,
      // Backward compatibility with old names
      canCreateEdit: canCreate,
      canManage: canDelete,
    });
  } catch (error) {
    console.error("Error fetching project variables:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const projectId = url.pathname.split("/projects/")[1]?.split("/")[0] || "";

    // Get authenticated user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Verify project exists and user has permission to create variables
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project.length) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Check permission using centralized function
    const canCreate = await canCreateVariableInProject(userId, projectId);
    if (!canCreate) {
      return NextResponse.json(
        { error: "Insufficient permissions to create variables" },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("Invalid JSON in request body:", parseError);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    try {
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
        value: "",
        encryptedValue: null as string | null,
      };

      if (validatedData.isSecret) {
        // Encrypt the value and store in encryptedValue field
        const encrypted = encryptValue(validatedData.value, projectId);
        variableData.encryptedValue = encrypted;
        variableData.value = "[ENCRYPTED]"; // Placeholder
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
        value: validatedData.isSecret ? "[ENCRYPTED]" : newVariable.value,
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
  } catch (error) {
    console.error("Error creating project variable:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
