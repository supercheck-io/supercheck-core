#!/bin/bash

# Dynamic Migration Script
# This script automatically finds and runs all migration files in order

set -e

echo "Starting database migration..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -U postgres -d supercheck; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is ready!"

# Find all migration files and sort them
echo "Finding migration files..."
MIGRATION_FILES=$(find /migrations -name "*.sql" | sort)

if [ -z "$MIGRATION_FILES" ]; then
  echo "No migration files found in /migrations"
  exit 0
fi

echo "Found migration files:"
echo "$MIGRATION_FILES"

# Run each migration file
for file in $MIGRATION_FILES; do
  echo "Running migration: $file"
  psql -h postgres -U postgres -d supercheck -f "$file"
  echo "Migration $file completed"
done

echo "All migrations completed successfully!" 