#!/bin/bash

# Bulletproof Database Migration Script for Production Environment
# This script handles database migrations with comprehensive error handling
# and retry logic for production deployments

set -e

# Configuration
MAX_RETRIES=10
INITIAL_RETRY_DELAY=2
MAX_RETRY_DELAY=60
HEALTH_CHECK_TIMEOUT=30
MIGRATION_TIMEOUT=300

# Set PGPASSWORD for all PostgreSQL connections
export PGPASSWORD="$DB_PASSWORD"

# Enhanced logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [MIGRATION] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [MIGRATION-ERROR] $1" >&2
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [MIGRATION-SUCCESS] $1"
}

# Function to check if database is ready with comprehensive health checks
wait_for_database() {
    log "Waiting for database to be ready..."
    
    local retry_count=0
    local delay=$INITIAL_RETRY_DELAY
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        log "Attempt $((retry_count + 1))/$MAX_RETRIES: Checking database connection..."
        
        # Check if PostgreSQL is accepting connections
        if timeout $HEALTH_CHECK_TIMEOUT pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
            log "PostgreSQL is accepting connections"
            
            # First try to connect to the target database directly
            if timeout $HEALTH_CHECK_TIMEOUT psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
                log_success "Database is ready and accepting queries"
                return 0
            else
                log "Cannot connect to target database '$DB_NAME', checking if it exists..."
                create_database_if_not_exists
                
                # Try connecting again after potential database creation
                if timeout $HEALTH_CHECK_TIMEOUT psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
                    log_success "Database is now ready and accepting queries"
                    return 0
                else
                    log_error "Database connection test failed even after creation attempt"
                fi
            fi
        else
            log_error "PostgreSQL is not accepting connections"
        fi
        
        retry_count=$((retry_count + 1))
        
        if [ $retry_count -lt $MAX_RETRIES ]; then
            log "Waiting ${delay}s before next attempt..."
            sleep $delay
            
            # Exponential backoff
            delay=$((delay * 2))
            if [ $delay -gt $MAX_RETRY_DELAY ]; then
                delay=$MAX_RETRY_DELAY
            fi
        fi
    done
    
    log_error "Database failed to become ready after $MAX_RETRIES attempts"
    return 1
}

# Function to create database if it doesn't exist
create_database_if_not_exists() {
    log "Checking if database '$DB_NAME' exists..."
    
    # Try to connect to postgres database to check if our target database exists
    if timeout $HEALTH_CHECK_TIMEOUT psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "SELECT 1;" >/dev/null 2>&1; then
        log "Connected to postgres database, checking if '$DB_NAME' exists..."
        
        # Check if our target database exists
        local db_exists
        db_exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" 2>/dev/null | tr -d ' ')
        
        if [ "$db_exists" = "1" ]; then
            log_success "Database '$DB_NAME' already exists"
            # Wait a moment for the database to be fully ready
            sleep 2
            return 0
        else
            log "Database '$DB_NAME' does not exist, creating it..."
            
            # Create the database
            if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null 2>&1; then
                log_success "Database '$DB_NAME' created successfully"
                # Wait a moment for the database to be fully ready
                sleep 3
                return 0
            else
                log_error "Failed to create database '$DB_NAME'"
                return 1
            fi
        fi
    else
        log_error "Cannot connect to postgres database to check/create target database"
        return 1
    fi
}

# Function to ensure database exists before migrations
ensure_database_exists() {
    log "Ensuring database '$DB_NAME' exists..."
    
    # First try to connect to the target database
    if timeout $HEALTH_CHECK_TIMEOUT psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_success "Database '$DB_NAME' exists and is accessible"
        return 0
    else
        log "Cannot connect to database '$DB_NAME', attempting to create it..."
        create_database_if_not_exists
    fi
}

# Function to create S3 buckets (optional, non-blocking)
create_s3_buckets() {
    log "Setting up S3 buckets..."
    
    # Create a simple Node.js script to set up S3 buckets
    cat > /tmp/setup-s3.js << 'EOF'
const { S3Client, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

async function createBucketIfNotExists(bucketName) {
    try {
        // Check if bucket exists
        await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        console.log(`Bucket ${bucketName} already exists`);
    } catch (error) {
        if (error.name === 'NotFound') {
            // Create bucket
            await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
            console.log(`Created bucket ${bucketName}`);
        } else {
            console.log(`Error checking/creating bucket ${bucketName}:`, error.message);
        }
    }
}

async function setupBuckets() {
    const buckets = [
        process.env.S3_JOB_BUCKET_NAME || 'playwright-job-artifacts',
        'playwright-test-artifacts'
    ];
    
    for (const bucket of buckets) {
        await createBucketIfNotExists(bucket);
    }
}

setupBuckets().catch(console.error);
EOF

    # Run the S3 setup script (non-blocking)
    if node /tmp/setup-s3.js; then
        log_success "S3 buckets setup completed"
    else
        log "S3 buckets setup failed (non-blocking)"
        # Don't fail the migration for S3 issues
        return 0
    fi
}

# Function to check if migration table exists
check_migration_table() {
    log "Checking if migration table exists..."
    
    local table_exists
    table_exists=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '__drizzle_migrations');" 2>/dev/null | tr -d ' ')
    
    if [ "$table_exists" = "t" ]; then
        log_success "Migration table exists"
        return 0
    else
        log "Migration table does not exist, will be created"
        return 1
    fi
}

