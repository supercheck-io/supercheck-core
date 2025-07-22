# Supertest Documentation

Welcome to the Supertest documentation. This repository contains comprehensive documentation for the Supertest monitoring and testing platform.

## 📚 Documentation Index

### 🏗️ **Core Architecture & System Design**
- **[System Overview](README.md)** - Complete system architecture, execution flow, and core concepts
- **[Test Execution and Job Queue Flow](TEST_EXECUTION_AND_JOB_QUEUE_FLOW.md)** - Detailed job execution and parallelism guide
- **[API Routes Analysis](API_ROUTES_ANALYSIS.md)** - API structure, performance optimizations, and recommendations
- **[Deployment and Migration Guide](DEPLOYMENT_AND_MIGRATION.md)** - Complete deployment and migration procedures

### 🔍 **Monitoring System**
- **[Monitoring System](MONITORING_SYSTEM.md)** - Complete monitoring system documentation including architecture, queue system, heartbeat monitoring, scheduling fixes, and implementation details

### 🚨 **Alerting & Notifications**
- **[Alerts and Notifications System](ALERTS_AND_NOTIFICATIONS_SYSTEM.md)** - Complete alerting system documentation including provider creation, channel limits, and configuration

### 🔑 **Authentication & Security**
- **[API Key System](API_KEY_SYSTEM.md)** - Complete API key system documentation including authentication fixes, job association improvements, and testing procedures

### ⚡ **Job & Test Execution**
- **[Test Execution and Job Queue Flow](TEST_EXECUTION_AND_JOB_QUEUE_FLOW.md)** - Complete test execution and job processing flow
- **[Parallel Execution and Capacity Management](PARALLEL_EXECUTION_CAPACITY_MANAGEMENT.md)** - Parallel execution system and capacity limits
- **[Real-Time Status Updates with SSE](REAL_TIME_STATUS_UPDATES_SSE.md)** - Server-Sent Events implementation for live updates
- **[Redis Memory Management](REDIS_MEMORY_MANAGEMENT.md)** - Redis cleanup and memory management strategy
- **[Job Trigger System](JOB_TRIGGER_SYSTEM.md)** - Manual, remote, and scheduled job triggers


## 🎯 **Quick Start Guides**

### For Developers
1. Start with **[System Overview](README.md)** to understand the architecture
2. Review **[Test Execution and Job Queue Flow](TEST_EXECUTION_AND_JOB_QUEUE_FLOW.md)** for core execution concepts
3. Check **[API Routes Analysis](API_ROUTES_ANALYSIS.md)** for API development
4. Follow **[Deployment and Migration Guide](DEPLOYMENT_AND_MIGRATION.md)** for deployment setup

### For Monitoring Setup
1. Read **[Monitoring System](MONITORING_SYSTEM.md)** for complete monitoring platform overview
2. Configure **[Alerts and Notifications System](ALERTS_AND_NOTIFICATIONS_SYSTEM.md)** for alerts
3. Set up monitoring with comprehensive documentation in **[Monitoring System](MONITORING_SYSTEM.md)**

### For Troubleshooting
1. Check **[API Key System](API_KEY_SYSTEM.md)** for authentication and API key issues
2. Review **[Monitoring System](MONITORING_SYSTEM.md)** for monitoring and scheduling problems
3. Use **[API Key System](API_KEY_SYSTEM.md)** for API key testing and verification

## 📋 **Documentation Status**

### ✅ **Complete & Accurate**
- System Overview (README.md) - Comprehensive and up-to-date
- Test Execution and Job Queue Flow - Clear and accurate
- Test Execution and Job Queue Flow - Complete execution flow documentation
- Parallel Execution and Capacity Management - Comprehensive capacity system docs
- Real-Time Status Updates with SSE - Complete SSE implementation guide
- Redis Memory Management - Detailed memory management strategy
- Alerts and Notifications System - Complete alerting system documentation
- API Key System - Complete API key system documentation
- Monitoring System - Complete monitoring system documentation
- Deployment and Migration Guide - Complete deployment and migration procedures

### ⚠️ **Needs Review**
- API Routes Analysis - Good but could use performance benchmarks
- Alerts & Notifications Breakdown - Comprehensive but complex
- Notification Provider Creation - Complete but could use more examples

### 🔄 **Recent Updates**
- Test Execution and Job Queue Flow - New comprehensive execution flow documentation
- Parallel Execution and Capacity Management - New capacity management system docs
- Real-Time Status Updates with SSE - New SSE implementation documentation
- Redis Memory Management - New memory management strategy documentation
- Alerts and Notifications System - Combined and reorganized alerting documentation
- API Key System - Combined and reorganized API key documentation
- Monitoring System - Combined and reorganized monitoring documentation
- Deployment and Migration Guide - Combined and reorganized deployment documentation
- Job Trigger System - New implementation with manual/remote/schedule triggers

## 🛠️ **Contributing to Documentation**

### Documentation Standards
1. **Use clear, descriptive titles** that indicate the content type
2. **Include practical examples** and code snippets
3. **Provide troubleshooting sections** for common issues
4. **Keep implementation details** separate from user guides
5. **Update this index** when adding new documentation

### File Naming Convention
- `README-*.md` - Core system documentation
- `*_BREAKDOWN.md` - Detailed system analysis
- `*_FIX.md` - Bug fixes and troubleshooting
- `*_FLOW.md` - Process and workflow documentation
- `test-*.md` - Testing guides and procedures

## 🔗 **Related Resources**

- **Codebase**: Main application code in `/app` and `/runner` directories
- **Database Schema**: Located in `/app/src/db/schema/schema.ts`
- **API Routes**: Next.js API routes in `/app/src/app/api/`
- **Worker Services**: NestJS services in `/runner/src/`


## Start Services Quick Reference

# Start Redis
docker run -d --name redis-supercheck -p 6379:6379 redis

# Start Postgres
docker run -d --name postgres-supercheck -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=supercheck -p 5432:5432 postgres:16.2

# Start MinIO
docker run -d --name minio-supercheck -p 9000:9000 -p 9001:9001 -e "MINIO_ROOT_USER=minioadmin" -e "MINIO_ROOT_PASSWORD=minioadmin" minio/minio server /data --console-address ":9001"

---

*Last updated: July 2025*
*Maintained by: Development Team*