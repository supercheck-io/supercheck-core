# Multi-Location Monitoring Implementation Plan

## Overview
Implement multi-location monitoring capabilities similar to Checkly, allowing monitors to execute from multiple geographic locations with per-location results, aggregated status percentages, and enhanced UI/UX.

## Current Architecture Analysis
- **Database:** PostgreSQL with Drizzle ORM - has reserved `config.regions` and `details.location` fields (unused)
- **Execution:** NestJS worker service processes monitor jobs from BullMQ queues
- **Storage:** Results stored in `monitorResults` table (single location currently)
- **Frontend:** Next.js with React components showing single-location results

## Proposed Architecture

### 1. Location Infrastructure
- Define standard monitoring locations (US East, US West, EU West, EU Central, Asia Pacific, etc.)
- Store location metadata (region code, display name, geographic coordinates)
- Allow configuration of which locations to monitor from

### 2. Database Schema Changes
- Add `location` field (non-nullable) to `monitorResults` table
- Keep existing schema structure (no breaking changes since app not in production)
- Store aggregated status on `monitors` table based on location results
- Add indices for efficient location-based queries

### 3. Execution Model
- Execute monitor checks in parallel from selected locations
- Each location creates separate result record in `monitorResults`
- Aggregate results to determine overall monitor status
- Support configurable success threshold (e.g., "pass if 80% of locations are up")

### 4. Aggregation Logic
- Calculate percentage of locations reporting "up" status
- Determine overall status based on threshold configuration
- Track per-location response times and status history
- Support different aggregation strategies (all, majority, any)

### 5. UI/UX Enhancements
- **Monitor Details Page:**
  - Location-based status grid showing each region's status
  - Per-location response time charts
  - Aggregated uptime percentage across all locations
  - Filter results by location
  - Visual map or grid showing geographic distribution
- **Monitor Creation/Edit:**
  - Multi-select for location configuration
  - Threshold configuration (percentage of locations that must be up)
- **Monitor List:**
  - Show aggregated status with location breakdown on hover
  - Display number of locations monitoring each endpoint

## Implementation Tasks

### Phase 1: Database & Schema Updates
- [ ] Define location constants and types in schema
- [ ] Add `location` field to `monitorResults` table (VARCHAR 50)
- [ ] Add `locationConfig` to `monitors.config` JSONB (selected locations, threshold)
- [ ] Create database migration
- [ ] Add composite index on (monitorId, location, checkedAt) for performance
- [ ] Test migration locally

### Phase 2: Worker Service Updates
- [ ] Create location service for managing available locations
- [ ] Update monitor.service.ts to execute checks from multiple locations
- [ ] Implement parallel execution per location with proper error handling
- [ ] Store location in result details when saving to database
- [ ] Update result aggregation logic to calculate overall status
- [ ] Add location-aware queuing strategy
- [ ] Test multi-location execution

### Phase 3: App Service & API Updates
- [ ] Update monitor-service.ts to handle location configuration
- [ ] Create API endpoints for location management (GET /api/locations)
- [ ] Update monitor results API to support location filtering
- [ ] Add aggregation calculations for monitor status
- [ ] Update monitor creation/update handlers for location config
- [ ] Test API endpoints

### Phase 4: Frontend - Monitor Form
- [ ] Add location multi-select component to monitor form
- [ ] Add threshold configuration UI (percentage slider/input)
- [ ] Show location preview with estimated cost/frequency impact
- [ ] Update form validation and submission
- [ ] Test form with various location configurations

### Phase 5: Frontend - Monitor Details Page
- [ ] Create location status grid component showing all locations
- [ ] Add per-location response time charts
- [ ] Update availability chart to show aggregated percentage
- [ ] Add location filter to results table
- [ ] Show location breakdown in status indicators
- [ ] Add location badges/tags in result rows
- [ ] Create visual location map or grid component
- [ ] Update loading states and error handling
- [ ] Test responsive design

### Phase 6: Frontend - Monitor List
- [ ] Update monitor card/row to show location count
- [ ] Add location status badges to list view
- [ ] Show location breakdown on hover/tooltip
- [ ] Update filtering to support location-based filters
- [ ] Test performance with large dataset

### Phase 7: Testing & Validation
- [ ] Test monitor creation with multiple locations
- [ ] Verify parallel execution from all selected locations
- [ ] Validate aggregation calculations (various threshold scenarios)
- [ ] Test UI with different screen sizes
- [ ] Verify database queries are optimized (no N+1 issues)
- [ ] Load test with multiple monitors and locations
- [ ] Test error scenarios (location timeout, partial failures)

### Phase 8: Documentation & Polish
- [ ] Update API documentation with location fields
- [ ] Add JSDoc comments to new functions
- [ ] Create user guide for multi-location monitoring
- [ ] Add tooltips and help text in UI
- [ ] Review for accessibility (ARIA labels, keyboard navigation)

## Technical Decisions

### Location Strategy
- **Simulated Locations (Phase 1):** Initially simulate different locations with configurable delays
  - This allows full UI/UX implementation without infrastructure
  - Easy to test and validate logic
  - Can be replaced with real distributed workers later
- **Future: Distributed Workers (Phase 2):** Deploy workers in actual geographic regions
  - Requires infrastructure changes (multi-region deployment)
  - Out of scope for initial implementation

### Aggregation Strategy Options
1. **All Locations Up:** Status is "up" only if all locations report up
2. **Majority Up:** Status is "up" if > 50% of locations report up (default)
3. **Any Location Up:** Status is "up" if at least one location reports up
4. **Custom Threshold:** User-defined percentage (e.g., 80% must be up)

We'll implement option 4 (custom threshold) with a default of 50% for maximum flexibility.

### Database Design
- Keep single `monitorResults` table with location field
- No separate table for location-specific results (simpler queries)
- Use existing `details` JSONB for location-specific metadata
- Aggregate calculations done at query time (no separate aggregation table)

### UI/UX Principles
- **Progressive Disclosure:** Show summary first, details on demand
- **Visual Hierarchy:** Location status grid prominent, details below
- **Color Coding:** Green (up), Red (down), Yellow (partial), Gray (unknown)
- **Responsive:** Mobile-friendly with collapsible sections
- **Performance:** Pagination, lazy loading, optimized queries

## Security Considerations
- [ ] Validate location selection server-side
- [ ] Prevent location spoofing in results
- [ ] Rate limiting per location to prevent abuse
- [ ] Ensure location data doesn't expose sensitive infrastructure
- [ ] Validate threshold values (0-100%)

## Performance Considerations
- Parallel execution of location checks (not sequential)
- Database indices on (monitorId, location, checkedAt)
- Pagination for location-based result queries
- Caching of location metadata
- Lazy loading of location-specific charts

## Backward Compatibility
- Not required (app not in production)
- Existing monitors will default to single location ("primary")
- Existing results will be migrated with default location

## Review Section
(To be completed after implementation)

---
**Status:** Planning Phase
**Created:** 2025-10-23
**Last Updated:** 2025-10-23