# Function to apply migrations directly using SQL
apply_migrations_directly() {
    log "Applying migrations directly using SQL..."
    
    # Ensure migration table exists
    if ! check_migration_table; then
        log "Creating migration table..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            CREATE TABLE IF NOT EXISTS \"__drizzle_migrations\" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            );
        " || {
            log_error "Failed to create migration table"
            return 1
        }
    fi
    
    # Find and apply migration files
    local migration_dir="/migration/src/db/migrations"
    local applied_count=0
    
    if [ ! -d "$migration_dir" ]; then
        log_error "Migration directory not found: $migration_dir"
        return 1
    fi
    
    # Sort migration files by name to ensure proper order
    for migration_file in $(find "$migration_dir" -name "*.sql" | sort); do
        local filename=$(basename "$migration_file")
        local hash=$(echo "$filename" | sed 's/^[0-9]*_//' | sed 's/\.sql$//')
        
        log "Processing migration: $filename"
        
        # Check if migration already applied
        local already_applied
        already_applied=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM \"__drizzle_migrations\" WHERE hash = '$hash';" 2>/dev/null | tr -d ' ')
        
        if [ "$already_applied" = "0" ]; then
            log "Applying migration: $filename"
            
            # Apply the migration
            if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file" >/dev/null 2>&1; then
                # Record the migration
                psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO \"__drizzle_migrations\" (hash, created_at) VALUES ('$hash', $(date +%s));" >/dev/null 2>&1
                log_success "Applied migration: $filename"
                applied_count=$((applied_count + 1))
            else
                log_error "Failed to apply migration: $filename"
                return 1
            fi
        else
            log "Migration already applied: $filename"
        fi
    done
    
    log_success "Applied $applied_count new migrations"
    return 0
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

# Function to run migrations with comprehensive retry logic
run_migrations() {
    log "Starting migration process..."
    
    local retry_count=0
    local delay=$INITIAL_RETRY_DELAY
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        log "Migration attempt $((retry_count + 1))/$MAX_RETRIES"
        
        if apply_migrations_directly && verify_migrations; then
            log_success "Migrations completed successfully"
            return 0
        else
            log_error "Migration attempt $((retry_count + 1)) failed"
            retry_count=$((retry_count + 1))
            
            if [ $retry_count -lt $MAX_RETRIES ]; then
                log "Waiting ${delay}s before retry..."
                sleep $delay
                
                # Exponential backoff
                delay=$((delay * 2))
                if [ $delay -gt $MAX_RETRY_DELAY ]; then
                    delay=$MAX_RETRY_DELAY
                fi
            fi
        fi
    done
    
    log_error "Migrations failed after $MAX_RETRIES attempts"
    return 1
}

# Main execution with comprehensive error handling
main() {
    log "Starting bulletproof migration script..."
    
    # Check required environment variables
    if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
        log_error "Missing required database environment variables"
        log_error "DB_HOST: $DB_HOST"
        log_error "DB_PORT: $DB_PORT"
        log_error "DB_USER: $DB_USER"
        log_error "DB_NAME: $DB_NAME"
        log_error "DB_PASSWORD: [SET]"
        exit 1
    fi
    
    log "Database configuration:"
    log "  Host: $DB_HOST"
    log "  Port: $DB_PORT"
    log "  User: $DB_USER"
    log "  Database: $DB_NAME"
    
    # Wait for database to be ready and create if needed
    if ! wait_for_database; then
        log_error "Database failed to become ready"
        exit 1
    fi
    
    # Ensure the target database exists
    if ! ensure_database_exists; then
        log_error "Failed to ensure database exists"
        exit 1
    fi
    
    # Double-check database connection after creation
    log "Verifying database connection..."
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "Cannot connect to database '$DB_NAME' after setup"
        exit 1
    fi
    log_success "Database connection verified"
    
    # Create S3 buckets (non-blocking)
    create_s3_buckets
    
    # Run migrations
    if ! run_migrations; then
        log_error "Migration process failed"
        exit 1
    fi
    
    log_success "Migration process completed successfully"
}

# Execute main function
main "$@" 