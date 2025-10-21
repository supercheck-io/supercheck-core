-- Remove SMS and search-related fields from status_pages
ALTER TABLE status_pages
DROP COLUMN IF EXISTS allow_sms_subscribers,
DROP COLUMN IF EXISTS hidden_from_search;

-- Remove SMS-related fields from status_page_subscribers
-- Change mode enum to only accept 'email' and 'webhook'
ALTER TABLE status_page_subscribers
DROP COLUMN IF EXISTS phone_number,
DROP COLUMN IF EXISTS phone_country;

-- Create index on custom_domain for faster lookup
CREATE INDEX IF NOT EXISTS idx_status_pages_custom_domain
ON status_pages(custom_domain)
WHERE custom_domain IS NOT NULL;

-- Add webhook-related fields for tracking delivery attempts
ALTER TABLE status_page_subscribers
ADD COLUMN IF NOT EXISTS webhook_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS webhook_last_attempt_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS webhook_last_error TEXT;
