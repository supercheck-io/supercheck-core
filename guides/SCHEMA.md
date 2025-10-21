# Database Schema Review and Recommendations

## 1. Executive Summary

This document provides a review of the Drizzle ORM schema located in `app/src/db/schema/schema.ts`. The schema is well-designed for its purpose, but several key improvements can be made to enhance data integrity, performance, and scalability for an enterprise-grade production environment.

The primary recommendations are:

- **Enforce Data Integrity with Enums**: Replace `text` and `varchar` columns used for status, role, and type fields with PostgreSQL `pgEnum` types.
- **Optimize Data Types**: Use more specific data types like `integer` and `jsonb` instead of generic `text` where appropriate.
- **Improve Indexing**: Add indexes to foreign keys and frequently queried columns to boost read performance.
- **Standardize Naming**: Ensure consistent naming conventions for columns and foreign key relationships.

By implementing these changes, the database will be more robust, performant, and easier to maintain as the application scales.

## 2. Detailed Analysis and Recommendations

### 2.1. Use `pgEnum` for Defined Sets of Values

Many tables use `text` or `varchar` with a TypeScript type (`.$type<T>`) to represent a fixed set of values (e.g., statuses, roles, types). While this provides type safety in the application, it does not enforce data integrity at the database level. An invalid value could still be inserted into the database from outside the application.

**Recommendation**: Use `pgEnum` to create true enum types in PostgreSQL. This guarantees data integrity, improves storage efficiency, and makes the schema more self-documenting.

**Example Implementation:**

First, define the enums:

```typescript
// At the top of your schema file, or in a separate enums.ts file
import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "user",
  "admin",
  "super_admin",
]);
export const memberRoleEnum = pgEnum("member_role", [
  "project_viewer",
  "project_editor",
  "project_admin",
  "org_admin",
  "org_owner",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "passed",
  "failed",
  "error",
]);
// ... and so on for other enums
```

The schema is robust, but the proposed changes will elevate it to an enterprise-ready standard. Prioritizing these changes will pay dividends in terms of system stability, performance, and maintainability as the application grows.

Highest Priority Recommendations:

Use pgEnum: This is the most critical change for data integrity.
Optimize apikey Data Types: Using integer for rate-limiting fields is essential for functionality and performance.
Add Indexes: This will prevent performance degradation as data volume increases.
By addressing these points, you will create a more resilient and scalable database foundation for Supercheck.
