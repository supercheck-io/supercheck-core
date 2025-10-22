# Quick Start: Webhook Notifications for Status Pages

## Overview
Webhook notifications allow status page subscribers to receive incident notifications via HTTP POST requests with HMAC-SHA256 signatures.

---

## For Users (Subscribers)

### Subscribing to Webhook Notifications

1. **Go to Status Page**
   - Open your public status page
   - Click "Subscribe to Updates" button

2. **Select Webhook Tab**
   - Switch from "Email" to "Webhook" tab
   - Enter your webhook URL (must be HTTPS in production)
   - Add optional description
   - Click "Subscribe via Webhook"

3. **Test Your Webhook** (Optional)
   - In subscribers management UI
   - Find your webhook
   - Click "Test Webhook"
   - Verify you received a test payload

### What You'll Receive

**Sample Webhook Payload**:
```json
{
  "type": "incident.created",
  "timestamp": "2025-10-22T12:34:56.789Z",
  "statusPageId": "550e8400-e29b-41d4-a716-446655440000",
  "incident": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Database Connection Issues",
    "status": "investigating",
    "impact": "major",
    "body": "We're currently investigating issues with database connectivity..."
  }
}
```

**Headers**:
- `X-Webhook-Signature`: `sha256=<hex-encoded-hmac>`
- `X-Webhook-Event`: `incident.created` or `incident.updated` or `incident.resolved`
- `X-Webhook-Timestamp`: ISO 8601 timestamp
- `Content-Type`: `application/json`

### Verifying the Signature

Your endpoint should verify the HMAC signature before processing:

**Node.js Example**:
```typescript
import crypto from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler
app.post('/webhooks/incidents', (req, res) => {
  const signature = req.headers['x-webhook-signature']?.replace('sha256=', '');
  const payload = JSON.stringify(req.body);

  if (!signature || !verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
  res.status(200).json({ received: true });
});
```

**Python Example**:
```python
import hmac
import hashlib
import json

def verify_signature(payload: str, signature: str, secret: str) -> bool:
    expected_sig = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected_sig)

@app.route('/webhooks/incidents', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature', '').replace('sha256=', '')
    payload = request.get_data(as_text=True)

    if not verify_signature(payload, signature, os.getenv('WEBHOOK_SECRET')):
        return {'error': 'Invalid signature'}, 401

    data = json.loads(payload)
    # Process webhook...
    return {'received': True}
```

**Go Example**:
```go
import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
)

func verifySignature(payload, signature, secret string) bool {
    h := hmac.New(sha256.New, []byte(secret))
    h.Write([]byte(payload))
    expected := hex.EncodeToString(h.Sum(nil))
    return hmac.Equal([]byte(signature), []byte(expected))
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
    signature := strings.TrimPrefix(r.Header.Get("X-Webhook-Signature"), "sha256=")
    payload, _ := io.ReadAll(r.Body)

    if !verifySignature(string(payload), signature, os.Getenv("WEBHOOK_SECRET")) {
        http.Error(w, "Invalid signature", http.StatusUnauthorized)
        return
    }

    // Process webhook...
}
```

---

## For Admins (Status Page Managers)

### Configuration

1. **Enable Webhook Subscriptions** (Enabled by Default)
   - Go to Status Page Settings
   - Ensure "Allow webhook subscriptions" is checked
   - Save settings

2. **Create an Incident**
   - All verified webhook subscribers are notified automatically
   - Unverified webhooks won't receive notifications
   - Quarantined webhooks won't receive notifications

