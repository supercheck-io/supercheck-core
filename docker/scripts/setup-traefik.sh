#!/bin/bash

# Traefik Setup Script for Docker Swarm
# This script sets up Traefik reverse proxy with SSL certificates

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

# Check if environment file exists
if [ ! -f "configs/.env.production" ]; then
    error "Environment file configs/.env.production not found. Please create it from configs/.env.production.example"
fi

# Load environment variables
source configs/.env.production

# Check required variables
required_vars=("DOMAIN" "LETSENCRYPT_EMAIL")
for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        error "Required environment variable $var is not set"
    fi
done

# Create necessary directories
log "Creating Traefik directories..."
mkdir -p /opt/docker/data/traefik/acme
mkdir -p /opt/docker/logs/traefik
mkdir -p /opt/docker/configs/traefik/dynamic

# Set proper permissions
chmod 600 /opt/docker/data/traefik/acme
chown -R root:root /opt/docker/data/traefik
chown -R root:root /opt/docker/configs/traefik

# Create ACME JSON file if it doesn't exist
if [ ! -f "/opt/docker/data/traefik/acme/acme.json" ]; then
    log "Creating ACME JSON file..."
    echo '{}' > /opt/docker/data/traefik/acme/acme.json
    chmod 600 /opt/docker/data/traefik/acme/acme.json
fi

# Generate basic auth hash if not provided
if [ -z "${TRAEFIK_BASIC_AUTH:-}" ] || [ "$TRAEFIK_BASIC_AUTH" = "admin:\$apr1\$hash" ]; then
    log "Generating basic auth hash..."
    if command -v htpasswd &> /dev/null; then
        read -s -p "Enter Traefik dashboard password: " password
        echo
        hash=$(htpasswd -nb admin "$password")
        sed -i "s/TRAEFIK_BASIC_AUTH=.*/TRAEFIK_BASIC_AUTH=$hash/" configs/.env.production
        log "Basic auth hash generated and saved to environment file"
    else
        warning "htpasswd not found. Please install apache2-utils or set TRAEFIK_BASIC_AUTH manually"
    fi
fi

# Update Traefik configuration with domain
log "Updating Traefik configuration..."
sed -i "s/yourdomain.com/$DOMAIN/g" configs/traefik/traefik.yml
sed -i "s/admin@yourdomain.com/$LETSENCRYPT_EMAIL/g" configs/traefik/traefik.yml
sed -i "s/yourdomain.com/$DOMAIN/g" configs/traefik/dynamic/middlewares.yml

# Create logrotate configuration for Traefik
log "Setting up log rotation..."
cat > /etc/logrotate.d/traefik << EOF
/opt/docker/logs/traefik/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker kill -s USR1 \$(docker ps -q -f name=traefik) || true
    endscript
}
EOF

# Create systemd service for Traefik (optional, for standalone mode)
cat > /etc/systemd/system/traefik.service << EOF
[Unit]
Description=Traefik
Documentation=https://docs.traefik.io
After=docker.service
Requires=docker.service

[Service]
Type=notify
ExecStart=/usr/bin/docker stack deploy -c /opt/docker/stacks/supercheck.yml supercheck
TimeoutStopSec=30
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# Create Traefik health check script
cat > /usr/local/bin/traefik-health-check.sh << 'EOF'
#!/bin/bash

# Traefik health check script
set -euo pipefail

# Check if Traefik is responding
if ! curl -f http://localhost:8080/ping > /dev/null 2>&1; then
    echo "ERROR: Traefik is not responding"
    exit 1
fi

# Check SSL certificate
if [ -n "${DOMAIN:-}" ]; then
    if ! echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null | openssl x509 -noout -dates | grep -q "notAfter"; then
        echo "WARNING: SSL certificate check failed for $DOMAIN"
    fi
fi

# Check ACME file
if [ ! -f "/opt/docker/data/traefik/acme/acme.json" ]; then
    echo "ERROR: ACME file not found"
    exit 1
fi

echo "Traefik health check passed"
EOF

chmod +x /usr/local/bin/traefik-health-check.sh

