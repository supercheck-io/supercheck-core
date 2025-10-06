#!/bin/bash

# Supercheck Dokploy Secrets Generator
# This script generates the required secrets for Dokploy deployment

set -e

echo "🔐 Supercheck Dokploy Secrets Generator"
echo "======================================"
echo ""

# Function to generate random hex string
generate_hex() {
    local length=$1
    openssl rand -hex "$length"
}

# Function to generate secure password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

echo "Generating required secrets for Supercheck deployment..."
echo ""

# Generate Better Auth Secret
echo "1. Generating Better Auth Secret..."
BETTER_AUTH_SECRET=$(generate_hex 16)
echo "   BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET"
echo ""

# Generate Encryption Keys
echo "2. Generating Encryption Keys..."
VARIABLES_ENCRYPTION_KEY=$(generate_hex 32)
CREDENTIAL_ENCRYPTION_KEY=$(generate_hex 32)
echo "   VARIABLES_ENCRYPTION_KEY=$VARIABLES_ENCRYPTION_KEY"
echo "   CREDENTIAL_ENCRYPTION_KEY=$CREDENTIAL_ENCRYPTION_KEY"
echo ""

# Generate secure passwords for external services
echo "3. Generating Secure Passwords (optional but recommended)..."
DB_PASSWORD=$(generate_password)
REDIS_PASSWORD=$(generate_password)
MINIO_ROOT_PASSWORD=$(generate_password)
echo "   Database Password: $DB_PASSWORD"
echo "   Redis Password: $REDIS_PASSWORD"
echo "   MinIO Root Password: $MINIO_ROOT_PASSWORD"
echo ""

# Create .env.dokploy file
echo "4. Creating .env.dokploy file..."
cat > .env.dokploy << EOF
# =============================================================================
# SECURITY CONFIGURATION - REQUIRED FOR PRODUCTION
# =============================================================================

# Better Auth Secret
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

# Encryption Keys
VARIABLES_ENCRYPTION_KEY=$VARIABLES_ENCRYPTION_KEY
CREDENTIAL_ENCRYPTION_KEY=$CREDENTIAL_ENCRYPTION_KEY

# =============================================================================
# EXTERNAL DATABASE CONFIGURATION - REQUIRED
# =============================================================================

# Replace with your actual database connection string
DATABASE_URL=CHANGE_THIS_YOUR_DATABASE_CONNECTION_STRING

# =============================================================================
# EXTERNAL REDIS CONFIGURATION - REQUIRED
# =============================================================================

# Replace with your actual Redis connection string
REDIS_URL=CHANGE_THIS_YOUR_REDIS_CONNECTION_STRING

# =============================================================================
# EXTERNAL S3 CONFIGURATION - REQUIRED
# =============================================================================

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=CHANGE_THIS_YOUR_AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=CHANGE_THIS_YOUR_AWS_SECRET_KEY
S3_ENDPOINT=https://s3.amazonaws.com
S3_JOB_BUCKET_NAME=supercheck-job-artifacts
S3_TEST_BUCKET_NAME=supercheck-test-artifacts
S3_FORCE_PATH_STYLE=false

# =============================================================================
# APPLICATION CONFIGURATION
# =============================================================================

# App URLs (Dokploy will automatically set these)
NEXT_PUBLIC_APP_URL=https://your-app-domain.dokploy.app
BETTER_AUTH_URL=https://your-app-domain.dokploy.app

# Environment and Logging
NODE_ENV=production

# Capacity and Timeout Configuration
RUNNING_CAPACITY=3
QUEUED_CAPACITY=25
TEST_EXECUTION_TIMEOUT_MS=120000
JOB_EXECUTION_TIMEOUT_MS=900000

# =============================================================================
# EMAIL CONFIGURATION - REQUIRED
# =============================================================================

SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=CHANGE_THIS_YOUR_SMTP_PASSWORD
SMTP_SECURE=false
SMTP_FROM_EMAIL=notifications@your-domain.com

# =============================================================================
# ADMIN CONFIGURATION - REQUIRED
# =============================================================================

# Organization Configuration
MAX_PROJECTS_PER_ORG=10
DEFAULT_PROJECT_NAME="Default Project"

# =============================================================================
# AI FIX FEATURE CONFIGURATION (OPTIONAL)
# =============================================================================

AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=CHANGE_THIS_YOUR_OPENAI_API_KEY

# =============================================================================
# WORKER SPECIFIC CONFIGURATION
# =============================================================================

# Worker-specific settings (for worker deployment)
NODE_OPTIONS="--max-old-space-size=1024 --expose-gc --experimental-worker"
UV_THREADPOOL_SIZE=4
EOF

echo "   ✅ .env.dokploy file created successfully!"
echo ""

# Display connection string examples
echo "5. Connection String Examples..."
echo ""
echo "   Database Connection String Examples:"
echo "   - Neon: postgresql://username:$DB_PASSWORD@ep-example.us-east-1.aws.neon.tech/supercheck?sslmode=require"
echo "   - Supabase: postgresql://postgres.xxx:$DB_PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres"
echo ""
echo "   Redis Connection String Examples:"
echo "   - Redis Cloud: redis://default:$REDIS_PASSWORD@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345"
echo "   - Upstash: rediss://:$REDIS_PASSWORD@us1-xxx.upstash.io:12345"
echo ""

# Next steps
echo "6. Next Steps..."
echo "   ✅ 1. Update DATABASE_URL with your actual database connection string"
echo "   ✅ 2. Update REDIS_URL with your actual Redis connection string"
echo "   ✅ 3. Update AWS credentials with your actual S3 access keys"
echo "   ✅ 4. Update SMTP_PASSWORD with your email service password"
echo "   ✅ 5. Update OPENAI_API_KEY if using AI features"
echo "   ✅ 6. Copy all variables to your Dokploy environment variables"
echo ""

echo "🎉 Secrets generated successfully!"
echo ""
echo "📝 Important: Store these secrets securely and never commit them to Git!"
echo ""

# Optional: Save to a secure file
read -p "Would you like to save these secrets to a secure file? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    SECRETS_FILE="supercheck-secrets-$TIMESTAMP.txt"
    
    cat > "$SECRETS_FILE" << EOF
Supercheck Dokploy Secrets - Generated on $(date)
==================================================

BETTER_AUTH_SECRET: $BETTER_AUTH_SECRET
VARIABLES_ENCRYPTION_KEY: $VARIABLES_ENCRYPTION_KEY
CREDENTIAL_ENCRYPTION_KEY: $CREDENTIAL_ENCRYPTION_KEY

Database Password: $DB_PASSWORD
Redis Password: $REDIS_PASSWORD
MinIO Root Password: $MINIO_ROOT_PASSWORD

⚠️  Keep this file secure and delete it after setup!
EOF
    
    echo "✅ Secrets saved to: $SECRETS_FILE"
    echo "🔒 Make sure to delete this file after completing your setup!"
fi

echo ""
echo "📚 For complete deployment instructions, see: docs/DOKPLOY_QUICK_DEPLOYMENT_GUIDE.md"