#!/bin/bash

# Setup monitoring stack for Supercheck Docker Swarm
# This script creates configurations and deploys the monitoring stack

set -e

echo "🔧 Setting up monitoring for Supercheck Docker Swarm"

# Create config directories
mkdir -p configs/{prometheus,grafana,alertmanager}

# Create Prometheus configuration
cat > configs/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  external_labels:
    monitor: 'supercheck-monitor'

rule_files:
  - "supercheck_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter for host metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '(.+):.*'
        replacement: '${1}'

  # cAdvisor for container metrics
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '(.+):.*'
        replacement: '${1}'

  # Supercheck App metrics (if enabled)
  - job_name: 'supercheck-app'
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        port: 3000
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_swarm_service_name]
        regex: 'supercheck_supercheck-app'
        action: keep
      - source_labels: [__meta_docker_container_label_com_docker_swarm_node_id]
        target_label: node_id
      - source_labels: [__meta_docker_container_id]
        target_label: container_id

  # Supercheck Worker metrics (if enabled)
  - job_name: 'supercheck-worker'
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        port: 3001
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_swarm_service_name]
        regex: 'supercheck_supercheck-worker'
        action: keep
      - source_labels: [__meta_docker_container_label_com_docker_swarm_node_id]
        target_label: node_id
      - source_labels: [__meta_docker_container_id]
        target_label: container_id

  # Traefik metrics
  - job_name: 'traefik'
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        port: 8080
    relabel_configs:
      - source_labels: [__meta_docker_container_label_com_docker_swarm_service_name]
        regex: 'supercheck_traefik'
        action: keep
    metrics_path: /metrics
EOF

# Create Prometheus alerting rules
cat > configs/prometheus/supercheck_rules.yml << 'EOF'
groups:
  - name: supercheck.rules
    rules:
      # High CPU usage
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[2m])) * 100) > 80
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage detected"
          description: "CPU usage is above 80% for more than 2 minutes on {{ $labels.instance }}"

      # High memory usage
      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage detected"
          description: "Memory usage is above 85% for more than 5 minutes on {{ $labels.instance }}"

      # Service down
      - alert: SupercheckServiceDown
        expr: up{job=~"supercheck-.*"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Supercheck service is down"
          description: "{{ $labels.job }} service is down for more than 1 minute"

      # High disk usage
      - alert: HighDiskUsage
        expr: (1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High disk usage detected"
          description: "Disk usage is above 85% for more than 5 minutes on {{ $labels.instance }}"

      # Container restart frequency
      - alert: ContainerRestartFrequency
        expr: increase(container_start_time_seconds[1h]) > 5
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Container restarting frequently"
          description: "Container {{ $labels.name }} has restarted more than 5 times in the last hour"
EOF

# Create AlertManager configuration
cat > configs/alertmanager/config.yml << 'EOF'
global:
  smtp_smarthost: 'smtp.resend.com:587'
  smtp_from: 'alerts@yourdomain.com'
  smtp_auth_username: 'resend'
  smtp_auth_password: 'your-smtp-password'  # Use Docker secret in production

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
  - name: 'web.hook'
    email_configs:
      - to: 'admin@yourdomain.com'
        subject: 'Supercheck Alert: {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Labels: {{ range .Labels.SortedPairs }}{{ .Name }}={{ .Value }} {{ end }}
          {{ end }}

  - name: 'slack'
    slack_configs:
      - api_url: 'your-slack-webhook-url'  # Configure if using Slack
        channel: '#alerts'
        title: 'Supercheck Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'dev', 'instance']
EOF

# Create Grafana datasource configuration
mkdir -p configs/grafana/provisioning/{datasources,dashboards}

cat > configs/grafana/provisioning/datasources/datasources.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
EOF

# Create Grafana dashboard configuration
cat > configs/grafana/provisioning/dashboards/dashboards.yml << 'EOF'
apiVersion: 1

providers:
  - name: 'supercheck-dashboards'
    orgId: 1
    folder: 'Supercheck'
    folderUid: 'supercheck'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /etc/grafana/provisioning/dashboards
EOF

# Create a basic Supercheck dashboard
cat > configs/grafana/provisioning/dashboards/supercheck-dashboard.json << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Supercheck Monitoring",
    "tags": ["supercheck"],
    "timezone": "browser",
    "refresh": "30s",
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "100 - (avg by(instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[2m])) * 100)",
            "legendFormat": "{{ instance }}"
          }
        ],
        "gridPos": {"h": 9, "w": 12, "x": 0, "y": 0},
        "yAxes": [
          {"label": "Percent", "max": 100, "min": 0}
        ]
      },
      {
        "id": 2,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
            "legendFormat": "{{ instance }}"
          }
        ],
        "gridPos": {"h": 9, "w": 12, "x": 12, "y": 0},
        "yAxes": [
          {"label": "Percent", "max": 100, "min": 0}
        ]
      },
      {
        "id": 3,
        "title": "Service Status",
        "type": "singlestat",
        "targets": [
          {
            "expr": "up{job=~\"supercheck-.*\"}",
            "legendFormat": "{{ job }}"
          }
        ],
        "gridPos": {"h": 6, "w": 8, "x": 0, "y": 9}
      },
      {
        "id": 4,
        "title": "Container Count",
        "type": "singlestat",
        "targets": [
          {
            "expr": "count(container_last_seen{name=~\"supercheck.*\"})",
            "legendFormat": "Containers"
          }
        ],
        "gridPos": {"h": 6, "w": 8, "x": 8, "y": 9}
      },
      {
        "id": 5,
        "title": "Network I/O",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(node_network_receive_bytes_total[2m])",
            "legendFormat": "RX {{ device }}"
          },
          {
            "expr": "rate(node_network_transmit_bytes_total[2m])",
            "legendFormat": "TX {{ device }}"
          }
        ],
        "gridPos": {"h": 6, "w": 8, "x": 16, "y": 9}
      }
    ]
  }
}
EOF

