# Docker Swarm Networking and Security Best Practices

This guide covers networking and security best practices for deploying Supercheck on Docker Swarm in production environments.

## Table of Contents

1. [Network Architecture](#network-architecture)
2. [Security Hardening](#security-hardening)
3. [Network Segmentation](#network-segmentation)
4. [SSL/TLS Configuration](#ssltls-configuration)
5. [Access Control](#access-control)
6. [Monitoring and Logging](#monitoring-and-logging)
7. [Backup and Recovery](#backup-and-recovery)
8. [Compliance](#compliance)

## Network Architecture

### Recommended Network Design

```
Internet
    |
    v
[Load Balancer/Reverse Proxy]
    |
    v
[Frontend Network] 10.21.0.0/24
    |    |    |
    v    v    v
[Nginx] [App] [Grafana]
    |    |    |
    v    v    v
[Backend Network] 10.20.0.0/24
    |    |    |    |
    v    v    v    v
[App] [Worker] [Postgres] [Redis]
    |    |    |    |
    v    v    v    v
[Storage Network] 10.23.0.0/24
    |    |    |
    v    v    v
[MinIO] [Backups] [Logs]
```

### Network Types

1. **Frontend Network** (10.21.0.0/24)

   - Public-facing services
   - Load balancers and reverse proxies
   - Monitoring dashboards

2. **Backend Network** (10.20.0.0/24)

   - Application services
   - Databases and caches
   - Internal APIs

3. **Storage Network** (10.23.0.0/24)

   - File storage services
   - Backup systems
   - Log aggregation

4. **Monitoring Network** (10.22.0.0/24)
   - Monitoring tools
   - Metrics collection
   - Alerting systems

## Security Hardening

### 1. Host Security

#### System Updates

```bash
# Enable automatic security updates
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Configure automatic updates
cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
EOF
```

#### SSH Security

```bash
# Harden SSH configuration
cat >> /etc/ssh/sshd_config << EOF

# Security enhancements
Protocol 2
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
MaxSessions 10
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers ubuntu
Banner /etc/ssh/banner
EOF

# Create SSH banner
cat > /etc/ssh/banner << EOF
***************************************************************************
                            AUTHORIZED ACCESS ONLY
***************************************************************************
This system is for the use of authorized users only. Individuals using
this computer system without authority, or in excess of their authority,
are subject to having all of their activities on this system monitored
and recorded by system personnel.
***************************************************************************
EOF

systemctl restart sshd
```

#### Firewall Configuration

```bash
# Configure UFW
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 22/tcp

# Docker Swarm ports
ufw allow 2376/tcp  # Docker daemon
ufw allow 2377/tcp  # Docker Swarm cluster management
ufw allow 7946/tcp  # Docker Swarm node discovery
ufw allow 7946/udp  # Docker Swarm node discovery
ufw allow 4789/udp  # Docker Swarm overlay traffic

# Application ports
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS

# Monitoring ports (restrict to management IPs)
ufw allow from 10.0.0.0/16 to any port 9090  # Prometheus
ufw allow from 10.0.0.0/16 to any port 3001  # Grafana

ufw --force enable
```

### 2. Docker Security

#### Docker Daemon Configuration

```json
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "userland-proxy": false,
  "experimental": false,
  "metrics-addr": "127.0.0.1:9323",
  "bridge": "none",
  "ip-forward": true,
  "iptables": true,
  "default-address-pools": [
    {
      "base": "172.30.0.0/16",
      "size": 24
    }
  ],
  "seccomp-profile": "/etc/docker/seccomp/default.json",
  "no-new-privileges": true,
  "selinux-enabled": false,
  "apparmor-profile": "docker-default"
}
```

#### Container Security Best Practices

1. **Use Minimal Images**

   ```yaml
   # Use Alpine-based images
   image: postgres:18-alpine
   image: redis:7-alpine
   ```

2. **Remove Unnecessary Packages**

   ```dockerfile
   RUN apt-get update && apt-get install -y \
       required-package \
       && apt-get clean \
       && rm -rf /var/lib/apt/lists/*
   ```

3. **Run as Non-Root User**

   ```dockerfile
   RUN groupadd -r appuser && useradd -r -g appuser appuser
   USER appuser
   ```

4. **Read-Only Filesystem**

   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
         cpus: "1.0"
     placement:
       constraints:
         - node.labels.app == true
     restart_policy:
       condition: on-failure
     read_only: true
     tmpfs:
       - /tmp
       - /var/tmp
   ```

5. **Resource Limits**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
         cpus: "1.0"
         pids: 100
       reservations:
         memory: 1G
         cpus: "0.5"
   ```

### 3. Network Security

#### Overlay Network Encryption

```bash
# Create encrypted overlay networks
docker network create \
  --driver overlay \
  --attachable \
  --subnet 10.20.0.0/24 \
  --opt encrypted \
  supercheck-backend
```

#### Network Isolation

```yaml
# Service-specific networks
networks:
  supercheck-backend:
    driver: overlay
    attachable: true
    internal: true # No external access
    ipam:
      driver: default
      config:
        - subnet: 10.20.0.0/24
```

#### Network Policies

```yaml
# Limit service exposure
deploy:
  labels:
    - "traefik.enable=false"
    - "traefik.docker.network=supercheck-frontend"
```

## Network Segmentation

### 1. VLAN Configuration

```bash
# Create VLAN interfaces
ip link add link eth0 name eth0.10 type vlan id 10
ip link set dev eth0.10 up
ip addr add 10.10.0.1/24 dev eth0.10

# Configure routing
ip route add 10.20.0.0/24 via 10.10.0.254 dev eth0.10
```

### 2. Service Segmentation

#### Database Network

```yaml
services:
  postgres:
    networks:
      - supercheck-backend
    deploy:
      placement:
        constraints:
          - node.labels.database == true
```

#### Application Network

```yaml
services:
  app:
    networks:
      - supercheck-backend
      - supercheck-frontend
    deploy:
      placement:
        constraints:
          - node.labels.app == true
```

#### Storage Network

```yaml
services:
  minio:
    networks:
      - supercheck-backend
      - supercheck-storage
    deploy:
      placement:
        constraints:
          - node.labels.storage == true
```

## SSL/TLS Configuration

### 1. Let's Encrypt Integration

```bash
# Install Certbot
apt install certbot python3-certbot-nginx

# Generate SSL certificate
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Setup auto-renewal
echo "0 4 * * * /usr/bin/certbot renew --quiet" | crontab -
```

### 2. Nginx SSL Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';" always;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Docker Secrets for SSL

```bash
# Create SSL secrets
docker secret create ssl-cert.pem /path/to/cert.pem
docker secret create ssl-key.pem /path/to/key.pem

# Use secrets in service
services:
  nginx:
    secrets:
      - ssl-cert.pem
      - ssl-key.pem
    configs:
      - source: nginx_config
        target: /etc/nginx/nginx.conf
```

## Access Control

### 1. Role-Based Access Control (RBAC)

```yaml
# Define user roles
x-roles: &roles
  admin:
    - supercheck.admin
    - supercheck.read
    - supercheck.write
  developer:
    - supercheck.read
    - supercheck.write
  viewer:
    - supercheck.read

# Apply roles to services
services:
  app:
    deploy:
      labels:
        - "supercheck.role=admin"
```

### 2. API Key Management

```bash
# Generate API keys
openssl rand -hex 32 > api_key.txt

# Create Docker secret
docker secret create api-key api_key.txt

# Use in service
services:
  app:
    environment:
      API_KEY_FILE: /run/secrets/api-key
    secrets:
      - api-key
```

### 3. Network Access Control

```bash
# Create network ACLs
iptables -A INPUT -p tcp --dport 5432 -s 10.20.0.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 5432 -j DROP

iptables -A INPUT -p tcp --dport 6379 -s 10.20.0.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 6379 -j DROP
```

## Monitoring and Logging

### 1. Security Monitoring

```yaml
# Falco for security monitoring
services:
  falco:
    image: falcosecurity/falco:latest
    privileged: true
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - /dev:/host/dev
      - /proc:/host/proc:ro
      - /boot:/host/boot:ro
      - /lib/modules:/host/lib/modules:ro
      - /usr:/host/usr:ro
      - /etc:/host/etc:ro
      - ./configs/falco/falco_rules.local.yaml:/etc/falco/falco_rules.local.yaml
    networks:
      - supercheck-monitoring
```

### 2. Log Aggregation

```yaml
# ELK Stack for log analysis
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=true
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    networks:
      - supercheck-monitoring

  logstash:
    image: docker.elastic.co/logstash/logstash:8.5.0
    volumes:
      - ./configs/logstash/pipeline:/usr/share/logstash/pipeline
    networks:
      - supercheck-monitoring
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.5.0
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
      - ELASTICSEARCH_PASSWORD=${ELASTIC_PASSWORD}
    ports:
      - "5601:5601"
    networks:
      - supercheck-monitoring
    depends_on:
      - elasticsearch
```

### 3. Audit Logging

```bash
# Enable Docker audit logging
cat > /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  },
  "audit": "true"
}
EOF

# Configure auditd
apt install auditd
cat > /etc/audit/rules.d/docker.rules << EOF
-w /usr/bin/docker -p x -k docker
-w /var/lib/docker -p wa -k docker
-w /etc/docker -p wa -k docker
-w /usr/lib/systemd/system/docker.service -p wa -k docker
EOF

systemctl restart auditd
```

## Backup and Recovery

### 1. Encrypted Backups

```bash
#!/bin/bash
# Backup script with encryption

BACKUP_DIR="/opt/docker/backups"
DATE=$(date +%Y%m%d_%H%M%S)
ENCRYPTION_KEY="your_encryption_key_here"

# Create backup
tar -czf - /opt/docker/data | \
  openssl enc -aes-256-cbc -salt -k $ENCRYPTION_KEY -out $BACKUP_DIR/backup_$DATE.tar.gz.enc

# Upload to S3
aws s3 cp $BACKUP_DIR/backup_$DATE.tar.gz.enc s3://supercheck-backups/

# Clean up old backups
find $BACKUP_DIR -name "backup_*.tar.gz.enc" -mtime +7 -delete
```

### 2. Disaster Recovery

```bash
#!/bin/bash
# Disaster recovery script

# Restore from backup
aws s3 cp s3://supercheck-backups/backup_latest.tar.gz.enc /tmp/backup.tar.gz.enc

# Decrypt backup
openssl enc -aes-256-cbc -d -k $ENCRYPTION_KEY -in /tmp/backup.tar.gz.enc -out /tmp/backup.tar.gz

# Extract backup
tar -xzf /tmp/backup.tar.gz -C /

# Restart services
docker stack deploy -c docker/stacks/supercheck.yml supercheck
docker stack deploy -c docker/stacks/monitoring.yml monitoring
```

## Compliance

### 1. GDPR Compliance

```yaml
# Data privacy configuration
services:
  app:
    environment:
      - GDPR_COMPLIANCE=true
      - DATA_RETENTION_DAYS=365
      - ANONYMIZATION_ENABLED=true
      - CONSENT_MANAGEMENT=true
```

### 2. SOC 2 Compliance

```bash
# Enable comprehensive logging
cat > /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  },
  "audit": "true",
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF
```

### 3. ISO 27001 Compliance

```yaml
# Security controls
services:
  app:
    deploy:
      labels:
        - "security.classification=confidential"
        - "data.classification=sensitive"
        - "access.control=rbac"
        - "audit.enabled=true"
```

## Security Checklist

### Pre-Deployment

- [ ] Update all system packages
- [ ] Configure firewall rules
- [ ] Harden SSH configuration
- [ ] Enable fail2ban
- [ ] Configure automatic security updates
- [ ] Set up SSL/TLS certificates
- [ ] Configure network segmentation
- [ ] Enable Docker security features
- [ ] Set up monitoring and alerting
- [ ] Configure backup and recovery

### Post-Deployment

- [ ] Verify SSL certificate installation
- [ ] Test firewall rules
- [ ] Validate network isolation
- [ ] Check container security settings
- [ ] Verify monitoring alerts
- [ ] Test backup and recovery procedures
- [ ] Conduct security audit
- [ ] Review access controls
- [ ] Validate compliance requirements
- [ ] Document security configuration

### Ongoing Maintenance

- [ ] Regularly update system packages
- [ ] Monitor security advisories
- [ ] Review and rotate secrets
- [ ] Audit user access
- [ ] Update firewall rules as needed
- [ ] Test backup recovery procedures
- [ ] Review and update security policies
- [ ] Conduct regular security assessments
- [ ] Monitor system logs for anomalies
- [ ] Update documentation

## Incident Response

### 1. Security Incident Response Plan

1. **Detection**

   - Monitor alerts from security tools
   - Review system logs
   - Check for unusual activity

2. **Containment**

   - Isolate affected systems
   - Block malicious IPs
   - Disable compromised accounts

3. **Eradication**

   - Remove malware
   - Patch vulnerabilities
   - Update security configurations

4. **Recovery**

   - Restore from clean backups
   - Verify system integrity
   - Monitor for recurrence

5. **Lessons Learned**
   - Document incident
   - Update procedures
   - Conduct post-mortem

### 2. Emergency Contacts

- Security Team: security@yourdomain.com
- System Administrator: admin@yourdomain.com
- Management: management@yourdomain.com

### 3. Escalation Procedures

1. **Level 1**: System alerts (within 1 hour)
2. **Level 2**: Security incidents (within 30 minutes)
3. **Level 3**: Critical incidents (immediate)

This guide provides a comprehensive framework for securing your Docker Swarm deployment. Regularly review and update these practices to maintain a secure and compliant environment.
