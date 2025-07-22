#!/bin/bash

# Simple Database Migration Script for Supercheck
# Handles database setup and migrations

set -e

# Configuration
MAX_RETRIES=10
RETRY_DELAY=5

# Set PGPASSWORD for PostgreSQL connections
export PGPASSWORD="$DB_PASSWORD"

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [MIGRATION] $1"
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

# Function to wait for database to be ready
wait_for_database() {
    log "Waiting for database to be ready..."
    
    local retry_count=0
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        log "Attempt $((retry_count + 1))/$MAX_RETRIES: Checking database connection..."
        
        if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
            log_success "Database is ready"
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        
        if [ $retry_count -lt $MAX_RETRIES ]; then
            log "Waiting ${RETRY_DELAY}s before next attempt..."
            sleep $RETRY_DELAY
        fi
    done
    
    log_error "Database failed to become ready after $MAX_RETRIES attempts"
    return 1
}

# Function to create database if it doesn't exist
create_database_if_not_exists() {
    log "Checking if database '$DB_NAME' exists..."
    
    # Try to connect to the target database
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_success "Database '$DB_NAME' exists and is accessible"
        return 0
    fi
    
    log "Database '$DB_NAME' does not exist, creating it..."
    
    # Create the database
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null 2>&1; then
        log_success "Database '$DB_NAME' created successfully"
        return 0
    else
        log_error "Failed to create database '$DB_NAME'"
        return 1
    fi
}

# Function to run migrations using Drizzle
run_drizzle_migrations() {
    log "Running Drizzle migrations..."
    
    # Change to the app directory where drizzle config is located
    cd /app
    
    # Run drizzle migrations
    if npx drizzle-kit migrate; then
        log_success "Drizzle migrations completed successfully"
        return 0
    else
        log_error "Drizzle migrations failed"
        return 1
    fi
}

# Function to verify migrations
verify_migrations() {
    log "Verifying migrations..."
    
    local required_tables=("user" "organization" "tests" "jobs" "monitors" "reports")
    local missing_tables=()
    
    for table in "${required_tables[@]}"; do
        local table_exists
        table_exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" 2>/dev/null | tr -d ' ')
        
        if [ "$table_exists" = "t" ]; then
            log "✓ Table '$table' exists"
        else
            log_error "✗ Table '$table' missing"
            missing_tables+=("$table")
        fi
    done
    
    if [ ${#missing_tables[@]} -eq 0 ]; then
        log_success "All required tables verified"
        return 0
    else
        log_error "Missing tables: ${missing_tables[*]}"
        return 1
    fi
}

# Main execution
main() {
    log "Starting migration process..."
    
    # Check required environment variables
    if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
        log_error "Missing required database environment variables"
        exit 1
    fi
    
    log "Database configuration:"
    log "  Host: $DB_HOST"
    log "  Port: $DB_PORT"
    log "  User: $DB_USER"
    log "  Database: $DB_NAME"
    
    # Wait for database to be ready
    if ! wait_for_database; then
        log_error "Database failed to become ready"
        exit 1
    fi
    
    # Create database if it doesn't exist
    if ! create_database_if_not_exists; then
        log_error "Failed to ensure database exists"
        exit 1
    fi
    
    # Run migrations
    if ! run_drizzle_migrations; then
        log_error "Migration process failed"
        exit 1
    fi
    
    # Verify migrations
    if ! verify_migrations; then
        log_error "Migration verification failed"
        exit 1
    fi
    
    log_success "Migration process completed successfully"
}

# Execute main function
main "$@" 