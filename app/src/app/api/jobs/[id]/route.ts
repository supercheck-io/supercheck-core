import { NextRequest, NextResponse } from "next/server";
import { updateJob } from "@/actions/update-job";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const body = await request.json();
    const result = await updateJob({
      jobId: params.id,
      ...body
    });
    
    if (result.success) {
      return NextResponse.json(result.job);
    } else {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error updating job:", error);
    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 }
    );
  }
} 