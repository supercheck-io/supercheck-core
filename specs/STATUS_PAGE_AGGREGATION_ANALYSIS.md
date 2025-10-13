# Status Page: Automatic Aggregation vs Manual Incident Creation Analysis

## Executive Summary

This analysis compares two approaches for managing status page incident creation: automatic aggregation from monitor status changes versus manual incident creation by users. The current Supercheck architecture already supports both approaches, and this document evaluates their relative merits, implementation challenges, and recommended use cases.

## Current Architecture Analysis

### 1. Automatic Status Aggregation Implementation

The system already has a robust status aggregation service implemented:

**Location**: [`app/src/lib/status-aggregation.service.ts`](app/src/lib/status-aggregation.service.ts:1)

**Key Features**:

- Multiple aggregation methods: worst_case, best_case, weighted_average, majority_vote
- Configurable failure thresholds
- Weight-based monitor importance
- Real-time status calculation from monitor results

**Database Schema**: [`app/src/db/schema/schema.ts`](app/src/db/schema/schema.ts:1105-1120)

```sql
CREATE TABLE status_page_component_monitors (
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  weight INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (component_id, monitor_id)
);
```

### 2. Manual Incident Creation Flow

The system provides comprehensive manual incident management:

**Key Components**:

- [`app/src/actions/create-incident.ts`](app/src/actions/create-incident.ts:1) - Server action for creating incidents
- [`app/src/components/status-pages/incidents-tab.tsx`](app/src/components/status-pages/incidents-tab.tsx:1) - UI for incident management
- Support for incident workflow (investigating → identified → monitoring → resolved)
- Component status override during incidents
- Incident timeline and updates

### 3. Monitor Integration

**Monitor Service**: [`worker/src/monitor/monitor.service.ts`](worker/src/monitor/monitor.service.ts:1)

- Executes checks and updates monitor status
- Triggers alerts on status changes
- No direct integration with status page incidents

**Monitor Scheduler**: [`app/src/lib/monitor-scheduler.ts`](app/src/lib/monitor-scheduler.ts:1)

- Schedules periodic monitor executions
- Uses BullMQ for job queueing
- No automatic incident triggering

## Comparison: Automatic Aggregation vs Manual Incidents

### Automatic Status Aggregation

**Pros:**

1. **Real-time Updates**: Component status updates immediately when monitors fail
2. **Reduced Manual Effort**: No need for human intervention to track basic outages
3. **Objective**: Based on actual monitor results, not human interpretation
4. **Fast Response**: Immediate detection and reporting of issues
5. **Consistent**: Always follows the same rules for status determination
6. **24/7 Coverage**: Works without human presence
7. **Data-Driven**: Based on actual monitoring data

**Cons:**

1. **False Positives**: Monitor failures may not always represent actual user impact
2. **Lacks Context**: Cannot distinguish between critical and non-critical failures
3. **Alert Fatigue**: Too many automatic updates can desensitize users
4. **No Human Insight**: Cannot provide explanations or workarounds
5. **No Communication**: Doesn't notify users about ongoing issues or resolution timelines
6. **Limited Context**: Cannot account for planned maintenance or known issues
7. **Potential Noise**: Flapping monitors can create frequent status changes

### Manual Incident Creation

**Pros:**

1. **Human Context**: Can explain what's happening and why it matters
2. **Communication Tool**: Provides structured updates to users
3. **Workflow Management**: Follows proper incident resolution process
4. **Selective Reporting**: Only communicates issues that actually matter to users
5. **Impact Assessment**: Can distinguish between minor and major incidents
6. **ETA Communication**: Can provide resolution timelines
7. **Quality Control**: Humans can filter out false positives and noise

**Cons:**

1. **Slower Response**: Requires human intervention to create and update
2. **Resource Intensive**: Requires staff time to manage incidents
3. **Inconsistent**: Different people may handle incidents differently
4. **Limited Coverage**: Only works when someone is available to respond
5. **Potential for Human Error**: Incidents may be forgotten or delayed
6. **Subjective**: Depends on individual judgment about what's important
7. **After-Hours Challenges**: May require on-call staff for timely updates

## Technical Implementation Analysis

### Current State

The system is already well-positioned to support both approaches:

1. **Database Schema**: Supports multiple monitors per component with weights
2. **Aggregation Service**: Fully implemented with multiple algorithms
3. **Manual Incident System**: Complete with workflow and updates
4. **Monitor Integration**: Existing monitor service with status tracking

### Missing Integration Points

1. **Automatic Incident Triggering**: No connection from monitor failures to incident creation
2. **Status Sync**: Components don't automatically update from aggregation results
3. **Notification Integration**: No automatic notifications when aggregation status changes
4. **Recovery Detection**: No automatic incident resolution when monitors recover

