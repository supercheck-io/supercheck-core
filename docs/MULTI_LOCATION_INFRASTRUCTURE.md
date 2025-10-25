# Multi-Location Monitoring Infrastructure Guide

**Target:** Docker Swarm deployment on Hetzner servers (distributed mode only)

---

## Table of Contents
1. [Overview](#overview)
2. [Reference Architecture](#reference-architecture)
3. [Hetzner Server Layout](#hetzner-server-layout)
4. [Environment Configuration](#environment-configuration)
5. [Docker Swarm Setup](#docker-swarm-setup)
6. [Deployment](#deployment)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Scaling & Best Practices](#scaling--best-practices)

---

## Overview

Supercheck’s multi-location monitoring now runs exclusively in distributed mode. Each monitor job is expanded into one task per region and executed by workers that advertise their `WORKER_LOCATION`. The recommended geography:

| Region | Location Code | Hetzner Site | Purpose |
|--------|---------------|--------------|---------|
| US East | `us-east` | Ashburn (`ash`) | North American coverage |
| EU Central | `eu-central` | Falkenstein (`fsn1`) | European coverage & GDPR residency |
| Asia Pacific | `asia-pacific` | Singapore (`sg`) | APAC coverage |

Local development without regional workers executes all locations sequentially on the same machine—no artificial delays are injected.

---

## Reference Architecture

```
┌───────────────────────────────┐
│   Hetzner Region: Ashburn     │
│   Worker Service (us-east)    │
│   WORKER_LOCATION=us-east     │
└───────────────┬──────────────┘
                │
┌───────────────────────────────┐
│   Hetzner Region: Falkenstein │
│   Worker Service (eu-central) │
│   WORKER_LOCATION=eu-central  │
└───────────────┼──────────────┘
                │
┌───────────────────────────────┐
│   Hetzner Region: Singapore   │
│   Worker Service (asia-pacific)│
│   WORKER_LOCATION=asia-pacific │
└───────────────┴──────────────┘
                │
      ┌─────────▼─────────┐
      │  Core Services    │
      │  (FSN1 manager)   │
      │  · App (Next.js)  │
      │  · PostgreSQL     │
      │  · Redis          │
      │  · MinIO          │
      └───────────────────┘
```

All workers share the `monitor-execution` queue. Each job carries `executionLocation`, `executionGroupId`, and `expectedLocations` so the correct region processes it and results can be aggregated.

---

## Hetzner Server Layout

| Purpose | Suggested Type | Region | Notes |
|---------|----------------|--------|-------|
| Swarm manager + core services | `cx41` | FSN1 | Hosts app, DB, Redis, MinIO |
| us-east worker pool | `cx51` (x2) | ASH | Set node label `location=ash` |
| eu-central worker pool | `cx51` (x2) | FSN1 | Shares private network with manager |
| asia-pacific worker pool | `cx51` (x2) | SG | Ensure VPN / private network connectivity |

> Adjust replica counts by editing `WORKER_REPLICAS_*` in `.env.hetzner`.

---

## Environment Configuration

1. Copy templates:
   ```bash
   cp .env.hetzner.example .env.hetzner
   ```
2. Key variables:
   - `MULTI_LOCATION_DISTRIBUTED=true` (default)
   - `WORKER_REPLICAS_FSN1`, `WORKER_REPLICAS_ASH`, `WORKER_REPLICAS_SG`
   - `WORKER_LOCATION` is set per worker service inside `docker-stack-swarm-hetzner.yml`
3. Secrets:
   - `SECRET_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, database and Redis credentials
4. Networking:
   - Use Hetzner private networks/VPN for cross-region traffic
   - Restrict public ingress to the load balancer / app ports

---

## Docker Swarm Setup

1. **Initialize Swarm on the manager**
   ```bash
   docker swarm init --advertise-addr <manager-private-ip>
   ```
2. **Join worker nodes**
   ```bash
   WORKER_TOKEN=$(docker swarm join-token worker -q)
   # Example (Ashburn):
   ssh root@ash-worker-1 \
     "docker swarm join --token $WORKER_TOKEN <manager-private-ip>:2377"
   ```
3. **Label nodes**
   ```bash
   docker node update --label-add service=app --label-add location=fsn1 <manager-node-id>
   docker node update --label-add service=worker --label-add location=fsn1 <fsn1-worker-id>
   docker node update --label-add service=worker --label-add location=ash <ash-worker-id>
   docker node update --label-add service=worker --label-add location=sg <sg-worker-id>
   ```

---

## Deployment

1. **Upload stack files**
   ```bash
   scp docker-stack-swarm-hetzner.yml .env.hetzner root@manager:/opt/supercheck/
   ```
2. **Deploy**
   ```bash
   docker stack deploy -c docker-stack-swarm-hetzner.yml supercheck --with-registry-auth
   ```
3. **Verify**
   ```bash
   docker service ls --format 'table {{.Name}}\t{{.Mode}}\t{{.Replicas}}\t{{.Ports}}'
   docker stack ps supercheck
   ```
4. **Check worker logs**
   ```bash
   docker service logs supercheck_worker_ash -f
   ```

---

## Monitoring & Maintenance

- **Redis/BullMQ:** monitor queue depth (`bullmq-admin`, custom dashboards).
- **PostgreSQL:** track connection count and storage (enable automated backups).
- **Workers:** use Hetzner metrics for CPU/RAM; configure alerting for stalled services.
- **App-level:** monitor `/api/health`, stats pages, and multi-location dashboards.

---

## Scaling & Best Practices

- Increase `WORKER_REPLICAS_*` as monitor volume grows; keep 2+ replicas per region for redundancy.
- When adding a new region:
  1. Add the region code to `MONITORING_LOCATIONS` in app/worker schemas.
  2. Extend `LOCATION_METADATA` in the app and worker.
  3. Add a worker service + environment stanza to `docker-stack-swarm-hetzner.yml`.
  4. Redeploy.
- Keep the distributed toggle enabled in production; disable only for local dev.
- Ensure secrets rotation and firewall policies follow [SECURITY.md](../guides/SECURITY.md).

---

With this setup in place, monitors capture real latency from three continents while retaining a straightforward operational footprint on Hetzner.
