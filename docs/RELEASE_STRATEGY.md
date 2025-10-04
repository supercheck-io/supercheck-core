# Release Strategy & Tagging Guide

This document outlines the release strategy, tagging practices, and Docker image management for Supercheck.

## Release Philosophy

Our release strategy follows these principles:
- **Tag-triggered builds only** - No automatic builds on branch pushes or PRs
- **Semantic versioning** - Clear version numbering with meaning
- **Multi-architecture support** - Images built for both AMD64 and ARM64
- **Immutable releases** - Tags represent fixed points in history

## GitHub Actions Workflow

### Trigger Conditions

The build workflow **only** triggers on:

1. **Version Tags**: `v*` pattern (e.g., `v1.2.3`, `v2.0.0-beta.1`)
2. **Manual Workflow Dispatch**: For custom builds and testing

```yaml
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      version: # Custom version tag
      push_latest: # Also tag as latest
```

### What Gets Built

Each release creates Docker images for both services:
- **App service**: `ghcr.io/supercheck-io/supercheck/app`
- **Worker service**: `ghcr.io/supercheck-io/supercheck/worker`

## Tagging Strategy

### Version Tag Format

Follow **Semantic Versioning (semver)** with `v` prefix:

```bash
v<MAJOR>.<MINOR>.<PATCH>[-<PRERELEASE>]
```

**Examples:**
- `v1.0.0` - Major release
- `v1.2.3` - Minor/patch release  
- `v2.0.0-beta.1` - Pre-release
- `v1.1.5-hotfix.1` - Hotfix release

### Docker Image Tags Generated

When you push `v1.2.3`, the following Docker tags are created:

| Docker Tag | Description | Use Case |
|------------|-------------|----------|
| `1.2.3` | Exact version | Production pinning |
| `1.2` | Major.minor | Patch updates |
| `latest` | Latest stable | Development/testing |

## Release Process

### 1. Standard Release

```bash
# Ensure you're on the latest main branch
git checkout main
git pull origin main

# Create annotated tag with release notes
git tag -a v1.2.3 -m "Release v1.2.3

Features:
- Added email notification system
- Improved monitor timeout handling
- Enhanced Docker performance

Bug Fixes:
- Fixed alert rule validation
- Resolved memory leak in worker service"

# Push the tag (triggers GitHub Actions)
git push origin v1.2.3
```

### 2. Pre-release (Beta/RC)

```bash
# For beta releases
git tag -a v1.3.0-beta.1 -m "Beta release v1.3.0-beta.1
- New monitoring dashboard (preview)
- Experimental notification channels"

git push origin v1.3.0-beta.1
```

### 3. Hotfix Release

```bash
# Create hotfix branch from the problematic release
git checkout v1.2.3
git checkout -b hotfix/v1.2.4

# Make the fix and commit
git add .
git commit -m "fix: resolve critical alert delivery issue"

# Tag the hotfix
git tag -a v1.2.4 -m "Hotfix v1.2.4
- Fixed critical alert delivery issue"

git push origin v1.2.4

# Merge back to main
git checkout main
git merge hotfix/v1.2.4
git push origin main
```

### 4. Manual/Custom Build

For testing or special builds:

1. Go to **GitHub Actions** → **Build Multi-Architecture Docker Images**
2. Click **"Run workflow"**
3. Enter custom version: `testing-2024-01-15`
4. Check **"Also tag as latest"** if needed
5. Click **"Run workflow"**

## Version Numbering Guidelines

### Major Version (X.0.0)
- Breaking API changes
- Database schema changes requiring migration
- Architectural changes
- Removal of deprecated features

### Minor Version (1.X.0)  
- New features (backward compatible)
- New API endpoints
- UI enhancements
- Performance improvements

### Patch Version (1.2.X)
- Bug fixes
- Security patches
- Documentation updates
- Minor UI fixes

### Pre-release Suffixes
- `alpha` - Early development (unstable)
- `beta` - Feature complete, testing phase
- `rc` - Release candidate (near final)
- `hotfix` - Emergency fixes

## Best Practices

### ✅ DO

- **Use annotated tags** with meaningful commit messages
- **Test thoroughly** before tagging releases
- **Follow semantic versioning** strictly
- **Pin to specific versions** in production
- **Document breaking changes** in major releases
- **Create release notes** for each version
- **Tag from main branch** for stable releases

### ❌ DON'T

- **Don't push tags for development work** (use branches instead)
- **Don't delete/move tags** once pushed (creates confusion)
- **Don't skip version numbers** (maintain sequence)
- **Don't use `latest` in production** (pin to specific versions)
- **Don't tag without testing** (ensure quality)

## Docker Image Usage

### Production (Recommended)
```yaml
services:
  app:
    image: ghcr.io/supercheck-io/supercheck/app:1.2.3  # Pin exact version
  worker:
    image: ghcr.io/supercheck-io/supercheck/worker:1.2.3
```

### Development/Testing
```yaml
services:
  app:
    image: ghcr.io/supercheck-io/supercheck/app:latest  # Latest stable
  worker:  
    image: ghcr.io/supercheck-io/supercheck/worker:latest
```

### Staging (Version Range)
```yaml
services:
  app:
    image: ghcr.io/supercheck-io/supercheck/app:1.2  # Auto-update patches
  worker:
    image: ghcr.io/supercheck-io/supercheck/worker:1.2
```

## Release Checklist

Before creating a release tag:

- [ ] All tests pass locally
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated (if applicable)
- [ ] Breaking changes are documented
- [ ] Database migrations are tested
- [ ] Security review completed (for major releases)
- [ ] Performance testing done (for major releases)

## Troubleshooting

### Failed Build
If GitHub Actions build fails:
1. Check build logs in Actions tab
2. Fix the issue in code
3. Delete the problematic tag: `git tag -d v1.2.3 && git push origin --delete v1.2.3`
4. Create new tag with incremented patch version: `v1.2.4`

### Wrong Tag Pushed
```bash
# Delete local tag
git tag -d v1.2.3

# Delete remote tag
git push origin --delete v1.2.3

# Create correct tag
git tag -a v1.2.3 -m "Corrected release message"
git push origin v1.2.3
```

## Registry Management

Images are stored in GitHub Container Registry (GHCR):
- **Registry**: `ghcr.io`
- **Namespace**: `supercheck-io/supercheck`
- **Authentication**: GitHub PAT token required
- **Retention**: Configure in GitHub settings for cost optimization

## Integration Examples

### Docker Compose
```yaml
version: '3.8'
services:
  app:
    image: ghcr.io/supercheck-io/supercheck/app:${VERSION:-latest}
  worker:
    image: ghcr.io/supercheck-io/supercheck/worker:${VERSION:-latest}
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: supercheck-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: ghcr.io/supercheck-io/supercheck/app:1.2.3
```

This strategy ensures reliable, predictable releases while minimizing unnecessary CI resource usage.