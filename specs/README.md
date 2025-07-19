# Supertest Documentation

Welcome to the Supertest documentation. This repository contains comprehensive documentation for the Supertest monitoring and testing platform.

## 📚 Documentation Index

### 🏗️ **Core Architecture & System Design**
- **[System Overview](README.md)** - Complete system architecture, execution flow, and core concepts
- **[Job Execution Flow](README-job-execution.md)** - Detailed job execution and parallelism guide
- **[API Routes Analysis](API_ROUTES_ANALYSIS.md)** - API structure, performance optimizations, and recommendations

### 🔍 **Monitoring System**
- **[Monitoring & Alerting System](MONITORING_README.md)** - Complete monitoring platform documentation
- **[Monitor Scheduling Fix](MONITOR_SCHEDULING_FIX.md)** - Robust monitor scheduling implementation
- **[Heartbeat Monitoring](HEARTBEAT_AND_MONITORING_FIXES.md)** - Heartbeat system fixes and implementation
- **[Heartbeat Monitor Refactor](HEARTBEAT_MONITOR_REFACTOR.md)** - Heartbeat monitoring architecture improvements

### 🚨 **Alerting & Notifications**
- **[Alerts & Notifications Breakdown](ALERTS_AND_NOTIFICATIONS_BREAKDOWN.md)** - Complete alerting system documentation
- **[Notification Provider Creation](NOTIFICATION_PROVIDER_CREATION_FLOW.md)** - Notification provider setup and configuration

### 🔑 **Authentication & Security**
- **[API Key Authentication Fix](API_KEY_AUTH_FIX.md)** - API key system fixes and implementation
- **[API Key Job Association Fix](API_KEY_JOB_ASSOCIATION_FIX.md)** - API key and job association improvements
- **[API Key Testing Guide](test-api-key-fix.md)** - Testing procedures for API key functionality

### ⚡ **Job & Test Execution**
- **[Job Trigger System](JOB_TRIGGER_SYSTEM_DOCUMENTATION.md)** - Manual, remote, and scheduled job triggers
- **[Monitoring Queue Architecture](MONITORING_QUEUE_ARCHITECTURE.md)** - Queue system design and implementation

## 🎯 **Quick Start Guides**

### For Developers
1. Start with **[System Overview](README.md)** to understand the architecture
2. Review **[Job Execution Flow](README-job-execution.md)** for core execution concepts
3. Check **[API Routes Analysis](API_ROUTES_ANALYSIS.md)** for API development

### For Monitoring Setup
1. Read **[Monitoring & Alerting System](MONITORING_README.md)** for platform overview
2. Configure **[Notification Provider Creation](NOTIFICATION_PROVIDER_CREATION_FLOW.md)** for alerts
3. Set up **[Heartbeat Monitoring](HEARTBEAT_AND_MONITORING_FIXES.md)** for passive monitoring

### For Troubleshooting
1. Check **[API Key Authentication Fix](API_KEY_AUTH_FIX.md)** for authentication issues
2. Review **[Monitor Scheduling Fix](MONITOR_SCHEDULING_FIX.md)** for scheduling problems
3. Use **[API Key Testing Guide](test-api-key-fix.md)** for API key verification

## 📋 **Documentation Status**

### ✅ **Complete & Accurate**
- System Overview (README.md) - Comprehensive and up-to-date
- Job Execution Flow - Clear and accurate
- API Key Authentication Fix - Well-documented implementation
- Monitor Scheduling Fix - Detailed solution documentation
- Heartbeat Monitoring Fixes - Complete implementation guide

### ⚠️ **Needs Review**
- API Routes Analysis - Good but could use performance benchmarks
- Alerts & Notifications Breakdown - Comprehensive but complex
- Notification Provider Creation - Complete but could use more examples

### 🔄 **Recent Updates**
- Job Trigger System - New implementation with manual/remote/schedule triggers
- API Key Job Association Fix - Recent security improvements
- Heartbeat Monitor Refactor - Architecture improvements

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

---

*Last updated: January 2024*
*Maintained by: Development Team*