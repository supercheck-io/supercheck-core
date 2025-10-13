-- Add aggregation_method column if it doesn't exist
ALTER TABLE status_page_components ADD COLUMN IF NOT EXISTS aggregation_method VARCHAR(50) DEFAULT 'worst_case';

-- Add failure_threshold column if it doesn't exist
ALTER TABLE status_page_components ADD COLUMN IF NOT EXISTS failure_threshold INTEGER DEFAULT 1;