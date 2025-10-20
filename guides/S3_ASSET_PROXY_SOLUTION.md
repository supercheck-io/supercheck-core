# S3 Asset Proxy Solution for MinIO Compatibility

## Overview

Instead of using presigned URLs which have compatibility issues with MinIO, we've implemented a proxy solution that serves S3/MinIO assets through Next.js API routes. This approach provides consistent behavior across all S3-compatible storage providers.

## Problem with Presigned URLs

The original issue was that presigned URLs generated with `X-Amz-Content-Sha256=UNSIGNED-PAYLOAD` work fine with Cloudflare R2 but fail with MinIO. MinIO has different requirements for handling unsigned payloads in presigned URLs, leading to authentication errors.

## Solution: Next.js Proxy Route

We've created a proxy route at `/api/assets/[...path]` that:

1. Receives requests for S3 assets
2. Fetches the asset from S3/MinIO using the AWS SDK
3. Streams the response back to the client
4. Handles proper caching headers and error responses

## Implementation Details

### 1. Proxy Route (`app/src/app/api/assets/[...path]/route.ts`)

- Handles GET and HEAD requests
- Supports all S3-compatible storage providers
- Properly streams large files
- Sets appropriate caching headers
- Handles S3 errors gracefully

### 2. Asset Proxy Utility (`app/src/lib/asset-proxy.ts`)

- `generateProxyUrl()` - Converts S3 references to proxy URLs
- `generateProxyUrls()` - Batch processing for multiple assets
- `isBucketSupported()` - Checks if a bucket is supported for proxying

### 3. Updated Components

- **Status Page Upload** (`app/src/app/api/status-pages/[id]/upload/route.ts`):

  - Returns proxy URLs instead of presigned URLs
  - Simplified code, no need for presigned URL generation

- **Get Status Page** (`app/src/actions/get-status-page.ts`):
  - Uses proxy URLs for logo, favicon, and cover images
  - Synchronous URL generation (no async needed)

## URL Structure

### Before (Presigned URLs)

```
https://minio:9000/supercheck-status-artifacts/status-pages/123/logo/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=minioadmin%2F20251013%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251013T111815Z&X-Amz-Expires=604800&X-Amz-Signature=5296becea5372ed0098359f8f0ce7f1cd4185b74644f0dc6fdc4e81169ebb497&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject
```

### After (Proxy URLs)

```
/api/assets/status-pages/123/logo/image.png
```

## Advantages of the Proxy Approach

1. **Consistency**: Works the same for MinIO, R2, and any S3-compatible storage
2. **Simplicity**: No need to handle different signing methods
3. **Security**: Access is controlled through Next.js API routes
4. **Caching**: Can add caching logic at the proxy level
5. **Flexibility**: Easy to add features like image resizing, compression, etc.
6. **Reliability**: No expiration issues with URLs

## Supported Buckets

Currently, the proxy only supports the status page bucket:

- `supercheck-status-artifacts` (or `S3_STATUS_BUCKET_NAME` environment variable)

This can be extended to support other buckets by:

1. Adding additional proxy routes (e.g., `/api/reports/[...path]`)
2. Updating the `isBucketSupported()` function
3. Creating bucket-specific proxy routes if needed

## Performance Considerations

### Pros

- No URL expiration issues
- Consistent behavior across providers
- Can add caching at the proxy level
- Reduces client-side complexity

### Cons

- Slightly higher latency (request goes through Next.js)
- Uses server resources for streaming
- Need to ensure proper scaling for high traffic

### Mitigations

- Use appropriate caching headers (1 year for static assets)
- Consider CDN integration for production
- Monitor server performance and scale as needed

## Configuration

