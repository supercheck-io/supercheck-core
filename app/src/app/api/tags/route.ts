import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/utils/db';
import { tags } from '@/db/schema/schema';
import { auth } from '@/utils/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all tags (no organization scoping like other entities)
    const allTags = await db
      .select()
      .from(tags)
      .orderBy(tags.name);

    return NextResponse.json(allTags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, color } = await request.json();

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



    // Check if tag already exists (global check, no organization scoping)
    const existingTag = await db
      .select()
      .from(tags)
      .where(eq(tags.name, trimmedName))
      .limit(1);

    if (existingTag.length > 0) {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
    }

    // Check if we've reached the maximum number of tags (50)
    const totalTags = await db
      .select({ count: tags.id })
      .from(tags);

    if (totalTags.length >= 50) {
      return NextResponse.json({ error: 'Maximum of 50 tags allowed per project' }, { status: 400 });
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
        organizationId: null, // No organization scoping
        createdByUserId: session.user.id,
      })
      .returning();

    return NextResponse.json(newTag, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 