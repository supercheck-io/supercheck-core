- [x] Harden notification-provider API routes (enforce project context & RBAC on PUT/DELETE, correct usage counts, mask responses).
- [x] Respect provider enablement flags when dispatching notifications across app and worker services.
- [x] Improve alert history persistence with per-provider records and adjust readers accordingly.
- [x] Encrypt notification provider configs at rest and decrypt on access in both app and worker.
- [x] Verify changes (lint/tests as feasible) and update review summary.

## Review
- API routes now enforce project-scoped RBAC on updates/deletes, block deletions only when actual link counts exist, and return sanitized configs with masking metadata.
- Worker queue respects `isEnabled` flags and decrypts provider credentials before dispatch; alert history records now persist per-provider outcomes for accurate analytics.
- Notification configs are AES-GCM encrypted at rest, decrypted on demand inside both services, and sensitive fields stay hidden in UI edits with user prompts to re-enter secrets.
- `app` lint passes; worker lint still fails due to legacy `any` usage outside the touched areas—documented for follow-up.
