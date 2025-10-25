# Multi-Location Monitoring - Local Testing Guide

## Overview

The multi-location monitoring feature executes checks from three strategic regions:

| Region | Worker Location Code |
|--------|----------------------|
| US East | `us-east` |
| EU Central | `eu-central` |
| Asia Pacific | `asia-pacific` |

## How It Works Locally

- In distributed deployments (`MULTI_LOCATION_DISTRIBUTED=true`, default), the app enqueues one job per region and geography-specific workers process their matching jobs.
- In local development (single worker, no `WORKER_LOCATION`), all locations execute sequentially on the same worker **without artificial delays**. The results still carry the correct location code so the UI behaves identically.

When a monitor with multi-location enabled runs:

1. The worker receives the `locationConfig` from the monitor.
2. For each enabled location, it runs the check (HTTP request, ping, etc.) and records the result with the location tag.
3. Results are aggregated based on your strategy (All, Majority, Any, Custom).

## Testing Multi-Location Monitors

### Step 1: Create a Multi-Location Monitor

1. **Create a new monitor** (any type: HTTP, Website, etc.)

2. **In the wizard, go to "Location Settings" step**
   - Toggle "Multi-Location Monitoring" ON
   - Select multiple locations (e.g., us-east, eu-central, asia-pacific)
   - Choose aggregation strategy:
     - **All Locations Up**: Monitor is UP only if ALL locations report UP
     - **Majority Up**: Monitor is UP if >50% locations report UP
     - **Any Location Up**: Monitor is UP if at least 1 location reports UP
     - **Custom Threshold**: Set custom percentage (e.g., 75%)

3. **Complete monitor creation**

### Step 2: Edit Existing Monitor to Enable Multi-Location

1. **Go to monitor edit page** → Click "Configure Locations"
2. **Toggle on** "Multi-Location Monitoring"
3. **Select locations** you want to monitor from
4. **Click "Update Monitor"**

### Step 3: View Multi-Location Results

#### Monitor Details Page

When viewing a monitor with multi-location enabled:

1. **Location Filter Dropdown** (top of page)
   - Shows when multiple locations are available
   - Select "All Locations" or specific location
   - Updates all metrics, charts, and tables

2. **Top Metrics** (filtered by selected location)
   - Status, Response Time, Uptime (24h/30d)
   - Avg Response Time (24h/30d)

3. **Availability Overview Chart**
   - **All Locations Selected**: Shows segmented bars
     - Each bar divided into colored segments (one per location)
     - Green segment = UP for that location
     - Red segment = DOWN for that location
     - Hover over segment to see location details

   - **Specific Location Selected**: Shows single-color bars
     - Simple UP/DOWN visualization for that location

4. **Response Time Chart** (filtered by location)

5. **Recent Checks Table** (filtered by location)

#### Location-Specific Data

View individual location stats at the bottom of monitor details:
- Shows each location as a card
- Uptime percentage per location
- Average/Min/Max response time
- Latest status

## Testing Scenarios

### Scenario 1: All Locations Healthy

```yaml
Configuration:
  Locations: us-east, eu-central, asia-pacific
  Strategy: Majority Up (50%)

Expected Result:
  - Monitor status: UP
  - All location bars: Green
  - All location cards: UP status
  - Avg response varies by location (asia-pacific typically slowest)
```

### Scenario 2: Partial Outage

To simulate:
1. Create monitor pointing to a service that's sometimes slow/down
2. Set strategy to "Majority Up"
3. Run checks - you should see:
   - Some locations UP (green)
   - Some locations DOWN (red)
   - Overall monitor status based on majority

### Scenario 3: Location-Specific Issues

1. Monitor a service with geographic restrictions
2. You'll see:
   - Some locations can't reach it (DOWN)
   - Other locations work fine (UP)
   - Segmented bar chart clearly shows which locations failed

## Local Development Environment Variables

No special environment variables are needed. With the default `.env` templates:

- `MULTI_LOCATION_DISTRIBUTED=false` runs all locations sequentially on the same worker (ideal for local dev).
- Setting `MULTI_LOCATION_DISTRIBUTED=true` requires workers with explicit `WORKER_LOCATION` values (`us-east`, `eu-central`, `asia-pacific`).

## Verifying Multi-Location is Working

### 1. Check Database Records

```sql
-- View results per location
SELECT
  location,
  "isUp",
  "responseTimeMs",
  "checkedAt"
FROM monitor_results
WHERE "monitorId" = 'your-monitor-id'
ORDER BY "checkedAt" DESC;
```

