# K3s Security Configuration Guide

This guide provides security best practices for deploying Supercheck on Hetzner K3s clusters.

## Network Security

### Private Network Configuration

For small to medium clusters, enable private networks:

```yaml
networking:
  private_network:
    enabled: true
    subnet: 10.0.0.0/16
  allowed_networks:
    api:
      - 10.0.0.0/16 # Restrict API access to private network
```

### SSH Security

Use SSH keys instead of passwords:

```yaml
networking:
  ssh:
    use_agent: true # For passphrase-protected keys
    public_key_path: "~/.ssh/id_ed25519.pub" # Use ed25519 for better security
    private_key_path: "~/.ssh/id_ed25519"
```

### API Access Restrictions

Restrict API access to specific networks:

```yaml
networking:
  allowed_networks:
    api:
      - 10.0.0.0/16 # Private network only
      - 203.0.113.0/24 # Your office IP range
```

## Cluster Security

### RBAC Configuration

Implement proper Role-Based Access Control (RBAC):

```yaml
# Example RBAC configuration
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: supercheck-admin
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps", "secrets"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
```

### Network Policies

Use Kubernetes network policies to restrict traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: supercheck-network-policy
  namespace: supercheck
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: supercheck
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: supercheck
```

### Pod Security Standards

Implement pod security standards:

```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: supercheck-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - "configMap"
    - "emptyDir"
    - "projected"
    - "secret"
    - "downwardAPI"
    - "persistentVolumeClaim"
  runAsUser:
    rule: "MustRunAsNonRoot"
  seLinux:
    rule: "RunAsAny"
  fsGroup:
    rule: "RunAsAny"
```

## Application Security

### Secret Management

Use Kubernetes secrets for sensitive data:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: supercheck-secrets
  namespace: supercheck
type: Opaque
data:
  # Base64 encoded values
  DB_PASSWORD: <base64-encoded-password>
  REDIS_PASSWORD: <base64-encoded-password>
  AWS_ACCESS_KEY_ID: <base64-encoded-access-key>
  AWS_SECRET_ACCESS_KEY: <base64-encoded-secret-key>
```

### Environment Variable Security

Separate sensitive configuration from non-sensitive:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: supercheck-config
  namespace: supercheck
data:
  # Non-sensitive configuration
  NODE_ENV: "production"
  RUNNING_CAPACITY: "5"
  QUEUED_CAPACITY: "100"
---
apiVersion: v1
kind: Secret
metadata:
  name: supercheck-secrets
  namespace: supercheck
type: Opaque
data:
  # Sensitive configuration
  DB_PASSWORD: <base64-encoded>
  AWS_SECRET_ACCESS_KEY: <base64-encoded>
```

### Container Security

Use non-root containers and security contexts:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
```

## Monitoring and Logging

### Security Monitoring

Implement security monitoring:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: falco-rules
  namespace: supercheck
data:
  rules.yaml: |
    - rule: Detect shell in container
      desc: Detect shell spawned in container
      condition: >
        spawned_process and
        container and
        proc.name in (bash, sh, zsh, fish)
      output: >
        Shell spawned in container (user=%user.name container=%container.name shell=%proc.name parent=%proc.pname cmdline=%proc.cmdline)
      priority: WARNING
```

### Audit Logging

Enable Kubernetes audit logging:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: audit-policy
  namespace: kube-system
data:
  policy.yaml: |
    apiVersion: audit.k8s.io/v1
    kind: Policy
    rules:
    - level: Metadata
      namespaces: ["supercheck"]
```

## Certificate Management

### TLS Configuration

Use proper TLS certificates:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: traefik
```

### Certificate Rotation

Implement automatic certificate rotation:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: supercheck-tls
  namespace: supercheck
spec:
  secretName: supercheck-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - supercheck.example.com
  renewBefore: 720h # 30 days before expiration
```

## Backup and Recovery

### Etcd Backup

Regularly backup etcd for HA clusters:

```bash
#!/bin/bash
# Backup etcd data
ETCDCTL_API=3 etcdctl snapshot save snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=<ca-file> \
  --cert=<cert-file> \
  --key=<key-file>
```

### Application Backup

Backup application data:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: supercheck-backup
  namespace: supercheck
spec:
  schedule: "0 2 * * *" # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: postgres:15
              command:
                - /bin/bash
                - -c
                - |
                  pg_dump $DATABASE_URL > /backup/backup-$(date +%Y%m%d).sql
                  aws s3 cp /backup/backup-$(date +%Y%m%d).sql s3://backup-bucket/
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: supercheck-secrets
                  key: DATABASE_URL
```

## Security Updates

### Regular Updates

Keep K3s and components updated:

```bash
# Check for updates
curl -s https://api.github.com/repos/k3s-io/k3s/releases/latest | grep tag_name

# Upgrade K3s
curl -sfL https://get.k3s.io | sh -s - --upgrade
```

### Image Scanning

Scan container images for vulnerabilities:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: trivy-config
  namespace: supercheck
data:
  trivy.yaml: |
    severity:
      - HIGH
      - CRITICAL
    ignore-unfixed: true
```

## Access Control

### Multi-Factor Authentication

Configure MFA for Hetzner Cloud:

1. Enable 2FA on your Hetzner Cloud account
2. Use API tokens with limited permissions
3. Regularly rotate API tokens

### Service Account Management

Use dedicated service accounts:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: supercheck-sa
  namespace: supercheck
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: supercheck-binding
  namespace: supercheck
subjects:
  - kind: ServiceAccount
    name: supercheck-sa
    namespace: supercheck
roleRef:
  kind: Role
  name: supercheck-role
  apiGroup: rbac.authorization.k8s.io
```

## Incident Response

### Security Incident Response Plan

1. **Detection**: Monitor logs and metrics for unusual activity
2. **Containment**: Isolate affected pods/nodes
3. **Investigation**: Analyze logs and audit trails
4. **Recovery**: Restore from backups and patch vulnerabilities
5. **Post-mortem**: Document lessons learned and improve procedures

### Emergency Procedures

```bash
# Emergency shutdown of affected namespace
kubectl scale deployment -n supercheck --replicas=0 --all

# Force restart of all pods
kubectl delete pods -n supercheck --all --grace-period=0 --force

# Network isolation
kubectl label namespace supercheck security=incident --overwrite
```

## Compliance

### GDPR Compliance

- Ensure data encryption at rest and in transit
- Implement proper data retention policies
- Provide data export and deletion capabilities

### SOC 2 Compliance

- Maintain audit logs for all actions
- Implement proper access controls
- Regular security assessments and penetration testing
