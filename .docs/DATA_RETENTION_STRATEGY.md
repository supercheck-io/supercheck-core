# Data Retention Strategy for Supercheck

## Executive Summary

High-frequency monitoring (1-minute intervals) generates massive amounts of data that requires intelligent lifecycle management. This document outlines a comprehensive data retention strategy that balances historical insights with operational efficiency.

---

## Current Data Growth Analysis

### Monitor Results Data Growth
```
Frequency: 1-minute monitoring
Per Monitor: 1,440 records/day = 525,600 records/year
100 Monitors: 144,000 records/day = 52.6M records/year
500 Monitors: 720,000 records/day = 263M records/year

Storage Impact:
- Raw records: ~200-500 bytes each
- 100 monitors: ~25-50GB/year raw data
- 500 monitors: ~125-250GB/year raw data
- With indexes: +30-50% overhead
```

### Job Run Data Growth
```
Typical Pattern: 10-50 test runs/day per organization
Average Run Data: ~1-5KB (metadata + logs)
100 Customers: 1,000-5,000 runs/day = 365K-1.8M runs/year

Storage Impact:
- Run metadata: ~500MB-2.5GB/year
- Artifacts (S3): ~10-100GB/year per customer
- Logs & reports: Varies significantly
```

---

## Recommended Tiered Retention Strategy

### Tier 1: Real-time Data (High Resolution)
```
Data Type: Raw monitor results, recent job runs
Retention: 7-30 days (configurable by plan tier)
Storage: Primary PostgreSQL database
Access: Immediate, full detail
Use Cases: Real-time dashboards, immediate alerts, debugging
```

### Tier 2: Aggregated Data (Medium Resolution)
```
Data Type: Hourly/daily aggregations, job summaries
Retention: 90 days - 1 year
Storage: Aggregation tables in PostgreSQL
Access: Fast queries, reduced detail
Use Cases: Trend analysis, SLA reporting, capacity planning
```

### Tier 3: Historical Data (Low Resolution)
```
Data Type: Monthly summaries, annual trends
Retention: 2-5+ years
Storage: Time-series database or cold storage
Access: Slower queries, summary data only
Use Cases: Long-term trends, compliance reporting
```

### Tier 4: Archive Data (Minimal Resolution)
```
Data Type: Critical incidents, compliance data
Retention: 7+ years (compliance dependent)
Storage: Cold storage (S3 Glacier, etc.)
Access: Infrequent, manual retrieval
Use Cases: Compliance, audit trails, legal requirements
```

---

## Implementation Strategy

### Phase 1: Database Schema Optimization

**1. Table Partitioning**
```sql
-- Partition monitor_results by month
CREATE TABLE monitor_results (
    id uuid DEFAULT gen_random_uuid(),
    monitor_id uuid NOT NULL,
    checked_at timestamp NOT NULL,
    status varchar(50) NOT NULL,
    response_time_ms integer,
    details jsonb,
    is_up boolean NOT NULL,
    is_status_change boolean DEFAULT false,
    consecutive_failure_count integer DEFAULT 0,
    alerts_sent_for_failure integer DEFAULT 0,
    PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);

-- Create monthly partitions (automated)
CREATE TABLE monitor_results_2025_01 PARTITION OF monitor_results
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Indexes for common queries
CREATE INDEX idx_monitor_results_monitor_time
    ON monitor_results (monitor_id, checked_at DESC);
CREATE INDEX idx_monitor_results_status_change
    ON monitor_results (checked_at DESC) WHERE is_status_change = true;
```

**2. Aggregation Tables**
```sql
-- Hourly aggregation
CREATE TABLE monitor_results_hourly (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id uuid NOT NULL,
    hour_bucket timestamp NOT NULL,
    checks_total integer NOT NULL,
    checks_up integer NOT NULL,
    checks_down integer NOT NULL,
    avg_response_time_ms integer,
    min_response_time_ms integer,
    max_response_time_ms integer,
    p95_response_time_ms integer,
    uptime_percentage decimal(5,2) NOT NULL,
    incident_count integer DEFAULT 0,
    created_at timestamp DEFAULT NOW(),

    UNIQUE(monitor_id, hour_bucket)
);

-- Daily aggregation
CREATE TABLE monitor_results_daily (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id uuid NOT NULL,
    day_date date NOT NULL,
    total_checks integer NOT NULL,
    successful_checks integer NOT NULL,
    failed_checks integer NOT NULL,
    avg_response_time_ms integer,
    min_response_time_ms integer,
    max_response_time_ms integer,
    p95_response_time_ms integer,
    p99_response_time_ms integer,
    uptime_percentage decimal(5,2) NOT NULL,
    incidents_count integer DEFAULT 0,
    mttr_minutes integer, -- Mean Time To Recovery
    mtbf_hours integer,   -- Mean Time Between Failures
    created_at timestamp DEFAULT NOW(),

    UNIQUE(monitor_id, day_date)
);

-- Monthly aggregation
CREATE TABLE monitor_results_monthly (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id uuid NOT NULL,
    month_date date NOT NULL,
    total_checks integer NOT NULL,
    uptime_percentage decimal(5,2) NOT NULL,
    avg_response_time_ms integer,
    incidents_count integer DEFAULT 0,
    sla_breaches integer DEFAULT 0,
    created_at timestamp DEFAULT NOW(),

    UNIQUE(monitor_id, month_date)
);
```

