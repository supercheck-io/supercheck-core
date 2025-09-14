# AI Fix Feature Setup Guide

This guide explains how to configure and enable the AI-powered test fix functionality in Supercheck.

## Overview

The AI Fix feature analyzes failed Playwright tests and automatically suggests fixes using advanced language models. It supports both OpenAI and Anthropic providers with intelligent error classification and security validation.

## Quick Setup

### 1. Choose Your AI Provider

**Option A: OpenAI (Recommended)**
- Cost-effective with GPT-4o-mini
- Fast response times
- Excellent code understanding

**Option B: Anthropic Claude**
- Alternative provider for redundancy
- Good for sensitive data scenarios

### 2. Get API Keys

**For OpenAI:**
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key (starts with `sk-`)

**For Anthropic:**
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key
3. Copy the key

### 3. Configure Environment Variables

**Production (.env):**
```bash
# Enable AI Fix feature
AI_FIX_ENABLED=true

# Provider configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini

# API Keys (add your actual keys)
OPENAI_API_KEY=sk-your-actual-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here

# Service configuration
AI_TIMEOUT_MS=30000
AI_MAX_REQUESTS_PER_HOUR=100
```

**Development:**
```bash
# Start with AI Fix disabled for development
AI_FIX_ENABLED=false

# Add your development keys when ready to test
# OPENAI_API_KEY=sk-your-dev-key-here
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_FIX_ENABLED` | Yes | `false` | Enable/disable AI Fix feature |
| `AI_PROVIDER` | Yes | `openai` | AI provider: `openai` or `anthropic` |
| `AI_MODEL` | Yes | `gpt-4o-mini` | Model to use for fixes |
| `OPENAI_API_KEY` | Conditional | - | Required if using OpenAI |
| `ANTHROPIC_API_KEY` | Conditional | - | Required if using Anthropic |
| `AI_TIMEOUT_MS` | No | `30000` | Request timeout in milliseconds |
| `AI_MAX_REQUESTS_PER_HOUR` | No | `100` | Rate limit per user per hour |

## Supported Models

### OpenAI Models
- `gpt-4o-mini` (Recommended) - Cost-effective and fast
- `gpt-4o` - Most capable, higher cost
- `gpt-4-turbo` - Balanced performance and cost

### Anthropic Models  
- `claude-3-haiku-20240307` - Fast and cost-effective
- `claude-3-sonnet-20240229` - Balanced performance

## Cost Considerations

**Estimated costs per AI fix request:**
- GPT-4o-mini: ~$0.001-0.005 per request
- GPT-4o: ~$0.01-0.05 per request  
- Claude-3-Haiku: ~$0.001-0.003 per request

**Cost optimization tips:**
- Use `gpt-4o-mini` for development and most use cases
- Set appropriate rate limits (`AI_MAX_REQUESTS_PER_HOUR`)
- Monitor usage through your AI provider's dashboard

## Security Features

The AI Fix feature includes comprehensive security measures:

✅ **Input Sanitization** - Removes dangerous code patterns  
✅ **Output Validation** - Scans AI responses for malicious content  
✅ **RBAC Authorization** - Organization-level access control  
✅ **Rate Limiting** - Per-user and per-organization limits  
✅ **Secure URLs** - Only trusted S3 endpoints allowed  
✅ **Audit Logging** - Complete compliance trail  

## How It Works

1. **Test Fails** - Playwright generates detailed markdown failure report
2. **User Clicks** - "Fix with AI" button appears for failed tests
3. **AI Analysis** - System analyzes error type and determines fixability
4. **Smart Response**:
   - **Fixable Issues** → Monaco diff editor with AI-generated fix
   - **Environmental Issues** → Professional guidance modal with actionable steps

## Testing the Setup

1. **Enable the feature:**
   ```bash
   AI_FIX_ENABLED=true
   OPENAI_API_KEY=your-actual-key
   ```

2. **Restart the application**

3. **Create a failing test:**
   ```javascript
   await page.click('#non-existent-button');
   ```

4. **Run the test** - it should fail

5. **Look for "Fix with AI" button** - should appear next to the Run button

6. **Click the button** - should analyze and suggest a fix

## Troubleshooting

### Button Not Appearing
- Check `AI_FIX_ENABLED=true`
- Ensure test actually failed (status = 'failed')
- Verify user has test execution permissions

### API Errors
- Verify API key is correct and active
- Check rate limits on your AI provider account
- Ensure `AI_PROVIDER` matches your API key type

### Security Errors
- Verify `S3_ENDPOINT_HOST` matches your S3 configuration
- Check that markdown reports are being generated and uploaded

### Performance Issues
- Reduce `AI_TIMEOUT_MS` if requests are too slow
- Switch to `gpt-4o-mini` for faster responses
- Implement organization-level rate limiting

## Production Deployment

**Pre-deployment checklist:**
- [ ] Set strong, unique API keys
- [ ] Configure appropriate rate limits
- [ ] Set `AI_FIX_ENABLED=true`
- [ ] Monitor initial usage and costs
- [ ] Set up alerts for high usage
- [ ] Review security logs

**Monitoring:**
- Track AI usage through provider dashboards
- Monitor application logs for errors
- Set up cost alerts
- Review rate limit effectiveness

## Support

For issues with the AI Fix feature:
1. Check the troubleshooting section above
2. Review application logs for errors
3. Verify environment variable configuration
4. Test with a minimal failing test case

The AI Fix feature is designed to be robust and secure for production use while providing valuable assistance to developers in fixing test failures quickly and accurately.