You should see multiple rows per check time (one per location).

### 2. Check Worker Logs

```bash
docker-compose -f docker-compose-local.yml logs worker --tail 50
```

Look for:
```
[Monitor Service] Executing multi-location check for monitor: <id>
[Monitor Service] Location: us-east - Result: UP (45ms)
[Monitor Service] Location: eu-west - Result: UP (125ms)
[Monitor Service] Location: asia-pacific - Result: UP (195ms)
[Monitor Service] Aggregated result: UP (3/3 locations up, 50% threshold)
```

### 3. API Endpoints for Testing

```bash
# Get location statistics
curl http://localhost:3000/api/monitors/{monitorId}/location-stats?days=7

# Get results filtered by location
curl http://localhost:3000/api/monitors/{monitorId}/results?location=us-east
```

## Advanced Testing

### Test Different Aggregation Strategies

1. **Create 4 identical monitors** pointing to the same target
2. **Configure each with different strategy:**
   - Monitor A: All Locations Up (100%)
   - Monitor B: Majority Up (50%)
   - Monitor C: Any Location Up (1%)
   - Monitor D: Custom (75%)
3. **Compare results** - they should differ based on partial failures

### Test Geographic-Specific Behavior

1. **Monitor a CDN endpoint** (e.g., Cloudflare, Fastly)
2. **Enable all 6 locations**
3. **View response times** - should see realistic variation:
   - us-east: ~20-50ms (base delay)
   - asia-pacific: ~170-200ms (base + 150ms delay)

### Test Location Selection Changes

1. **Start with 2 locations** (us-east, eu-west)
2. **Run several checks** - verify 2 results per check
3. **Add 3 more locations** (asia-pacific, etc.)
4. **Next check should show 5 results**
5. **Remove some locations**
6. **Verify next check only uses active locations**

## Troubleshooting

### Not Seeing Multiple Location Results?

**Check:**
1. ✅ Multi-location is enabled in monitor config
2. ✅ At least 2 locations are selected
3. ✅ Monitor has run at least once since enabling
4. ✅ Worker is running (`docker-compose ps worker`)

### All Locations Show Same Response Time?

**This is expected when:**
- Monitoring internal or localhost targets (minimal network latency)
- All locations execute on the same local worker

**Tip:** Monitor an external service or deploy regional workers to observe live geographic latency.

### Location Filter Dropdown Not Showing?

**Check:**
1. ✅ Monitor has multi-location enabled
2. ✅ Monitor has run with multiple locations
3. ✅ Viewing monitor details page
4. ✅ Results exist in database

## Production vs. Local Differences

| Feature | Local Development | Production |
|---------|------------------|------------|
| Geographic delay | Sequential execution on single worker (no artificial delay) | Real regional latency via distributed workers |
| Worker location | Unset (`WORKER_LOCATION` optional) | Explicit `WORKER_LOCATION` per worker (`us-east`, `eu-central`, `asia-pacific`) |
| Infrastructure | Docker Compose / single server | Docker Swarm, Kubernetes, or VM fleets across regions |
| Cost | Free | Depends on regional infrastructure |
| Testing | Functional validation | Real-world accuracy |

## Next Steps

Once you've tested locally and are ready for production:

1. Keep `MULTI_LOCATION_DISTRIBUTED=true` (default) in production.
2. Deploy workers with region-specific `WORKER_LOCATION` values (`us-east`, `eu-central`, `asia-pacific`).
3. Scale worker replicas per region to handle the desired concurrency.

## FAQ

**Q: Do I need to deploy workers in different regions?**
A: Not for basic validation—local sequential execution works without regional infrastructure. Deploy regional workers when you need true latency measurements and redundancy.

**Q: Can I add custom locations?**
A: The default distribution covers three strategic regions. You can extend the list by updating `/worker/src/db/schema.ts` and `/worker/src/common/location/location.service.ts`, then redeploy the app and worker.

**Q: What happens if one location is down?**
A: Based on your aggregation strategy:
- **All**: Monitor goes DOWN
- **Majority**: Monitor stays UP if >50% are up
- **Any**: Monitor stays UP as long as 1 is up
- **Custom**: Based on your threshold %

**Q: How often does each location check?**
A: All locations check at the same time, based on your monitor's check interval (e.g., every 5 minutes).

**Q: Can I see historical data per location?**
A: Yes! Use the location filter dropdown and the API endpoint `/api/monitors/{id}/location-stats?days=30`.
