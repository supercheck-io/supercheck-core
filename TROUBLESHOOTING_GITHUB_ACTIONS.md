# GitHub Actions Permission Issues - Troubleshooting Guide

## Problem
The GitHub Actions workflow is failing with the error:
```
ERROR: failed to push ghcr.io/krish-kant/supercheck/app:monitoring: denied: permission_denied: write_package
```

## Solutions

### Solution 1: Use Personal Access Token (Recommended)

1. **Create a Personal Access Token (PAT):**
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a name like "GitHub Actions Container Registry"
   - Select scopes: `write:packages`, `read:packages`, `delete:packages`
   - Copy the token

2. **Add the PAT to repository secrets:**
   - Go to your repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `PAT_TOKEN`
   - Value: Paste your PAT token

3. **Use the PAT workflow:**
   - The workflow file `build-multiarch-pat.yml` uses the PAT token
   - Rename it to replace the current workflow or use it as an alternative

### Solution 2: Check Repository Settings

1. **Verify Package Registry permissions:**
   - Go to repository Settings → Actions → General
   - Ensure "Read and write permissions" is selected under "Workflow permissions"
   - Check "Allow GitHub Actions to create and approve pull requests" if needed

2. **Check Package Registry visibility:**
   - Go to repository Settings → Packages
   - Ensure the package registry is properly configured
   - Check if there are any access restrictions

### Solution 3: Update Workflow Permissions

The current workflow has the correct permissions, but you can try adding more explicit permissions:

```yaml
permissions:
  contents: read
  packages: write
  id-token: write  # Add this for better authentication
```

### Solution 4: Use Alternative Authentication

If the above doesn't work, try using a different authentication method:

```yaml
- name: Log in to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ${{ env.REGISTRY }}
    username: ${{ github.repository_owner }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

### Solution 5: Debug Steps

1. **Check the workflow logs** for the exact error message
2. **Verify the repository name** matches exactly: `krish-kant/supercheck`
3. **Check if the package exists** in the GitHub Container Registry
4. **Verify the branch name** is correct (`monitoring`)

### Common Issues

1. **Repository name mismatch:** Ensure the repository name in the workflow matches your actual repository
2. **Token permissions:** The PAT token must have the correct scopes
3. **Package visibility:** Check if the package is public or private and adjust permissions accordingly
4. **Branch protection:** Ensure the branch doesn't have restrictions that prevent the workflow

### Testing the Fix

1. Push the updated workflow to trigger a new build
2. Check the workflow logs for the "Check registry access" step output
3. Verify the images are pushed successfully to ghcr.io

## Current Workflow Files

- `build-multiarch.yml` - Uses GITHUB_TOKEN (may have permission issues)
- `build-multiarch-pat.yml` - Uses PAT_TOKEN (recommended for better permissions)

Choose the appropriate workflow based on your authentication setup. 