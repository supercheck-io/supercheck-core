#!/bin/bash

# Setup script for macOS development environment
# This script installs required tools for Docker multi-architecture builds

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

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed for macOS only"
    exit 1
fi

print_status "Setting up macOS development environment for Supercheck..."

# Check if Homebrew is installed
if ! command -v brew >/dev/null 2>&1; then
    print_warning "Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    print_status "Homebrew is already installed"
fi

# Install coreutils for gtimeout (which provides 'timeout' command)
if ! command -v gtimeout >/dev/null 2>&1; then
    print_status "Installing GNU coreutils (includes gtimeout)..."
    brew install coreutils
    print_success "GNU coreutils installed successfully"
else
    print_status "gtimeout is already available"
fi

# Check Docker installation
if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker is not installed. Please install Docker Desktop for Mac."
    print_status "Download from: https://docs.docker.com/desktop/install/mac-install/"
    exit 1
else
    print_status "Docker is installed"
fi

# Check Docker Buildx
if ! docker buildx version >/dev/null 2>&1; then
    print_error "Docker Buildx is not available. Please update Docker Desktop."
    exit 1
else
    print_success "Docker Buildx is available"
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop."
    exit 1
else
    print_success "Docker is running"
fi

print_success "macOS development environment setup complete!"
print_status "You can now run: ./scripts/docker-images.sh"