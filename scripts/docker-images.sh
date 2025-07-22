#!/bin/bash

# Docker Images Management Script for Supercheck
# Builds multi-architecture images (linux/amd64, linux/arm64) by default

set -e

# Configuration
GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-"krish-kant/supercheck"}
REGISTRY="ghcr.io"
APP_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/app"
WORKER_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/worker"
MIGRATION_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/migrate"

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

# Function to setup buildx for multi-architecture builds
setup_buildx() {
    print_status "Setting up Docker Buildx for multi-architecture builds..."
    
    # Check if buildx is available
    if ! docker buildx version > /dev/null 2>&1; then
        print_error "Docker Buildx is not available. Please upgrade Docker to a version that supports buildx."
        exit 1
    fi
    
    # Remove existing builder if it exists and has issues
    if docker buildx inspect multiarch-builder > /dev/null 2>&1; then
        print_status "Removing existing multi-architecture builder..."
        docker buildx rm multiarch-builder 2>/dev/null || true
    fi
    
    # Try to create builder with docker-container driver
    print_status "Creating multi-architecture builder with docker-container driver..."
    if docker buildx create --name multiarch-builder --driver docker-container --use 2>/dev/null; then
        print_status "Using docker-container driver..."
        # Bootstrap the builder
        print_status "Bootstrapping the builder..."
        if docker buildx inspect --bootstrap; then
            print_success "Buildx setup completed successfully!"
            return 0
        fi
    fi
    
    # If docker-container fails, try with containerd driver
    print_warning "docker-container driver failed, trying containerd driver..."
    if docker buildx create --name multiarch-builder --driver containerd --use 2>/dev/null; then
        print_status "Using containerd driver..."
        print_success "Buildx setup completed with containerd driver!"
        return 0
    fi
    
    # No fallback - multi-arch buildx is required
    print_error "All buildx drivers failed. Multi-architecture buildx setup is required."
    return 1
}

# Function to build multi-architecture images
build_multiarch_images() {
    print_status "Building multi-architecture Docker images..."
    
    # Setup buildx
    if ! setup_buildx; then
        print_error "Multi-architecture buildx setup failed. Cannot proceed with multi-arch build."
        exit 1
    fi
    
    # Build and push app image for multiple architectures
    print_status "Building app image for multiple architectures..."
    if docker buildx build --platform linux/amd64,linux/arm64 \
        -t $APP_IMAGE:latest \
        --push ./app; then
        print_success "App multi-architecture image built and pushed successfully"
    else
        print_error "Failed to build app image"
        exit 1
    fi
    
    # Build and push worker image for multiple architectures
    print_status "Building worker image for multiple architectures..."
    if docker buildx build --platform linux/amd64,linux/arm64 \
        -t $WORKER_IMAGE:latest \
        --push ./runner; then
        print_success "Worker multi-architecture image built and pushed successfully"
    else
        print_error "Failed to build worker image"
        exit 1
    fi
    
    # Build and push migration image for multiple architectures
    print_status "Building migration image for multiple architectures..."
    if docker buildx build --platform linux/amd64,linux/arm64 \
        -f Dockerfile.migrate \
        --target migrate \
        -t $MIGRATION_IMAGE:latest \
        --push .; then
        print_success "Migration multi-architecture image built and pushed successfully"
    else
        print_error "Failed to build migration image"
        exit 1
    fi
    
    print_success "All multi-architecture images built and pushed successfully!"
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
    echo ""
    echo "Environment Variables:"
    echo "  GITHUB_REPOSITORY: GitHub repository (default: krish-kant/supercheck)"
    echo ""
    echo "Images:"
    echo "  - ghcr.io/krish-kant/supercheck/app:latest"
    echo "  - ghcr.io/krish-kant/supercheck/worker:latest"
    echo "  - ghcr.io/krish-kant/supercheck/migrate:latest"
}

# Main script logic
if [ "$1" = "help" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

check_docker
build_multiarch_images 