### Phase 2: Data Aggregation Service

**Create Aggregation Worker:**
```typescript
// app/src/lib/data-aggregation.ts
export class DataAggregationService {

  // Hourly aggregation (runs every hour)
  async aggregateHourlyData(): Promise<void> {
    const query = `
      INSERT INTO monitor_results_hourly (
        monitor_id, hour_bucket, checks_total, checks_up, checks_down,
        avg_response_time_ms, min_response_time_ms, max_response_time_ms,
        p95_response_time_ms, uptime_percentage, incident_count
      )
      SELECT
        monitor_id,
        date_trunc('hour', checked_at) as hour_bucket,
        COUNT(*) as checks_total,
        COUNT(*) FILTER (WHERE is_up = true) as checks_up,
        COUNT(*) FILTER (WHERE is_up = false) as checks_down,
        AVG(response_time_ms)::integer as avg_response_time_ms,
        MIN(response_time_ms) as min_response_time_ms,
        MAX(response_time_ms) as max_response_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::integer as p95_response_time_ms,
        (COUNT(*) FILTER (WHERE is_up = true) * 100.0 / COUNT(*))::decimal(5,2) as uptime_percentage,
        COUNT(*) FILTER (WHERE is_status_change = true AND is_up = false) as incident_count
      FROM monitor_results
      WHERE checked_at >= NOW() - INTERVAL '2 hours'
        AND checked_at < NOW() - INTERVAL '1 hour'
      GROUP BY monitor_id, date_trunc('hour', checked_at)
      ON CONFLICT (monitor_id, hour_bucket) DO UPDATE SET
        checks_total = EXCLUDED.checks_total,
        checks_up = EXCLUDED.checks_up,
        checks_down = EXCLUDED.checks_down,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms,
        uptime_percentage = EXCLUDED.uptime_percentage
    `;

    await this.db.execute(query);
  }

  // Daily aggregation (runs once daily)
  async aggregateDailyData(): Promise<void> {
    // Similar pattern but aggregates hourly data into daily summaries
  }
}
```

### Phase 3: Data Cleanup Service

**Automated Data Lifecycle Management:**
```typescript
// app/src/lib/data-retention.ts
export class DataRetentionService {
  private retentionPolicies = {
    free: {
      rawData: 7,      // days
      hourlyData: 30,  // days
      dailyData: 90,   // days
      monthlyData: 365 // days
    },
    professional: {
      rawData: 30,
      hourlyData: 90,
      dailyData: 365,
      monthlyData: 1825 // 5 years
    },
    business: {
      rawData: 90,
      hourlyData: 365,
      dailyData: 730,   // 2 years
      monthlyData: 3650  // 10 years
    },
    enterprise: {
      rawData: 365,     // 1 year
      hourlyData: 1825, // 5 years
      dailyData: 3650,  // 10 years
      monthlyData: -1   // Unlimited
    }
  };

  async cleanupExpiredData(): Promise<void> {
    // Get all organizations with their plan tiers
    const orgs = await this.getOrganizationsWithPlans();

    for (const org of orgs) {
      const policy = this.retentionPolicies[org.planTier];

      // Clean up monitor results by organization
      await this.cleanupMonitorResults(org.id, policy);

      // Clean up job runs by organization
      await this.cleanupJobRuns(org.id, policy);

      // Clean up S3 artifacts
      await this.cleanupS3Artifacts(org.id, policy);
    }
  }

  private async cleanupMonitorResults(orgId: string, policy: RetentionPolicy): Promise<void> {
    if (policy.rawData > 0) {
      // Delete raw data older than retention period
      const cutoffDate = new Date(Date.now() - policy.rawData * 24 * 60 * 60 * 1000);

      const query = `
        DELETE FROM monitor_results mr
        USING monitors m
        WHERE mr.monitor_id = m.id
          AND m.organization_id = $1
          AND mr.checked_at < $2
      `;

      await this.db.execute(query, [orgId, cutoffDate]);
    }
  }
}
```

### Phase 4: Query Optimization

