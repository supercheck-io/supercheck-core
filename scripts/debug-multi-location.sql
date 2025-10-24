-- Debug Multi-Location Monitoring
-- Run these queries to check what's happening

-- 1. Check if monitor has locationConfig
SELECT
  id,
  name,
  type,
  enabled,
  config->'locationConfig' as location_config,
  config->'locationConfig'->>'enabled' as multi_location_enabled,
  config->'locationConfig'->'locations' as selected_locations
FROM monitors
WHERE id = '019a147f-463c-78e7-a062-d19d7c9156af';

-- 2. Check recent results and their locations
SELECT
  id,
  location,
  "isUp" as is_up,
  "responseTimeMs" as response_time_ms,
  "checkedAt" as checked_at,
  status
FROM monitor_results
WHERE "monitorId" = '019a147f-463c-78e7-a062-d19d7c9156af'
ORDER BY "checkedAt" DESC
LIMIT 20;

-- 3. Count results per location
SELECT
  location,
  COUNT(*) as check_count,
  COUNT(CASE WHEN "isUp" THEN 1 END) as up_count
FROM monitor_results
WHERE "monitorId" = '019a147f-463c-78e7-a062-d19d7c9156af'
GROUP BY location
ORDER BY location;

-- 4. Check if location column has data
SELECT
  DISTINCT location
FROM monitor_results
WHERE "monitorId" = '019a147f-463c-78e7-a062-d19d7c9156af'
  AND location IS NOT NULL;

-- 5. View full monitor config
SELECT
  id,
  name,
  config
FROM monitors
WHERE id = '019a147f-463c-78e7-a062-d19d7c9156af';
