#!/bin/bash

# Docker Images Management Script for Supercheck
# Builds multi-architecture images (linux/amd64, linux/arm64) by default
# Optimized for Hetzner servers with proper QEMU support

set -e

# Enable BuildKit for better performance and caching
export DOCKER_BUILDKIT=1

# Configuration
GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-"krish-kant/supercheck"}
REGISTRY="ghcr.io"
APP_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/app"
WORKER_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/worker"

# Versioned tagging with fallback to latest
TAG=${GITHUB_SHA:-latest}

# BuildKit cache options for better performance
CACHE_OPTS="--build-arg BUILDKIT_INLINE_CACHE=1 --cache-to type=inline"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check and install QEMU support for multi-arch builds
check_qemu_support() {
    print_status "Checking QEMU support for multi-architecture builds..."
    
    # Check if QEMU is installed
    if ! command -v qemu-arm-static > /dev/null 2>&1; then
        print_warning "QEMU not found. Installing QEMU support..."
        if command -v apt-get > /dev/null 2>&1; then
            sudo apt-get update
            sudo apt-get install -y qemu-user-static binfmt-support
            print_success "QEMU installed successfully"
        else
            print_error "Cannot install QEMU automatically. Please install qemu-user-static manually."
            return 1
        fi
    else
        print_success "QEMU support already available"
    fi
    
    # Install binfmt support for all architectures
    print_status "Setting up binfmt support for all architectures..."
    if docker run --privileged --rm tonistiigi/binfmt --install all 2>/dev/null; then
        print_success "Binfmt support configured successfully"
        return 0
    else
        print_warning "Binfmt setup failed, but continuing..."
        return 0
    fi
}

# Function to setup buildx for multi-architecture builds
setup_buildx() {
    print_status "Setting up Docker Buildx for multi-architecture builds..."
    
    # Check if buildx is available
    if ! docker buildx version > /dev/null 2>&1; then
        print_error "Docker Buildx is not available. Please upgrade Docker to a version that supports buildx."
        exit 1
    fi
    
    # Check QEMU support first
    if ! check_qemu_support; then
        print_error "QEMU setup failed. Multi-architecture builds may not work properly."
        exit 1
    fi
    
    # Remove existing builder if it exists
    if docker buildx inspect multiarch-builder > /dev/null 2>&1; then
        print_status "Removing existing multi-architecture builder..."
        docker buildx rm multiarch-builder 2>/dev/null || true
    fi
    
    # Create builder with docker-container driver (preferred for multi-arch)
    print_status "Creating multi-architecture builder with docker-container driver..."
    if docker buildx create --name multiarch-builder --driver docker-container --use 2>/dev/null; then
        print_status "Using docker-container driver for multi-architecture builds..."
        
        # Bootstrap the builder
        print_status "Bootstrapping the builder..."
        if docker buildx inspect --bootstrap; then
            print_success "Buildx setup completed successfully with docker-container driver!"
            
            # Verify the builder can handle multi-arch
            print_status "Verifying multi-architecture support..."
            if docker buildx inspect | grep -q "linux/amd64\|linux/arm64"; then
                print_success "Multi-architecture support verified!"
                return 0
            else
                print_warning "Multi-architecture support verification inconclusive, but continuing..."
                return 0
            fi
        else
            print_error "Builder bootstrap failed"
            return 1
        fi
    else
        print_error "Failed to create docker-container builder"
        return 1
    fi
}

# Function to validate multi-arch manifest
validate_manifest() {
    local image=$1
    local tag=$2
    
    print_status "Validating multi-architecture manifest for $image:$tag..."
    
    # Check if both architectures are present
    if docker buildx imagetools inspect "$image:$tag" | grep -q "linux/amd64" && \
       docker buildx imagetools inspect "$image:$tag" | grep -q "linux/arm64"; then
        print_success "Multi-architecture manifest validated successfully for $image:$tag"
        return 0
    else
        print_error "Multi-architecture manifest validation failed for $image:$tag"
        return 1
    fi
}

# Function to build and push a multi-architecture image
build_and_push_image() {
    local image=$1
    local context=$2
    local dockerfile=${3:-Dockerfile}
    local target=${4:-}
    
    print_status "Building $image for multiple architectures..."
    
    # Build command with optional target
    local build_cmd="docker buildx build --platform linux/amd64,linux/arm64"
    build_cmd="$build_cmd $CACHE_OPTS"
    build_cmd="$build_cmd -t $image:$TAG -t $image:latest"
    build_cmd="$build_cmd --push"
    
    if [ -n "$target" ]; then
        build_cmd="$build_cmd --target $target"
    fi
    
    if [ "$dockerfile" != "Dockerfile" ]; then
        build_cmd="$build_cmd -f $dockerfile"
    fi
    
    build_cmd="$build_cmd $context"
    
    # Execute build
    if eval $build_cmd; then
        print_success "$image multi-architecture image built and pushed successfully"
        
        # Validate manifest
        if validate_manifest "$image" "$TAG"; then
            return 0
        else
            print_error "Manifest validation failed for $image"
            return 1
        fi
    else
        print_error "Failed to build $image"
        return 1
    fi
}

# Function to build multi-architecture images
build_multiarch_images() {
    print_status "Building multi-architecture Docker images..."
    print_status "Using tag: $TAG"
    
    # Setup buildx
    if ! setup_buildx; then
        print_error "Multi-architecture buildx setup failed. Cannot proceed with multi-arch build."
        exit 1
    fi
    
    # Build and push app image
    if ! build_and_push_image "$APP_IMAGE" "./app"; then
        print_error "App image build failed"
        exit 1
    fi
    
    # Build and push worker image
    if ! build_and_push_image "$WORKER_IMAGE" "./runner"; then
        print_error "Worker image build failed"
        exit 1
    fi
    
    print_success "All multi-architecture images built, pushed, and validated successfully!"
    
    # Display final image information
    print_status "Final images:"
    echo "  - $APP_IMAGE:$TAG"
    echo "  - $APP_IMAGE:latest"
    echo "  - $WORKER_IMAGE:$TAG"
    echo "  - $WORKER_IMAGE:latest"
}

# Function to show help
show_help() {
    echo "Docker Images Management Script for Supercheck"
    echo ""
    echo "Usage: $0"
    echo ""
    echo "This script builds and pushes multi-architecture Docker images:"
    echo "  - Supports linux/amd64 and linux/arm64"
    echo "  - Automatically pushes to GitHub Container Registry"
    echo "  - Requires Docker Buildx support"
    echo "  - Works on Apple Silicon, Intel, AMD, ARM servers"
    echo "  - Uses BuildKit for enhanced performance and caching"
    echo "  - Validates multi-architecture manifests"
    echo "  - Optimized for Hetzner servers with QEMU support"
    echo ""
    echo "Environment Variables:"
    echo "  GITHUB_REPOSITORY: GitHub repository (default: krish-kant/supercheck)"
    echo "  GITHUB_SHA: Git commit SHA for versioned tagging (default: latest)"
    echo "  DOCKER_BUILDKIT: Enabled for better build performance"
    echo ""
    echo "Prerequisites for Hetzner:"
    echo "  - Docker Engine installed"
    echo "  - QEMU support (auto-installed if missing)"
    echo "  - Binfmt support (auto-configured)"
    echo ""
    echo "Images:"
    echo "  - ghcr.io/krish-kant/supercheck/app:latest (and :$TAG)"
    echo "  - ghcr.io/krish-kant/supercheck/worker:latest (and :$TAG)"
}

# Main script logic
if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

check_docker
build_multiarch_images 