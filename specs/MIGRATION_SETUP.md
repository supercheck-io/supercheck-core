# Database Migration Setup

This project uses a dedicated migration service to handle database migrations before the application starts.

## Architecture

The migration setup follows the best practice of separating migration concerns from application concerns:

1. **Migration Service**: A dedicated container that runs migrations using DrizzleKit
2. **App Service**: The Next.js application that starts after migrations complete
3. **Worker Service**: The NestJS worker that starts after migrations complete

## Flow

```
PostgreSQL → Migration Service → App + Worker Services
```

1. PostgreSQL starts and becomes healthy
2. Migration service runs and applies all pending migrations
3. App and Worker services start only after migrations complete successfully

## Files

- `Dockerfile.migrate`: Dedicated migration container with only necessary dependencies
- `app/scripts/migrate.sh`: Migration script that handles database setup and migration application
- `docker-compose.yml`: Updated to include migration service with proper dependencies
- `.github/workflows/docker-build.yml`: GitHub Actions workflow for building and pushing images

## Images

- `ghcr.io/krish-kant/supercheck/migrate:latest`: Migration service image
- `ghcr.io/krish-kant/supercheck/app:latest`: Application image
- `ghcr.io/krish-kant/supercheck/worker:latest`: Worker image

## Benefits

✅ **Separation of Concerns**: Migration logic is isolated from application logic
✅ **Reliable Startup**: Apps only start after migrations complete successfully  
✅ **Lightweight Images**: App containers don't include dev dependencies
✅ **Better Error Handling**: Migration failures are clearly separated from app failures
✅ **Production Ready**: Follows Docker Compose best practices
✅ **Multi-Architecture Support**: Images built for both AMD64 and ARM64 platforms

## Usage

### Start the full stack with migrations:
```bash
docker-compose up --build
```

### Run only migrations:
```bash
docker-compose up migration
```

### Test migration setup:
```bash
./test-migration-setup.sh
```

## Troubleshooting

### Migration fails
Check the migration service logs:
```bash
docker-compose logs migration
```

### Database connection issues
Verify PostgreSQL is running and healthy:
```bash
docker-compose logs postgres
```

### Migration script issues
The migration script includes comprehensive error handling and retry logic. Check the script logs for detailed error messages.

## Migration Script Features

- ✅ Waits for database to be ready
- ✅ Creates database if it doesn't exist
- ✅ Applies migrations in order
- ✅ Verifies all required tables exist
- ✅ Comprehensive error handling and retry logic
- ✅ Detailed logging for debugging 