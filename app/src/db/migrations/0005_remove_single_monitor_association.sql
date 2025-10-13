-- Migration to remove single monitor association and use only multiple monitors
-- This removes the problematic monitorId field from status_page_components

-- Step 1: Add weight column to status_page_component_monitors if it doesn't exist
ALTER TABLE status_page_component_monitors ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 1;

-- Step 2: Migrate any existing single monitor associations to the join table
INSERT INTO status_page_component_monitors (component_id, monitor_id, weight, created_at)
SELECT id, monitor_id, 1, created_at
FROM status_page_components
WHERE monitor_id IS NOT NULL
ON CONFLICT (component_id, monitor_id) DO NOTHING;

-- Step 2: Remove the problematic monitorId field from status_page_components
ALTER TABLE status_page_components DROP COLUMN monitor_id;

-- Step 3: Add aggregation settings to components for multiple monitor scenarios
ALTER TABLE status_page_components ADD COLUMN aggregation_method VARCHAR(50) DEFAULT 'worst_case';
ALTER TABLE status_page_components ADD COLUMN failure_threshold INTEGER DEFAULT 1;

-- Step 4: Add index for better performance on monitor associations
CREATE INDEX IF NOT EXISTS idx_status_page_component_monitors_component_id 
ON status_page_component_monitors(component_id);

CREATE INDEX IF NOT EXISTS idx_status_page_component_monitors_monitor_id 
ON status_page_component_monitors(monitor_id);