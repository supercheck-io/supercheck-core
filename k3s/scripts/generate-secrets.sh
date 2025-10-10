#!/bin/bash

# Generate secrets for Supercheck deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "Supercheck Secrets Generator"
print_status "============================"

# Function to encode input to base64
encode_base64() {
    echo -n "$1" | base64
}

# Get user input
echo ""
print_warning "Please provide the following values:"
echo ""

read -p "Database password: " DB_PASSWORD
read -p "Redis password (press Enter if none): " REDIS_PASSWORD
read -p "S3 Access Key: " S3_ACCESS_KEY
read -p "S3 Secret Key: " S3_SECRET_KEY
read -p "Better Auth Secret (generate with: openssl rand -base64 32): " BETTER_AUTH_SECRET
read -p "Credential Encryption Key (generate with: openssl rand -base64 32): " CREDENTIAL_ENCRYPTION_KEY
read -p "Variables Encryption Key (64 characters, generate with: openssl rand -base64 48): " VARIABLES_ENCRYPTION_KEY
read -p "SMTP Password: " SMTP_PASSWORD
read -p "OpenAI API Key (press Enter if not using): " OPENAI_API_KEY

# Generate the secret YAML
cat > ../configs/supercheck-secrets.yaml <<EOF
# Secrets for Supercheck
apiVersion: v1
kind: Secret
metadata:
  name: supercheck-secrets
  namespace: supercheck
type: Opaque
data:
  DB_PASSWORD: $(encode_base64 "$DB_PASSWORD")
EOF

# Add optional Redis password if provided
if [ ! -z "$REDIS_PASSWORD" ]; then
    echo "  REDIS_PASSWORD: $(encode_base64 "$REDIS_PASSWORD")" >> ../configs/supercheck-secrets.yaml
fi

cat >> ../configs/supercheck-secrets.yaml <<EOF
  AWS_ACCESS_KEY_ID: $(encode_base64 "$S3_ACCESS_KEY")
  AWS_SECRET_ACCESS_KEY: $(encode_base64 "$S3_SECRET_KEY")
  BETTER_AUTH_SECRET: $(encode_base64 "$BETTER_AUTH_SECRET")
  CREDENTIAL_ENCRYPTION_KEY: $(encode_base64 "$CREDENTIAL_ENCRYPTION_KEY")
  VARIABLES_ENCRYPTION_KEY: $(encode_base64 "$VARIABLES_ENCRYPTION_KEY")
  SMTP_PASSWORD: $(encode_base64 "$SMTP_PASSWORD")
EOF

# Add optional OpenAI API key if provided
if [ ! -z "$OPENAI_API_KEY" ]; then
    echo "  OPENAI_API_KEY: $(encode_base64 "$OPENAI_API_KEY")" >> ../configs/supercheck-secrets.yaml
fi

print_status ""
print_status "Secret file created: ../configs/supercheck-secrets.yaml"
print_status ""
print_warning "IMPORTANT:"
echo "1. The secret file contains sensitive information - keep it secure!"
echo "2. Apply it to the cluster with: kubectl apply -f ../configs/supercheck-secrets.yaml"
echo "3. Or merge it into supercheck.yaml before deployment"
echo ""
print_status "To generate secrets:"
echo "openssl rand -base64 32     # For general secrets"
echo "openssl rand -base64 48     # For 64-character encryption key"