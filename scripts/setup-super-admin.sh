#!/bin/bash

# Super Admin Setup Script
# This script helps you set up your first super admin user for Supertest

set -e

echo "🔧 Supertest Super Admin Setup"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: This script must be run from the root directory of the Supertest project"
    exit 1
fi

# Check if Docker is running
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

echo "📋 This script will help you:"
echo "   1. Validate the email address exists in the database"
echo "   2. Add it to your environment configuration"
echo "   3. Restart the application"
echo ""

# Get user email
read -p "📧 Enter the email address of the user to make super admin: " USER_EMAIL

if [ -z "$USER_EMAIL" ]; then
    echo "❌ Error: Email address is required"
    exit 1
fi

echo ""
echo "🔍 Validating user exists in database..."

# Check if postgres container is running
if ! docker ps | grep -q "postgres-supercheck"; then
    echo "❌ Error: PostgreSQL container 'postgres-supercheck' is not running"
    echo "   Please start your services with: docker-compose up -d"
    exit 1
fi

# Query the database for the user
USER_EXISTS=$(docker exec postgres-supercheck psql -U postgres -d supercheck -t -c "SELECT email FROM \"user\" WHERE email = '$USER_EMAIL';" 2>/dev/null | tr -d ' ' | head -n 1)

if [ -z "$USER_EXISTS" ] || [ "$USER_EXISTS" = "" ]; then
    echo "❌ Error: User with email '$USER_EMAIL' not found in database"
    echo ""
    echo "💡 To create this user:"
    echo "   1. Go to your app signup page"
    echo "   2. Create an account with email: $USER_EMAIL"
    echo "   3. Run this script again"
    exit 1
fi

echo "✅ Found user: $USER_EMAIL"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📁 Creating .env file..."
    touch .env
fi

# Check if SUPER_ADMIN_EMAILS already exists
if grep -q "SUPER_ADMIN_EMAILS" .env; then
    echo "⚠️  SUPER_ADMIN_EMAILS already exists in .env file"
    
    # Get current value
    CURRENT_VALUE=$(grep "SUPER_ADMIN_EMAILS" .env | cut -d'=' -f2)
    echo "   Current value: $CURRENT_VALUE"
    echo ""
    
    read -p "❓ Do you want to replace it? (y/N): " REPLACE
    
    if [ "$REPLACE" = "y" ] || [ "$REPLACE" = "Y" ]; then
        # Remove existing line and add new one
        sed -i.bak '/SUPER_ADMIN_EMAILS/d' .env
        echo "SUPER_ADMIN_EMAILS=$USER_EMAIL" >> .env
        echo "✅ Updated SUPER_ADMIN_EMAILS in .env file"
    else
        # Add to existing value
        if [[ "$CURRENT_VALUE" == *"$USER_EMAIL"* ]]; then
            echo "ℹ️  Email already in SUPER_ADMIN_EMAILS list"
        else
            sed -i.bak "s/SUPER_ADMIN_EMAILS=.*/SUPER_ADMIN_EMAILS=$CURRENT_VALUE,$USER_EMAIL/" .env
            echo "✅ Added email to existing SUPER_ADMIN_EMAILS list"
        fi
    fi
else
    # Add new line
    echo "SUPER_ADMIN_EMAILS=$USER_EMAIL" >> .env
    echo "✅ Added SUPER_ADMIN_EMAILS to .env file"
fi

echo ""
echo "🔄 Restarting application to apply changes..."

# Restart the app service
if docker-compose ps | grep -q "app"; then
    docker-compose restart app
    echo "✅ Application restarted"
else
    echo "⚠️  App service not running. Starting services..."
    docker-compose up -d
    echo "✅ Services started"
fi

echo ""
echo "🎉 Super Admin Setup Complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Wait for the application to fully start (30-60 seconds)"
echo "   2. Login with email: $USER_EMAIL"
echo "   3. Navigate to: http://localhost:3001/admin"
echo "   4. You should see the admin dashboard"
echo ""
echo "🔧 You can now:"
echo "   • View system statistics"
echo "   • Manage users and organizations"
echo "   • Impersonate other users"
echo "   • Change user roles through the UI"
echo ""
echo "📚 For more information, see: SUPER_ADMIN_SETUP.md"