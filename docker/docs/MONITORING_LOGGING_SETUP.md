# Monitoring and Logging Setup Guide

This guide provides comprehensive instructions for setting up monitoring, logging, and alerting for Supercheck on Docker Swarm.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Monitoring Stack Setup](#monitoring-stack-setup)
5. [Logging Stack Setup](#logging-stack-setup)
6. [Alerting Configuration](#alerting-configuration)
7. [Dashboard Creation](#dashboard-creation)
8. [Maintenance](#maintenance)
9. [Troubleshooting](#troubleshooting)

## Overview

The monitoring and logging stack consists of:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **AlertManager**: Alert management and routing
- **Loki**: Log aggregation
- **Promtail**: Log collection
- **Node Exporter**: System metrics
- **cAdvisor**: Container metrics
- **Custom Exporters**: Application-specific metrics

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Prometheus    │    │     Grafana     │    │  AlertManager   │
│   (Metrics)     │    │  (Dashboards)   │    │   (Alerts)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Loki        │    │   Node Exporter │    │    cAdvisor     │
│   (Logs)        │    │  (System Metrics)│    │(Container Metrics)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Promtail     │    │ Redis Exporter  │    │Postgres Exporter│
│ (Log Collection)│    │ (Redis Metrics) │    │(DB Metrics)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

### Required Services

- Docker Swarm cluster initialized
- Overlay networks created
- Sufficient storage for metrics and logs
- Proper network connectivity

### Resource Requirements

| Service      | CPU  | Memory | Storage |
| ------------ | ---- | ------ | ------- |
| Prometheus   | 1.0  | 2GB    | 50GB    |
| Grafana      | 0.5  | 1GB    | 10GB    |
| Loki         | 0.5  | 1GB    | 30GB    |
| AlertManager | 0.25 | 512MB  | 5GB     |

## Monitoring Stack Setup

### 1. Deploy Monitoring Stack

```bash
# Deploy monitoring stack
docker stack deploy -c docker/stacks/monitoring.yml monitoring

# Verify deployment
docker stack services monitoring
docker stack ps monitoring
```

### 2. Configure Prometheus

Create Prometheus configuration:

```yaml
# docker/configs/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: "supercheck"
    region: "eu-central"

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

scrape_configs:
  # Prometheus itself
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]
    scrape_interval: 30s
    metrics_path: /metrics

  # Docker Swarm nodes
  - job_name: "docker-swarm-nodes"
    static_configs:
      - targets: ["node-exporter:9100"]
    scrape_interval: 30s
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: "swarm-node"

  # Docker Swarm services
  - job_name: "docker-swarm-services"
    dockerswarm_sd_configs:
      - host: unix:///var/run/docker.sock
        role: services
        refresh_interval: 30s
    relabel_configs:
      - source_labels: [__meta_dockerswarm_service_name]
        target_label: service
      - source_labels: [__meta_dockerswarm_node_hostname]
        target_label: node

  # Docker Swarm tasks
  - job_name: "docker-swarm-tasks"
    dockerswarm_sd_configs:
      - host: unix:///var/run/docker.sock
        role: tasks
        refresh_interval: 30s
    relabel_configs:
      - source_labels: [__meta_dockerswarm_task_name]
        target_label: task
      - source_labels: [__meta_dockerswarm_service_name]
        target_label: service

  # Container metrics
  - job_name: "cadvisor"
    static_configs:
      - targets: ["cadvisor:8080"]
    scrape_interval: 30s
    metrics_path: /metrics

  # Redis metrics
  - job_name: "redis"
    static_configs:
      - targets: ["redis-exporter:9121"]
    scrape_interval: 30s

  # PostgreSQL metrics
  - job_name: "postgres"
    static_configs:
      - targets: ["postgres-exporter:9187"]
    scrape_interval: 30s

  # Supercheck App metrics
  - job_name: "supercheck-app"
    static_configs:
      - targets: ["app:3000"]
    scrape_interval: 30s
    metrics_path: /api/metrics
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: "supercheck-app"

  # Supercheck Worker metrics
  - job_name: "supercheck-worker"
    static_configs:
      - targets: ["worker:3001"]
    scrape_interval: 30s
    metrics_path: /metrics
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: "supercheck-worker"

  # MinIO metrics
  - job_name: "minio"
    static_configs:
      - targets: ["minio:9000"]
    scrape_interval: 30s
    metrics_path: /minio/v2/metrics/cluster
    basic_auth:
      username: ${MINIO_ROOT_USER}
      password: ${MINIO_ROOT_PASSWORD}
```

### 3. Configure Alert Rules

```yaml
# docker/configs/prometheus/alert_rules.yml
groups:
  - name: swarm_alerts
    rules:
      # Node down alerts
      - alert: NodeDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
          service: swarm
        annotations:
          summary: "Node {{ $labels.instance }} is down"
          description: "Node {{ $labels.instance }} has been down for more than 1 minute."

      # High memory usage
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
        for: 5m
        labels:
          severity: warning
          service: system
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value }}% on {{ $labels.instance }}."

      # High CPU usage
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
          service: system
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is {{ $value }}% on {{ $labels.instance }}."

      # Disk space usage
      - alert: DiskSpaceUsage
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 15
        for: 5m
        labels:
          severity: warning
          service: system
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Disk space is {{ $value }}% available on {{ $labels.instance }}."

  - name: docker_alerts
    rules:
      # Container down
      - alert: ContainerDown
        expr: time() - container_last_seen > 300
        for: 1m
        labels:
          severity: critical
          service: docker
        annotations:
          summary: "Container {{ $labels.name }} is down"
          description: "Container {{ $labels.name }} has been down for more than 5 minutes."

      # Container restarts
      - alert: ContainerRestarts
        expr: increase(container_start_time_seconds[1h]) > 3
        for: 0m
        labels:
          severity: warning
          service: docker
        annotations:
          summary: "Container {{ $labels.name }} is restarting frequently"
          description: "Container {{ $labels.name }} has restarted {{ $value }} times in the last hour."

  - name: application_alerts
    rules:
      # Application down
      - alert: ApplicationDown
        expr: up{job=~"supercheck-.*"} == 0
        for: 1m
        labels:
          severity: critical
          service: application
        annotations:
          summary: "Application {{ $labels.job }} is down"
          description: "Application {{ $labels.job }} has been down for more than 1 minute."

      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100 > 5
        for: 5m
        labels:
          severity: warning
          service: application
        annotations:
          summary: "High error rate in {{ $labels.job }}"
          description: "Error rate is {{ $value }}% in {{ $labels.job }}."

      # High response time
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
          service: application
        annotations:
          summary: "High response time in {{ $labels.job }}"
          description: "95th percentile response time is {{ $value }}s in {{ $labels.job }}."

  - name: database_alerts
    rules:
      # PostgreSQL down
      - alert: PostgreSQLDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
          service: database
        annotations:
          summary: "PostgreSQL is down"
          description: "PostgreSQL database has been down for more than 1 minute."

      # High database connections
      - alert: HighDatabaseConnections
        expr: pg_stat_database_numbackends / pg_settings_max_connections * 100 > 80
        for: 5m
        labels:
          severity: warning
          service: database
        annotations:
          summary: "High database connections"
          description: "Database connection usage is {{ $value }}%."

      # Redis down
      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
          service: database
        annotations:
          summary: "Redis is down"
          description: "Redis cache has been down for more than 1 minute."

      # High Redis memory usage
      - alert: HighRedisMemoryUsage
        expr: redis_memory_used_bytes / redis_memory_max_bytes * 100 > 85
        for: 5m
        labels:
          severity: warning
          service: database
        annotations:
          summary: "High Redis memory usage"
          description: "Redis memory usage is {{ $value }}%."
```

### 4. Configure AlertManager

```yaml
# docker/configs/alertmanager/alertmanager.yml
global:
  smtp_smarthost: "${SMTP_HOST}:${SMTP_PORT}"
  smtp_from: "${SMTP_FROM}"
  smtp_auth_username: "${SMTP_USER}"
  smtp_auth_password: "${SMTP_PASSWORD}"

route:
  group_by: ["alertname", "cluster", "service"]
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: "default"
  routes:
    - match:
        severity: critical
      receiver: "critical-alerts"
    - match:
        severity: warning
      receiver: "warning-alerts"

receivers:
  - name: "default"
    email_configs:
      - to: "admin@yourdomain.com"
        subject: "[Supercheck] {{ .GroupLabels.alertname }}"
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Labels: {{ range .Labels.SortedPairs }}{{ .Name }}={{ .Value }} {{ end }}
          {{ end }}

  - name: "critical-alerts"
    email_configs:
      - to: "admin@yourdomain.com,ops@yourdomain.com"
        subject: "[CRITICAL] Supercheck Alert: {{ .GroupLabels.alertname }}"
        body: |
          CRITICAL ALERT DETECTED

          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Severity: {{ .Labels.severity }}
          Service: {{ .Labels.service }}
          Instance: {{ .Labels.instance }}
          Time: {{ .StartsAt }}
          {{ end }}

          Immediate action required!
    slack_configs:
      - api_url: "${SLACK_WEBHOOK_URL}"
        channel: "#alerts"
        title: "Critical Alert: {{ .GroupLabels.alertname }}"
        text: |
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Service:* {{ .Labels.service }}
          *Instance:* {{ .Labels.instance }}
          {{ end }}

  - name: "warning-alerts"
    email_configs:
      - to: "ops@yourdomain.com"
        subject: "[WARNING] Supercheck Alert: {{ .GroupLabels.alertname }}"
        body: |
          Warning alert detected

          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Service: {{ .Labels.service }}
          Instance: {{ .Labels.instance }}
          Time: {{ .StartsAt }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: "critical"
    target_match:
      severity: "warning"
    equal: ["alertname", "cluster", "service"]
```

## Logging Stack Setup

### 1. Configure Loki

```yaml
# docker/configs/loki/local-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s
  max_transfer_retries: 0

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 16
  ingestion_burst_size_mb: 32

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
```

### 2. Configure Promtail

```yaml
# docker/configs/promtail/config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Docker container logs
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        port: 80
    relabel_configs:
      - source_labels: [__meta_docker_container_name]
        target_label: container
      - source_labels: [__meta_docker_container_log_stream]
        target_label: stream
      - source_labels:
          [__meta_docker_container_label_com_docker_compose_service]
        target_label: service
      - source_labels:
          [__meta_docker_container_label_com_docker_swarm_service_name]
        target_label: swarm_service
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            timestamp: time
      - timestamp:
          source: timestamp
          format: RFC3339
      - labels:
          level:
          service:
          container:
          swarm_service:

  # System logs
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: syslog
          __path__: /var/log/syslog
    pipeline_stages:
      - regex:
          expression: '^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+)\s+(?P<hostname>\w+)\s+(?P<service>[^[]+)\[(?P<pid>\d+)\]:\s*(?P<message>.*)'
      - timestamp:
          source: timestamp
          format: Jan 02 15:04:05
      - labels:
          hostname:
          service:
          pid:

  # Nginx logs
  - job_name: nginx
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          __path__: /var/log/nginx/*.log
    pipeline_stages:
      - regex:
          expression: '^(?P<remote_addr>\S+)\s+-\s+(?P<remote_user>\S+)\s+\[(?P<time_local>[^\]]+)\]\s+"(?P<method>\S+)\s+(?P<path>\S+)\s+(?P<protocol>\S+)"\s+(?P<status>\d+)\s+(?P<body_bytes_sent>\d+)\s+"(?P<http_referer>[^"]*)"\s+"(?P<http_user_agent>[^"]*)".*'
      - timestamp:
          source: time_local
          format: 02/Jan/2006:15:04:05 -0700
      - labels:
          remote_addr:
          method:
          status:
          path:
          protocol:
```

## Dashboard Creation

### 1. System Overview Dashboard

```json
{
  "dashboard": {
    "title": "System Overview",
    "panels": [
      {
        "title": "Node Status",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=\"docker-swarm-nodes\"}",
            "legendFormat": "{{instance}}"
          }
        ]
      },
      {
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "100 - (avg by(instance) (irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "{{instance}}"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100",
            "legendFormat": "{{instance}}"
          }
        ]
      },
      {
        "title": "Disk Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "(node_filesystem_size_bytes - node_filesystem_avail_bytes) / node_filesystem_size_bytes * 100",
            "legendFormat": "{{instance}}:{{mountpoint}}"
          }
        ]
      }
    ]
  }
}
```

### 2. Application Dashboard

```json
{
  "dashboard": {
    "title": "Supercheck Application",
    "panels": [
      {
        "title": "Service Status",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=~\"supercheck-.*\"}",
            "legendFormat": "{{job}}"
          }
        ]
      },
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "50th percentile"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m]) * 100",
            "legendFormat": "Error Rate %"
          }
        ]
      }
    ]
  }
}
```

### 3. Database Dashboard

```json
{
  "dashboard": {
    "title": "Database Performance",
    "panels": [
      {
        "title": "PostgreSQL Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends",
            "legendFormat": "{{datname}}"
          }
        ]
      },
      {
        "title": "PostgreSQL Query Duration",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(pg_stat_statements_mean_time_seconds[5m])",
            "legendFormat": "{{query}}"
          }
        ]
      },
      {
        "title": "Redis Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "redis_memory_used_bytes",
            "legendFormat": "Used Memory"
          },
          {
            "expr": "redis_memory_max_bytes",
            "legendFormat": "Max Memory"
          }
        ]
      },
      {
        "title": "Redis Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "redis_connected_clients",
            "legendFormat": "Connected Clients"
          }
        ]
      }
    ]
  }
}
```

## Maintenance

### 1. Log Rotation

```bash
#!/bin/bash
# docker/scripts/log-rotation.sh

# Rotate Prometheus logs
find /opt/docker/data/prometheus -name "wal" -mtime +7 -exec rm -rf {} \;

# Rotate Loki logs
find /opt/docker/data/loki -name "*.log" -mtime +7 -delete

# Rotate Grafana logs
find /opt/docker/data/grafana/logs -name "*.log" -mtime +7 -delete

# Compress old logs
find /var/log -name "*.log" -mtime +1 -exec gzip {} \;
find /var/log -name "*.log.gz" -mtime +30 -delete
```

### 2. Backup Configuration

```bash
#!/bin/bash
# docker/scripts/backup-monitoring.sh

BACKUP_DIR="/opt/docker/backups/monitoring"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup Prometheus data
tar -czf $BACKUP_DIR/prometheus_$DATE.tar.gz /opt/docker/data/prometheus

# Backup Grafana data
tar -czf $BACKUP_DIR/grafana_$DATE.tar.gz /opt/docker/data/grafana

# Backup Loki data
tar -czf $BACKUP_DIR/loki_$DATE.tar.gz /opt/docker/data/loki

# Backup configurations
tar -czf $BACKUP_DIR/configs_$DATE.tar.gz docker/configs/

# Clean up old backups (keep 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Monitoring backup completed: $DATE"
```

### 3. Health Checks

```bash
#!/bin/bash
# docker/scripts/monitoring-health-check.sh

# Check Prometheus
curl -f http://localhost:9090/-/healthy || echo "Prometheus is unhealthy"

# Check Grafana
curl -f http://localhost:3001/api/health || echo "Grafana is unhealthy"

# Check Loki
curl -f http://localhost:3100/ready || echo "Loki is unhealthy"

# Check AlertManager
curl -f http://localhost:9093/-/healthy || echo "AlertManager is unhealthy"

# Check exporters
curl -f http://localhost:9100/metrics || echo "Node Exporter is unhealthy"
curl -f http://localhost:8080/metrics || echo "cAdvisor is unhealthy"
curl -f http://localhost:9121/metrics || echo "Redis Exporter is unhealthy"
curl -f http://localhost:9187/metrics || echo "Postgres Exporter is unhealthy"
```

## Troubleshooting

### Common Issues

1. **Prometheus not scraping targets**

   ```bash
   # Check Prometheus configuration
   docker exec -it $(docker ps -q -f name=prometheus) promtool check config /etc/prometheus/prometheus.yml

   # Check target status
   curl http://localhost:9090/api/v1/targets
   ```

2. **Grafana not connecting to Prometheus**

   ```bash
   # Check Grafana logs
   docker logs $(docker ps -q -f name=grafana)

   # Test Prometheus connection
   curl -u admin:password http://localhost:3001/api/datasources/proxy/1/api/v1/query?query=up
   ```

3. **Loki not receiving logs**

   ```bash
   # Check Promtail logs
   docker logs $(docker ps -q -f name=promtail)

   # Check Loki logs
   docker logs $(docker ps -q -f name=loki)

   # Test Loki API
   curl http://localhost:3100/loki/api/v1/labels
   ```

4. **AlertManager not sending alerts**

   ```bash
   # Check AlertManager configuration
   docker exec -it $(docker ps -q -f name=alertmanager) amtool config routes test

   # Check AlertManager logs
   docker logs $(docker ps -q -f name=alertmanager)
   ```

### Performance Tuning

1. **Prometheus Optimization**

   ```yaml
   # Increase retention period
   --storage.tsdb.retention.time=30d

   # Optimize scrape intervals
   scrape_interval: 30s
   evaluation_interval: 30s
   ```

2. **Loki Optimization**

   ```yaml
   # Increase ingestion rate
   ingestion_rate_mb: 32
   ingestion_burst_size_mb: 64

   # Optimize chunk settings
   chunk_idle_period: 30m
   max_chunk_age: 1h
   ```

3. **Grafana Optimization**
   ```yaml
   # Enable caching
   GF_SECURITY_ALLOW_EMBEDDING=true
   GF_USERS_ALLOW_SIGN_UP=false
   GF_AUTH_ANONYMOUS_ENABLED=false
   ```

This comprehensive monitoring and logging setup provides complete visibility into your Supercheck deployment, enabling proactive issue detection and rapid troubleshooting.
