# Corporate Environment Setup Guide

This guide helps you configure Supertest in corporate environments with proxies, firewalls, and self-signed certificates.

## Corporate Proxy Configuration

### Host-Level Proxy Setup (Recommended)
Configure proxy settings at the Docker host level. Docker containers will automatically inherit these settings:

```bash
# Set system-wide proxy (Linux/macOS)
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.company.com,internal.domain

# For persistent configuration, add to ~/.bashrc or ~/.profile
echo 'export HTTP_PROXY=http://proxy.company.com:8080' >> ~/.bashrc
echo 'export HTTPS_PROXY=http://proxy.company.com:8080' >> ~/.bashrc
```

### Docker Daemon Proxy Configuration
For system-wide Docker proxy support, configure the Docker daemon:

```bash
# Create or edit /etc/systemd/system/docker.service.d/http-proxy.conf
[Service]
Environment="HTTP_PROXY=http://proxy.company.com:8080"
Environment="HTTPS_PROXY=http://proxy.company.com:8080"
Environment="NO_PROXY=localhost,127.0.0.1,postgres,redis,minio"

# Reload and restart Docker
sudo systemctl daemon-reload
sudo systemctl restart docker
```

## Windows Corporate Environment

### Common Issues and Solutions

1. **Path Issues**: Fixed in the latest version with proper Windows path handling
2. **Process Cleanup**: Enhanced timeout cleanup prevents resource leaks
3. **Proxy Authentication**: Supports proxy authentication via URL format

### Windows-Specific Configuration

```bash
# PowerShell
$env:HTTP_PROXY="http://proxy.company.com:8080"
$env:HTTPS_PROXY="http://proxy.company.com:8080"
$env:NO_PROXY="localhost,127.0.0.1,.company.com"

# Command Prompt
set HTTP_PROXY=http://proxy.company.com:8080
set HTTPS_PROXY=http://proxy.company.com:8080
set NO_PROXY=localhost,127.0.0.1,.company.com
```

## Timeout and Resource Management

### Robust Process Cleanup
- **2-minute timeout** for individual tests
- **15-minute timeout** for job executions
- **Aggressive process cleanup** after timeouts to prevent CPU usage
- **Windows-specific** process termination using PowerShell and taskkill
- **Unix-specific** process group termination using pkill

### Monitoring CPU Usage
The system now includes:
- PowerShell commands to kill high-CPU processes on Windows
- Unix commands to identify and kill processes using >50% CPU
- Pattern-based process killing for infinite loop detection

## SSL Certificate Issues

### Self-Signed Certificates
For development environments with self-signed certificates:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
```

⚠️ **Warning**: Never use this in production environments.

### Corporate Certificate Authority
If your company uses a custom CA, add the certificate to your system's trust store or use Docker volume mounts:

```yaml
volumes:
  - /path/to/corporate/certificates:/usr/local/share/ca-certificates:ro
```

## Firewall Configuration

### Required Outbound Ports
- **HTTP**: 80
- **HTTPS**: 443
- **Custom ports**: As configured in your monitors

### Internal Service Ports
- **PostgreSQL**: 5432
- **Redis**: 6379
- **MinIO**: 9000
- **Application**: 3000
- **Worker**: Internal communication

## Troubleshooting

### Common Error Messages

1. **"ECONNREFUSED"**: Check proxy settings and firewall rules
2. **"Certificate verification failed"**: Set `NODE_TLS_REJECT_UNAUTHORIZED=0` for testing
3. **"Process timeout"**: Fixed with enhanced cleanup logic
4. **"High CPU usage"**: Fixed with aggressive process termination

### Debug Logging
Enable debug logging to troubleshoot proxy and connection issues:

```bash
DEBUG=supertest:*
```

### Testing Proxy Configuration
Test your proxy settings with a simple curl command:

```bash
curl -v --proxy http://proxy.company.com:8080 https://httpbin.org/ip
```

## Performance Optimization

### For High-Load Environments
- Increase `RUNNING_CAPACITY` and `QUEUED_CAPACITY`
- Configure appropriate timeout values
- Monitor system resources

### Resource Limits
```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '1.0'
```

## Security Considerations

1. **Never commit proxy credentials** to version control
2. **Use environment variables** or secrets management
3. **Regularly rotate proxy passwords**
4. **Monitor proxy logs** for security events
5. **Use HTTPS** for all external communications

## Support

If you encounter issues specific to your corporate environment:
1. Check proxy logs
2. Verify firewall rules
3. Test network connectivity
4. Review certificate chains
5. Monitor resource usage

For additional help, please refer to the main documentation or create an issue in the repository.