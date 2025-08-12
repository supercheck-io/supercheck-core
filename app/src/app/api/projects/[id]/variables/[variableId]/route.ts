import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { projectVariables } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from '@/lib/rbac/middleware';
import { canManageProjectVariables } from "@/lib/rbac/variable-permissions";
import { updateVariableSchema } from "@/lib/validations/variable";
import { encryptValue, decryptValue } from "@/lib/encryption";
import { z } from "zod";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const resolvedParams = await params;
    const projectId = resolvedParams.id;
    const { variableId } = resolvedParams;

    // Check if user has permission to manage variables
    const hasManageAccess = await canManageProjectVariables(userId, projectId);
    if (!hasManageAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if variable exists and belongs to the project
    const [existingVariable] = await db
      .select()
      .from(projectVariables)
      .where(
        and(
          eq(projectVariables.id, variableId),
          eq(projectVariables.projectId, projectId)
        )
      );

    if (!existingVariable) {
      return NextResponse.json({ error: "Variable not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updateVariableSchema.parse(body);

    // If key is being changed, check for conflicts
    if (validatedData.key && validatedData.key !== existingVariable.key) {
      const conflictingVariable = await db
        .select()
        .from(projectVariables)
        .where(
          and(
            eq(projectVariables.projectId, projectId),
            eq(projectVariables.key, validatedData.key)
          )
        )
        .limit(1);

      if (conflictingVariable.length > 0) {
        return NextResponse.json(
          { error: "Variable with this name already exists" },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: Record<string, string | boolean | Date | null> = {
      updatedAt: new Date(),
    };

    if (validatedData.key !== undefined) {
      updateData.key = validatedData.key;
    }

    if (validatedData.description !== undefined) {
      updateData.description = validatedData.description;
    }

    if (validatedData.isSecret !== undefined) {
      updateData.isSecret = validatedData.isSecret;
    }

    // Handle value update
    if (validatedData.value !== undefined) {
      if (validatedData.isSecret ?? existingVariable.isSecret) {
        // Encrypt the new value
        const encrypted = encryptValue(validatedData.value, projectId);
        updateData.encryptedValue = encrypted;
        updateData.value = '[ENCRYPTED]';
      } else {
        // Store as plain text
        updateData.value = validatedData.value;
        updateData.encryptedValue = null;
      }
    }

    // If changing from secret to non-secret, decrypt the value
    if (validatedData.isSecret === false && existingVariable.isSecret) {
      try {
        const decryptedValue = decryptValue(existingVariable.encryptedValue || '', projectId);
        updateData.value = decryptedValue;
        updateData.encryptedValue = null;
      } catch {
        return NextResponse.json(
          { error: "Cannot decrypt existing secret value" },
          { status: 400 }
        );
      }
    }

    // If changing from non-secret to secret, encrypt the existing value
    if (validatedData.isSecret === true && !existingVariable.isSecret) {
      const valueToEncrypt = validatedData.value || existingVariable.value;
      const encrypted = encryptValue(valueToEncrypt, projectId);
      updateData.encryptedValue = encrypted;
      updateData.value = '[ENCRYPTED]';
    }

    // Update the variable
    const [updatedVariable] = await db
      .update(projectVariables)
      .set(updateData)
      .where(eq(projectVariables.id, variableId))
      .returning();

    // Return the variable without encrypted data
    const responseVariable = {
      ...updatedVariable,
      encryptedValue: undefined,
      value: updatedVariable.isSecret ? '[ENCRYPTED]' : updatedVariable.value,
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

    console.error("Error updating project variable:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  try {
    const { userId } = await requireAuth();
    const resolvedParams = await params;
    const projectId = resolvedParams.id;
    const { variableId } = resolvedParams;

    // Check if user has permission to manage variables
    const hasManageAccess = await canManageProjectVariables(userId, projectId);
    if (!hasManageAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if variable exists and belongs to the project
    const [existingVariable] = await db
      .select()
      .from(projectVariables)
      .where(
        and(
          eq(projectVariables.id, variableId),
          eq(projectVariables.projectId, projectId)
        )
      );

    if (!existingVariable) {
      return NextResponse.json({ error: "Variable not found" }, { status: 404 });
    }

    // Delete the variable
    await db
      .delete(projectVariables)
      .where(eq(projectVariables.id, variableId));

    return NextResponse.json({
      success: true,
      message: "Variable deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project variable:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}