3. **Monitor Webhook Health**
   - Check subscribers list
   - Look for "Quarantined" status (won't receive events)
   - Check last error message if webhook failed
   - Use "Test Webhook" to verify endpoint is working

### Webhook Health Status

**Green (Active)**:
- Verified and receiving notifications
- 0-2 recent failures

**Yellow (Degraded)**:
- Multiple failures but still active
- > 2 failures in last attempts

**Red (Quarantined)**:
- Disabled after 10 consecutive failures
- Won't receive any notifications
- Requires admin action to re-enable

---

## For Developers

### Key Files

**Webhook Logic**:
- `/app/src/actions/send-webhook-notifications.ts` - Main delivery logic
- `/app/src/lib/webhook-delivery.service.ts` - Delivery service with HMAC
- `/app/src/actions/test-webhook.ts` - Testing endpoint

**Database**:
- `statusPageSubscribers` table has:
  - `webhookSecret`: 64-char hex string
  - `endpoint`: Webhook URL
  - `webhookFailures`: Failure counter
  - `webhookLastError`: Last error message
  - `quarantinedAt`: When disabled (null = active)

### Integration Points

**When Incident is Created**:
```typescript
// in create-incident.ts
if (validatedData.deliverNotifications) {
  sendWebhookNotifications(result.id, validatedData.statusPageId);
}
```

**When Incident is Updated**:
```typescript
// in update-incident-status.ts
if (validatedData.deliverNotifications) {
  sendWebhookNotifications(result.id, validatedData.statusPageId);
}
```

### Webhook Delivery Flow

```
Incident Event Triggered
    ↓
Query verified webhooks:
  - mode = 'webhook'
  - verifiedAt != null
  - quarantinedAt = null
  - statusPage.allowWebhookSubscribers = true
  - incident.deliverNotifications = true
    ↓
For each webhook:
  - Generate HMAC-SHA256 signature
  - POST to endpoint with 10-second timeout
    ↓
  - Success? Update last_attempt, reset failures
  - Failure? Increment failures, check quarantine
    ↓
Completed with summary: X sent, Y failed
```

### Retry Logic

- **Max Attempts**: 4 (initial + 3 retries)
- **Backoff**: 1s → 2s → 4s → 8s (capped at 60s)
- **Jitter**: ±10% added to prevent thundering herd
- **Non-retryable**: 4xx client errors (except 429)
- **Retryable**: 5xx, timeouts, connection errors, 429

### Quarantine Mechanism

- **Threshold**: 10 consecutive failures
- **Action**: Set `quarantinedAt` timestamp
- **Effect**: No more webhooks delivered
- **Recovery**: Requires manual re-enable via database update

**Re-enable Quarantined Webhook**:
```sql
UPDATE status_page_subscribers
SET quarantined_at = NULL, webhook_failures = 0
WHERE id = 'webhook-id';
```

---

## Troubleshooting

### Webhook Not Receiving Events

**Check List**:
1. Is webhook verified?
   ```sql
   SELECT verified_at FROM status_page_subscribers
   WHERE endpoint = 'https://...';
   ```

2. Is webhook quarantined?
   ```sql
   SELECT quarantined_at, webhook_last_error
   FROM status_page_subscribers
   WHERE endpoint = 'https://...';
   ```

3. Is status page published?
   ```sql
   SELECT status FROM status_pages WHERE id = '...';
   ```

4. Are webhooks enabled on status page?
   ```sql
   SELECT allow_webhook_subscribers FROM status_pages WHERE id = '...';
   ```

5. Test webhook endpoint directly
   - Use test webhook button in UI
   - Check your endpoint logs
   - Verify signature verification code

### Webhook Repeatedly Failing

**Common Issues**:

1. **Timeout (10 second limit)**
   - Make endpoint respond faster
   - Or increase timeout in webhook-delivery.service.ts

2. **Invalid Signature**
   - Verify you're using correct secret
   - Verify you're using raw request body (not parsed JSON)
   - Check secret from database matches

3. **Endpoint Returns 4xx Error**
   - Won't retry on 4xx (except 429)
   - Check endpoint logs for errors
   - Fix endpoint logic

4. **Endpoint Not Accessible**
   - Verify HTTPS certificate is valid
   - Verify domain resolves
   - Check firewall/security rules

### Re-enable Quarantined Webhook

```sql
-- Check current status
SELECT id, endpoint, quarantined_at, webhook_failures
FROM status_page_subscribers
WHERE endpoint = 'https://your-endpoint.com';

-- Re-enable
UPDATE status_page_subscribers
SET quarantined_at = NULL, webhook_failures = 0
WHERE endpoint = 'https://your-endpoint.com';

-- Verify
SELECT id, endpoint, quarantined_at
FROM status_page_subscribers
WHERE endpoint = 'https://your-endpoint.com';
```

---

## Security Best Practices

1. **Always Verify Signatures**
   - Use `crypto.timingSafeEqual()` to compare signatures
   - Prevents timing attacks
   - Validates payload authenticity

2. **Use HTTPS Only**
   - Webhooks require HTTPS endpoints
   - No localhost in production

3. **Implement Idempotency**
   - Same webhook might be delivered multiple times (retries)
   - Use incident ID as idempotency key
   - Store which incidents you've processed

4. **Handle Out-of-Order Events**
   - Webhooks might arrive out of order
   - Use timestamps to determine event order
   - Don't assume order of creation/update/resolved

5. **Implement Timeout**
   - Endpoint must respond within 10 seconds
   - Use async processing if needed
   - Queue webhook data for async processing

6. **Implement Backpressure**
   - Multiple webhooks sent simultaneously
   - Implement rate limiting/queue if needed
   - Don't process synchronously in handler

---

## Example Implementations

### Slack Integration
```typescript
async function handleIncidentWebhook(payload: WebhookEvent) {
  const slack = new WebClient(process.env.SLACK_TOKEN);

  const color = {
    critical: 'danger',
    major: 'warning',
    minor: 'good',
    none: '#808080'
  }[payload.incident.impact];

  await slack.chat.postMessage({
    channel: '#incidents',
    attachments: [{
      color,
      title: payload.incident.name,
      text: payload.incident.body,
      fields: [
        { title: 'Status', value: payload.incident.status, short: true },
        { title: 'Impact', value: payload.incident.impact, short: true }
      ]
    }]
  });
}
```

### PagerDuty Integration
```typescript
async function handleIncidentWebhook(payload: WebhookEvent) {
  const pagerDuty = new EventsAPIV2({ token: process.env.PAGERDUTY_KEY });

  await pagerDuty.enqueueEvent({
    routing_key: process.env.PAGERDUTY_ROUTING_KEY,
    event_action: payload.incident.status === 'resolved' ? 'resolve' : 'trigger',
    payload: {
      summary: payload.incident.name,
      severity: payload.incident.impact,
      source: 'Supercheck Status Page',
      custom_details: {
        body: payload.incident.body,
        timestamp: payload.timestamp
      }
    }
  });
}
```

### Database Storage
```typescript
async function handleIncidentWebhook(payload: WebhookEvent) {
  await db.insert(webhookEvents).values({
    webhookId: req.subscriber.id,
    eventType: payload.type,
    incidentId: payload.incident.id,
    payload: JSON.stringify(payload),
    processedAt: new Date(),
  });
}
```

---

## Performance Considerations

- **Webhook Delivery**: Async, non-blocking
- **Timeout**: 10 seconds per request
- **Retries**: Exponential backoff prevents overwhelming endpoints
- **Concurrency**: All webhooks sent in parallel (Promise.allSettled)
- **Database**: Indexed queries for subscriber filtering

---

## Support

For issues or questions:
1. Check webhook last error message
2. Review security review: `WEBHOOK_SECURITY_REVIEW.md`
3. Review implementation: `WEBHOOK_IMPLEMENTATION_SUMMARY.md`
4. Check database state for quarantined/failed webhooks

---

**Last Updated**: October 22, 2025
**Version**: 1.0