### Implementation Options

#### Option 1: Pure Manual (Current State)

- Keep current manual incident system
- Use aggregation service for reference only
- No automatic incident creation

#### Option 2: Hybrid Approach

- Maintain manual incident system for significant issues
- Add automatic status updates for minor issues
- Use aggregation to suggest incidents but require human approval

#### Option 3: Full Automation

- Automatically create incidents based on aggregation rules
- Use manual overrides for exceptions
- Auto-resolve incidents when monitors recover

## Use Case Analysis

### When Automatic Aggregation Excels

1. **Simple Service Monitoring**: Single service with clear success/failure criteria
2. **Internal Tools**: Where stakeholders understand the limitations
3. **High-Frequency Monitoring**: Systems with rapid status changes
4. **Low-Risk Services**: Where false positives don't cause major issues
5. **Development Environments**: Where users expect frequent changes
6. **API Endpoints**: With clear success/failure patterns

### When Manual Incidents Are Essential

1. **Customer-Facing Services**: Where communication is critical
2. **Complex Systems**: Where monitor failures don't directly map to user impact
3. **Multi-Region Services**: Where partial outages need careful explanation
4. **Planned Maintenance**: Where context about upcoming changes is needed
5. **Third-Party Dependencies**: Where issues may be outside your control
6. **Compliance Requirements**: Where audit trails and documentation are required

### Recommended Hybrid Approach

Based on the analysis, a hybrid approach provides the best balance:

1. **Automatic Component Status**: Use aggregation to update component status in real-time
2. **Manual Incident Creation**: Require human intervention to create incidents
3. **Smart Suggestions**: Suggest incident creation when aggregation detects issues
4. **Auto-Recovery**: Automatically resolve incidents when all monitors recover
5. **Tiered Responses**: Different thresholds for different severity levels

## Implementation Recommendations

### Phase 1: Enhance Current System (Immediate)

1. **Activate Status Aggregation**

   - Schedule regular aggregation updates (every 1-5 minutes)
   - Update component statuses based on monitor results
   - Display aggregate component status on public status pages

2. **Add Incident Suggestions**

   - Detect when component status changes from operational
   - Create "suggested incidents" that require human approval
   - Send notifications to relevant team members

3. **Implement Basic Automation**
   - Auto-resolve incidents when all monitors recover
   - Add incident templates for common issues
   - Improve monitor-to-component visibility

### Phase 2: Smart Automation (Medium-term)

1. **Contextual Aggregation**

   - Implement business hours vs. after-hours rules
   - Add weight adjustments based on monitor importance
   - Implement flapping detection to prevent alert fatigue

2. **Enhanced Incident Management**

   - Auto-escalate unanswered incidents
   - Implement incident severity classification
   - Add resolution time tracking and SLAs

3. **Integration Improvements**
   - Connect monitor alerts to incident suggestions
   - Implement automatic subscriber notifications
   - Add metrics on incident response times

### Phase 3: Advanced Features (Long-term)

1. **Machine Learning Integration**

   - Learn from manual incident creation patterns
   - Predict incident severity based on monitor patterns
   - Optimize aggregation weights based on user feedback

2. **Multi-Tier Status Pages**

   - Different views for different stakeholder groups
   - Automatic filtering of non-critical incidents
   - Custom aggregation rules per audience

3. **Advanced Communication**
   - Automatic status page updates during incidents
   - Integration with external communication tools
   - Predictive incident resolution times

## Security and Performance Considerations

### Security

1. **Incident Authorization**: Ensure only authorized users can create/update incidents
2. **Data Privacy**: Be careful about what information is exposed publicly
3. **Audit Trails**: Log all incident changes for compliance
4. **Access Control**: Different permissions for different user roles

### Performance

1. **Aggregation Frequency**: Balance between real-time updates and database load
2. **Caching**: Cache aggregated status to reduce database queries
3. **Background Processing**: Run aggregation in background jobs
4. **Database Optimization**: Ensure proper indexing for monitor/component relationships

## Conclusion

The current Supercheck architecture is well-positioned to implement a sophisticated hybrid approach to status page management. The existing aggregation service and manual incident system provide a solid foundation for both automatic status updates and human-curated incident communication.

**Recommendation**: Implement a hybrid approach that uses automatic aggregation for component status updates while maintaining manual incident creation for user communication. This provides the best balance of real-time information and human context.

**Next Steps**:

1. Activate the existing status aggregation service
2. Add incident suggestions based on aggregation results
3. Implement auto-resolution for recovered incidents
4. Collect user feedback and refine the approach

This approach leverages the existing infrastructure while providing immediate value to users, with a clear path for future enhancements based on real-world usage patterns.