echo "✅ Monitoring configuration created"

# Deploy the monitoring stack
echo "🚀 Deploying monitoring stack..."

# Copy configs to Docker volumes
docker run --rm -v monitoring_prometheus_config:/target -v $(pwd)/configs/prometheus:/source busybox sh -c 'cp -r /source/* /target/'
docker run --rm -v monitoring_grafana_provisioning:/target -v $(pwd)/configs/grafana/provisioning:/source busybox sh -c 'cp -r /source/* /target/'
docker run --rm -v monitoring_alertmanager_config:/target -v $(pwd)/configs/alertmanager:/source busybox sh -c 'cp -r /source/* /target/'

echo "✅ Configuration files copied to Docker volumes"

# Deploy the stack
docker stack deploy -c prometheus-stack.yml monitoring

echo "⏳ Waiting for monitoring services to start..."
sleep 15

echo "📊 Monitoring Stack Status:"
docker stack services monitoring

echo ""
echo "✅ Monitoring setup complete!"
echo ""
echo "🔗 Access Points:"
echo "   - Prometheus: http://localhost:9090"
echo "   - Grafana: http://localhost:3100 (admin/admin123)"
echo "   - AlertManager: http://localhost:9093"
echo "   - Node Exporter: http://localhost:9100/metrics"
echo "   - cAdvisor: http://localhost:8080"
echo ""
echo "🌐 Production URLs (configure DNS):"
echo "   - Prometheus: https://prometheus.yourdomain.com"
echo "   - Grafana: https://grafana.yourdomain.com"
echo "   - AlertManager: https://alertmanager.yourdomain.com"
echo ""
echo "🔧 Management Commands:"
echo "   - View logs: docker service logs -f monitoring_prometheus"
echo "   - Update stack: docker stack deploy -c prometheus-stack.yml monitoring"
echo "   - Remove monitoring: docker stack rm monitoring"
echo ""
echo "📈 Next Steps:"
echo "   1. Configure email/Slack alerts in AlertManager"
echo "   2. Import additional Grafana dashboards"
echo "   3. Set up log aggregation with ELK stack (optional)"
echo "   4. Configure external monitoring (Pingdom, UptimeRobot, etc.)"