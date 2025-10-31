# `src/routes/admin-management-routes.js` Inventory (merging branch)

Line numbers reference the `merging` branch snapshot as of 2025-10-31. The file is ~3.7k lines and powers the current monolithic admin panel. This outline captures the major responsibility clusters so we can rehome them in the "New Design" split (Admin app, Authenticated User app, Public app, shared backend services).

## 1. Imports, Shared Setters, and Global Trackers (lines ~1-110)
- Express router, `cacheManager`, base URL helper, DigitalOcean `doRequest` proxy.
- Setter hooks (`setCacheFunctions`, `setDoRequestFunction`) so `server.js` injects shared clients at runtime.
- Global in-memory trackers for user activity and agent deployments.
- **New Design:** Shared backend library; Admin app loads router after injecting shared clients.

## 2. Agent Deployment Monitoring (lines ~60-220)
- `addToDeploymentTracking`, `startDeploymentMonitoring`, `checkAgentDeployments` poll DigitalOcean for agent status and emit admin notifications via `addUpdateToAllAdmins` from `server.js`.
- Tracks retry counts, deployment durations, and updates user workflow stages once deployment succeeds.
- **New Design:** Shared background worker (or Admin backend service) responsible for DigitalOcean polling and admin notifications.

## 3. User Activity Tracking & Persistence (lines ~220-560)
- `updateUserActivity`, `syncActivityToDatabase`, `getAgentActivity`, `getAllUserActivities`, and `loadUserActivityFromDatabase` maintain last-activity timestamps in memory with periodic CouchDB writes.
- Includes retry/backoff logic to handle Cloudant rate limiting.
- **New Design:** Shared backend service; Admin app consumes dashboards, Authenticated app may read-only access.

## 4. CouchDB Injection & Admin Authentication Middleware (lines ~560-720)
- `setCouchDBClient` setter triggers `loadUserActivityFromDatabase`.
- `requireAdminAuth` validates `maia_admin_auth` cookie, handles bypass for localhost, and enforces rate-limit-safe errors.
- **New Design:** Admin-specific backend server wraps these as middleware; shared auth helpers for cookie verification.

## 5. Health & Admin Registration (lines ~720-880)
- `/health` endpoint checks DB availability; tolerant of Cloudant 429s.
- `/register` verifies `ADMIN_USERNAME`/`ADMIN_SECRET`, upgrades or creates admin user records.
- **New Design:** Admin app server; registration workflow eventually becomes standalone admin onboarding service.

## 6. User Listing & Caching (lines ~880-1010)
- `/users` endpoint assembles private-user list from cache or CouchDB, attaching bucket status via `getBucketStatusForUser` from `server.js`.
- Shares `isValidUserForList` filter logic.
- **New Design:** Admin backend (list, pagination) + shared bucket helper; user app doesn’t need these admin-only views.

## 7. User Detail Helpers (lines ~1010-1480)
- `getKBAssociationsForFile`, `processUserDataSync`, `processUserDataWithBucket`, `processUserData` merge CouchDB user docs with Spaces file metadata and KB associations.
- `/users/:userId` builds comprehensive user record for the admin UI.
- **New Design:** Admin-specific service; shared utilities for KB lookup and bucket data.

## 8. Approval Workflow & Automation (lines ~1170-1760)
- `/users/:userId/approve` updates approval status, ensures bucket folder, auto-creates agents, schedules notifications.
- `/users/:userId/notes`, `/users/:userId/fix-orphaned-kbs`, `/users/:userId/assign-agent` manage admin interventions.
- `/users/:userId/assigned-agent` returns current mapping.
- **New Design:** Admin backend (approval pipeline) calling shared agent/KB/file services; some pieces transition to dedicated workflow service.

## 9. Data Repair Utilities (lines ~1480-2100)
- `/fix-user-data/:userId`, `/users/:userId/workflow-stage`, `scheduleWorkflowStageFix` reconcile mismatched workflow states.
- `/users/:userId/reset-passkey` handles passkey revocation and notifications.
- **New Design:** Admin maintenance toolkit; consider moving to scripts or separate ops service.

## 10. Session & Activity Dashboards (lines ~2250-2410)
- `/sessions`, `/sessions/:sessionId/signout`, `/sessions/user/:userId`, `/sessions/active-check` surfaces session data from `server.js` exports.
- `/agent-activities` endpoints expose in-memory agent activity tracker.
- **New Design:** Admin backend; requires shared session service exposing APIs for other apps.

## 11. Database & Workflow Consistency Tools (lines ~2419-3107)
- `/database/update-user-agent`, `/database/sync-agent-names`, `/database/user-agent-status`, `/database/validate-workflow-consistency`, `/database/fix-user-workflow/:userId`, `/database/fix-consistency` repair mismatches between CouchDB docs and DO state.
- `/update-activity` ingests external activity updates.
- **New Design:** Admin/DevOps service; may evolve into automated data-repair jobs.

## 12. DigitalOcean Resource Dashboards (lines ~3130-3520)
- `/agents`, `/knowledge-bases`, `/models`, `/models/current` list and manage DO assets, with caching and pagination.
- Prioritizes cached data but falls back to live DO API calls with rate-limit handling.
- **New Design:** Admin backend; share DO client helpers across apps.

## 13. Agent API Key & Cache Maintenance (lines ~3540-3710)
- `/users/:userId/generate-api-key` provisions DO agent API keys and updates user docs.
- `/refresh-cache` clears/rebuilds caches for users, agents, KBs, models using DO APIs and bucket status.
- **New Design:** Admin backend tasks; cache rebuild logic should move into shared caching service.

## 14. Exports (lines ~3710-3754)
- Exports `updateUserActivity`, `getAllUserActivities`, `checkAgentDeployments`, `addToDeploymentTracking`, and router default.
- Consumed by `server.js` for cross-module coordination.
- **New Design:** Shared backend package exposing these services to whichever app needs them.

## Mapping Summary

| Concern | Current Location | New Design Destination |
| --- | --- | --- |
| Deployment monitoring & notifications | Lines ~60-220 | Shared worker or Admin backend background service |
| User activity tracking | Lines ~220-560 | Shared backend service (Admin dashboards consume) |
| Admin authentication | Lines ~560-720 | Admin app middleware (shared auth helpers) |
| Health & registration | Lines ~720-880 | Admin backend bootstrap |
| User listing/detail APIs | Lines ~880-1480 | Admin backend (with shared bucket/KB utilities) |
| Approval workflow & automation | Lines ~1170-1760 | Admin backend workflow module |
| Workflow repair utilities | Lines ~1480-2100 | Admin maintenance/ops tooling |
| Session dashboards | Lines ~2250-2410 | Admin backend + shared session service |
| Database consistency endpoints | Lines ~2419-3107 | Admin maintenance service |
| DO asset dashboards | Lines ~3130-3520 | Admin backend using shared DO client |
| API key generation & cache refresh | Lines ~3540-3710 | Admin backend maintenance tools |

## Follow-Up Notes
- Many endpoints import helpers from `server.js` (`addUpdateToAllAdmins`, `getBucketStatusForUser`), reinforcing the need for a shared package of backend services in the New Design.
- Rate-limiting and retry logic is scattered across sections; centralizing in shared DO/CouchDB clients will simplify the split.
- Several maintenance endpoints may migrate to standalone CLIs or scheduled jobs rather than stay in the Admin API.

