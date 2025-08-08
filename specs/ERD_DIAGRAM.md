
# Database Schema Design

## Entity Relationship Diagram

This diagram represents the complete database schema for the Supercheck application, based on the main app schema.

```mermaid
erDiagram
    USER {
        uuid id PK
        text name
        text email
        boolean emailVerified
        text image
        timestamp createdAt
        timestamp updatedAt
        text role
        boolean banned
        text banReason
        timestamp banExpires
    }
    
    ORGANIZATION {
        uuid id PK
        text name
        text slug
        text logo
        timestamp createdAt
        text metadata
    }
    
    MEMBER {
        uuid id PK
        uuid organizationId FK
        uuid userId FK
        text role
        timestamp createdAt
    }
    
    INVITATION {
        uuid id PK
        uuid organizationId FK
        text email
        text role
        text status
        timestamp expiresAt
        uuid inviterId FK
        text selectedProjects
    }
    
    PROJECTS {
        uuid id PK
        uuid organizationId FK
        varchar name
        varchar slug
        text description
        boolean isDefault
        varchar status
        timestamp createdAt
        timestamp updatedAt
    }
    
    PROJECT_MEMBERS {
        uuid id PK
        uuid userId FK
        uuid projectId FK
        varchar role
        timestamp createdAt
    }
    
    TESTS {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        uuid createdByUserId FK
        varchar title
        text description
        text script
        varchar priority
        varchar type
        timestamp createdAt
        timestamp updatedAt
    }
    
    JOBS {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        uuid createdByUserId FK
        varchar name
        text description
        varchar cronSchedule
        varchar status
        jsonb alertConfig
        timestamp lastRunAt
        timestamp nextRunAt
        varchar scheduledJobId
        timestamp createdAt
        timestamp updatedAt
    }
    
    JOB_TESTS {
        uuid jobId FK
        uuid testId FK
        integer orderPosition
    }
    
    RUNS {
        uuid id PK
        uuid jobId FK
        uuid projectId FK
        varchar status
        varchar duration
        timestamp startedAt
        timestamp completedAt
        jsonb artifactPaths
        text logs
        text errorDetails
        varchar trigger
        timestamp createdAt
        timestamp updatedAt
    }
    
    MONITORS {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        uuid createdByUserId FK
        varchar name
        text description
        varchar type
        varchar target
        integer frequencyMinutes
        boolean enabled
        varchar status
        jsonb config
        jsonb alertConfig
        timestamp lastCheckAt
        timestamp lastStatusChangeAt
        timestamp mutedUntil
        varchar scheduledJobId
        timestamp createdAt
        timestamp updatedAt
    }
    
    MONITOR_RESULTS {
        uuid id PK
        uuid monitorId FK
        timestamp checkedAt
        varchar status
        integer responseTimeMs
        jsonb details
        boolean isUp
        boolean isStatusChange
    }
    
    TAGS {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        uuid createdByUserId FK
        varchar name
        varchar color
        timestamp createdAt
        timestamp updatedAt
    }
    
    MONITOR_TAGS {
        uuid monitorId FK
        uuid tagId FK
        timestamp assignedAt
    }
    
    TEST_TAGS {
        uuid testId FK
        uuid tagId FK
        timestamp assignedAt
    }
    
    NOTIFICATION_PROVIDERS {
        uuid id PK
        uuid organizationId FK
        uuid projectId FK
        uuid createdByUserId FK
        varchar name
        varchar type
        jsonb config
        boolean isEnabled
        timestamp createdAt
        timestamp updatedAt
    }
    
    MONITOR_NOTIFICATION_SETTINGS {
        uuid monitorId FK
        uuid notificationProviderId FK
        timestamp createdAt
    }
    
    JOB_NOTIFICATION_SETTINGS {
        uuid jobId FK
        uuid notificationProviderId FK
        timestamp createdAt
    }
    
    REPORTS {
        uuid id PK
        uuid organizationId FK
        uuid createdByUserId FK
        varchar entityType
        uuid entityId
        varchar reportPath
        varchar status
        varchar s3Url
        timestamp createdAt
        timestamp updatedAt
    }
    
    ALERTS {
        uuid id PK
        uuid organizationId FK
        uuid monitorId FK
        boolean enabled
        jsonb notificationProviders
        boolean alertOnFailure
        boolean alertOnRecovery
        boolean alertOnSslExpiration
        boolean alertOnSuccess
        boolean alertOnTimeout
        integer failureThreshold
        integer recoveryThreshold
        text customMessage
        timestamp createdAt
        timestamp updatedAt
    }
    
    ALERT_HISTORY {
        uuid id PK
        text message
        varchar type
        varchar target
        varchar targetType
        uuid monitorId FK
        uuid jobId FK
        varchar provider
        varchar status
        timestamp sentAt
        text errorMessage
    }
    
    API_KEYS {
        uuid id PK
        text name
        text start
        text prefix
        text key
        uuid userId FK
        uuid jobId FK
        uuid projectId FK
        text refillInterval
        text refillAmount
        timestamp lastRefillAt
        boolean enabled
        boolean rateLimitEnabled
        text rateLimitTimeWindow
        text rateLimitMax
        text requestCount
        text remaining
        timestamp lastRequest
        timestamp expiresAt
        timestamp createdAt
        timestamp updatedAt
        text permissions
        text metadata
    }
    
    SESSION {
        uuid id PK
        timestamp expiresAt
        text token
        timestamp createdAt
        timestamp updatedAt
        text ipAddress
        text userAgent
        uuid userId FK
        uuid activeOrganizationId FK
        uuid activeProjectId FK
        text impersonatedBy
    }
    
    ACCOUNT {
        uuid id PK
        text accountId
        text providerId
        uuid userId FK
        text accessToken
        text refreshToken
        text idToken
        timestamp accessTokenExpiresAt
        timestamp refreshTokenExpiresAt
        text scope
        text password
        timestamp createdAt
        timestamp updatedAt
    }
    
    VERIFICATION {
        uuid id PK
        text identifier
        text value
        timestamp expiresAt
        timestamp createdAt
        timestamp updatedAt
    }
    
    AUDIT_LOGS {
        uuid id PK
        uuid userId FK
        uuid organizationId FK
        varchar action
        jsonb details
        timestamp createdAt
    }
    
    NOTIFICATIONS {
        uuid id PK
        uuid userId FK
        varchar type
        jsonb content
        varchar status
        timestamp sentAt
        timestamp createdAt
    }
    
    %% Core Relationships
    USER ||--o{ MEMBER : "belongs to"
    USER ||--o{ INVITATION : "invites"
    USER ||--o{ PROJECT_MEMBERS : "member of"
    USER ||--o{ SESSION : "has"
    USER ||--o{ ACCOUNT : "linked to"
    USER ||--o{ API_KEYS : "owns"
    USER ||--o{ NOTIFICATIONS : "receives"
    USER ||--o{ AUDIT_LOGS : "performs"
    
    ORGANIZATION ||--o{ MEMBER : "has members"
    ORGANIZATION ||--o{ INVITATION : "has invitations"
    ORGANIZATION ||--o{ PROJECTS : "contains"
    ORGANIZATION ||--o{ TESTS : "owns"
    ORGANIZATION ||--o{ JOBS : "owns"
    ORGANIZATION ||--o{ MONITORS : "owns"
    ORGANIZATION ||--o{ TAGS : "owns"
    ORGANIZATION ||--o{ NOTIFICATION_PROVIDERS : "configures"
    ORGANIZATION ||--o{ REPORTS : "generates"
    ORGANIZATION ||--o{ ALERTS : "manages"
    ORGANIZATION ||--o{ AUDIT_LOGS : "tracks"
    
    PROJECTS ||--o{ PROJECT_MEMBERS : "has members"
    PROJECTS ||--o{ TESTS : "contains"
    PROJECTS ||--o{ JOBS : "contains"
    PROJECTS ||--o{ MONITORS : "contains"
    PROJECTS ||--o{ TAGS : "organizes"
    PROJECTS ||--o{ NOTIFICATION_PROVIDERS : "uses"
    PROJECTS ||--o{ RUNS : "executes"
    PROJECTS ||--o{ API_KEYS : "accesses"
    
    %% Test & Job Relationships
    JOBS ||--o{ JOB_TESTS : "includes"
    TESTS ||--o{ JOB_TESTS : "used in"
    JOBS ||--o{ RUNS : "executes"
    JOBS ||--o{ ALERT_HISTORY : "triggers"
    JOBS ||--o{ JOB_NOTIFICATION_SETTINGS : "notifies via"
    JOBS ||--o{ API_KEYS : "accessed by"
    
    %% Monitor Relationships
    MONITORS ||--o{ MONITOR_RESULTS : "produces"
    MONITORS ||--o{ ALERTS : "configured for"
    MONITORS ||--o{ ALERT_HISTORY : "triggers"
    MONITORS ||--o{ MONITOR_NOTIFICATION_SETTINGS : "notifies via"
    MONITORS ||--o{ MONITOR_TAGS : "tagged with"
    
    %% Tag Relationships
    TAGS ||--o{ MONITOR_TAGS : "applied to monitors"
    TAGS ||--o{ TEST_TAGS : "applied to tests"
    TESTS ||--o{ TEST_TAGS : "tagged with"
    
    %% Notification Relationships
    NOTIFICATION_PROVIDERS ||--o{ MONITOR_NOTIFICATION_SETTINGS : "used by monitors"
    NOTIFICATION_PROVIDERS ||--o{ JOB_NOTIFICATION_SETTINGS : "used by jobs"
    
    %% Session & Auth Relationships
    SESSION ||--o{ ORGANIZATION : "active org"
    SESSION ||--o{ PROJECTS : "active project"
```

## Schema Notes

### Key Features
- **Multi-tenant Architecture**: Organizations contain projects, users are members of organizations
- **Project-based Access Control**: Users can have different roles in different projects
- **Comprehensive Monitoring**: HTTP/website/ping/port/heartbeat monitoring with results tracking
- **Test Automation**: Tests can be grouped into jobs with cron scheduling
- **Flexible Notifications**: Multiple notification providers (email, Slack, webhooks, etc.)
- **Audit Trail**: Complete audit logging of user actions
- **API Access**: Fine-grained API key management with rate limiting

### Role Hierarchy
- **Organization Level**: `org_owner`, `org_admin`, `project_admin`, `project_editor`, `project_viewer`
- **Project Level**: `project_admin`, `project_editor`, `project_viewer`

### Data Types
- All IDs use UUID for better security and distribution
- JSON fields for flexible configuration storage
- Comprehensive timestamp tracking for audit purposes
