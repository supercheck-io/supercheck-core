#!/bin/bash

# Startup script for Supercheck App
# Always runs database migrations before starting the Next.js server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
log() {
    echo -e "${BLUE}[STARTUP]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to run migrations
run_migrations() {
    log "Running database migrations..."
    
    # Set PGPASSWORD for PostgreSQL connections
    export PGPASSWORD="$DB_PASSWORD"
    
    # Run the migration script
    if ./scripts/migrate.sh; then
        log_success "Migrations completed successfully"
        return 0
    else
        log_error "Migrations failed"
        return 1
    fi
}

# Function to start the Next.js server
start_server() {
    log "Starting Next.js server..."
    
    # Start the server
    exec node server.js
}

# Main execution
main() {
    log "Starting Supercheck App..."
    
    # Always run migrations first
    if ! run_migrations; then
        log_error "Failed to run migrations. Exiting."
        exit 1
    fi
    
    # Start the server
    start_server
}

# Execute main function
main "$@" 