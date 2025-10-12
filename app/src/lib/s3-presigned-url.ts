import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "minioadmin",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "minioadmin",
  },
  forcePathStyle: true,
});

/**
 * Generate a presigned URL from an S3 reference
 * @param s3Reference - S3 reference in format: bucket/key or full S3 URL
 * @param expiresIn - Expiration time in seconds (default: 7 days)
 * @returns Presigned URL or null if invalid reference
 */
export async function generatePresignedUrl(
  s3Reference: string | null | undefined,
  expiresIn: number = 604800 // 7 days
): Promise<string | null> {
  if (!s3Reference) {
    return null;
  }

  try {
    // Parse the S3 reference to extract bucket and key
    let bucket: string;
    let key: string;

    // Handle format: bucket/key
    if (s3Reference.includes("/") && !s3Reference.startsWith("http")) {
      const parts = s3Reference.split("/");
      bucket = parts[0];
      key = parts.slice(1).join("/");
    }
    // Handle old format: full S3 URL (for backward compatibility)
    else if (s3Reference.startsWith("http")) {
      const url = new URL(s3Reference);
      const pathParts = url.pathname.split("/").filter(Boolean);
      bucket = pathParts[0];
      key = pathParts.slice(1).join("/");
    }
    // Invalid format
    else {
      console.error(`[S3] Invalid S3 reference format: ${s3Reference}`);
      return null;
    }

    // Generate presigned URL
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
    });

    return presignedUrl;
  } catch (error) {
    console.error(`[S3] Error generating presigned URL for ${s3Reference}:`, error);
    return null;
  }
}

/**
 * Generate presigned URLs for multiple S3 references
 * @param references - Array of S3 references
 * @param expiresIn - Expiration time in seconds (default: 7 days)
 * @returns Array of presigned URLs (null for invalid references)
 */
export async function generatePresignedUrls(
  references: (string | null | undefined)[],
  expiresIn: number = 604800
): Promise<(string | null)[]> {
  return Promise.all(
    references.map((ref) => generatePresignedUrl(ref, expiresIn))
  );
}