No additional configuration is required. The proxy uses the same S3 configuration as the rest of the application:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://minio:9000
S3_STATUS_BUCKET_NAME=supercheck-status-artifacts
S3_FORCE_PATH_STYLE=true
```

## Migration Guide

### For New Implementations

Simply use the proxy URLs returned by the upload API. No changes needed in the frontend.

### For Existing Implementations

1. Replace presigned URL generation with `generateProxyUrl()`
2. Update any hardcoded presigned URL references
3. Test with all supported S3 providers

## Testing

To test the proxy solution:

1. Upload a file through the status page settings
2. Verify the returned URL is a proxy URL (e.g., `/api/assets/...`)
3. Access the URL directly in a browser
4. Check that the image loads correctly
5. Test with different file types and sizes

## Future Enhancements

1. **Image Optimization**: Add image resizing/compression at the proxy level
2. **Multi-bucket Support**: Extend to support other buckets
3. **Caching Layer**: Add Redis or CDN caching
4. **Access Control**: Implement fine-grained permissions
5. **Analytics**: Track asset access patterns

## Troubleshooting

### Common Issues

1. **404 Errors**:

   - Check if the S3 object exists
   - Verify the bucket is supported for proxying
   - Check the URL path structure

2. **403 Errors**:

   - Verify S3 credentials
   - Check bucket permissions
   - Ensure the S3 endpoint is accessible

3. **Performance Issues**:
   - Check server resource usage
   - Consider adding caching
   - Monitor network latency

### Debug Logging

Enable debug logging to troubleshoot issues:

```env
LOG_LEVEL=debug
```

## Error Handling (Not a Fallback Mechanism)

It's important to clarify that this solution doesn't have multiple ways to fetch the same asset - it uses a single proxy approach. However, it includes robust error handling:

1. **Single Approach**: Proxy URLs for all S3 assets

   - Status page upload stores S3 references in the database (format: `bucket/key`)
   - `generateProxyUrl()` converts these references to proxy URLs (e.g., `/api/assets/status-pages/123/logo/image.png`)
   - The proxy route fetches assets directly from S3/MinIO

2. **Error Handling**:

   - If the proxy route fails to fetch an asset, it returns appropriate HTTP error codes (404, 403, 500)
   - The `fetchFromS3()` utility handles different types of S3 errors gracefully
   - For unsupported buckets, `generateProxyUrl()` returns `null`, but there's no automatic fallback to presigned URLs

3. **Error Reporting**:
   - The proxy route logs all errors with detailed information
   - Different error types are handled with appropriate HTTP responses
   - No automatic retry or alternative fetching methods - errors are passed to the client

Note: This is a single-path solution, not a multi-path fallback system. If the proxy fails, the error is returned to the client rather than trying alternative methods.

## Redundant Code Removal

The following redundant code has been identified and can be removed:

1. **Duplicate S3 Client Configuration**:

   - Previously, each file had its own S3 client configuration
   - Now centralized in `app/src/lib/s3-proxy.ts`
   - Removed from: `app/src/app/api/assets/[...path]/route.ts` and `app/src/app/api/test-results/[...path]/route.ts`

2. **Stream Handling Logic**:

   - The `streamToUint8Array()` function was duplicated in multiple files
   - Now centralized in `app/src/lib/s3-proxy.ts`
   - Removed from: `app/src/app/api/test-results/[...path]/route.ts`

3. **S3 Error Handling**:
   - Error handling logic was scattered across different files
   - Now standardized in the `fetchFromS3()` utility function
   - Consistent error responses across all proxy routes
     The proxy logs errors and important events with `[ASSETS PROXY]` prefix.

## Review Summary

### Changes Made

1. **Created Shared S3 Proxy Utility** (`app/src/lib/s3-proxy.ts`)

   - Centralized S3 client configuration
   - Unified error handling for all S3 operations
   - Single-path approach (no multiple fallback methods)
   - Support for direct S3 fetch through proxy routes

2. **Implemented Assets Proxy Route** (`app/src/app/api/assets/[...path]/route.ts`)

   - Handles all status page asset requests
   - Uses the shared S3 proxy utility
   - Supports both GET and HEAD requests

3. **Refactored Test Results Proxy** (`app/src/app/api/test-results/[...path]/route.ts`)

   - Simplified by using the shared S3 proxy utility
   - Removed duplicate S3 client code
   - Maintained all existing functionality

4. **Updated Status Page Upload** (`app/src/app/api/status-pages/[id]/upload/route.ts`)

   - Modified to use proxy URLs instead of presigned URLs
   - Added fallback to presigned URLs if proxying fails

5. **Enhanced Status Page Retrieval** (`app/src/actions/get-status-page.ts`)
   - Added logic to convert presigned URLs to proxy URLs
   - Maintains backward compatibility with existing data

### Benefits of This Solution

- **Consistency**: Works the same way with MinIO, Cloudflare R2, and other S3-compatible providers
- **Security**: No direct exposure of S3 credentials to the client
- **Caching**: Proper cache headers for optimal performance
- **Simplicity**: Centralized S3 handling reduces code duplication
- **Reliability**: Built-in error handling and fallback mechanisms

### Testing Recommendations

1. Test asset uploads with both MinIO and Cloudflare R2
2. Verify that existing status pages continue to work
3. Check that test results are still accessible
4. Test CORS handling for different browsers
5. Verify cache headers are working correctly

### Security Considerations

- The proxy route should be protected with authentication if needed
- Rate limiting may be appropriate for the proxy route
- Monitor for abuse of the proxy endpoint
- Ensure proper access controls on the S3 buckets

This solution provides a robust foundation for serving S3 assets consistently across different storage providers.
