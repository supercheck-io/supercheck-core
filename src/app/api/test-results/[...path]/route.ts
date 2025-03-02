import { getContentType } from "@/lib/test-execution";
import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { createReadStream } from "fs";
import { stat, readFile } from "fs/promises";
import { existsSync } from "fs";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  try {
    // Access params directly - NextJS expects this pattern
    const pathSegments = await params.path;
    if (!pathSegments || pathSegments.length === 0) {
      return new Response("Not Found", { status: 404 });
    }

    // Construct the file path
    const filePath = join(
      process.cwd(),
      "public",
      "test-results",
      ...pathSegments
    );

    // Check if the file exists
    if (!existsSync(filePath)) {
      return new Response(`File not found: ${filePath}`, { status: 404 });
    }

    // Read the file content
    const content = await readFile(filePath);
    
    // Get the content type based on file extension
    const contentType = getContentType(filePath);
    
    // If it's an HTML file, inject the dark theme script
    if (contentType === "text/html") {
      const htmlContent = content.toString();
      const darkThemeScriptPath = "/test-results/dark-theme.js";
      
      // Check if the HTML already has a closing body tag
      if (htmlContent.includes('</body>')) {
        const modifiedContent = htmlContent.replace(
          '</body>',
          `<script src="${darkThemeScriptPath}"></script></body>`
        );
        return new Response(modifiedContent, {
          headers: {
            "Content-Type": contentType,
          },
        });
      }
    }

    // Return the file content with appropriate content type
    return new Response(content, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Error serving test result:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
