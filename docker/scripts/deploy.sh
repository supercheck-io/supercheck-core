#!/bin/bash

# Supercheck Docker Swarm Deployment Script
# Usage: ./deploy.sh [environment] [stack-name]

set -e

ENVIRONMENT=${1:-prod}
STACK_NAME=${2:-supercheck}

echo "🚀 Deploying Supercheck to Docker Swarm"
echo "Environment: $ENVIRONMENT"
echo "Stack Name: $STACK_NAME"

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Invalid environment. Use 'dev' or 'prod'"
    exit 1
fi

# Check if Docker is running and in Swarm mode
if ! docker info | grep -q "Swarm: active"; then
    echo "❌ Docker Swarm is not active"
    echo "Initialize swarm with: docker swarm init"
    echo "Or join existing swarm: docker swarm join --token <token> <manager-ip>:2377"
    exit 1
fi

# Check if running on manager node
if ! docker node ls &>/dev/null; then
    echo "❌ This script must be run on a Docker Swarm manager node"
    exit 1
fi

echo "✅ Docker Swarm is active and running on manager node"

# Check if secrets exist
echo "🔍 Checking required secrets..."

REQUIRED_SECRETS=(
    "database_url"
    "redis_url"
    "aws_access_key_id"
    "aws_secret_access_key"
    "auth_secret"
    "credential_encryption_key"
    "variables_encryption_key"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! docker secret inspect $secret &>/dev/null; then
        echo "❌ Missing required secret: $secret"
        echo "Please run the secrets setup script first:"
        echo "   cp configs/secrets-template.sh configs/secrets.sh"
        echo "   # Edit configs/secrets.sh with your actual values"
        echo "   chmod +x configs/secrets.sh"
        echo "   ./configs/secrets.sh"
        exit 1
    fi
done

echo "✅ All required secrets are available"

# Select the appropriate stack file
if [[ "$ENVIRONMENT" == "dev" ]]; then
    STACK_FILE="../stacks/supercheck-dev.yml"
    if [ ! -f "$STACK_FILE" ]; then
        echo "❌ Stack file not found: $STACK_FILE"
        exit 1
    fi
else
    STACK_FILE="../stacks/supercheck-external-services.yml"
    if [ ! -f "$STACK_FILE" ]; then
        echo "❌ Stack file not found: $STACK_FILE"
        exit 1
    fi
fi

echo "📦 Using stack file: $STACK_FILE"

# Deploy the stack
echo "🚀 Deploying stack '$STACK_NAME'..."
docker stack deploy -c "$STACK_FILE" "$STACK_NAME"

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "📊 Service Status:"
docker stack services "$STACK_NAME"

echo ""
echo "📋 Service Details:"
docker service ls --filter label=com.docker.stack.namespace="$STACK_NAME"

# Wait for services to be running
echo ""
echo "⏳ Waiting for services to be ready..."

SERVICES=(
    "${STACK_NAME}_supercheck-app"
    "${STACK_NAME}_supercheck-worker"
)

if [[ "$ENVIRONMENT" == "prod" ]]; then
    SERVICES+=("${STACK_NAME}_traefik")
fi

for service in "${SERVICES[@]}"; do
    echo "⏳ Waiting for $service..."

    # Wait up to 5 minutes for service to be ready
    timeout 300 bash -c "
        while true; do
            replicas=\$(docker service ls --filter name=$service --format '{{.Replicas}}' | head -1)
            if [[ \"\$replicas\" == *'/'* ]]; then
                running=\$(echo \$replicas | cut -d'/' -f1)
                desired=\$(echo \$replicas | cut -d'/' -f2)
                if [[ \"\$running\" == \"\$desired\" ]] && [[ \"\$running\" != \"0\" ]]; then
                    echo \"✅ $service is ready (\$replicas)\"
                    break
                fi
            fi
            echo \"⏳ $service: \$replicas\"
            sleep 5
        done
    " || echo "⚠️  Timeout waiting for $service (check logs: docker service logs $service)"
done

echo ""
echo "🌐 Network Information:"
docker network ls --filter label=com.docker.stack.namespace="$STACK_NAME"

echo ""
echo "🔐 Secrets in use:"
docker secret ls | grep -E "(database_url|redis_url|aws_access_key|auth_secret)" || echo "No matching secrets found"

echo ""
echo "📊 Current deployment status:"
docker stack ps "$STACK_NAME"

echo ""
echo "✅ Deployment complete!"

if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo ""
    echo "🔗 Development Access:"
    echo "   - Supercheck App: http://localhost:3000"
    echo "   - Worker Health: http://localhost:3001/health"
    echo ""
    echo "🔧 Development Commands:"
    echo "   - View app logs: docker service logs -f ${STACK_NAME}_supercheck-app"
    echo "   - View worker logs: docker service logs -f ${STACK_NAME}_supercheck-worker"
    echo "   - Scale workers: docker service scale ${STACK_NAME}_supercheck-worker=2"
else
    echo ""
    echo "🔗 Production Access:"
    echo "   - Update DNS to point to this server's IP"
    echo "   - Supercheck App: https://supercheck.yourdomain.com"
    echo "   - Traefik Dashboard: https://traefik.yourdomain.com"
    echo ""
    echo "🔧 Production Commands:"
    echo "   - View app logs: docker service logs -f ${STACK_NAME}_supercheck-app"
    echo "   - View worker logs: docker service logs -f ${STACK_NAME}_supercheck-worker"
    echo "   - View Traefik logs: docker service logs -f ${STACK_NAME}_traefik"
    echo "   - Scale workers: docker service scale ${STACK_NAME}_supercheck-worker=8"
fi

echo ""
echo "📈 Monitoring Commands:"
echo "   - Stack overview: docker stack ps $STACK_NAME"
echo "   - Service status: docker stack services $STACK_NAME"
echo "   - Node status: docker node ls"
echo "   - Resource usage: docker stats"

echo ""
echo "🔄 Management Commands:"
echo "   - Update stack: docker stack deploy -c $STACK_FILE $STACK_NAME"
echo "   - Remove stack: docker stack rm $STACK_NAME"
echo "   - Rolling restart: docker service update --force ${STACK_NAME}_supercheck-app"

echo ""
echo "🌟 External Services:"
echo "   - ✅ Database: External (Neon/PlanetScale)"
echo "   - ✅ Redis: External (Redis Cloud)"
echo "   - ✅ Storage: External (S3/R2)"
echo "   - ✅ Simplified cluster with external services!"

# Test external service connectivity
echo ""
echo "🔍 Testing external service connectivity..."

# Test app health endpoint
if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo "Testing app health endpoint..."
    if timeout 30 bash -c 'until curl -sf http://localhost:3000/api/health; do sleep 2; done' 2>/dev/null; then
        echo "✅ App is responding to health checks"
    else
        echo "⚠️  App health check failed - check logs: docker service logs ${STACK_NAME}_supercheck-app"
    fi
fi

echo ""
echo "🎉 Supercheck Docker Swarm deployment completed!"
echo "Monitor your external services through their respective dashboards."