# Add health check to cron
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/traefik-health-check.sh >> /var/log/traefik-health-check.log 2>&1") | crontab -

# Create Traefik log monitoring script
cat > /usr/local/bin/traefik-log-monitor.sh << 'EOF'
#!/bin/bash

# Traefik log monitoring script
set -euo pipefail

LOG_FILE="/opt/docker/logs/traefik/access.log"
ALERT_THRESHOLD=100
ALERT_EMAIL="${ALERT_EMAIL:-admin@yourdomain.com}"

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
    echo "ERROR: Traefik access log not found"
    exit 1
fi

# Count errors in last hour
error_count=$(tail -n 1000 "$LOG_FILE" | grep '"StatusCode":"5"' | wc -l)

if [ "$error_count" -gt "$ALERT_THRESHOLD" ]; then
    echo "High error rate detected: $error_count errors in last hour" | \
    mail -s "Traefik Alert: High Error Rate" "$ALERT_EMAIL"
fi

# Check for SSL certificate errors
ssl_errors=$(tail -n 1000 "$LOG_FILE" | grep -i "ssl\|certificate" | grep -i "error" | wc -l)

if [ "$ssl_errors" -gt 0 ]; then
    echo "SSL certificate errors detected: $ssl_errors errors" | \
    mail -s "Traefik Alert: SSL Certificate Issues" "$ALERT_EMAIL"
fi
EOF

chmod +x /usr/local/bin/traefik-log-monitor.sh

# Add log monitoring to cron
(crontab -l 2>/dev/null; echo "*/10 * * * * /usr/local/bin/traefik-log-monitor.sh >> /var/log/traefik-log-monitor.log 2>&1") | crontab -

# Create backup script for Traefik
cat > /usr/local/bin/backup-traefik.sh << 'EOF'
#!/bin/bash

# Traefik backup script
set -euo pipefail

BACKUP_DIR="/opt/docker/backups/traefik"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup ACME certificates
tar -czf $BACKUP_DIR/acme_$DATE.tar.gz /opt/docker/data/traefik/acme/

# Backup configuration
tar -czf $BACKUP_DIR/config_$DATE.tar.gz /opt/docker/configs/traefik/

# Backup logs (last 7 days)
find /opt/docker/logs/traefik -name "*.log" -mtime -7 -print0 | \
    tar -czf $BACKUP_DIR/logs_$DATE.tar.gz --null -T -

# Clean up old backups (keep 30 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Traefik backup completed: $DATE"
EOF

chmod +x /usr/local/bin/backup-traefik.sh

# Add backup to cron
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-traefik.sh >> /var/log/traefik-backup.log 2>&1") | crontab -

# Open firewall ports for Traefik
log "Configuring firewall..."
ufw allow 80/tcp comment "Traefik HTTP"
ufw allow 443/tcp comment "Traefik HTTPS"
ufw allow 8080/tcp comment "Traefik Dashboard"

# Display setup information
log "Traefik setup completed successfully!"
echo ""
echo "=== Traefik Information ==="
echo "Dashboard URL: http://traefik.$DOMAIN:8080"
echo "Main Application URL: https://$DOMAIN"
echo "Grafana URL: https://grafana.$DOMAIN"
echo "Prometheus URL: https://monitoring.$DOMAIN"
echo ""
echo "=== Important Files ==="
echo "Configuration: /opt/docker/configs/traefik/"
echo "ACME Certificates: /opt/docker/data/traefik/acme/"
echo "Logs: /opt/docker/logs/traefik/"
echo ""
echo "=== Next Steps ==="
echo "1. Deploy the stack: docker stack deploy -c stacks/supercheck.yml supercheck"
echo "2. Verify dashboard access: http://traefik.$DOMAIN:8080"
echo "3. Check SSL certificates: https://$DOMAIN"
echo "4. Monitor logs: tail -f /opt/docker/logs/traefik/access.log"
echo ""
echo "=== Health Check ==="
echo "Run health check: /usr/local/bin/traefik-health-check.sh"
echo "Monitor logs: /usr/local/bin/traefik-log-monitor.sh"
echo "Backup data: /usr/local/bin/backup-traefik.sh"