**Optimized Dashboard Queries:**
```typescript
// Instead of querying raw data for dashboards
// BAD: SELECT * FROM monitor_results WHERE checked_at > NOW() - INTERVAL '24 hours'

// GOOD: Use aggregated data with fallback
export class MonitorQueryService {
  async getUptimeData(monitorId: string, timeRange: string) {
    switch (timeRange) {
      case 'last_hour':
        // Use raw data for very recent queries
        return this.queryRawData(monitorId, '1 hour');

      case 'last_24_hours':
        // Use hourly aggregations
        return this.queryHourlyData(monitorId, '24 hours');

      case 'last_30_days':
        // Use daily aggregations
        return this.queryDailyData(monitorId, '30 days');

      case 'last_year':
        // Use monthly aggregations
        return this.queryMonthlyData(monitorId, '1 year');
    }
  }

  private async queryHourlyData(monitorId: string, timeRange: string) {
    return this.db.query(`
      SELECT
        hour_bucket as timestamp,
        uptime_percentage,
        avg_response_time_ms,
        incident_count
      FROM monitor_results_hourly
      WHERE monitor_id = $1
        AND hour_bucket > NOW() - INTERVAL '${timeRange}'
      ORDER BY hour_bucket DESC
    `, [monitorId]);
  }
}
```

---

## Configuration by Plan Tier

### Free Tier
```yaml
Raw Data Retention: 7 days
Hourly Aggregation: 30 days
Daily Aggregation: 90 days
Monthly Aggregation: 1 year
Max Monitors: 5
Cleanup Frequency: Daily
```

### Professional Tier
```yaml
Raw Data Retention: 30 days
Hourly Aggregation: 90 days
Daily Aggregation: 1 year
Monthly Aggregation: 5 years
Max Monitors: 25
Cleanup Frequency: Daily
Export Options: CSV, JSON
```

### Business Tier
```yaml
Raw Data Retention: 90 days
Hourly Aggregation: 1 year
Daily Aggregation: 2 years
Monthly Aggregation: 10 years
Max Monitors: 100
Cleanup Frequency: Daily
Export Options: CSV, JSON, PDF Reports
Custom Retention: Available
```

### Enterprise Tier
```yaml
Raw Data Retention: 1 year (customizable)
Hourly Aggregation: 5 years
Daily Aggregation: 10 years
Monthly Aggregation: Unlimited
Max Monitors: Unlimited
Cleanup Frequency: Configurable
Export Options: All formats + API
Custom Retention: Fully customizable
Data Export: Full historical export
```

---

## Implementation Timeline

### Month 1: Foundation
- **Week 1-2**: Implement table partitioning
- **Week 3-4**: Create aggregation tables and initial data migration

### Month 2: Automation
- **Week 1-2**: Build data aggregation service
- **Week 3-4**: Implement automated cleanup service

### Month 3: Optimization
- **Week 1-2**: Optimize queries and add monitoring
- **Week 3-4**: Performance testing and fine-tuning

### Month 4: Advanced Features
- **Week 1-2**: Add custom retention policies for Enterprise
- **Week 3-4**: Implement data export capabilities

---

## Monitoring & Alerting

### Key Metrics to Track
```typescript
interface DataHealthMetrics {
  totalRecordsCount: number;
  dailyGrowthRate: number;
  retentionComplianceRate: number;
  queryPerformanceP95: number;
  storageUtilization: number;
  cleanupSuccessRate: number;
}
```

### Alerts Configuration
```yaml
Database Size Growth:
  Warning: >80% of allocated storage
  Critical: >95% of allocated storage

Query Performance:
  Warning: P95 response time >5 seconds
  Critical: P95 response time >10 seconds

Cleanup Job Status:
  Warning: Cleanup job failed
  Critical: Cleanup job failed 3 consecutive times

Data Integrity:
  Warning: Aggregation data inconsistency detected
  Critical: Primary data corruption detected
```

---

## Cost Impact Analysis

### Storage Cost Reduction
```
Current (No Retention): ~$500-5000/month for large customers
With Tiered Retention: ~$100-1000/month (80% reduction)

Performance Improvement:
Query Speed: 10-100x faster for historical data
Dashboard Load: 3-5x faster
Backup Time: 5-10x faster
```

### Operational Benefits
- **Reduced backup/restore times**
- **Faster database maintenance**
- **Improved query performance**
- **Better compliance posture**
- **Predictable storage costs**

---

## Best Practices Summary

### 1. Data Lifecycle Design
- **Start with retention policies** before scaling
- **Design aggregations first**, raw data second
- **Plan for compliance** requirements early
- **Monitor storage growth** actively

### 2. Query Optimization
- **Always use appropriate time ranges** for queries
- **Prefer aggregated data** for historical views
- **Cache frequent queries** with Redis
- **Use read replicas** for analytical workloads

### 3. Operational Excellence
- **Automate everything** - no manual cleanup
- **Monitor retention job health** continuously
- **Test backup/restore** processes regularly
- **Document retention policies** clearly

### 4. Customer Communication
- **Transparent retention policies** in pricing tiers
- **Data export options** before deletion
- **Migration assistance** for plan upgrades
- **Compliance documentation** available

This tiered retention strategy ensures Supercheck can scale efficiently while providing customers with appropriate data access based on their plan tier and compliance needs.