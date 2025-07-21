#!/bin/bash

# Setup script for Traefik integration

echo "🚀 Setting up Traefik for SuperTest..."

# Create traefik network if it doesn't exist
echo "📡 Creating Traefik network..."
docker network create traefik-public 2>/dev/null || echo "Network already exists"

# Create traefik directory structure
echo "📁 Creating Traefik directories..."
mkdir -p traefik
mkdir -p traefik/dynamic

# Create acme.json with proper permissions
echo "🔐 Creating SSL certificate storage..."
touch traefik/acme.json
chmod 600 traefik/acme.json

# Create logs directory
echo "📝 Creating logs directory..."
mkdir -p traefik/logs

# Set proper permissions
echo "🔒 Setting permissions..."
chmod 644 traefik/traefik.yml
chmod 644 traefik/dynamic.yml

echo "✅ Traefik setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update your email in traefik/traefik.yml (line 25)"
echo "2. Update your domain in docker-compose.traefik.yml"
echo "3. Run: docker-compose -f docker-compose.traefik.yml up -d"
echo ""
echo "🌐 Access URLs:"
echo "- App: https://supertest.localhost"
echo "- Traefik Dashboard: https://traefik.localhost (admin:admin)"
echo "- MinIO Console: http://localhost:9001 (minioadmin:minioadmin)" 