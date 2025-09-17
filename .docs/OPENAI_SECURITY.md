# OpenAI API Key Security Best Practices

## ⚠️ CRITICAL: Your API Key Has Been Exposed

If you're reading this, your OpenAI API key may have been exposed. Take immediate action:

1. **Revoke the exposed key immediately** at https://platform.openai.com/api-keys
2. **Generate a new API key**
3. **Never commit API keys to version control**

## Secure Configuration Methods

### Method 1: Environment Variables (Recommended for Production)

```bash
# Set environment variable on your server/container
export OPENAI_API_KEY="sk-proj-..."

# For Docker, pass it when running:
docker run -e OPENAI_API_KEY="$OPENAI_API_KEY" your-image

# For Docker Compose:
docker-compose --env-file=.env.production up
```

### Method 2: Secret Management Systems

For production environments, use:
- **Kubernetes Secrets**
- **AWS Secrets Manager**
- **HashiCorp Vault**
- **Azure Key Vault**
- **Docker Secrets** (for Swarm mode)

### Method 3: .env Files (Development Only)

For local development:

1. Create `.env.local` (already in .gitignore)
2. Add your key: `OPENAI_API_KEY=sk-proj-...`
3. Never commit this file

## Docker Compose Configuration

### Development Setup
```yaml
# docker-compose.override.yml (local only, not committed)
services:
  app:
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
  worker:
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
```

### Production Setup
```bash
# Use environment file
docker-compose --env-file=.env.production up

# Or pass directly (more secure)
OPENAI_API_KEY="sk-proj-..." docker-compose up
```

## Security Checklist

- [ ] API key is NOT in any committed files
- [ ] API key is NOT in Docker images
- [ ] API key is passed via environment variables
- [ ] Production uses secret management system
- [ ] API key has restricted permissions (if OpenAI supports it)
- [ ] API key is rotated regularly
- [ ] Monitoring is set up for API key usage
- [ ] Rate limiting is configured

## Monitoring API Usage

1. Set up usage alerts in OpenAI dashboard
2. Monitor for unusual activity
3. Set spending limits
4. Use different keys for dev/staging/production

## If Your Key Was Exposed

1. **Immediately revoke** the compromised key
2. **Check usage logs** for unauthorized access
3. **Generate new key** with restricted permissions
4. **Update all services** with new key
5. **Review git history** - consider rewriting if needed
6. **Notify team** about the breach

## Additional Security Measures

1. **IP Whitelisting**: If OpenAI supports it, restrict key to your server IPs
2. **Rate Limiting**: Implement application-level rate limiting
3. **Proxy Service**: Consider using a proxy service to hide keys from client code
4. **Audit Logging**: Log all AI service calls for security auditing
5. **Encryption at Rest**: Ensure environment variables are encrypted on disk

## Never Do This

- ❌ Hardcode keys in source code
- ❌ Commit .env files with real keys
- ❌ Share keys via email/slack
- ❌ Use production keys in development
- ❌ Store keys in Docker images
- ❌ Log or print keys in application logs
- ❌ Use the same key across environments

## Resources

- [OpenAI API Keys Documentation](https://platform.openai.com/docs/api-reference/authentication)
- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [12 Factor App - Config](https://12factor.net/config)