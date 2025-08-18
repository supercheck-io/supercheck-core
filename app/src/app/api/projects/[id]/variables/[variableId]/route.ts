import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { projectVariables, projects } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from '@/lib/rbac/middleware';
import { canManageProjectVariables } from "@/lib/rbac/variable-permissions";
import { updateVariableSchema } from "@/lib/validations/variable";
import { encryptValue, decryptValue } from "@/lib/encryption";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  let userId: string | undefined;
  let projectId: string | undefined;
  let variableId: string | undefined;
  let body: Record<string, unknown> | undefined;
  let project: { id: string; organizationId: string }[] = [];
  
  try {
    const authResult = await requireAuth();
    userId = authResult.userId;
    const resolvedParams = await params;
    projectId = resolvedParams.id;
    variableId = resolvedParams.variableId;

    // Check if user has permission to manage variables
    const hasManageAccess = await canManageProjectVariables(userId, projectId);
    if (!hasManageAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get project info for organization ID
    project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project.length) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("Invalid JSON in request body:", parseError);
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    
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

    // Log audit event for variable update
    try {
      const changedFields = Object.keys(updateData).filter(key => key !== 'updatedAt');
      await logAuditEvent({
        userId,
        organizationId: project[0].organizationId,
        action: 'variable_update',
        resource: 'project_variable',
        resourceId: variableId,
        metadata: {
          projectId,
          variableKey: updatedVariable.key,
          isSecret: updatedVariable.isSecret,
          changedFields,
          wasSecretChanged: changedFields.includes('isSecret'),
          wasValueChanged: changedFields.includes('value') || changedFields.includes('encryptedValue')
        },
        success: true
      });
    } catch (auditError) {
      console.error('Failed to log audit event for variable update:', auditError);
      // Continue with success response as audit failure shouldn't break the operation
    }

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
    // Log audit event for variable update failure
    if (userId && projectId && variableId) {
      try {
        await logAuditEvent({
          userId,
          organizationId: project[0]?.organizationId,
          action: 'variable_update',
          resource: 'project_variable',
          resourceId: variableId,
          metadata: {
            projectId,
            variableKey: body?.key || 'unknown',
            errorType: error instanceof z.ZodError ? 'validation_error' : 'internal_error'
          },
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (auditError) {
        console.error('Failed to log audit event for variable update failure:', auditError);
      }
    }

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
  let userId: string | undefined;
  let projectId: string | undefined;
  let variableId: string | undefined;
  let project: { id: string; organizationId: string }[] = [];
  
  try {
    const authResult = await requireAuth();
    userId = authResult.userId;
    const resolvedParams = await params;
    projectId = resolvedParams.id;
    variableId = resolvedParams.variableId;

    // Check if user has permission to manage variables
    const hasManageAccess = await canManageProjectVariables(userId, projectId);
    if (!hasManageAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get project info for organization ID
    project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project.length) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

    // Log audit event for variable deletion
    try {
      await logAuditEvent({
        userId,
        organizationId: project[0].organizationId,
        action: 'variable_delete',
        resource: 'project_variable',
        resourceId: variableId,
        metadata: {
          projectId,
          variableKey: existingVariable.key,
          wasSecret: existingVariable.isSecret
        },
        success: true
      });
    } catch (auditError) {
      console.error('Failed to log audit event for variable deletion:', auditError);
      // Continue with success response as audit failure shouldn't break the operation
    }

    return NextResponse.json({
      success: true,
      message: "Variable deleted successfully",
    });
  } catch (error) {
    // Log audit event for variable deletion failure
    if (userId && projectId && variableId) {
      try {
        await logAuditEvent({
          userId,
          organizationId: project[0]?.organizationId,
          action: 'variable_delete',
          resource: 'project_variable',
          resourceId: variableId,
          metadata: {
            projectId,
            errorType: 'internal_error'
          },
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (auditError) {
        console.error('Failed to log audit event for variable deletion failure:', auditError);
      }
    }

    console.error("Error deleting project variable:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}