#!/bin/bash

# Docker Images Management Script for Supertest
# This script helps build, push, and pull Docker images

set -e

# Configuration
GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-"your-username/supertest"}
REGISTRY="ghcr.io"
FRONTEND_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/frontend"
WORKER_IMAGE="$REGISTRY/$GITHUB_REPOSITORY/worker"

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

# Function to build images locally
build_images() {
    print_status "Building Docker images..."
    
    # Build frontend image
    print_status "Building frontend image..."
    docker build -t $FRONTEND_IMAGE:latest ./app
    print_success "Frontend image built successfully"
    
    # Build worker image
    print_status "Building worker image..."
    docker build -t $WORKER_IMAGE:latest ./runner
    print_success "Worker image built successfully"
    
    print_success "All images built successfully!"
}

# Function to push images to GitHub Container Registry
push_images() {
    print_status "Pushing images to GitHub Container Registry..."
    
    # Check if logged in to GHCR
    if ! docker images | grep -q "$REGISTRY"; then
        print_warning "You may need to login to GitHub Container Registry first:"
        echo "echo \$GITHUB_TOKEN | docker login ghcr.io -u \$GITHUB_USERNAME --password-stdin"
    fi
    
    # Push frontend image
    print_status "Pushing frontend image..."
    docker push $FRONTEND_IMAGE:latest
    print_success "Frontend image pushed successfully"
    
    # Push worker image
    print_status "Pushing worker image..."
    docker push $WORKER_IMAGE:latest
    print_success "Worker image pushed successfully"
    
    print_success "All images pushed successfully!"
}

# Function to pull images from GitHub Container Registry
pull_images() {
    print_status "Pulling images from GitHub Container Registry..."
    
    # Pull frontend image
    print_status "Pulling frontend image..."
    docker pull $FRONTEND_IMAGE:latest
    print_success "Frontend image pulled successfully"
    
    # Pull worker image
    print_status "Pulling worker image..."
    docker pull $WORKER_IMAGE:latest
    print_success "Worker image pulled successfully"
    
    print_success "All images pulled successfully!"
}

# Function to tag images with version
tag_images() {
    local version=$1
    if [ -z "$version" ]; then
        print_error "Please provide a version tag"
        echo "Usage: $0 tag <version>"
        exit 1
    fi
    
    print_status "Tagging images with version $version..."
    
    # Tag frontend image
    docker tag $FRONTEND_IMAGE:latest $FRONTEND_IMAGE:$version
    print_success "Frontend image tagged as $version"
    
    # Tag worker image
    docker tag $WORKER_IMAGE:latest $WORKER_IMAGE:$version
    print_success "Worker image tagged as $version"
    
    print_success "All images tagged successfully!"
}

# Function to show image information
show_images() {
    print_status "Current Docker images:"
    echo ""
    docker images | grep -E "($FRONTEND_IMAGE|$WORKER_IMAGE)" || print_warning "No Supertest images found locally"
    echo ""
    print_status "Image URLs:"
    echo "Frontend: $FRONTEND_IMAGE:latest"
    echo "Worker: $WORKER_IMAGE:latest"
}

# Function to clean up images
clean_images() {
    print_warning "This will remove all Supertest Docker images. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        print_status "Removing Supertest Docker images..."
        docker rmi $(docker images | grep -E "($FRONTEND_IMAGE|$WORKER_IMAGE)" | awk '{print $3}') 2>/dev/null || print_warning "No images to remove"
        print_success "Cleanup completed!"
    else
        print_status "Cleanup cancelled"
    fi
}

# Function to show help
show_help() {
    echo "Supertest Docker Images Management Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  build              Build images locally"
    echo "  push               Push images to GitHub Container Registry"
    echo "  pull               Pull images from GitHub Container Registry"
    echo "  tag <version>      Tag images with specific version"
    echo "  show               Show current images and URLs"
    echo "  clean              Remove all Supertest images"
    echo "  help               Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  GITHUB_REPOSITORY  Your GitHub repository (default: your-username/supertest)"
    echo ""
    echo "Examples:"
    echo "  $0 build"
    echo "  $0 push"
    echo "  $0 tag v1.0.0"
    echo "  GITHUB_REPOSITORY=myorg/supertest $0 pull"
}

# Main script logic
check_docker

case "${1:-help}" in
    build)
        build_images
        ;;
    push)
        push_images
        ;;
    pull)
        pull_images
        ;;
    tag)
        tag_images "$2"
        ;;
    show)
        show_images
        ;;
    clean)
        clean_images
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac 