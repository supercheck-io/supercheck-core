# Supercheck Deployment Architecture Diagrams

This document contains comprehensive architectural diagrams for all Supercheck deployment options, providing visual representations of how the platform can be deployed across different infrastructure and orchestration platforms.

## 📋 Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Component Overview](#component-overview)
- [Docker Compose Architecture](#docker-compose-architecture)
- [Docker Swarm Architecture](#docker-swarm-architecture)
- [Kubernetes Architecture](#kubernetes-architecture)
- [Windows Server Architecture](#windows-server-architecture)
- [Cloud Provider Architectures](#cloud-provider-architectures)
- [Network Architecture](#network-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Scaling Architectures](#scaling-architectures)
- [Security Architecture](#security-architecture)

## 🏗️ High-Level Architecture

### System Overview

```mermaid
graph TB
    subgraph "External Users"
        Users[Users & API Clients]
    end

    subgraph "Edge Layer"
        CDN[CDN / CloudFlare]
        WAF[Web Application Firewall]
        LB[Load Balancer]
    end

    subgraph "Application Layer"
        App[Supercheck Web App<br/>Next.js]
        API[API Endpoints<br/>GraphQL/REST]
        Auth[Authentication<br/>Better Auth]
    end

    subgraph "Processing Layer"
        Worker[Test Workers<br/>NestJS]
        Queue[Job Queue<br/>Redis/BullMQ]
        Scheduler[Job Scheduler<br/>Cron]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Primary Database)]
        Cache[(Redis<br/>Caching)]
        Storage[(S3/MinIO<br/>File Storage)]
    end

    subgraph "External Services"
        Email[SMTP<br/>Notifications]
        AI[AI Service<br/>OpenAI/Claude]
        Monitor[Monitoring<br/>Prometheus/Grafana]
    end

    Users --> CDN
    CDN --> WAF
    WAF --> LB
    LB --> App
    LB --> API

    App --> Auth
    App --> DB
    App --> Cache
    App --> Storage
    App --> Queue

    API --> Auth
    API --> DB
    API --> Cache
    API --> Queue

    Queue --> Worker
    Worker --> DB
    Worker --> Cache
    Worker --> Storage
    Worker --> AI

    Scheduler --> Queue

    App --> Email
    Worker --> Email

    App --> Monitor
    Worker --> Monitor
    DB --> Monitor
```

### Multi-Cluster Architecture

```mermaid
graph TB
    subgraph "Global Traffic Manager"
        GTM[Global Load Balancer<br/>CloudFlare/AWS Route 53]
    end

    subgraph "Region 1 - US East"
        LB1[Regional Load Balancer]
        App1[App Cluster 1]
        Worker1[Worker Cluster 1]
        DB1[(Primary DB)]
        Redis1[(Redis Cluster)]
    end

    subgraph "Region 2 - EU West"
        LB2[Regional Load Balancer]
        App2[App Cluster 2]
        Worker2[Worker Cluster 2]
        DB2[(Read Replica)]
        Redis2[(Redis Replica)]
    end

    subgraph "Region 3 - APAC"
        LB3[Regional Load Balancer]
        App3[App Cluster 3]
        Worker3[Worker Cluster 3]
        DB3[(Read Replica)]
        Redis3[(Redis Replica)]
    end

    subgraph "Global Services"
        S3[Global S3 Storage]
        AI[AI Services]
        Email[Email Services]
    end

    GTM --> LB1
    GTM --> LB2
    GTM --> LB3

    LB1 --> App1
    LB2 --> App2
    LB3 --> App3

    App1 --> Worker1
    App2 --> Worker2
    App3 --> Worker3

    App1 --> DB1
    App2 --> DB2
    App3 --> DB3

    DB1 --> DB2
    DB1 --> DB3

    App1 --> Redis1
    App2 --> Redis2
    App3 --> Redis3

    Redis1 --> Redis2
    Redis1 --> Redis3

    App1 --> S3
    App2 --> S3
    App3 --> S3

    Worker1 --> AI
    Worker2 --> AI
    Worker3 --> AI

    App1 --> Email
    App2 --> Email
    App3 --> Email
```

## 🧩 Component Overview

### Core Components

```mermaid
graph LR
    subgraph "Frontend Components"
        UI[React UI Components]
        Dashboard[Dashboard]
        TestEditor[Test Editor]
        MonitorPanel[Monitor Panel]
        JobScheduler[Job Scheduler UI]
    end

    subgraph "Backend Components"
        API1[REST API]
        API2[GraphQL API]
        Auth1[Authentication Service]
        Validation[Validation Service]
    end

    subgraph "Worker Components"
        Executor[Test Executor]
        Playwright[Playwright Engine]
        Browser[Browser Pool]
        Reporter[Report Generator]
    end

    subgraph "Infrastructure Components"
        Queue1[Job Queue]
        Cache1[Cache Layer]
        Storage1[File Storage]
        Database[Database]
    end

    UI --> API1
    Dashboard --> API2
    TestEditor --> API1
    MonitorPanel --> API2
    JobScheduler --> API1

    API1 --> Auth1
    API2 --> Validation
    Auth1 --> Database
    Validation --> Cache1

    Queue1 --> Executor
    Executor --> Playwright
    Playwright --> Browser
    Browser --> Reporter
    Reporter --> Storage1

    Executor --> Database
    Reporter --> Cache1
```

## 🐳 Docker Compose Architecture

### Single Server Deployment

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "Docker Engine"
            subgraph "Network: supercheck-network"
                App[Next.js App<br/>Port: 3000]
                Worker[NestJS Worker<br/>Port: 3001]
                PostgreSQL[PostgreSQL<br/>Port: 5432]
                Redis[Redis<br/>Port: 6379]
                MinIO[MinIO<br/>Port: 9000/9001]
            end

            subgraph "Network: traefik-network"
                Traefik[Traefik<br/>Port: 80/443]
            end
        end

        subgraph "Docker Volumes"
            PG_Data[(postgres-data)]
            Redis_Data[(redis-data)]
            MinIO_Data[(minio-data)]
            Reports[(reports)]
        end
    end

    subgraph "External Access"
        Internet[Internet]
        Users[Users]
    end

    Internet --> Traefik
    Traefik --> App
    App --> Worker
    App --> PostgreSQL
    App --> Redis
    App --> MinIO
    Worker --> PostgreSQL
    Worker --> Redis
    Worker --> MinIO

    PostgreSQL --> PG_Data
    Redis --> Redis_Data
    MinIO --> MinIO_Data
    Worker --> Reports

    Users --> Internet
```

### Docker Compose with External Services

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "Docker Engine"
            App[Next.js App<br/>Port: 3000]
            Worker[NestJS Worker<br/>Port: 3001]
            Traefik[Traefik<br/>Port: 80/443]
        end
    end

    subgraph "External Services"
        Neon[(Neon PostgreSQL)]
        RedisCloud[(Redis Cloud)]
        S3[(AWS S3)]
        Email[SMTP Service]
        AI[OpenAI API]
    end

    subgraph "External Access"
        Internet[Internet]
        Users[Users]
    end

    Internet --> Traefik
    Traefik --> App
    App --> Worker
    App --> Neon
    App --> RedisCloud
    App --> S3
    Worker --> Neon
    Worker --> RedisCloud
    Worker --> S3
    Worker --> AI
    App --> Email

    Users --> Internet
```

## 🐙 Docker Swarm Architecture

### Multi-Node Cluster

```mermaid
graph TB
    subgraph "Docker Swarm Cluster"
        subgraph "Manager Nodes (HA)"
            M1[Manager 1<br/>Leader<br/>- Scheduling<br/>- Orchestration]
            M2[Manager 2<br/>Reachable<br/>- Raft Consensus]
            M3[Manager 3<br/>Reachable<br/>- Failover]
        end

        subgraph "Worker Nodes"
            W1[Worker 1<br/>App + Workers<br/>- Traefik<br/>- 2x App<br/>- 4x Workers]
            W2[Worker 2<br/>Workers Only<br/>- 6x Workers]
            W3[Worker 3<br/>Workers Only<br/>- 6x Workers]
            W4[Worker 4<br/>Workers Only<br/>- 6x Workers]
            W5[Worker 5<br/>Workers Only<br/>- 6x Workers]
        end

        subgraph "Swarm Networks"
            Net1[supercheck-network<br/>Overlay Network]
            Net2[traefik-network<br/>Ingress Network]
        end
    end

    subgraph "External Services"
        Neon[(Neon DB)]
        RedisCloud[(Redis Cloud)]
        S3[(AWS S3)]
        Monitor[Prometheus/Grafana]
    end

    subgraph "Load Balancer"
        LB[External LB<br/>Hetzner/AWS]
    end

    subgraph "Users"
        Internet[Internet Users]
    end

    M1 --> M2
    M1 --> M3
    M1 --> W1
    M2 --> W2
    M3 --> W3
    W1 --> W4
    W1 --> W5

    Internet --> LB
    LB --> M1
    LB --> M2
    LB --> M3

    W1 --> Neon
    W1 --> RedisCloud
    W1 --> S3
    W2 --> Neon
    W2 --> RedisCloud
    W2 --> S3
    W3 --> Neon
    W3 --> RedisCloud
    W3 --> S3
    W4 --> Neon
    W4 --> RedisCloud
    W4 --> S3
    W5 --> Neon
    W5 --> RedisCloud
    W5 --> S3

    W1 --> Monitor
```

### Docker Swarm Service Distribution

```mermaid
graph TB
    subgraph "Swarm Services"
        subgraph "App Service"
            App1[App Instance 1<br/>Manager Node]
            App2[App Instance 2<br/>Worker Node 1]
            App3[App Instance 3<br/>Worker Node 2]
        end

        subgraph "Worker Service"
            Worker1[Worker 1<br/>Worker Node 1]
            Worker2[Worker 2<br/>Worker Node 1]
            Worker3[Worker 3<br/>Worker Node 2]
            Worker4[Worker 4<br/>Worker Node 2]
            Worker5[Worker 5<br/>Worker Node 3]
            Worker6[Worker 6<br/>Worker Node 3]
            Worker7[Worker 7<br/>Worker Node 4]
            Worker8[Worker 8<br/>Worker Node 4]
            Worker9[Worker 9<br/>Worker Node 5]
            Worker10[Worker 10<br/>Worker Node 5]
        end

        subgraph "Support Services"
            Traefik[Traefik<br/>Manager Nodes]
            Monitor[Monitoring<br/>Worker Node 1]
        end
    end

    subgraph "Load Balancing"
        LB[Traefik Load Balancer]
    end

    LB --> App1
    LB --> App2
    LB --> App3

    App1 --> Worker1
    App1 --> Worker2
    App2 --> Worker3
    App2 --> Worker4
    App3 --> Worker5
    App3 --> Worker6

    App1 --> Worker7
    App1 --> Worker8
    App2 --> Worker9
    App2 --> Worker10
```

## ☸️ Kubernetes Architecture

### K3s Cluster Architecture

```mermaid
graph TB
    subgraph "K3s Cluster"
        subgraph "Control Plane"
            API[API Server<br/>:6443]
            Scheduler[Scheduler]
            Controller[Controller Manager]
            etcd[(etcd<br/>Data Store)]
        end

        subgraph "Worker Nodes"
            Node1[Worker Node 1<br/>kubelet<br/>containerd]
            Node2[Worker Node 2<br/>kubelet<br/>containerd]
            Node3[Worker Node 3<br/>kubelet<br/>containerd]
        end

        subgraph "Pods"
            subgraph "App Pods"
                AppPod1[App Pod 1<br/>Next.js]
                AppPod2[App Pod 2<br/>Next.js]
            end

            subgraph "Worker Pods"
                WorkerPod1[Worker Pod 1<br/>NestJS]
                WorkerPod2[Worker Pod 2<br/>NestJS]
                WorkerPod3[Worker Pod 3<br/>NestJS]
                WorkerPod4[Worker Pod 4<br/>NestJS]
            end

            subgraph "System Pods"
                TraefikPod[Traefik Pod<br/>Ingress Controller]
                DNSPod[CoreDNS Pod<br/>DNS Service]
            end
        end

        subgraph "Kubernetes Resources"
            SVC[Services]
            Ingress[Ingress Controller]
            ConfigMap[ConfigMaps]
            Secrets[Secrets]
            PVC[Persistent Volumes]
        end
    end

    subgraph "External Services"
        Neon[(Neon DB)]
        RedisCloud[(Redis Cloud)]
        S3[(AWS S3)]
    end

    subgraph "Load Balancer"
        LB[External Load Balancer]
    end

    API --> Scheduler
    API --> Controller
    API --> etcd

    Scheduler --> Node1
    Scheduler --> Node2
    Scheduler --> Node3

    Node1 --> AppPod1
    Node1 --> WorkerPod1
    Node1 --> WorkerPod2

    Node2 --> AppPod2
    Node2 --> WorkerPod3
    Node2 --> WorkerPod4

    Node3 --> TraefikPod
    Node3 --> DNSPod
    Node3 --> WorkerPod3

    LB --> TraefikPod
    TraefikPod --> AppPod1
    TraefikPod --> AppPod2

    AppPod1 --> Neon
    AppPod2 --> Neon
    WorkerPod1 --> Neon
    WorkerPod2 --> Neon
    WorkerPod3 --> Neon
    WorkerPod4 --> Neon

    AppPod1 --> RedisCloud
    AppPod2 --> RedisCloud
    WorkerPod1 --> RedisCloud
    WorkerPod2 --> RedisCloud
    WorkerPod3 --> RedisCloud
    WorkerPod4 --> RedisCloud

    WorkerPod1 --> S3
    WorkerPod2 --> S3
    WorkerPod3 --> S3
    WorkerPod4 --> S3
```

### Kubernetes Resource Relationships

```mermaid
graph TB
    subgraph "Kubernetes API Objects"
        Deployment[Deployment<br/>App + Worker]
        Service[Service<br/>ClusterIP]
        Ingress[Ingress<br/>HTTP Rules]
        HPA[HPA<br/>Auto Scaling]
        ConfigMap[ConfigMap<br/>Configuration]
        Secret[Secret<br/>Credentials]
        PVC[PersistentVolumeClaim<br/>Storage]
        Namespace[Namespace<br/>Isolation]
    end

    subgraph "Pod Template"
        Pod[Pod<br/>Running Instance]
        Container1[Container 1<br/>App/Worker]
        Container2[Container 2<br/>Sidecar]
        Volume[Volume<br/>Mount]
    end

    subgraph "Network"
        NetworkPolicy[Network Policy<br/>Traffic Rules]
        ServiceAccount[Service Account<br/>Identity]
        RBAC[RBAC<br/>Permissions]
    end

    Deployment --> Pod
    Service --> Pod
    Ingress --> Service
    HPA --> Deployment
    ConfigMap --> Pod
    Secret --> Pod
    PVC --> Volume
    Namespace --> Deployment
    Namespace --> Service
    Namespace --> Ingress

    Pod --> Container1
    Pod --> Container2
    Pod --> Volume

    NetworkPolicy --> Pod
    ServiceAccount --> Pod
    RBAC --> ServiceAccount
```

## 🪟 Windows Server Architecture

### Windows Container Deployment

```mermaid
graph TB
    subgraph "Windows Server"
        subgraph "Docker Desktop"
            App[Supercheck App<br/>Windows Container]
            Worker[Supercheck Worker<br/>Windows Container]
        end

        subgraph "IIS"
            IIS[IIS Server<br/>Reverse Proxy]
            AppPool[Application Pool]
        end

        subgraph "Windows Services"
            NodeJS[Node.js Runtime]
            PM2[PM2 Process Manager]
        end

        subgraph "Storage"
            LocalStorage[Local Storage<br/>C:\supercheck]
            Backup[Backup Storage]
        end
    end

    subgraph "External Services"
        SQL[(SQL Server)]
        Redis[(Redis on Linux)]
        Blob[Azure Blob Storage]
    end

    subgraph "Network"
        Firewall[Windows Firewall]
        AD[Active Directory]
    end

    IIS --> App
    App --> Worker
    App --> SQL
    App --> Redis
    Worker --> SQL
    Worker --> Redis
    Worker --> Blob

    App --> LocalStorage
    Worker --> LocalStorage
    LocalStorage --> Backup

    Firewall --> IIS
    AD --> IIS
```

### Native Windows Deployment

```mermaid
graph TB
    subgraph "Windows Server"
        subgraph "IIS"
            Website[Supercheck Website]
            AppPool[Application Pool]
            WebConfig[web.config]
        end

        subgraph "Windows Services"
            Service1[Supercheck Worker Service 1]
            Service2[Supercheck Worker Service 2]
            Service3[Supercheck Worker Service 3]
        end

        subgraph "Process Management"
            PM2[PM2 Process Manager]
            NodeJS[Node.js Runtime]
        end

        subgraph "File System"
            WebRoot[C:\inetpub\wwwroot]
            AppData[C:\ProgramData\Supercheck]
            Logs[C:\Logs\Supercheck]
        end
    end

    subgraph "Database"
        SQL[(SQL Server)]
        Redis[(Redis)]
    end

    subgraph "Storage"
        Azure[Azure Blob]
        Local[Local File Storage]
    end

    Website --> AppPool
    AppPool --> WebConfig
    Website --> Service1
    Website --> Service2
    Website --> Service3

    Service1 --> PM2
    Service2 --> PM2
    Service3 --> PM2
    PM2 --> NodeJS

    Website --> SQL
    Service1 --> SQL
    Service2 --> SQL
    Service3 --> SQL

    Website --> Redis
    Service1 --> Redis

    Service1 --> Azure
    Service2 --> Azure
    Service3 --> Azure

    Website --> WebRoot
    Service1 --> AppData
    Service2 --> AppData
    Service3 --> AppData
    Service1 --> Logs
    Service2 --> Logs
    Service3 --> Logs
```

## ☁️ Cloud Provider Architectures

### AWS ECS Deployment

```mermaid
graph TB
    subgraph "AWS Cloud"
        subgraph "VPC"
            subgraph "Public Subnets"
                ALB[Application Load Balancer]
                NAT[NAT Gateway]
            end

            subgraph "Private Subnets"
                ECS[ECS Cluster]
                App[App Service<br/>Fargate]
                Worker[Worker Service<br/>Fargate]
            end

            subgraph "Database Subnets"
                RDS[(RDS PostgreSQL)]
            end
        end

        subgraph "ElastiCache"
            Redis[(ElastiCache Redis)]
        end

        subgraph "S3"
            Bucket[S3 Buckets]
        end

        subgraph "CloudWatch"
            Logs[CloudWatch Logs]
            Metrics[CloudWatch Metrics]
        end

        subgraph "IAM"
            Role[IAM Roles]
        end
    end

    subgraph "Internet"
        Users[Users]
        Internet[Internet]
    end

    Internet --> ALB
    ALB --> App
    App --> Worker
    App --> RDS
    App --> Redis
    App --> Bucket
    Worker --> RDS
    Worker --> Redis
    Worker --> Bucket

    App --> Logs
    Worker --> Logs
    App --> Metrics
    Worker --> Metrics

    ECS --> Role
    App --> Role
    Worker --> Role

    Users --> Internet
```

### Google Cloud GKE Deployment

```mermaid
graph TB
    subgraph "Google Cloud Platform"
        subgraph "GKE Cluster"
            subgraph "Node Pool 1"
                Node1[Node 1<br/>e2-standard-2]
                Node2[Node 2<br/>e2-standard-2]
            end

            subgraph "Node Pool 2"
                Node3[Node 3<br/>e2-standard-4]
                Node4[Node 4<br/>e2-standard-4]
            end

            subgraph "Workloads"
                App[App Deployment]
                Worker[Worker Deployment]
                Ingress[Ingress Controller]
            end
        end

        subgraph "Cloud SQL"
            PostgreSQL[(Cloud SQL PostgreSQL)]
        end

        subgraph "Memorystore"
            Redis[(Memorystore Redis)]
        end

        subgraph "Cloud Storage"
            GCS[Cloud Storage Buckets]
        end

        subgraph "Cloud Load Balancing"
            L7[L7 Load Balancer]
        end

        subgraph "Cloud Operations"
            Monitoring[Cloud Monitoring]
            Logging[Cloud Logging]
        end
    end

    subgraph "External"
        Internet[Internet]
        Users[Users]
    end

    Internet --> L7
    L7 --> Ingress
    Ingress --> App
    App --> Worker
    App --> PostgreSQL
    App --> Redis
    App --> GCS
    Worker --> PostgreSQL
    Worker --> Redis
    Worker --> GCS

    App --> Monitoring
    Worker --> Monitoring
    App --> Logging
    Worker --> Logging

    Users --> Internet
```

### Azure AKS Deployment

```mermaid
graph TB
    subgraph "Azure Cloud"
        subgraph "Resource Group"
            subgraph "AKS Cluster"
                subgraph "System Node Pool"
                    SystemNode[System Node<br/>B2s]
                end

                subgraph "User Node Pool"
                    UserNode1[User Node 1<br/>Standard_D2s_v3]
                    UserNode2[User Node 2<br/>Standard_D2s_v3]
                    UserNode3[User Node 3<br/>Standard_D2s_v3]
                end

                subgraph "Pods"
                    AppPods[App Pods]
                    WorkerPods[Worker Pods]
                end
            end

            subgraph "Azure Database"
                PostgreSQL[Azure Database for PostgreSQL]
            end

            subgraph "Azure Cache"
                Redis[Azure Cache for Redis]
            end

            subgraph "Storage"
                StorageAccount[Azure Storage Account]
            end

            subgraph "Networking"
                VNet[Virtual Network]
                AG[Azure Application Gateway]
            end

            subgraph "Monitor"
                Monitor[Azure Monitor]
            end
        end
    end

    subgraph "Internet"
        Users[Users]
        Internet[Internet]
    end

    Internet --> AG
    AG --> VNet
    VNet --> AppPods
    AppPods --> WorkerPods
    AppPods --> PostgreSQL
    AppPods --> Redis
    AppPods --> StorageAccount
    WorkerPods --> PostgreSQL
    WorkerPods --> Redis
    WorkerPods --> StorageAccount

    AppPods --> Monitor
    WorkerPods --> Monitor

    Users --> Internet
```

### Hetzner Cloud Deployment

```mermaid
graph TB
    subgraph "Hetzner Cloud"
        subgraph "Private Network"
            subgraph "Manager Nodes"
                M1[Manager 1<br/>CAX21<br/>Falkenstein]
                M2[Manager 2<br/>CAX21<br/>Nuremberg]
                M3[Manager 3<br/>CAX21<br/>Helsinki]
            end

            subgraph "Worker Nodes"
                W1[Worker 1<br/>CAX31<br/>Falkenstein]
                W2[Worker 2<br/>CAX31<br/>Falkenstein]
                W3[Worker 3<br/>CAX31<br/>Nuremberg]
                W4[Worker 4<br/>CAX31<br/>Nuremberg]
                W5[Worker 5<br/>CAX31<br/>Helsinki]
            end

            subgraph "Docker Swarm"
                App[App Services]
                Worker[Worker Services]
                Traefik[Traefik Ingress]
            end
        end

        subgraph "Load Balancer"
            LB[Load Balancer 11<br/>Hetzner LB]
        end

        subgraph "Firewall"
            FW[Firewall Rules]
        end

        subgraph "Placement Groups"
            Managers[Placement Group: Managers]
            Workers[Placement Group: Workers]
        end
    end

    subgraph "External Services"
        Neon[(Neon DB)]
        RedisCloud[(Redis Cloud)]
        S3[(Hetzner Storage Box)]
    end

    subgraph "Internet"
        Users[Users]
        Internet[Internet]
    end

    Internet --> LB
    LB --> FW
    FW --> M1
    FW --> M2
    FW --> M3

    M1 --> App
    M2 --> App
    M3 --> App
    M1 --> Worker
    M2 --> Worker
    M3 --> Worker

    W1 --> Worker
    W2 --> Worker
    W3 --> Worker
    W4 --> Worker
    W5 --> Worker

    App --> Neon
    App --> RedisCloud
    App --> S3
    Worker --> Neon
    Worker --> RedisCloud
    Worker --> S3

    M1 --> Managers
    M2 --> Managers
    M3 --> Managers
    W1 --> Workers
    W2 --> Workers
    W3 --> Workers
    W4 --> Workers
    W5 --> Workers

    Users --> Internet
```

## 🌐 Network Architecture

### Network Topology Overview

```mermaid
graph TB
    subgraph "Internet"
        Internet[Internet]
        CDN[CloudFlare CDN]
        WAF[Web Application Firewall]
    end

    subgraph "DMZ"
        LB[External Load Balancer]
        FW[Firewall]
    end

    subgraph "Application Network"
        AppLB[Internal Load Balancer]
        AppNet[Application Subnet<br/>10.0.1.0/24]
        WorkerNet[Worker Subnet<br/>10.0.2.0/24]
    end

    subgraph "Data Network"
        DBNet[Database Subnet<br/>10.0.3.0/24]
        CacheNet[Cache Subnet<br/>10.0.4.0/24]
        StorageNet[Storage Subnet<br/>10.0.5.0/24]
    end

    subgraph "Management Network"
        MgmtNet[Management Subnet<br/>10.0.6.0/24]
        MonitorNet[Monitoring Subnet<br/>10.0.7.0/24]
    end

    Internet --> CDN
    CDN --> WAF
    WAF --> LB
    LB --> FW
    FW --> AppLB

    AppLB --> AppNet
    AppLB --> WorkerNet

    AppNet --> DBNet
    AppNet --> CacheNet
    AppNet --> StorageNet

    WorkerNet --> DBNet
    WorkerNet --> CacheNet
    WorkerNet --> StorageNet

    MgmtNet --> AppNet
    MgmtNet --> WorkerNet
    MgmtNet --> DBNet

    MonitorNet --> AppNet
    MonitorNet --> WorkerNet
    MonitorNet --> DBNet
```

### Service Mesh Architecture

```mermaid
graph TB
    subgraph "Service Mesh"
        subgraph "Ingress Gateway"
            IG[Ingress Gateway<br/>Traefik/Envoy]
        end

        subgraph "Application Services"
            AppService[App Service<br/>Next.js]
            AuthService[Auth Service<br/>Better Auth]
            APIService[API Service<br/>GraphQL/REST]
        end

        subgraph "Processing Services"
            WorkerService[Worker Service<br/>NestJS]
            QueueService[Queue Service<br/>BullMQ]
            ScheduleService[Schedule Service<br/>Cron]
        end

        subgraph "Data Services"
            DBService[Database Service<br/>PostgreSQL]
            CacheService[Cache Service<br/>Redis]
            StorageService[Storage Service<br/>S3]
        end

        subgraph "External Services"
            EmailService[Email Service<br/>SMTP]
            AIService[AI Service<br/>OpenAI]
            MonitorService[Monitor Service<br/>Prometheus]
        end
    end

    subgraph "Traffic Management"
        Router[Service Router]
        LB[Load Balancer]
        Circuit[Circuit Breaker]
        Retry[Retry Policy]
    end

    IG --> Router
    Router --> LB
    LB --> AppService
    LB --> AuthService
    LB --> APIService

    AppService --> WorkerService
    AppService --> DBService
    AppService --> CacheService
    AppService --> StorageService

    WorkerService --> DBService
    WorkerService --> CacheService
    WorkerService --> StorageService
    WorkerService --> AIService

    APIService --> Circuit
    Circuit --> Retry
    Retry --> DBService

    AppService --> EmailService
    WorkerService --> EmailService

    AppService --> MonitorService
    WorkerService --> MonitorService
```

## 📊 Data Flow Diagrams

### Test Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Queue
    participant Worker
    participant Browser
    participant DB
    participant Storage

    User->>App: Create Test
    App->>DB: Save Test
    App->>Queue: Enqueue Job

    Queue->>Worker: Dequeue Job
    Worker->>DB: Update Job Status

    Worker->>Browser: Launch Browser
    Browser->>Worker: Browser Ready

    Worker->>Browser: Execute Test
    Browser->>Worker: Test Results

    Worker->>Storage: Upload Artifacts
    Worker->>DB: Update Results

    Worker->>Queue: Mark Complete

    App->>DB: Poll for Updates
    App->>User: Display Results
```

### Monitoring Flow

```mermaid
sequenceDiagram
    participant Monitor
    participant Target
    participant Queue
    participant Worker
    participant Notification
    participant User

    Monitor->>Target: HTTP/HTTPS Check
    Target->>Monitor: Response Status

    Monitor->>Queue: Enqueue Monitor Result
    Queue->>Worker: Process Result

    Worker->>DB: Store Result
    Worker->>Worker: Check Thresholds

    alt Alert Condition
        Worker->>Notification: Send Alert
        Notification->>User: Email/Webhook
    end

    Monitor->>DB: Update Status
    Monitor->>User: Dashboard Update
```

### Job Scheduling Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant Queue
    participant Worker
    participant App
    participant User

    Scheduler->>Scheduler: Check Cron Triggers
    Scheduler->>Queue: Enqueue Scheduled Jobs

    loop Job Processing
        Queue->>Worker: Dequeue Job
        Worker->>Worker: Execute Job
        Worker->>Queue: Update Status
    end

    App->>Queue: Get Job Status
    App->>User: Display Status

    User->>App: Request Manual Run
    App->>Queue: Enqueue Manual Job
    Queue->>Worker: Process Manual Job
```

## 📈 Scaling Architectures

### Auto-scaling Architecture

```mermaid
graph TB
    subgraph "Monitoring Layer"
        Prometheus[Prometheus<br/>Metrics Collection]
        Grafana[Grafana<br/>Visualization]
        AlertManager[AlertManager<br/>Alerting]
    end

    subgraph "Auto-scaling Layer"
        HPA[Horizontal Pod Autoscaler]
        VPA[Vertical Pod Autoscaler]
        ClusterAutoscaler[Cluster Autoscaler]
    end

    subgraph "Application Layer"
        App[Application Pods]
        Worker[Worker Pods]
        Queue[Job Queue]
    end

    subgraph "Infrastructure Layer"
        Nodes[Cluster Nodes]
        LoadBalancer[Load Balancer]
    end

    Prometheus --> HPA
    Prometheus --> VPA
    Prometheus --> ClusterAutoscaler

    HPA --> App
    HPA --> Worker
    VPA --> App
    VPA --> Worker
    ClusterAutoscaler --> Nodes

    App --> Queue
    Worker --> Queue
    App --> LoadBalancer
    Worker --> LoadBalancer

    Nodes --> App
    Nodes --> Worker
```

### Multi-region Scaling

```mermaid
graph TB
    subgraph "Global Layer"
        GlobalLB[Global Load Balancer]
        DNS[DNS / Geo-routing]
        CDN[Content Delivery Network]
    end

    subgraph "Region 1 - Primary"
        LB1[Regional Load Balancer]
        App1[App Cluster 1]
        Worker1[Worker Cluster 1]
        DB1[(Primary Database)]
        Redis1[(Primary Redis)]
    end

    subgraph "Region 2 - Secondary"
        LB2[Regional Load Balancer]
        App2[App Cluster 2]
        Worker2[Worker Cluster 2]
        DB2[(Read Replica)]
        Redis2[(Read Replica)]
    end

    subgraph "Region 3 - DR"
        LB3[Regional Load Balancer]
        App3[App Cluster 3]
        Worker3[Worker Cluster 3]
        DB3[(Backup Replica)]
        Redis3[(Backup Redis)]
    end

    subgraph "Global Services"
        GlobalStorage[Global S3]
        GlobalCache[Global CDN]
        GlobalDNS[Global DNS]
    end

    DNS --> GlobalLB
    GlobalLB --> LB1
    GlobalLB --> LB2
    GlobalLB --> LB3

    LB1 --> App1
    LB2 --> App2
    LB3 --> App3

    App1 --> Worker1
    App2 --> Worker2
    App3 --> Worker3

    App1 --> DB1
    App2 --> DB2
    App3 --> DB3

    DB1 --> DB2
    DB1 --> DB3

    App1 --> Redis1
    App2 --> Redis2
    App3 --> Redis3

    Redis1 --> Redis2
    Redis1 --> Redis3

    App1 --> GlobalStorage
    App2 --> GlobalStorage
    App3 --> GlobalStorage

    Worker1 --> GlobalCache
    Worker2 --> GlobalCache
    Worker3 --> GlobalCache
```

## 🔒 Security Architecture

### Security Layers

```mermaid
graph TB
    subgraph "Edge Security"
        WAF[Web Application Firewall]
        DDoS[DDoS Protection]
        CDN[CloudFlare CDN]
    end

    subgraph "Network Security"
        FW[Firewall Rules]
        VPC[Virtual Private Cloud]
        Subnets[Private Subnets]
        NACL[Network ACLs]
    end

    subgraph "Application Security"
        Auth[Authentication<br/>Better Auth]
        RBAC[Role-Based Access Control]
        APIKeys[API Key Management]
        RateLimit[Rate Limiting]
    end

    subgraph "Data Security"
        Encryption[Encryption at Rest]
        TLS[TLS in Transit]
        Secrets[Secrets Management]
        Backup[Secure Backups]
    end

    subgraph "Container Security"
        ImageScan[Image Scanning]
        RuntimeSec[Runtime Security]
        NetworkPolicy[Network Policies]
        PodSecurity[Pod Security]
    end

    subgraph "Monitoring Security"
        AuditLogs[Audit Logging]
        SIEM[Security Information]
        Alerts[Security Alerts]
        Compliance[Compliance Checks]
    end

    WAF --> FW
    FW --> Auth
    Auth --> Encryption
    Encryption --> ImageScan
    ImageScan --> AuditLogs

    DDoS --> VPC
    VPC --> RBAC
    RBAC --> TLS
    TLS --> RuntimeSec
    RuntimeSec --> SIEM

    CDN --> Subnets
    Subnets --> APIKeys
    APIKeys --> Secrets
    Secrets --> NetworkPolicy
    NetworkPolicy --> Alerts

    NACL --> RateLimit
    RateLimit --> Backup
    Backup --> PodSecurity
    PodSecurity --> Compliance
```

### Zero Trust Architecture

```mermaid
graph TB
    subgraph "Identity Layer"
        IdP[Identity Provider]
        MFA[Multi-Factor Auth]
        SSO[Single Sign-On]
        UserMgmt[User Management]
    end

    subgraph "Policy Engine"
        Policy[Access Policies]
        Context[Contextual Access]
        Risk[Risk Assessment]
        Adaptive[Adaptive Auth]
    end

    subgraph "Network Segmentation"
        MicroSeg[Micro-segmentation]
        ServiceMesh[Service Mesh]
        mTLS[mTLS Encryption]
        ZeroTrustNet[Zero Trust Network]
    end

    subgraph "Application Security"
        APIGateway[API Gateway]
        ServiceAuth[Service Auth]
        JWT[JWT Tokens]
        OAuth[OAuth 2.0]
    end

    subgraph "Data Protection"
        DataEncryption[Data Encryption]
        KeyManagement[Key Management]
        DataClassification[Data Classification]
        DLP[Data Loss Prevention]
    end

    subgraph "Threat Detection"
        Anomaly[Anomaly Detection]
        ThreatIntel[Threat Intelligence]
        Behavioral[Behavioral Analysis]
        Response[Automated Response]
    end

    IdP --> Policy
    Policy --> MicroSeg
    MicroSeg --> APIGateway
    APIGateway --> DataEncryption
    DataEncryption --> Anomaly

    MFA --> Context
    Context --> ServiceMesh
    ServiceMesh --> ServiceAuth
    ServiceAuth --> KeyManagement
    KeyManagement --> ThreatIntel

    SSO --> Risk
    Risk --> mTLS
    mTLS --> JWT
    JWT --> DataClassification
    DataClassification --> Behavioral

    UserMgmt --> Adaptive
    Adaptive --> ZeroTrustNet
    ZeroTrustNet --> OAuth
    OAuth --> DLP
    DLP --> Response
```

---

These architectural diagrams provide comprehensive visual representations of all Supercheck deployment options, helping technical teams understand the infrastructure, networking, and security aspects of each deployment scenario.
