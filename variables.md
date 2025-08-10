# Variable Management System Design

## Overview
Design for implementing variable/secret management in the Supertest playground to handle sensitive data like usernames, passwords, API keys, etc. without exposing them in test scripts.

## Variable Management UI Locations

### 1. **Project Settings** (Primary Location)
**Best for: Organization-wide variables, secrets, shared configurations**

**Location**: Main navigation → Project Settings → Variables tab
**Why here**:
- Variables are shared across all tests in the project
- Admins/editors can manage sensitive credentials centrally
- Better security control - separate from test editing
- Reduces duplication of common variables (API keys, base URLs, etc.)

**UI Features**:
- Table view of all project variables
- Add/Edit/Delete variables
- Mark variables as "Secret" (masked values)
- Bulk import/export functionality
- Access control based on user roles

### 2. **Playground Right Panel** (Secondary Location)
**Best for: Test-specific variables, quick overrides, development**

**Location**: Playground → Test Details panel → Variables section (below Tags)
**Why here**:
- Immediate access while writing/editing tests
- Test-specific variable overrides
- Real-time preview of available variables
- Contextual to the current test being developed

**UI Features**:
- Compact key-value input fields
- Dropdown to select from project variables
- Override indicator (show when overriding project variable)
- Quick "Add to Project" button for promoting test variables

### 3. **Hybrid Approach** (Recommended)

#### **Primary Management**: Project Settings
```
Navigation → Project Settings → Variables
┌─────────────────────────────────────┐
│ Project Variables                   │
├─────────────────────────────────────┤
│ + Add Variable                      │
│                                     │
│ Name          Value       Type      │
│ API_KEY       ********    Secret    │
│ BASE_URL      https://   String     │
│ USERNAME      testuser   String     │
└─────────────────────────────────────┘
```

#### **Quick Access**: Playground Panel
```
Test Details Panel
┌─────────────────────────────────┐
│ Variables (3 available)         │
├─────────────────────────────────┤
│ □ API_KEY (from project)        │
│ □ USERNAME (from project)       │
│ ☑ BASE_URL (overridden)         │
│   └ https://staging.example.com │
│                                 │
│ + Add Test Variable             │
│ ⚙ Manage Project Variables      │
└─────────────────────────────────┘
```

## Database Schema Design

### Recommended Database Changes:

#### New Tables:
```typescript
// Project-level variables
export const projectVariables = pgTable("project_variables", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 255 }).notNull(),
  value: text("value").notNull(), // Encrypted for secrets
  isSecret: boolean("is_secret").default(false),
  description: text("description"), // Optional description
  createdByUserId: uuid("created_by_user_id").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueKeyPerProject: unique().on(table.projectId, table.key),
}));

// Add to existing tests table
export const tests = pgTable("tests", {
  // ... existing fields ...
  variables: jsonb("variables").$type<Record<string, string>>(), // Test-specific overrides
});
```

## Implementation Solutions

### 1. **Project-Level Environment Variables** (Recommended)
**Best for: Organization and security**

- **Database Structure**: New `project_variables` table with encrypted values
- **UI/UX**: Variables tab in project settings
- **Script Usage**: Variables accessed via `process.env.USERNAME` or custom `getVar('USERNAME')`
- **Security**: Values encrypted at rest, RBAC access control

### 2. **Test-Level Variables**
**Best for: Test-specific configurations**

- **Database Structure**: `variables` jsonb column in `tests` table
- **UI/UX**: Variables section in test form right panel
- **Script Usage**: Variables injected before script execution
- **Security**: Sensitive values marked as "secret" and masked

### 3. **Template Variables with Placeholder Replacement**
**Best for: Simple variable substitution**

- **UI/UX**: Variables defined as `{{USERNAME}}`, `{{PASSWORD}}` placeholders
- **Script Usage**: Template engine replaces placeholders before execution
- **Security**: Secrets never stored in plain text in scripts

### 4. **Hybrid Approach** (Most Flexible)
Combine project-level and test-level variables with inheritance

## Script Integration Options

### **Option A: Environment Variables** (Recommended)
```javascript
// Variables automatically available as environment variables
const username = process.env.USERNAME;
const apiKey = process.env.API_KEY;
```

### **Option B: Helper Functions**
```javascript
// Custom helper function (safer)
const username = getVariable('USERNAME');
const apiKey = getVariable('API_KEY', { required: true });
```

### **Option C: Template Replacement**
```javascript
// Template placeholders replaced before execution
await page.fill('[name="username"]', '{{USERNAME}}');
await page.fill('[name="password"]', '{{PASSWORD}}');
```

## User Workflows

### **Admin/Team Lead Workflow**:
1. Go to Project Settings → Variables
2. Set up common variables (API keys, URLs, credentials)
3. Mark sensitive ones as "Secret"
4. Team members inherit these automatically

### **Developer Workflow**:
1. Writing test in Playground
2. See available project variables in right panel
3. Can override values for testing (e.g., staging URL vs production)
4. Can add test-specific variables quickly
5. Can promote useful test variables to project level

## UI Enhancements for Better UX

### **In Playground**:
- **Variable Autocomplete**: Type `{{` and see available variables
- **Syntax Highlighting**: Highlight variable placeholders in code editor
- **Variable Preview**: Hover over `{{USERNAME}}` to see resolved value
- **Usage Indicators**: Show which variables are used in current test

### **In Project Settings**:
- **Usage Tracking**: Show which tests use each variable
- **Bulk Operations**: Import from CSV, export for backup
- **Environment Grouping**: Different variable sets for dev/staging/prod
- **Validation**: Ensure variable names follow conventions

## Security Considerations

### **Encryption & Storage**:
- All secret values encrypted with project-specific keys
- Variable names can be plain text, values encrypted
- Separate encryption keys per project/organization

### **Access Control**:
- **Project Admin**: Full access (create, edit, delete, view secrets)
- **Project Editor**: Can use variables, can't see secret values
- **Project Viewer**: Can see variable names only

### **Audit & Compliance**:
- Log all variable access and modifications
- Track which tests use which variables
- Audit trail for secret access

### **UI Security**:
- Secret values masked in UI (show `***` instead of actual value)
- No secret values in browser console/network requests
- Secure variable resolution on server-side only

## Implementation Priority

### **Phase 1**: Foundation
- Project-level variables with environment variable injection
- Basic CRUD in Project Settings
- Database schema and encryption

### **Phase 2**: Playground Integration  
- Test-level variable overrides
- Variables section in playground right panel
- Basic template replacement in scripts

### **Phase 3**: UI Enhancements
- Variable picker/autocomplete in code editor
- Syntax highlighting for variable placeholders
- Usage tracking and indicators

### **Phase 4**: Advanced Features
- Variable inheritance and environments
- Conditional variables
- Bulk import/export
- Advanced audit and compliance features

## Technical Notes

### **Validation Service Updates**:
- Update script validation to allow variable placeholders
- Add validation for variable names (no conflicts with system vars)
- Ensure template replacement doesn't introduce security issues

### **Script Execution**:
- Variables resolved server-side before sending to worker
- No client-side access to encrypted secret values
- Environment variables injected into Playwright execution context

### **Current Schema Integration**:
- JobConfig already has `variables?: Record<string, string>` field
- Can leverage existing job variable structure
- Extend pattern to tests and projects

## Benefits of This Approach

1. **Security**: Centralized secret management with encryption
2. **Usability**: Context-aware variable access in playground
3. **Governance**: Admin control over sensitive credentials
4. **Flexibility**: Test-level overrides for different environments
5. **Collaboration**: Shared variables reduce duplication
6. **Compliance**: Full audit trail and access control