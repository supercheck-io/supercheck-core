# Playwright Configuration Optimization

## Overview
The Playwright configuration has been optimized for the Supercheck execution architecture to balance performance, resource usage, and reliability.

## Key Optimizations

### 1. Worker Count Management
```javascript
workers: getOptimalWorkerCount()
```

**Previous**: `workers: process.env.CI ? 3 : undefined` (CPU cores in dev)
**Optimized**: 
- Production/CI: `1` worker (aligned with execution service limits)
- Development: `2` workers (balanced performance)

**Rationale**: Prevents Playwright from overwhelming the execution service which limits `maxConcurrentExecutions = 1`.

### 2. Optimized Browser Configuration
**Features**:
- Browser launch arguments optimized for containers
- Consistent artifact collection across environments
- Performance-focused settings for production use

### 3. Timeout Alignment
```javascript
timeout: 110000, // 110 seconds
```

**Previous**: `120000ms` (same as execution service)
**Optimized**: `110000ms` (10s buffer for cleanup)

**Rationale**: Ensures Playwright times out before the execution service, allowing proper cleanup.

### 4. Artifact Strategy
```javascript
trace: 'on',
screenshot: 'on',
video: 'on',
```

**Benefits**:
- Always collect artifacts for comprehensive debugging
- Consistent behavior across all environments
- Full test execution visibility

### 5. Browser Optimization
```javascript
launchOptions: {
  args: [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-sandbox',
    // ... memory optimizations for low-memory environments
  ]
}
```

**Features**:
- Container-friendly settings
- Memory pressure handling
- Performance optimizations

## Environment Variables

### Core Settings
```env
# Basic configuration
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_RETRIES=2
NODE_ENV=production
```

### Optional Browser Support
```env
# Enable additional browsers (disabled by default for performance)
ENABLE_FIREFOX=false
ENABLE_WEBKIT=false
ENABLE_MOBILE=false
```

### Advanced Options
```env
# JSON reporter for metrics (optional)
ENABLE_JSON_REPORTER=false
```

## Performance Impact

### Before Optimization
- **Workers**: Up to CPU core count (4-8+ in dev)
- **Memory**: Uncontrolled memory management
- **Timeouts**: Risk of execution service timeout conflicts
- **Artifacts**: Inconsistent collection strategy

### After Optimization
- **Workers**: 1-2 workers (controlled)
- **Memory**: Optimized browser launch arguments
- **Timeouts**: Proper cleanup time allocated
- **Artifacts**: Always collected for comprehensive debugging

## Production Deployment

### Recommended Settings
```env
NODE_ENV=production
PLAYWRIGHT_HEADLESS=true
ENABLE_FIREFOX=false
ENABLE_WEBKIT=false
ENABLE_MOBILE=false
```

### Container Resource Requirements
```yaml
# Docker container limits
memory: 4Gi        # Minimum recommended
cpu: 2             # 2 CPU cores
```

### Scaling Considerations
- Each worker instance processes 1 execution at a time
- Horizontal scaling preferred over increasing worker count
- Monitor container memory usage and adjust Docker limits accordingly

## Monitoring

### Key Metrics to Watch
1. **Container Memory Usage**: Monitor Docker container memory consumption
2. **Execution Time**: Should complete within 110 seconds
3. **Artifact Size**: Monitor S3 storage growth
4. **Worker Utilization**: Should align with queue capacity

### Troubleshooting

**High Memory Usage**:
- Reduce Docker container memory limits
- Monitor S3 storage usage for artifacts
- Consider reducing artifact retention in S3

**Slow Execution**:
- Check if running in headless mode
- Verify browser launch arguments
- Monitor network latency

**Timeout Issues**:
- Increase individual action timeouts if needed
- Check for infinite loops in test scripts
- Verify network connectivity

## Migration Guide

### From Previous Config
1. Remove manual worker count settings
2. Add memory threshold configuration
3. Update environment variables
4. Test with reduced worker count

### Validation Steps
1. Run sample test executions
2. Monitor memory usage patterns
3. Verify artifact generation
4. Check execution times
5. Validate S3 uploads

## Best Practices

1. **Always use headless mode** in production
2. **Monitor memory thresholds** and adjust as needed
3. **Keep worker count low** (1-2 maximum)
4. **Enable additional browsers only when necessary**
5. **Use JSON reporter only for metrics collection**
6. **Regular cleanup** of old artifacts in S3

This optimized configuration ensures reliable, efficient test execution while maintaining debugging capabilities and staying within resource constraints.