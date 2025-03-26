import { getContentType } from "@/lib/test-execution";
import { NextRequest } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";

const { join, normalize } = path;

/**
 * Find the most recent test result directory that exists
 */
function findMostRecentTestResultDir(publicDir: string): string | null {
  try {
    const testResultsDir = normalize(join(publicDir, "test-results"));
    if (!existsSync(testResultsDir)) {
      return null;
    }

    const dirs = readdirSync(testResultsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (dirs.length === 0) {
      return null;
    }

    // Sort directories by creation time (most recent first)
    const sortedDirs = dirs.sort((a, b) => {
      const statA = existsSync(join(testResultsDir, a, "report", "index.html"));
      const statB = existsSync(join(testResultsDir, b, "report", "index.html"));
      
      // Prioritize directories that have a report
      if (statA && !statB) return -1;
      if (!statA && statB) return 1;
      
      // Otherwise sort by name (which might contain a timestamp)
      return b.localeCompare(a);
    });

    return sortedDirs[0];
  } catch (error) {
    console.error("Error finding most recent test result directory:", error);
    return null;
  }
}

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

    // The first segment is the ID
    const id = pathSegments[0];
    const remainingPath = pathSegments.slice(1);
    const publicDir = normalize(join(process.cwd(), "public"));

    // Try to find the test results directory with the given ID
    let testResultsDir = normalize(join(publicDir, "test-results", id));
    
    // If the directory doesn't exist, try to find the most recent directory
    if (!existsSync(testResultsDir)) {
      console.log(`Test results directory not found for ID: ${id}`);
      const mostRecentDir = findMostRecentTestResultDir(publicDir);
      if (mostRecentDir) {
        console.log(`Using most recent test results directory: ${mostRecentDir}`);
        testResultsDir = normalize(join(publicDir, "test-results", mostRecentDir));
      } else {
        return new Response(`No test results found for ID: ${id}`, { status: 404 });
      }
    }

    // Construct the file path
    const filePath = normalize(join(testResultsDir, ...remainingPath));

    // Check if the file exists
    if (!existsSync(filePath)) {
      return new Response(`File not found: ${filePath}`, { status: 404 });
    }

    // Read the file content
    const content = await readFile(filePath);

    // Get the content type based on file extension
    const contentType = getContentType(filePath);

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
