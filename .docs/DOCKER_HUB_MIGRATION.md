# Docker Hub Migration Guide

This guide explains how to migrate from GitHub Container Registry (GHCR) to Docker Hub for publishing Docker images.

## Docker Hub vs GitHub Container Registry (GHCR)

### Docker Hub Advantages:
- **Wider Reach**: More universally recognized and accessible
- **Public Discovery**: Better for open source projects that want public visibility
- **Ecosystem Integration**: Better integration with many Docker tools and platforms
- **Historical Standard**: Industry standard for container registries
- **Docker Desktop Integration**: Seamless integration with Docker Desktop
- **Official Images**: Hosts official images from vendors

### Docker Hub Disadvantages:
- **Rate Limits**: Strict pull rate limits for anonymous users (100 pulls/6 hours)
- **Cost**: Paid plans required for more than 1 private repository
- **Security Scanning**: Limited security scanning on free tier
- **Bandwidth Limits**: Lower bandwidth limits on free tier
- **Fewer Features**: Less advanced features compared to GHCR

### GHCR Advantages:
- **No Rate Limits**: No pull rate limits for public repositories
- **Free Private Repos**: Unlimited private repositories
- **Advanced Security**: Built-in vulnerability scanning and security features
- **GitHub Integration**: Seamless integration with GitHub repos and Actions
- **Better Permissions**: Fine-grained access control tied to GitHub permissions
- **Package Ecosystem**: Part of GitHub Packages ecosystem
- **Higher Bandwidth**: Better bandwidth allowances

### GHCR Disadvantages:
- **Less Discovery**: Not as widely known for public image discovery
- **GitHub Dependency**: Tied to GitHub ecosystem
- **Newer Platform**: Less mature than Docker Hub
- **Corporate Firewalls**: Some corporate environments may block ghcr.io

## Migration Steps

### 1. Set up Docker Hub Account
1. Create a Docker Hub account at https://hub.docker.com
2. Create repositories for your images:
   - `your-username/supercheck-app`
   - `your-username/supercheck-worker`

### 2. Configure GitHub Secrets
Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_PASSWORD`: Your Docker Hub password or access token (recommended)

**Note**: For security, use a Docker Hub access token instead of your password:
1. Go to Docker Hub → Account Settings → Security
2. Create a new access token
3. Use this token as `DOCKER_PASSWORD`

### 3. Updated GitHub Actions Workflow

Replace your existing `.github/workflows/build-multiarch.yml` with:

```yaml
name: Build Multi-Architecture Docker Images

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: docker.io
  IMAGE_NAME: your-username/supercheck  # Replace with your Docker Hub username

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract app metadata
        id: app-meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_NAME }}-app
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Extract worker metadata
        id: worker-meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_NAME }}-worker
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push app image
        uses: docker/build-push-action@v5
        with:
          context: ./app
          file: ./app/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.app-meta.outputs.tags }}
          labels: ${{ steps.app-meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push worker image
        uses: docker/build-push-action@v5
        with:
          context: ./worker
          file: ./worker/Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.worker-meta.outputs.tags }}
          labels: ${{ steps.worker-meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Output image names
        run: |
          echo "App image: ${{ env.IMAGE_NAME }}-app"
          echo "Worker image: ${{ env.IMAGE_NAME }}-worker"
          echo "App tags: ${{ steps.app-meta.outputs.tags }}"
          echo "Worker tags: ${{ steps.worker-meta.outputs.tags }}"
```

### 4. Update Docker Compose Files

Update your `docker-compose.yml` and related files to use the new image names:

```yaml
# Before (GHCR)
image: ghcr.io/krish-kant/supercheck/app:latest
image: ghcr.io/krish-kant/supercheck/worker:latest

# After (Docker Hub)
image: your-username/supercheck-app:latest
image: your-username/supercheck-worker:latest
```

### 5. Update Documentation

Update any documentation that references the old image names:

- README.md
- Deployment guides
- Docker scripts
- Kubernetes manifests

## Image Naming Convention

### Current (GHCR):
- `ghcr.io/krish-kant/supercheck/app:latest`
- `ghcr.io/krish-kant/supercheck/worker:latest`

### New (Docker Hub):
- `your-username/supercheck-app:latest`
- `your-username/supercheck-worker:latest`

## Testing the Migration

1. **Test the Workflow**: Push a test commit to a feature branch to verify the workflow works
2. **Pull Test Images**: Test pulling the new images locally:
   ```bash
   docker pull your-username/supercheck-app:latest
   docker pull your-username/supercheck-worker:latest
   ```
3. **Update Local Development**: Update your local docker-compose files to use the new images

## Rollback Plan

If you need to rollback to GHCR:

1. Revert the workflow file changes
2. Remove the Docker Hub secrets
3. The workflow will automatically use `GITHUB_TOKEN` for GHCR access

## Security Considerations

- **Use Access Tokens**: Always use Docker Hub access tokens instead of passwords
- **Scope Tokens**: Create tokens with minimal required permissions
- **Rotate Tokens**: Regularly rotate access tokens for security
- **Monitor Usage**: Monitor your Docker Hub account for unexpected usage

## Cost Considerations

- **Free Tier Limits**: Docker Hub free tier includes 1 private repository
- **Public Repositories**: Unlimited public repositories on free tier
- **Rate Limits**: Be aware of pull rate limits for public images
- **Paid Plans**: Consider paid plans if you need multiple private repositories

## Next Steps

1. Replace `your-username` with your actual Docker Hub username in the workflow
2. Set up the GitHub secrets
3. Test the workflow with a feature branch
4. Update all references to the old image names
5. Update deployment configurations

## Support

For issues with:
- **Docker Hub**: Check Docker Hub documentation or contact Docker support
- **GitHub Actions**: Check GitHub Actions documentation
- **This Migration**: Create an issue in this repository