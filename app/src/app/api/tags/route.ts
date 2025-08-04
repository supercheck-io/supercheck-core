import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { tags } from '@/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { OrgPermission } from '@/lib/rbac/permissions';
import { getActiveOrganization } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    
    // Get organization context from query params or active organization
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    
    let targetOrganizationId = organizationId;
    
    if (!targetOrganizationId) {
      const activeOrganization = await getActiveOrganization();
      if (!activeOrganization) {
        return NextResponse.json(
          { error: 'No active organization found' },
          { status: 400 }
        );
      }
      targetOrganizationId = activeOrganization.id;
    }
    
    // Build permission context and check access
    const context = await buildPermissionContext(userId, 'organization', targetOrganizationId);
    const canView = await hasPermission(context, OrgPermission.VIEW_TAGS);
    
    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get tags scoped to the organization
    const allTags = await db
      .select()
      .from(tags)
      .where(eq(tags.organizationId, targetOrganizationId))
      .orderBy(tags.name);

    return NextResponse.json(allTags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth();

    const { name, color, organizationId: bodyOrganizationId } = await request.json();
    
    // Get organization context
    let targetOrganizationId = bodyOrganizationId;
    
    if (!targetOrganizationId) {
      const activeOrganization = await getActiveOrganization();
      if (!activeOrganization) {
        return NextResponse.json(
          { error: 'No active organization found' },
          { status: 400 }
        );
      }
      targetOrganizationId = activeOrganization.id;
    }
    
    // Build permission context and check access
    const context = await buildPermissionContext(userId, 'organization', targetOrganizationId);
    const canCreate = await hasPermission(context, OrgPermission.CREATE_TAGS);
    
    if (!canCreate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create tags' },
        { status: 403 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Validate tag name
    if (!trimmedName) {
      return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 });
    }

    if (trimmedName.length < 3 || trimmedName.length > 12) {
      return NextResponse.json({ error: 'Tag name must be between 3 and 12 characters' }, { status: 400 });
    }

    if (/\s/.test(trimmedName)) {
      return NextResponse.json({ error: 'Tag name cannot contain spaces' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      return NextResponse.json({ error: 'Tag name can only contain letters, numbers, underscores, and hyphens' }, { status: 400 });
    }



    // Check if tag already exists within the organization
    const existingTag = await db
      .select()
      .from(tags)
      .where(and(
        eq(tags.name, trimmedName),
        eq(tags.organizationId, targetOrganizationId)
      ))
      .limit(1);

    if (existingTag.length > 0) {
      return NextResponse.json({ error: 'Tag already exists in this organization' }, { status: 409 });
    }

    // Check if we've reached the maximum number of tags (50) per organization
    const totalTags = await db
      .select({ count: tags.id })
      .from(tags)
      .where(eq(tags.organizationId, targetOrganizationId));

    if (totalTags.length >= 50) {
      return NextResponse.json({ error: 'Maximum of 50 tags allowed per organization' }, { status: 400 });
    }

    // Generate a default color if not provided
    const defaultColors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280',
      '#14B8A6', '#F472B6', '#A78BFA', '#FB7185', '#FBBF24'
    ];
    const tagColor = color || defaultColors[Math.floor(Math.random() * defaultColors.length)];

    // Create the tag
    const [newTag] = await db
      .insert(tags)
      .values({
        name: trimmedName,
        color: tagColor,
        organizationId: targetOrganizationId,
        createdByUserId: userId,
      })
      .returning();

    return NextResponse.json(newTag, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 