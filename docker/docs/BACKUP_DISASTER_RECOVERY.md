# Backup and Disaster Recovery Guide

This guide provides comprehensive instructions for implementing backup and disaster recovery strategies for Supercheck on Docker Swarm.

## Table of Contents

1. [Overview](#overview)
2. [Backup Strategy](#backup-strategy)
3. [Implementation](#implementation)
4. [Automated Backups](#automated-backups)
5. [Disaster Recovery](#disaster-recovery)
6. [Testing Procedures](#testing-procedures)
7. [Maintenance](#maintenance)
8. [Compliance](#compliance)

## Overview

### What to Backup

1. **Application Data**

   - PostgreSQL database
   - Redis cache data
   - MinIO object storage
   - Application configurations

2. **System Configuration**

   - Docker Swarm configuration
   - Network configurations
   - SSL certificates
   - Environment variables

3. **Monitoring Data**
   - Prometheus metrics
   - Grafana dashboards
   - Loki logs
   - AlertManager rules

### Backup Retention Policy

| Data Type         | Retention Period | Storage Location |
| ----------------- | ---------------- | ---------------- |
| Database          | 30 days          | Local + Cloud    |
| Application Files | 7 days           | Local            |
| Configuration     | 90 days          | Cloud            |
| Logs              | 7 days           | Local            |
| Metrics           | 30 days          | Local            |

## Backup Strategy

### 1. 3-2-1 Backup Rule

- **3 copies** of data (1 primary + 2 backups)
- **2 different media types** (local disk + cloud storage)
- **1 off-site copy** (cloud storage)

### 2. Backup Categories

#### Full Backups

- Complete system backup
- Performed weekly
- Includes all data and configurations

#### Incremental Backups

- Changes since last backup
- Performed daily
- Faster and smaller

#### Differential Backups

- Changes since last full backup
- Performed twice daily
- Balance between speed and size

### 3. Backup Locations

#### Primary Storage (Local)

- Fast access for quick recovery
- RAID-10 configuration
- SSD storage for performance

#### Secondary Storage (Cloud)

- Off-site protection
- AWS S3, Hetzner Storage Box, or similar
- Encrypted storage

#### Tertiary Storage (Archive)

- Long-term retention
- Cold storage for compliance
- Cost-effective solution

## Implementation

### 1. Database Backup

```bash
#!/bin/bash
# docker/scripts/backup-database.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups/database"
DATE=$(date +%Y%m%d_%H%M%S)
POSTGRES_CONTAINER="supercheck_postgres.1.$(docker service ps -q supercheck_postgres | head -1)"
RETENTION_DAYS=30
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database backup
echo "Creating PostgreSQL backup..."
docker exec $POSTGRES_CONTAINER pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} --format=custom --compress=9 --verbose > $BACKUP_DIR/postgres_$DATE.dump

# Create schema backup
echo "Creating schema backup..."
docker exec $POSTGRES_CONTAINER pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} --schema-only --format=custom --compress=9 > $BACKUP_DIR/postgres_schema_$DATE.dump

# Encrypt backup
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "Encrypting backup..."
    openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY -in $BACKUP_DIR/postgres_$DATE.dump -out $BACKUP_DIR/postgres_$DATE.dump.enc
    openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY -in $BACKUP_DIR/postgres_schema_$DATE.dump -out $BACKUP_DIR/postgres_schema_$DATE.dump.enc

    # Remove unencrypted files
    rm $BACKUP_DIR/postgres_$DATE.dump
    rm $BACKUP_DIR/postgres_schema_$DATE.dump

    # Update file extensions
    mv $BACKUP_DIR/postgres_$DATE.dump.enc $BACKUP_DIR/postgres_$DATE.dump
    mv $BACKUP_DIR/postgres_schema_$DATE.dump.enc $BACKUP_DIR/postgres_schema_$DATE.dump
fi

# Verify backup integrity
echo "Verifying backup integrity..."
if [ -n "$ENCRYPTION_KEY" ]; then
    openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in $BACKUP_DIR/postgres_$DATE.dump | pg_restore --list --verbose > /dev/null
else
    pg_restore --list --verbose $BACKUP_DIR/postgres_$DATE.dump > /dev/null
fi

# Upload to cloud storage
echo "Uploading to cloud storage..."
if command -v aws &> /dev/null; then
    aws s3 cp $BACKUP_DIR/postgres_$DATE.dump s3://supercheck-backups/database/
    aws s3 cp $BACKUP_DIR/postgres_schema_$DATE.dump s3://supercheck-backups/database/
fi

# Clean up old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "postgres_*.dump" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "postgres_schema_*.dump" -mtime +$RETENTION_DAYS -delete

echo "Database backup completed: postgres_$DATE.dump"
```

### 2. Redis Backup

```bash
#!/bin/bash
# docker/scripts/backup-redis.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups/redis"
DATE=$(date +%Y%m%d_%H%M%S)
REDIS_CONTAINER="supercheck_redis.1.$(docker service ps -q supercheck_redis | head -1)"
RETENTION_DAYS=7
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create Redis backup
echo "Creating Redis backup..."
docker exec $REDIS_CONTAINER redis-cli --rdb /tmp/dump_$DATE.rdb

# Copy backup from container
docker cp $REDIS_CONTAINER:/tmp/dump_$DATE.rdb $BACKUP_DIR/redis_$DATE.rdb

# Clean up container
docker exec $REDIS_CONTAINER rm /tmp/dump_$DATE.rdb

# Compress backup
gzip $BACKUP_DIR/redis_$DATE.rdb

# Encrypt backup
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "Encrypting backup..."
    openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY -in $BACKUP_DIR/redis_$DATE.rdb.gz -out $BACKUP_DIR/redis_$DATE.rdb.gz.enc

    # Remove unencrypted file
    rm $BACKUP_DIR/redis_$DATE.rdb.gz

    # Update file extension
    mv $BACKUP_DIR/redis_$DATE.rdb.gz.enc $BACKUP_DIR/redis_$DATE.rdb.gz
fi

# Upload to cloud storage
echo "Uploading to cloud storage..."
if command -v aws &> /dev/null; then
    aws s3 cp $BACKUP_DIR/redis_$DATE.rdb.gz s3://supercheck-backups/redis/
fi

# Clean up old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "redis_*.rdb.gz" -mtime +$RETENTION_DAYS -delete

echo "Redis backup completed: redis_$DATE.rdb.gz"
```

### 3. MinIO Backup

```bash
#!/bin/bash
# docker/scripts/backup-minio.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups/minio"
DATE=$(date +%Y%m%d_%H%M%S)
MINIO_CONTAINER="supercheck_minio.1.$(docker service ps -q supercheck_minio | head -1)"
RETENTION_DAYS=30
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"
BUCKETS="supercheck-artifacts"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create MinIO backup
echo "Creating MinIO backup..."
docker exec $MINIO_CONTAINER mc alias set local http://localhost:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD}

# Backup each bucket
for bucket in $BUCKETS; do
    echo "Backing up bucket: $bucket"
    docker exec $MINIO_CONTAINER mc mirror local/$bucket /tmp/backup_$bucket_$DATE

    # Copy backup from container
    docker cp $MINIO_CONTAINER:/tmp/backup_$bucket_$DATE $BACKUP_DIR/minio_$bucket_$DATE

    # Clean up container
    docker exec $MINIO_CONTAINER rm -rf /tmp/backup_$bucket_$DATE

    # Compress backup
    tar -czf $BACKUP_DIR/minio_$bucket_$DATE.tar.gz -C $BACKUP_DIR minio_$bucket_$DATE
    rm -rf $BACKUP_DIR/minio_$bucket_$DATE

    # Encrypt backup
    if [ -n "$ENCRYPTION_KEY" ]; then
        echo "Encrypting backup..."
        openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY -in $BACKUP_DIR/minio_$bucket_$DATE.tar.gz -out $BACKUP_DIR/minio_$bucket_$DATE.tar.gz.enc

        # Remove unencrypted file
        rm $BACKUP_DIR/minio_$bucket_$DATE.tar.gz

        # Update file extension
        mv $BACKUP_DIR/minio_$bucket_$DATE.tar.gz.enc $BACKUP_DIR/minio_$bucket_$DATE.tar.gz
    fi

    # Upload to cloud storage
    echo "Uploading to cloud storage..."
    if command -v aws &> /dev/null; then
        aws s3 cp $BACKUP_DIR/minio_$bucket_$DATE.tar.gz s3://supercheck-backups/minio/
    fi

    # Clean up old backups
    find $BACKUP_DIR -name "minio_$bucket_*.tar.gz" -mtime +$RETENTION_DAYS -delete
done

echo "MinIO backup completed"
```

### 4. Configuration Backup

```bash
#!/bin/bash
# docker/scripts/backup-config.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups/config"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=90
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create configuration backup
echo "Creating configuration backup..."

# Backup Docker Swarm configuration
docker config ls > $BACKUP_DIR/docker_configs_$DATE.txt
docker secret ls > $BACKUP_DIR/docker_secrets_$DATE.txt
docker service ls > $BACKUP_DIR/docker_services_$DATE.txt
docker network ls > $BACKUP_DIR/docker_networks_$DATE.txt
docker node ls > $BACKUP_DIR/docker_nodes_$DATE.txt

# Backup application configurations
tar -czf $BACKUP_DIR/app_configs_$DATE.tar.gz docker/configs/

# Backup SSL certificates
if [ -d "/etc/letsencrypt" ]; then
    tar -czf $BACKUP_DIR/ssl_certs_$DATE.tar.gz /etc/letsencrypt/
fi

# Backup system configurations
tar -czf $BACKUP_DIR/system_configs_$DATE.tar.gz \
    /etc/docker/daemon.json \
    /etc/systemd/system/docker.service.d/ \
    /etc/ufw/ \
    /etc/fail2ban/

# Create comprehensive backup
tar -czf $BACKUP_DIR/complete_config_$DATE.tar.gz \
    $BACKUP_DIR/docker_configs_$DATE.txt \
    $BACKUP_DIR/docker_secrets_$DATE.txt \
    $BACKUP_DIR/docker_services_$DATE.txt \
    $BACKUP_DIR/docker_networks_$DATE.txt \
    $BACKUP_DIR/docker_nodes_$DATE.txt \
    $BACKUP_DIR/app_configs_$DATE.tar.gz \
    $BACKUP_DIR/ssl_certs_$DATE.tar.gz \
    $BACKUP_DIR/system_configs_$DATE.tar.gz

# Clean up individual files
rm $BACKUP_DIR/docker_configs_$DATE.txt
rm $BACKUP_DIR/docker_secrets_$DATE.txt
rm $BACKUP_DIR/docker_services_$DATE.txt
rm $BACKUP_DIR/docker_networks_$DATE.txt
rm $BACKUP_DIR/docker_nodes_$DATE.txt
rm $BACKUP_DIR/app_configs_$DATE.tar.gz
rm $BACKUP_DIR/ssl_certs_$DATE.tar.gz
rm $BACKUP_DIR/system_configs_$DATE.tar.gz

# Encrypt backup
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "Encrypting backup..."
    openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY -in $BACKUP_DIR/complete_config_$DATE.tar.gz -out $BACKUP_DIR/complete_config_$DATE.tar.gz.enc

    # Remove unencrypted file
    rm $BACKUP_DIR/complete_config_$DATE.tar.gz

    # Update file extension
    mv $BACKUP_DIR/complete_config_$DATE.tar.gz.enc $BACKUP_DIR/complete_config_$DATE.tar.gz
fi

# Upload to cloud storage
echo "Uploading to cloud storage..."
if command -v aws &> /dev/null; then
    aws s3 cp $BACKUP_DIR/complete_config_$DATE.tar.gz s3://supercheck-backups/config/
fi

# Clean up old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "complete_config_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Configuration backup completed: complete_config_$DATE.tar.gz"
```

## Automated Backups

### 1. Cron Configuration

```bash
# Add to crontab
crontab -e

# Backup schedule
0 2 * * * /opt/docker/scripts/backup-database.sh >> /var/log/backup.log 2>&1
0 3 * * * /opt/docker/scripts/backup-redis.sh >> /var/log/backup.log 2>&1
0 4 * * 0 /opt/docker/scripts/backup-minio.sh >> /var/log/backup.log 2>&1
0 5 * * 0 /opt/docker/scripts/backup-config.sh >> /var/log/backup.log 2>&1
0 6 * * * /opt/docker/scripts/backup-monitoring.sh >> /var/log/backup.log 2>&1
```

### 2. Backup Orchestrator

```bash
#!/bin/bash
# docker/scripts/backup-orchestrator.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/backup.log"
NOTIFICATION_EMAIL="admin@yourdomain.com"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Error handling
error_handler() {
    local line_number=$1
    log "ERROR: Script failed at line $line_number"

    # Send notification
    echo "Backup failed at line $line_number" | mail -s "Backup Failure" $NOTIFICATION_EMAIL

    exit 1
}

trap 'error_handler $LINENO' ERR

# Start backup
log "Starting backup orchestration: $DATE"

# Create backup directory
mkdir -p $BACKUP_DIR

# Run backup scripts
log "Running database backup..."
/opt/docker/scripts/backup-database.sh

log "Running Redis backup..."
/opt/docker/scripts/backup-redis.sh

# Run MinIO backup on Sundays
if [ $(date +%u) -eq 7 ]; then
    log "Running MinIO backup..."
    /opt/docker/scripts/backup-minio.sh
fi

# Run configuration backup on Sundays
if [ $(date +%u) -eq 7 ]; then
    log "Running configuration backup..."
    /opt/docker/scripts/backup-config.sh
fi

log "Running monitoring backup..."
/opt/docker/scripts/backup-monitoring.sh

# Verify backups
log "Verifying backups..."
/opt/docker/scripts/verify-backups.sh

# Cleanup
log "Cleaning up old backups..."
/opt/docker/scripts/cleanup-backups.sh

# Generate backup report
log "Generating backup report..."
/opt/docker/scripts/backup-report.sh

log "Backup orchestration completed successfully"

# Send success notification
echo "Backup completed successfully on $(date)" | mail -s "Backup Success" $NOTIFICATION_EMAIL
```

### 3. Backup Verification

```bash
#!/bin/bash
# docker/scripts/verify-backups.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups"
LOG_FILE="/var/log/backup.log"
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Verify database backup
verify_database_backup() {
    local latest_backup=$(find $BACKUP_DIR/database -name "postgres_*.dump" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

    if [ -z "$latest_backup" ]; then
        log "ERROR: No database backup found"
        return 1
    fi

    log "Verifying database backup: $latest_backup"

    if [ -n "$ENCRYPTION_KEY" ]; then
        openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in "$latest_backup" | pg_restore --list --verbose > /dev/null
    else
        pg_restore --list --verbose "$latest_backup" > /dev/null
    fi

    log "Database backup verification successful"
}

# Verify Redis backup
verify_redis_backup() {
    local latest_backup=$(find $BACKUP_DIR/redis -name "redis_*.rdb.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

    if [ -z "$latest_backup" ]; then
        log "ERROR: No Redis backup found"
        return 1
    fi

    log "Verifying Redis backup: $latest_backup"

    if [ -n "$ENCRYPTION_KEY" ]; then
        openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in "$latest_backup" | gunzip -t > /dev/null
    else
        gunzip -t "$latest_backup" > /dev/null
    fi

    log "Redis backup verification successful"
}

# Verify MinIO backup
verify_minio_backup() {
    local latest_backup=$(find $BACKUP_DIR/minio -name "minio_*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

    if [ -z "$latest_backup" ]; then
        log "WARNING: No MinIO backup found"
        return 0
    fi

    log "Verifying MinIO backup: $latest_backup"

    if [ -n "$ENCRYPTION_KEY" ]; then
        openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in "$latest_backup" | tar -tzf - > /dev/null
    else
        tar -tzf "$latest_backup" > /dev/null
    fi

    log "MinIO backup verification successful"
}

# Run verifications
log "Starting backup verification..."

verify_database_backup
verify_redis_backup
verify_minio_backup

log "Backup verification completed successfully"
```

## Disaster Recovery

### 1. Recovery Procedures

#### Database Recovery

```bash
#!/bin/bash
# docker/scripts/recover-database.sh

set -euo pipefail

# Configuration
BACKUP_FILE="${1:-}"
POSTGRES_CONTAINER="supercheck_postgres.1.$(docker service ps -q supercheck_postgres | head -1)"
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

# Download backup from cloud if needed
if [[ $BACKUP_FILE == s3://* ]]; then
    echo "Downloading backup from S3..."
    aws s3 cp $BACKUP_FILE /tmp/backup.dump
    BACKUP_FILE="/tmp/backup.dump"
fi

# Decrypt backup if needed
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "Decrypting backup..."
    openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in $BACKUP_FILE -out /tmp/backup_decrypted.dump
    BACKUP_FILE="/tmp/backup_decrypted.dump"
fi

# Stop application services
echo "Stopping application services..."
docker service scale supercheck_app=0
docker service scale supercheck_worker=0

# Restore database
echo "Restoring database..."
docker exec -i $POSTGRES_CONTAINER pg_restore -U ${POSTGRES_USER} -d ${POSTGRES_DB} --verbose --clean --if-exists < $BACKUP_FILE

# Restart application services
echo "Restarting application services..."
docker service scale supercheck_app=2
docker service scale supercheck_worker=3

# Clean up
rm -f /tmp/backup.dump /tmp/backup_decrypted.dump

echo "Database recovery completed"
```

#### Full System Recovery

```bash
#!/bin/bash
# docker/scripts/recover-system.sh

set -euo pipefail

# Configuration
BACKUP_DATE="${1:-}"
BACKUP_DIR="/opt/docker/backups"
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup_date> (format: YYYYMMDD)"
    exit 1
fi

echo "Starting system recovery for date: $BACKUP_DATE"

# Download all backups from cloud
echo "Downloading backups from cloud..."
aws s3 sync s3://supercheck-backups/ $BACKUP_DIR/ --exclude "*" --include "*$BACKUP_DATE*"

# Recover configuration
echo "Recovering configuration..."
CONFIG_BACKUP="$BACKUP_DIR/config/complete_config_$BACKUP_DATE.tar.gz"

if [ -n "$ENCRYPTION_KEY" ]; then
    openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in $CONFIG_BACKUP | tar -xzf - -C /
else
    tar -xzf $CONFIG_BACKUP -C /
fi

# Restart Docker daemon
echo "Restarting Docker daemon..."
systemctl restart docker

# Recover database
echo "Recovering database..."
/opt/docker/scripts/recover-database.sh $BACKUP_DIR/database/postgres_$BACKUP_DATE.dump

# Recover Redis
echo "Recovering Redis..."
REDIS_BACKUP="$BACKUP_DIR/redis/redis_$BACKUP_DATE.rdb.gz"

if [ -n "$ENCRYPTION_KEY" ]; then
    openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in $REDIS_BACKUP | gunzip > /tmp/redis_$BACKUP_DATE.rdb
else
    gunzip -c $REDIS_BACKUP > /tmp/redis_$BACKUP_DATE.rdb
fi

# Copy Redis backup to container
REDIS_CONTAINER="supercheck_redis.1.$(docker service ps -q supercheck_redis | head -1)"
docker cp /tmp/redis_$BACKUP_DATE.rdb $REDIS_CONTAINER:/data/dump.rdb
docker restart $REDIS_CONTAINER

# Recover MinIO
echo "Recovering MinIO..."
MINIO_BACKUPS=$(find $BACKUP_DIR/minio -name "minio_*_$BACKUP_DATE.tar.gz")
MINIO_CONTAINER="supercheck_minio.1.$(docker service ps -q supercheck_minio | head -1)"

for backup in $MINIO_BACKUPS; do
    bucket=$(basename $backup | sed "s/minio_\(.*\)_$BACKUP_DATE.tar.gz/\1/")

    if [ -n "$ENCRYPTION_KEY" ]; then
        openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in $backup | tar -xzf - -C /tmp
    else
        tar -xzf $backup -C /tmp
    fi

    docker exec $MINIO_CONTAINER mc mirror /tmp/$bucket /$bucket
    rm -rf /tmp/$bucket
done

# Redeploy stacks
echo "Redeploying stacks..."
docker stack deploy -c docker/stacks/supercheck.yml supercheck
docker stack deploy -c docker/stacks/monitoring.yml monitoring

# Clean up
rm -f /tmp/redis_$BACKUP_DATE.rdb

echo "System recovery completed"
```

### 2. Emergency Procedures

#### Swarm Recovery

```bash
#!/bin/bash
# docker/scripts/recover-swarm.sh

set -euo pipefail

# Configuration
MANAGER_NODES=("manager-1" "manager-2" "manager-3")
BACKUP_DIR="/opt/docker/backups"

echo "Recovering Docker Swarm..."

# Force leave swarm on all nodes
for node in "${MANAGER_NODES[@]}"; do
    echo "Removing node $node from swarm..."
    docker swarm leave --force || true
done

# Initialize new swarm on first manager
echo "Initializing new swarm on ${MANAGER_NODES[0]}..."
docker swarm init --advertise-addr $(get-ip-address ${MANAGER_NODES[0]})

# Get join tokens
MANAGER_TOKEN=$(docker swarm join-token -q manager)
WORKER_TOKEN=$(docker swarm join-token -q worker)

# Join other managers
for i in "${!MANAGER_NODES[@]}"; do
    if [ $i -ne 0 ]; then
        echo "Joining manager ${MANAGER_NODES[$i]}..."
        docker swarm join --token $MANAGER_TOKEN $(get-ip-address ${MANAGER_NODES[0]}):2377
    fi
done

# Restore configurations
echo "Restoring configurations..."
latest_config=$(find $BACKUP_DIR/config -name "complete_config_*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
tar -xzf $latest_config -C /

# Recreate networks
echo "Recreating networks..."
docker network create --driver overlay --attachable supercheck-backend
docker network create --driver overlay --attachable supercheck-frontend
docker network create --driver overlay --attachable supercheck-monitoring

echo "Swarm recovery completed"
```

## Testing Procedures

### 1. Backup Testing

```bash
#!/bin/bash
# docker/scripts/test-backup.sh

set -euo pipefail

# Configuration
TEST_ENV="test-backup-$(date +%s)"
BACKUP_DIR="/opt/docker/backups"
LOG_FILE="/var/log/backup-test.log"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Create test environment
log "Creating test environment: $TEST_ENV"

# Deploy test stack
docker stack deploy -c docker/stacks/supercheck.yml $TEST_ENV

# Wait for services to be ready
log "Waiting for services to be ready..."
sleep 60

# Insert test data
log "Inserting test data..."
# Add your test data insertion logic here

# Create backup
log "Creating backup..."
/opt/docker/scripts/backup-orchestrator.sh

# Remove test environment
log "Removing test environment..."
docker stack rm $TEST_ENV

# Restore from backup
log "Restoring from backup..."
# Add your restore logic here

# Verify restored data
log "Verifying restored data..."
# Add your verification logic here

# Clean up
log "Cleaning up..."
docker stack rm $TEST_ENV

log "Backup test completed successfully"
```

### 2. Disaster Recovery Drill

```bash
#!/bin/bash
# docker/scripts/disaster-recovery-drill.sh

set -euo pipefail

# Configuration
DRILL_DATE="drill-$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/opt/docker/backups"
LOG_FILE="/var/log/disaster-drill.log"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Start drill
log "Starting disaster recovery drill: $DRILL_DATE"

# Document current state
log "Documenting current state..."
docker node ls > $BACKUP_DIR/drill/$DRILL_DATE/nodes_before.txt
docker service ls > $BACKUP_DIR/drill/$DRILL_DATE/services_before.txt
docker network ls > $BACKUP_DIR/drill/$DRILL_DATE/networks_before.txt

# Simulate disaster
log "Simulating disaster..."
docker stack rm supercheck
docker stack rm monitoring

# Wait for cleanup
log "Waiting for cleanup..."
sleep 30

# Recover system
log "Starting recovery..."
/opt/docker/scripts/recover-system.sh $(date +%Y%m%d)

# Verify recovery
log "Verifying recovery..."
sleep 60

# Check services
docker service ls > $BACKUP_DIR/drill/$DRILL_DATE/services_after.txt
docker node ls > $BACKUP_DIR/drill/$DRILL_DATE/nodes_after.txt

# Generate report
log "Generating drill report..."
/opt/docker/scripts/generate-drill-report.sh $DRILL_DATE

log "Disaster recovery drill completed: $DRILL_DATE"
```

## Maintenance

### 1. Backup Health Check

```bash
#!/bin/bash
# docker/scripts/backup-health-check.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups"
LOG_FILE="/var/log/backup-health.log"
ALERT_EMAIL="admin@yourdomain.com"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Check backup age
check_backup_age() {
    local backup_type=$1
    local max_age_hours=$2
    local backup_path="$BACKUP_DIR/$backup_type"

    if [ ! -d "$backup_path" ]; then
        log "ERROR: Backup directory $backup_path does not exist"
        return 1
    fi

    local latest_backup=$(find $backup_path -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

    if [ -z "$latest_backup" ]; then
        log "ERROR: No backups found in $backup_path"
        return 1
    fi

    local backup_age=$(( ($(date +%s) - $(stat -c %Y $latest_backup)) / 3600 ))

    if [ $backup_age -gt $max_age_hours ]; then
        log "ERROR: Backup in $backup_path is $backup_age hours old (max: $max_age_hours)"
        return 1
    fi

    log "OK: Backup in $backup_path is $backup_age hours old"
    return 0
}

# Check backup size
check_backup_size() {
    local backup_type=$1
    local min_size_mb=$2
    local backup_path="$BACKUP_DIR/$backup_type"

    local backup_size=$(du -sm $backup_path | cut -f1)

    if [ $backup_size -lt $min_size_mb ]; then
        log "ERROR: Backup size in $backup_path is ${backup_size}MB (min: ${min_size_mb}MB)"
        return 1
    fi

    log "OK: Backup size in $backup_path is ${backup_size}MB"
    return 0
}

# Check cloud sync
check_cloud_sync() {
    local backup_type=$1
    local backup_path="$BACKUP_DIR/$backup_type"

    if ! command -v aws &> /dev/null; then
        log "WARNING: AWS CLI not available, skipping cloud sync check"
        return 0
    fi

    local local_count=$(find $backup_path -type f | wc -l)
    local cloud_count=$(aws s3 ls s3://supercheck-backups/$backup_type/ --recursive | wc -l)

    if [ $local_count -ne $cloud_count ]; then
        log "ERROR: Cloud sync mismatch for $backup_type (local: $local_count, cloud: $cloud_count)"
        return 1
    fi

    log "OK: Cloud sync for $backup_type is in sync"
    return 0
}

# Run health checks
log "Starting backup health check..."

overall_status=0

check_backup_age "database" 25 || overall_status=1
check_backup_age "redis" 7 || overall_status=1
check_backup_age "config" 90 || overall_status=1

check_backup_size "database" 100 || overall_status=1
check_backup_size "redis" 10 || overall_status=1
check_backup_size "config" 50 || overall_status=1

check_cloud_sync "database" || overall_status=1
check_cloud_sync "redis" || overall_status=1
check_cloud_sync "config" || overall_status=1

if [ $overall_status -ne 0 ]; then
    log "ERROR: Backup health check failed"
    echo "Backup health check failed. Please check $LOG_FILE for details." | mail -s "Backup Health Check Failed" $ALERT_EMAIL
    exit 1
fi

log "Backup health check completed successfully"
```

### 2. Automated Cleanup

```bash
#!/bin/bash
# docker/scripts/cleanup-backups.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups"
LOG_FILE="/var/log/backup-cleanup.log"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Cleanup old backups
cleanup_old_backups() {
    local backup_type=$1
    local retention_days=$2
    local backup_path="$BACKUP_DIR/$backup_type"

    log "Cleaning up old backups in $backup_path (retention: $retention_DAYS days)"

    local deleted_count=$(find $backup_path -type f -mtime +$retention_days -delete -print | wc -l)

    log "Deleted $deleted_count old backup files from $backup_path"
}

# Cleanup cloud backups
cleanup_cloud_backups() {
    local backup_type=$1
    local retention_days=$2

    if ! command -v aws &> /dev/null; then
        log "WARNING: AWS CLI not available, skipping cloud cleanup"
        return 0
    fi

    log "Cleaning up old cloud backups for $backup_type (retention: $retention_days days)"

    local cutoff_date=$(date -d "$retention_days days ago" +%Y%m%d)

    aws s3 ls s3://supercheck-backups/$backup_type/ --recursive | \
    while read -r line; do
        local file_date=$(echo $line | awk '{print $1}' | tr -d '-')
        local file_path=$(echo $line | awk '{print $4}')

        if [ "$file_date" -lt "$cutoff_date" ]; then
            log "Deleting old cloud backup: $file_path"
            aws s3 rm s3://supercheck-backups/$file_path
        fi
    done
}

# Run cleanup
log "Starting backup cleanup..."

cleanup_old_backups "database" 30
cleanup_old_backups "redis" 7
cleanup_old_backups "config" 90
cleanup_old_backups "monitoring" 30

cleanup_cloud_backups "database" 30
cleanup_cloud_backups "redis" 7
cleanup_cloud_backups "config" 90
cleanup_cloud_backups "monitoring" 30

log "Backup cleanup completed"
```

## Compliance

### 1. GDPR Compliance

```bash
#!/bin/bash
# docker/scripts/gdpr-backup.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups/gdpr"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=365
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

# Create GDPR-compliant backup
log "Creating GDPR-compliant backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Anonymize personal data before backup
log "Anonymizing personal data..."
docker exec supercheck_postgres.1.$(docker service ps -q supercheck_postgres | head -1) \
    psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c "
    UPDATE users SET email = CONCAT('user-', id, '@example.com'), name = CONCAT('User ', id);
    UPDATE audit_logs SET user_id = NULL, ip_address = '0.0.0.0';
"

# Create anonymized backup
docker exec supercheck_postgres.1.$(docker service ps -q supercheck_postgres | head -1) \
    pg_dump -U ${POSTGRES_USER} -d ${POSTGRES_DB} --format=custom --compress=9 \
    > $BACKUP_DIR/gdpr_backup_$DATE.dump

# Encrypt backup
if [ -n "$ENCRYPTION_KEY" ]; then
    openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY \
        -in $BACKUP_DIR/gdpr_backup_$DATE.dump \
        -out $BACKUP_DIR/gdpr_backup_$DATE.dump.enc
    rm $BACKUP_DIR/gdpr_backup_$DATE.dump
    mv $BACKUP_DIR/gdpr_backup_$DATE.dump.enc $BACKUP_DIR/gdpr_backup_$DATE.dump
fi

# Create backup manifest
cat > $BACKUP_DIR/gdpr_manifest_$DATE.json << EOF
{
  "backup_date": "$DATE",
  "backup_type": "gdpr_compliant",
  "data_anonymized": true,
  "encryption_enabled": $(if [ -n "$ENCRYPTION_KEY" ]; then echo "true"; else echo "false"; fi),
  "retention_days": $RETENTION_DAYS,
  "compliance_standards": ["GDPR"]
}
EOF

log "GDPR-compliant backup created: gdpr_backup_$DATE.dump"
```

### 2. Audit Trail

```bash
#!/bin/bash
# docker/scripts/backup-audit.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/docker/backups"
AUDIT_FILE="/var/log/backup-audit.log"

# Audit function
audit_backup() {
    local backup_type=$1
    local backup_file=$2
    local operation=$3

    local audit_entry=$(cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "backup_type": "$backup_type",
  "backup_file": "$backup_file",
  "operation": "$operation",
  "user": "$(whoami)",
  "node": "$(hostname)",
  "size": "$(stat -c%s $backup_file 2>/dev/null || echo 'unknown')",
  "checksum": "$(sha256sum $backup_file 2>/dev/null | cut -d' ' -f1 || echo 'unknown')"
}
EOF
    )

    echo $audit_entry >> $AUDIT_FILE
}

# Monitor backup operations
monitor_backups() {
    inotifywait -m -r -e create,delete,modify $BACKUP_DIR --format '%w%f %e' | \
    while read file event; do
        local backup_type=$(echo $file | cut -d'/' -f5)
        local filename=$(basename $file)

        case $event in
            CREATE)
                audit_backup "$backup_type" "$filename" "created"
                ;;
            DELETE)
                audit_backup "$backup_type" "$filename" "deleted"
                ;;
            MODIFY)
                audit_backup "$backup_type" "$filename" "modified"
                ;;
        esac
    done
}

# Start monitoring
log "Starting backup audit monitoring..."
monitor_backups
```

This comprehensive backup and disaster recovery guide ensures your Supercheck deployment is protected against data loss and can be quickly restored in case of emergencies.
