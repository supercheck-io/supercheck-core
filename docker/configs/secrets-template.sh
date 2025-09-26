#!/bin/bash

# Supercheck Docker Swarm Secrets Setup Template
# This script creates Docker Swarm secrets for external services
# Copy this file to secrets.sh and update with your actual values

set -e

echo "🔐 Setting up Docker Swarm secrets for Supercheck with external services"

# Function to create secret if it doesn't exist
create_secret() {
    local secret_name=$1
    local secret_value=$2

    if docker secret inspect $secret_name >/dev/null 2>&1; then
        echo "✅ Secret '$secret_name' already exists"
    else
        echo -n "$secret_value" | docker secret create $secret_name -
        echo "✅ Created secret '$secret_name'"
    fi
}

# ============================================================================
# EXTERNAL SERVICE CREDENTIALS
# ============================================================================

# Database Configuration (Neon/PlanetScale)
# Format for Neon: postgresql://username:password@ep-example.neon.com/supercheck?sslmode=require
# Format for PlanetScale: postgresql://username:password@host.psdb.cloud/supercheck?sslmode=require
DATABASE_URL="postgresql://your-username:your-password@your-host.neon.com/supercheck?sslmode=require"

# Redis Cloud Configuration
# Format: redis://username:password@host:port
# Example: redis://default:password@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
REDIS_URL="redis://default:your-password@your-redis-host:port"

# AWS S3 or Cloudflare R2 Configuration
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"

# ============================================================================
# APPLICATION SECRETS
# ============================================================================

# Better Auth Secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET="your-super-secure-auth-secret-change-this-in-production"

# Encryption Keys (generate with: openssl rand -base64 32)
CREDENTIAL_ENCRYPTION_KEY="your-credential-encryption-key-change-this-in-production"

# Variables Encryption Key (generate with: openssl rand -base64 64)
VARIABLES_ENCRYPTION_KEY="your-64-character-encryption-key-for-variables-change-this-in-production"

# SMTP Configuration (for notifications)
SMTP_PASSWORD="your-smtp-password-change-this-in-production"

# OpenAI API Key (for AI features)
OPENAI_API_KEY="your-openai-api-key-here"

# ============================================================================
# CREATE SECRETS
# ============================================================================

echo "Creating external service secrets..."

# Database secrets
create_secret "database_url" "$DATABASE_URL"

# Redis secrets
create_secret "redis_url" "$REDIS_URL"

# AWS/S3 secrets
create_secret "aws_access_key_id" "$AWS_ACCESS_KEY_ID"
create_secret "aws_secret_access_key" "$AWS_SECRET_ACCESS_KEY"

# Application secrets
create_secret "auth_secret" "$BETTER_AUTH_SECRET"
create_secret "credential_encryption_key" "$CREDENTIAL_ENCRYPTION_KEY"
create_secret "variables_encryption_key" "$VARIABLES_ENCRYPTION_KEY"

# Optional secrets
create_secret "smtp_password" "$SMTP_PASSWORD"
create_secret "openai_api_key" "$OPENAI_API_KEY"

echo ""
echo "✅ All secrets created successfully!"
echo ""
echo "🔍 To verify secrets:"
echo "   docker secret ls"
echo ""
echo "🗑️  To remove all secrets:"
echo "   docker secret rm database_url redis_url aws_access_key_id aws_secret_access_key auth_secret credential_encryption_key variables_encryption_key smtp_password openai_api_key"
echo ""
echo "⚠️  SECURITY NOTES:"
echo "   1. This script contains sensitive information - DO NOT commit it to git"
echo "   2. Run this script only on secure manager nodes"
echo "   3. Delete this script after running or store it securely"
echo "   4. Rotate secrets regularly in production"
echo ""
echo "🚀 Ready to deploy Supercheck:"
echo "   docker stack deploy -c stacks/supercheck-external-services.yml supercheck"