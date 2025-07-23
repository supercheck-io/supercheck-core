#!/bin/bash

# Docker Images Management Script for Supercheck
# Builds multi-architecture images (linux/amd64, linux/arm64) by default
# Optimized for Hetzner servers

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
    print_success "Docker is running"
}

# Function to setup buildx for multi-architecture builds
setup_buildx() {
    print_status "Setting up Docker Buildx for multi-architecture builds..."
    
    # Check if buildx is available
    if ! docker buildx version > /dev/null 2>&1; then
        print_error "Docker Buildx is not available. Please upgrade Docker to a version that supports buildx."
        exit 1
    fi
    
    # Remove existing builder if it exists
    if docker buildx inspect multiarch-builder > /dev/null 2>&1; then
        print_status "Removing existing multi-architecture builder..."
        docker buildx rm multiarch-builder 2>/dev/null || true
    fi
    
    # Clean up any orphaned builders
    docker buildx prune -f > /dev/null 2>&1 || true
    
    # Create builder with docker-container driver
    print_status "Creating multi-architecture builder..."
    if docker buildx create \
        --name multiarch-builder \
        --driver docker-container \
        --platform linux/amd64,linux/arm64 \
        --use 2>/dev/null; then
        
        print_status "Bootstrapping the builder..."
        if docker buildx inspect --bootstrap; then
            print_success "Buildx setup completed successfully!"
            return 0
        else
            print_error "Builder bootstrap failed"
            return 1
        fi
    else
        print_error "Failed to create builder"
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
    
    # Build command with best practices
    local build_cmd="docker buildx build"
    build_cmd="$build_cmd --platform linux/amd64,linux/arm64"
    build_cmd="$build_cmd --build-arg BUILDKIT_INLINE_CACHE=1"
    build_cmd="$build_cmd --progress=plain"
    build_cmd="$build_cmd -t $image:$TAG -t $image:latest"
    build_cmd="$build_cmd --push"
    
    if [ -n "$target" ]; then
        build_cmd="$build_cmd --target $target"
    fi
    
    if [ "$dockerfile" != "Dockerfile" ]; then
        build_cmd="$build_cmd -f $dockerfile"
    fi
    
    build_cmd="$build_cmd $context"
    
    print_status "Executing build..."
    
    if eval $build_cmd; then
        print_success "$image multi-architecture image built and pushed successfully"
        return 0
    else
        print_error "Failed to build $image"
        return 1
    fi
}

# Function to build multi-architecture images
build_multiarch_images() {
    print_status "Building multi-architecture Docker images..."
    print_status "Using tag: $TAG"
    print_status "Building for platforms: linux/amd64,linux/arm64"
    
    # Check if we're logged into the registry
    print_status "Checking Docker registry authentication..."
    if ! docker info | grep -q "Username"; then
        print_warning "Not logged into Docker registry. Make sure to run 'docker login ghcr.io' first."
    fi
    
    # Setup buildx
    if ! setup_buildx; then
        print_error "Multi-architecture buildx setup failed. Cannot proceed with multi-arch build."
        print_status "Troubleshooting suggestions:"
        print_status "1. Ensure Docker Desktop is running"
        print_status "2. Update Docker to latest version"
        print_status "3. Try: docker buildx prune -f"
        exit 1
    fi
    
    # Build and push app image
    print_status "Starting app image build..."
    if ! build_and_push_image "$APP_IMAGE" "./app"; then
        print_error "App image build failed"
        exit 1
    fi
    
    # Build and push worker image
    print_status "Starting worker image build..."
    if ! build_and_push_image "$WORKER_IMAGE" "./runner"; then
        print_error "Worker image build failed"
        print_warning "The app image has been built successfully. You can:"
        print_warning "1. Use the app image: ghcr.io/krish-kant/supercheck/app:latest"
        print_warning "2. Build worker locally: ./scripts/build-local.sh"
        exit 1
    fi
    
    print_success "All multi-architecture images built and pushed successfully!"
    
    # Display final image information
    print_status "Final images available:"
    echo "  - $APP_IMAGE:$TAG (linux/amd64, linux/arm64)"
    echo "  - $APP_IMAGE:latest (linux/amd64, linux/arm64)"
    echo "  - $WORKER_IMAGE:$TAG (linux/amd64, linux/arm64)"
    echo "  - $WORKER_IMAGE:latest (linux/amd64, linux/arm64)"
    
    print_status "Images are ready for deployment on Hetzner servers!"
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
    echo "  - Optimized for Hetzner servers"
    echo ""
    echo "Environment Variables:"
    echo "  GITHUB_REPOSITORY: GitHub repository (default: krish-kant/supercheck)"
    echo "  GITHUB_SHA: Git commit SHA for versioned tagging (default: latest)"
    echo "  DOCKER_BUILDKIT: Enabled for better build performance"
    echo ""
    echo "Prerequisites:"
    echo "  - Docker Engine installed"
    echo "  - Docker Buildx support"
    echo "  - Logged into ghcr.io: docker login ghcr.io"
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