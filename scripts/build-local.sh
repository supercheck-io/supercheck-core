#!/bin/bash

# Local Docker Build Script for Supercheck
# Builds images locally without pushing to registry

set -e

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

# Function to build app image
build_app() {
    print_status "Building app image..."
    
    cd app
    
    # Build with local tag
    if docker build -t supercheck-app:latest .; then
        print_success "App image built successfully"
        return 0
    else
        print_error "App image build failed"
        return 1
    fi
}

# Function to build worker image
build_worker() {
    print_status "Building worker image..."
    
    cd runner
    
    # Build with local tag
    if docker build -t supercheck-worker:latest .; then
        print_success "Worker image built successfully"
        return 0
    else
        print_error "Worker image build failed"
        return 1
    fi
}

# Function to test the images
test_images() {
    print_status "Testing built images..."
    
    # Test app image
    print_status "Testing app image..."
    if docker run --rm supercheck-app:latest node -e "console.log('App image test successful')"; then
        print_success "App image test passed"
    else
        print_error "App image test failed"
        return 1
    fi
    
    # Test worker image
    print_status "Testing worker image..."
    if docker run --rm supercheck-worker:latest node -e "console.log('Worker image test successful')"; then
        print_success "Worker image test passed"
    else
        print_error "Worker image test failed"
        return 1
    fi
    
    print_success "All image tests passed!"
}

# Function to show help
show_help() {
    echo "Local Docker Build Script for Supercheck"
    echo ""
    echo "Usage: $0 [app|worker|test|all]"
    echo ""
    echo "Options:"
    echo "  app     - Build only the app image"
    echo "  worker  - Build only the worker image"
    echo "  test    - Test the built images"
    echo "  all     - Build and test both images (default)"
    echo ""
    echo "Images built:"
    echo "  - supercheck-app:latest"
    echo "  - supercheck-worker:latest"
}

# Main script logic
case "${1:-all}" in
    "help"|"--help"|"-h")
        show_help
        exit 0
        ;;
    "app")
        check_docker
        build_app
        ;;
    "worker")
        check_docker
        build_worker
        ;;
    "test")
        check_docker
        test_images
        ;;
    "all")
        check_docker
        print_status "Building all images..."
        
        if build_app && build_worker; then
            print_success "All images built successfully!"
            
            if test_images; then
                print_success "All builds and tests completed successfully!"
                print_status "Images available:"
                echo "  - supercheck-app:latest"
                echo "  - supercheck-worker:latest"
            else
                print_error "Image tests failed"
                exit 1
            fi
        else
            print_error "Image builds failed"
            exit 1
        fi
        ;;
    *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac 