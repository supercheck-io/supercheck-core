# Supercheck - Platform Demo

## 🎯 Overview
**Supercheck** is a comprehensive end-to-end testing and monitoring platform built with a distributed, scalable architecture.

---

## 🏗️ System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        FE[Frontend Service<br/>Next.js]
        FE --> |UI/UX| UI[User Interface]
        FE --> |API Routes| API[REST APIs]
        FE --> |Job Scheduling| JSCHED[Job Scheduler]
        FE --> |Monitor Scheduling| MSCHED[Monitor Scheduler]
        FE --> |Migrations| DB_MIG[DB Migrations]
    end
    
    subgraph "Processing Layer"
        WS[Worker Service<br/>NestJS]
        WS --> |Test Execution| TE[Playwright Tests]
        WS --> |Monitor Execution| ME[HTTP/SSL/Ping/Heartbeat]
        WS --> |Queue Processing| QP[BullMQ Processors]
        WS --> |Capacity Management| CM[Resource Limits]
        WS --> |Notifications| NS[Alert Service]
    end
    
    subgraph "Queue Layer"
        RD[(Redis<br/>BullMQ)]
        RD --> |Job Queue| JQ[Test/Job Execution]
        RD --> |Monitor Queue| MQ[Monitor Execution]
        RD --> |Scheduler Queues| SQ[Job/Monitor Schedulers]
        RD --> |Notification Queue| NQ[Heartbeat Notifications]
    end
    
    subgraph "Storage Layer"
        PG[(PostgreSQL<br/>Database)]
        MO[(MinIO<br/>Object Storage)]
        PG --> |Tables| TABLES[Tests/Jobs/Monitors/Results]
        MO --> |Artifacts| ARTS[Reports/Traces/Screenshots]
    end
    
    FE <--> |API Calls| WS
    FE <--> |Database Access| PG
    FE <--> |Queue Management| RD
    WS <--> |Job Processing| RD
    WS <--> |Data Persistence| PG
    WS <--> |Artifact Storage| MO
    
    classDef frontend fill:#e1f5fe
    classDef worker fill:#f3e5f5
    classDef queue fill:#fff3e0
    classDef storage fill:#e8f5e8
    
    class FE,UI,API,JSCHED,MSCHED,DB_MIG frontend
    class WS,TE,ME,QP,CM,NS worker
    class RD,JQ,MQ,SQ,NQ queue
    class PG,MO,TABLES,ARTS storage
```

### Component Breakdown

#### 🎨 Frontend Service (Next.js)
- **Location**: `/app`
- **Responsibilities**:
  - User interface and experience
  - API routes for data operations
  - Job scheduling and management
  - Database migrations
  - Real-time updates via SSE

#### ⚙️ Worker Service (NestJS)
- **Location**: `/runner`
- **Responsibilities**:
  - Playwright test execution
  - Parallel processing with capacity management
  - Queue job processing
  - Test artifact generation

#### 🗄️ Infrastructure Layer
- **PostgreSQL**: Primary database with Drizzle ORM
- **Redis**: Job queuing with BullMQ
- **MinIO**: S3-compatible storage for test artifacts

---

## 🚀 Core Features

### 1. **End-to-End Testing**
- Playwright-based browser automation
- Parallel test execution
- Configurable timeouts and retries
- Real-time status updates
- Comprehensive test reports

### 2. **Job Scheduling & Management**
- Cron-based scheduling
- Manual job triggers
- API key authentication
- Job history tracking
- Queue-based execution

### 3. **Monitoring System**
- HTTP/HTTPS endpoint monitoring
- Heartbeat monitoring
- Response time metrics
- Uptime calculations
- Availability tracking

### 4. **Alerting & Notifications**
- Multi-channel notifications (email, webhooks)
- Rule-based alerting
- Custom notification conditions
- Provider quota management

### 5. **Multi-Tenant Support**
- Organization-based isolation
- Member management
- Role-based access control
- Secure API access

---

## 🛠️ Technology Stack

### Backend Technologies
- **Next.js 14**: Full-stack React framework
- **NestJS**: Scalable Node.js framework
- **Drizzle ORM**: Type-safe database operations
- **Better Auth**: Authentication system
- **BullMQ**: Job queue management

### Frontend Technologies
- **React 18**: Component-based UI
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first styling
- **Server-Sent Events**: Real-time updates

### Infrastructure
- **PostgreSQL**: Relational database
- **Redis**: In-memory data store
- **MinIO**: Object storage
- **Docker**: Containerization
- **Playwright**: Browser automation

---

## 🗄️ Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        text email
        text name
        boolean emailVerified
        text image
        timestamp createdAt
        timestamp updatedAt
        text role
        boolean banned
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
        uuid userId FK
        uuid organizationId FK
        text role
        uuid teamId FK
        timestamp createdAt
    }
    
    TEST {
        uuid id PK
        varchar title
        text description
        text script
        varchar priority
        varchar type
        uuid organizationId FK
        uuid createdByUserId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    JOB {
        uuid id PK
        varchar name
        text description
        varchar cronSchedule
        varchar status
        jsonb alertConfig
        timestamp lastRunAt
        timestamp nextRunAt
        varchar scheduledJobId
        uuid organizationId FK
        uuid createdByUserId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    JOB_TESTS {
        uuid jobId FK
        uuid testId FK
        integer orderPosition
    }
    
    RUN {
        uuid id PK
        uuid jobId FK
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
    
    MONITOR {
        uuid id PK
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
        uuid organizationId FK
        uuid createdByUserId FK
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
    
    NOTIFICATION_PROVIDERS {
        uuid id PK
        varchar name
        varchar type
        jsonb config
        boolean isEnabled
        uuid organizationId FK
        uuid createdByUserId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    REPORTS {
        uuid id PK
        varchar entityType
        uuid entityId
        varchar reportPath
        varchar status
        varchar s3Url
        uuid organizationId FK
        uuid createdByUserId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    API_KEYS {
        uuid id PK
        varchar name
        varchar keyHash
        varchar keyPrefix
        boolean enabled
        text permissions
        timestamp expiresAt
        timestamp lastUsedAt
        uuid organizationId FK
        uuid createdByUserId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    USER ||--o{ MEMBER : "belongs to"
    ORGANIZATION ||--o{ MEMBER : "has"
    ORGANIZATION ||--o{ TEST : "owns"
    ORGANIZATION ||--o{ JOB : "owns"
    ORGANIZATION ||--o{ MONITOR : "owns"
    ORGANIZATION ||--o{ NOTIFICATION_PROVIDERS : "owns"
    ORGANIZATION ||--o{ REPORTS : "owns"
    ORGANIZATION ||--o{ API_KEYS : "owns"
    JOB ||--o{ JOB_TESTS : "includes"
    TEST ||--o{ JOB_TESTS : "used in"
    JOB ||--o{ RUN : "executes"
    MONITOR ||--o{ MONITOR_RESULTS : "checks"
```

---

## 📊 Data Flow

### Test Execution Flow

```mermaid
flowchart LR
    A[User Trigger<br/>Manual/API/Schedule] --> B[Test/Job API<br/>Next.js Routes]
    B --> C[Capacity Verification<br/>Queue Stats Check]
    C --> D[Job Creation<br/>Database Insert]
    D --> E[Queue Addition<br/>BullMQ Redis]
    E --> F[Test Execution Processor<br/>NestJS Worker]
    F --> G[Execution Service<br/>Test Orchestration]
    G --> H[Playwright Runner<br/>Browser Automation]
    H --> I[Report Generation<br/>HTML Reports/Traces]
    I --> J[Artifact Upload<br/>MinIO S3 Storage]
    J --> K[Database Update<br/>Status & Results]
    K --> L[Redis Publish<br/>Status Events]
    L --> M[SSE Stream<br/>Real-time Updates]
    
    subgraph "Frontend Layer"
        A
        B
        M
    end
    
    subgraph "Validation Layer"
        C
        D
    end
    
    subgraph "Queue Layer"
        E
        F
    end
    
    subgraph "Execution Layer"
        G
        H
        I
    end
    
    subgraph "Storage Layer"
        J
        K
        L
    end
    
    classDef frontend fill:#e1f5fe
    classDef validation fill:#fff8e1
    classDef queue fill:#fff3e0
    classDef exec fill:#f3e5f5
    classDef storage fill:#e8f5e8
    
    class A,B,M frontend
    class C,D validation
    class E,F queue
    class G,H,I exec
    class J,K,L storage
```

### Monitoring Flow

```mermaid
flowchart LR
    A[User/API Trigger<br/>Manual/Schedule] --> B[Monitor API<br/>Next.js Routes]
    B --> C[Monitor Service<br/>Create/Update Config]
    C --> D[Monitor Scheduler<br/>Schedule Setup]
    D --> E[Monitor Scheduler Queue<br/>BullMQ Redis]
    E --> F[Monitor Scheduler Processor<br/>NestJS Worker]
    F --> G[Add Execution Job<br/>One-time Job]
    G --> H[Monitor Execution Queue<br/>BullMQ Redis]
    H --> I[Monitor Processor<br/>NestJS Worker]
    I --> J[Monitor Service<br/>Execute Monitor]
    J --> K{Monitor Type}
    K --> |HTTP/Website| L[HTTP Request<br/>Status/Response/SSL Check]
    K --> |Ping Host| M[ICMP Ping<br/>Platform Detection]
    K --> |Port Check| N[TCP/UDP Connection<br/>Socket Test]
    K --> |Heartbeat| O[Missed Ping Check<br/>Grace Period Logic]
    L --> P[Result Processing<br/>Status Determination]
    M --> P
    N --> P
    O --> P
    P --> Q[Save Monitor Result<br/>Database Update]
    Q --> R[Monitor Status Update<br/>Last Check Time]
    R --> S[Status Change Detection<br/>Previous vs Current]
    S --> T[Threshold Evaluation<br/>Consecutive Failures/Success]
    T --> U[Monitor Alert Service<br/>Notification Logic]
    U --> V[Notification Service<br/>Multi-Provider Dispatch]
    V --> W[Provider Delivery<br/>Email/Slack/Webhook/etc]
    W --> X[Alert History<br/>Audit Trail]
    
    subgraph "Frontend Layer"
        A
        B
        C
    end
    
    subgraph "Scheduling Layer"
        D
        E
        F
        G
    end
    
    subgraph "Execution Layer"
        H
        I
        J
        K
        L
        M
        N
        O
    end
    
    subgraph "Analysis Layer"
        P
        Q
        R
        S
        T
    end
    
    subgraph "Notification Layer"
        U
        V
        W
        X
    end
    
    classDef frontend fill:#e1f5fe
    classDef schedule fill:#fff3e0
    classDef exec fill:#f3e5f5
    classDef analysis fill:#e8f5e8
    classDef delivery fill:#fce4ec
    
    class A,B,C frontend
    class D,E,F,G schedule
    class H,I,J,K,L,M,N,O exec
    class P,Q,R,S,T analysis
    class U,V,W,X delivery
```

---

## 🎭 Demo Scenarios & User Workflows

### 1. **Creating and Running a Test**

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API Routes
    participant DB as Database
    participant Q as Job Queue
    participant W as Worker
    participant S as Storage

    U->>FE: Navigate to Tests
    FE->>API: GET /api/tests
    API->>DB: Query tests
    DB-->>API: Return tests
    API-->>FE: Test list
    FE-->>U: Display tests

    U->>FE: Create new test
    FE->>API: POST /api/tests
    API->>DB: Insert test
    DB-->>API: Test created
    API-->>FE: Success response
    FE-->>U: Test created

    U->>FE: Run test manually
    FE->>API: POST /api/jobs
    API->>Q: Add job to queue
    API->>DB: Insert job record
    API-->>FE: Job queued
    
    Q->>W: Pick up job
    W->>DB: Update job status
    W->>W: Execute Playwright test
    W->>S: Store artifacts
    W->>DB: Update results
    W-->>FE: SSE status update
    FE-->>U: Real-time updates
```

### 2. **Setting Up Monitoring**

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API Routes
    participant DB as Database
    participant SCHED as Monitor Scheduler
    participant MQ as Monitor Queue
    participant W as Worker Service
    participant ALERT as Alert Service
    participant NOTIFY as Notification Service

    U->>FE: Configure monitor
    FE->>API: POST /api/monitors
    API->>DB: Insert monitor config
    API->>SCHED: Schedule monitor
    SCHED->>MQ: Add to scheduler queue
    DB-->>API: Monitor created
    API-->>FE: Success
    FE-->>U: Monitor active

    loop Monitor Execution
        MQ->>MQ: Trigger scheduled check
        MQ->>W: Execute monitor job
        W->>W: Perform check (HTTP/SSL/Ping/Heartbeat)
        W->>DB: Store monitor result
        W->>ALERT: Check status change
        
        alt Status changed & alerts enabled
            ALERT->>DB: Get notification providers
            ALERT->>NOTIFY: Send notifications
            NOTIFY->>DB: Record alert history
            NOTIFY-->>U: Email/Webhook alert
        end
    end
```

### 3. **Organization Management**

```mermaid
sequenceDiagram
    participant OWNER as Org Owner
    participant MEMBER as New Member
    participant FE as Frontend
    participant API as API Routes
    participant DB as Database
    participant EMAIL as Email Service

    OWNER->>FE: Invite member
    FE->>API: POST /api/organizations/invite
    API->>DB: Create invitation
    API->>EMAIL: Send invite email
    EMAIL-->>MEMBER: Invitation email
    
    MEMBER->>FE: Accept invitation
    FE->>API: POST /api/organizations/accept
    API->>DB: Update member status
    API->>DB: Grant permissions
    DB-->>API: Member added
    API-->>FE: Success
    FE-->>MEMBER: Access granted
```

---

## 📈 Scalability & Performance

### Horizontal Scaling
- **Worker Scaling**: Multiple NestJS workers
- **Queue Distribution**: Redis-based job distribution
- **Capacity Management**: Configurable limits
- **Resource Isolation**: Container-based deployment

### Performance Features
- **Parallel Execution**: Multiple tests simultaneously
- **Artifact Caching**: MinIO with presigned URLs
- **Database Optimization**: Indexed queries
- **Memory Management**: Configurable timeouts

---

## 🔒 Security Features

### Authentication & Authorization
- Better Auth integration
- Session management
- API key authentication
- Role-based access control

### Infrastructure Security
- Redis authentication
- Database connection pooling
- Environment variable management
- Secure artifact storage

---

## 🚀 Deployment Architecture

### Container Deployment Diagram

```mermaid
graph TB
    subgraph "Load Balancer / Reverse Proxy"
        LB[Nginx/Traefik<br/>Load Balancer]
    end
    
    subgraph "Application Tier"
        APP1[App Container 1<br/>Next.js<br/>Port 3000]
        APP2[App Container 2<br/>Next.js<br/>Port 3000]
        WRK1[Worker Container 1<br/>NestJS<br/>Background Jobs]
        WRK2[Worker Container 2<br/>NestJS<br/>Background Jobs]
    end
    
    subgraph "Data Tier"
        PG[(PostgreSQL<br/>Database<br/>Port 5432)]
        RD[(Redis<br/>Job Queue<br/>Port 6379)]
        MIO[(MinIO<br/>Object Storage<br/>Ports 9000/9001)]
    end
    
    subgraph "Monitoring & Logging"
        MON[Monitoring<br/>Prometheus/Grafana]
        LOG[Logging<br/>Docker Logs]
    end
    
    LB --> APP1
    LB --> APP2
    
    APP1 --> PG
    APP1 --> RD
    APP1 --> MIO
    
    APP2 --> PG
    APP2 --> RD
    APP2 --> MIO
    
    WRK1 --> PG
    WRK1 --> RD
    WRK1 --> MIO
    
    WRK2 --> PG
    WRK2 --> RD
    WRK2 --> MIO
    
    MON -.-> APP1
    MON -.-> APP2
    MON -.-> WRK1
    MON -.-> WRK2
    
    LOG -.-> APP1
    LOG -.-> APP2
    LOG -.-> WRK1
    LOG -.-> WRK2
    
    classDef app fill:#e1f5fe
    classDef worker fill:#f3e5f5
    classDef data fill:#e8f5e8
    classDef infra fill:#fff3e0
    classDef monitor fill:#fce4ec
    
    class APP1,APP2 app
    class WRK1,WRK2 worker
    class PG,RD,MIO data
    class LB infra
    class MON,LOG monitor
```

### Multi-Architecture Support

```mermaid
flowchart LR
    subgraph "Development"
        DEV[Developer<br/>Code Changes]
    end
    
    subgraph "CI/CD Pipeline"
        GHA[GitHub Actions<br/>Build Pipeline]
        BUILDX[Docker Buildx<br/>Multi-arch Builder]
    end
    
    subgraph "Registry"
        GHCR[GitHub Container Registry<br/>ghcr.io]
    end
    
    subgraph "Target Platforms"
        AMD64[Linux AMD64<br/>Intel/AMD Servers]
        ARM64[Linux ARM64<br/>Apple Silicon/ARM]
    end
    
    DEV --> GHA
    GHA --> BUILDX
    BUILDX --> GHCR
    GHCR --> AMD64
    GHCR --> ARM64
    
    classDef dev fill:#e1f5fe
    classDef ci fill:#f3e5f5
    classDef registry fill:#e8f5e8
    classDef platform fill:#fff3e0
    
    class DEV dev
    class GHA,BUILDX ci
    class GHCR registry
    class AMD64,ARM64 platform
```

### Production Deployment Features
- **Registry**: GitHub Container Registry
- **Platforms**: Linux AMD64/ARM64
- **Health Checks**: Service readiness validation
- **Migration Handling**: Automatic database updates
- **Scaling**: Horizontal container scaling
- **Load Balancing**: Multi-instance load distribution

---

## 📋 Key Metrics & Insights

### Test Execution Metrics
- Test success/failure rates
- Execution duration trends
- Resource utilization
- Queue processing times

### Monitoring Metrics
- Endpoint availability
- Response time trends
- Alert frequency
- Notification delivery rates

### System Metrics
- Worker capacity utilization
- Database performance
- Queue depth analysis
- Storage usage patterns

---

## 🎪 Live Demo Points

1. **Dashboard Overview**: System status and recent activity
2. **Test Creation**: Step-by-step test setup
3. **Job Execution**: Real-time job monitoring
4. **Monitor Configuration**: Uptime monitoring setup
5. **Alert Management**: Notification rule configuration
6. **Reporting**: Test results and monitoring reports
7. **Organization**: Multi-tenant features
8. **API Integration**: Programmatic access examples

---

## 🔗 Quick Start Commands

```bash
# Production deployment (default)
export DOMAIN=your-domain.com
export REDIS_PASSWORD=your-secure-redis-password
docker-compose up -d

# View logs
docker-compose logs -f app
docker-compose logs -f worker

# Development setup (local)
cd app && npm run dev
cd runner && npm run dev

# Build multi-arch images
./scripts/docker-images.sh
```

---

## 📞 Support & Documentation

- **GitHub**: Repository with full source code
- **Docker Hub**: Pre-built multi-arch images
- **Documentation**: Comprehensive setup guides
- **API Reference**: OpenAPI specifications