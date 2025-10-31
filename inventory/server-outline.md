# `server.js` Inventory (merging branch)

This document captures the major responsibility clusters inside the 11.5k-line `server.js` so we can decompose it while moving to the "New Design" (separate Admin, Public, and Authenticated User apps sharing a common backend layer).

Line numbers reference the `merging` branch snapshot on 2025-10-31. They are approximate, intended to guide extraction work.

## 1. Bootstrapping & Environment Setup (lines ~1-110)
- Loads environment (`dotenv`), Express, middleware libraries, DigitalOcean/Spaces helpers, cache manager, admin alert system.
- Initializes CouchDB client via `createCouchDBClient()`.
- Sets public KB whitelist and global session trackers.
- **Target:** Shared backend bootstrap module used by all three apps.

## 2. Session Lifecycle & Real-Time Notifications (lines ~110-330)
- Implements `createSession`, `removeSession`, `updateSessionActivity`, `addUpdateTo*` helpers and `logSessionEvent` (writes to `maia_session_logs`).
- Manages public-user pseudo session (`getOrCreatePublicUserSession`) and activity tracking.
- Exports active session utilities for other modules (`admin-management-routes`, polling, etc.).
- **Target:** Shared backend service; Admin app consumes notifications, User/Public apps consume session state.

## 3. Database/Cache Initialization & Alert System (lines ~340-470)
- `initializeDatabase()` wires CouchDB databases, views, service info.
- Starts cache priming (`cacheManager`), DigitalOcean model caching, admin alert initialization, background heartbeat.
- Ties into Resend via alert utilities.
- **Target:** Shared backend startup script; Admin app depends heavily on cached data.

## 4. Middleware, Security, and Shell Routes (lines ~470-820)
- Session event capture middleware, session manager instantiation, rate limiting, security headers, cookie parser, cors, JSON payload limits.
- Express/EJS rendering for `/`, `/admin`, `/admin2`, etc. (currently serving SPA bundle from `dist/index.ejs`).
- **Target:** Split between shared middleware library and respective frontends; static rendering will move into each app’s own server.

## 5. Health & Diagnostics Endpoints (lines ~864-1190)
- `/health`, `/debug/sessions`, `/api/session-status`, `/api/current-user`, `/api/sign-out`.
- Upload utilities (`/api/upload-to-bucket-binary`, `/api/parse-pdf`, `/api/process-rtf`).
- **Target:** Shared backend (health) + Authenticated User app (sign-out, current user) + Admin diagnostics.

## 6. File Intake & Organization (lines ~1200-2050)
- `/api/upload-file`, `/api/organize-files-for-kb`, `/api/users/:userId/unindexed-subfolder-files`, `/api/users/:userId/kb-file-locations`.
- KB file reconciliation, metadata persistence, Level 1→Level 2 movement logic, `.folder-marker` filtering.
- **Target:** Authenticated User app (upload + organization), Admin app (reconciliation, diagnostics); to wrap inside shared file-service module.

## 7. Bucket Utilities & Cleanup (lines ~2050-3350)
- Metadata association endpoints, Spaces file proxies (`/api/proxy-pdf`), bucket listings, admin event streams, ensure-folder, copy/cleanup helpers, delete operations.
- Includes background bucket status refresh and cached responses.
- **Target:** Shared storage service consumed by User + Admin apps; Public app will only need read proxies.

## 8. Chat & Group Chat APIs (lines ~3380-5090)
- Personal chat pipeline (`/api/personal-chat`) with DigitalOcean GenAI integration and request logging.
- Provider-specific fallbacks (`/api/anthropic-chat`, `/api/gemini-chat`, `/api/deepseek-r1-chat`, `/api/chatgpt-chat`).
- Group chat persistence, cleanup, sharing, deep link creation, load/save endpoints.
- **Target:** Authenticated User app (main chat), Admin app (group chat oversight). Public app may reuse read-only deep links.

## 9. Agent Management & User CRUD (lines ~5370-7060)
- Agent listings, detail retrieval, assignment endpoints, create/update/delete, template export.
- User detail endpoints (`/api/users/:id`, `/api/current-agent`, knowledge base listings`).
- Relies on DigitalOcean agent APIs, CouchDB user records, cache manager.
- **Target:** Primarily Admin app; some read-only pieces go to Authenticated User app (current agent, user self info). Should be extracted into shared agent service + admin routes.

## 10. Knowledge Base Lifecycle (lines ~6460-8760)
- Attach/detach KBs to agents, create KBs, manage data sources, start indexing, poll jobs, automate KB with organized files, update existing KBs, auto summary workflow.
- Heavy DigitalOcean GenAI and Spaces usage, plus database synchronization.
- **Target:** Shared KB service with distinct controllers:
  - Authenticated User app: create/update own KBs, view status.
  - Admin app: reconciliation tools, manual overrides, automated jobs.
  - Public app: read-only listing of whitelisted KBs.

## 11. Maintenance & Testing Utilities (lines ~8760-10095)
- Re-index specific KB, large-file indexing test, agent/KB sync reconciliation, `setup-maia`, `cleanup-database`, `fix-agent-ownership`, exam diagnostic endpoints.
- **Target:** Admin app / DevOps only. Many can migrate into dedicated maintenance scripts or be retired.

## 12. Deep Link & Public Sharing Flows (lines ~10180-10430)
- Deep link user provisioning, email selection, share retrieval, `shared/:shareId` SSR route.
- Depends on session middleware, CouchDB share docs, Resend notifications.
- **Target:** Shared deep-link service consumed by Public app (viewer) and Authenticated User app (invite flows).

## 13. Legacy/Test Pages & Catch-All (lines ~10440-10550)
- `app.get('*')`, tooltip test routes. Serves SPA shell; to be replaced once frontend split completes.
- **Target:** Will disappear once each app hosts its own frontend.

## 14. Startup Schedulers & Background Tasks (lines ~10550-11390)
- Document cleanup loops, DigitalOcean monitoring intervals (`monitorIndexingProgress`, agent sync monitors, Cron-like `setInterval` at 2520, 9466, 11377, etc.).
- Startup syncs for knowledge bases/models, admin cache warm-up.
- **Target:** Shared background worker service (could become separate process) with per-app hooks for event broadcasting.

## 15. Test Harness Endpoints (lines ~11390-11530)
- `/api/test-create-kb` and other proof-of-concept endpoints retained for manual testing.
- **Target:** Evaluate for removal or move into dev-only scripts.

## Mapping Summary

| Concern | Current Location | New Design Home |
| --- | --- | --- |
| Environment/config bootstrap | Lines ~1-150 | Shared backend package |
| Session lifecycle & polling | Lines ~110-330 | Shared backend; Admin app consumes notifications, User/Public apps consume state |
| Express middleware setup | Lines ~470-650 | Shared middleware module reused by each app’s express shell |
| SPA shell routes (`/`, `/admin2`) | Lines ~658-820 | Move into respective frontend servers (Public app, Admin app) |
| Health & auth endpoints | Lines ~864-960 | Shared backend (health) + Authenticated User app (auth) |
| File uploads & organization | Lines ~1038-2050 | Shared file service used by User and Admin apps |
| Bucket + Spaces helpers | Lines ~2050-3350 | Shared storage service |
| Chat & group chat APIs | Lines ~3380-5090 | Authenticated User app (chat) + Admin app (group management) |
| Agent management | Lines ~5376-7097 | Admin app (with shared agent client) |
| Knowledge base orchestration | Lines ~7116-8760 | Shared KB service with app-specific controllers |
| Maintenance utilities | Lines ~9141-10095 | Admin/DevOps tooling (consider separate repo) |
| Deep link workflows | Lines ~10183-10430 | Shared deep-link service (Public viewer + User invite flows) |
| Background schedulers | Lines ~2520, 9466, 11377 | Shared worker (possibly separate service) |

## Next Steps
- Break out reusable clients (`digitalocean-api`, `couchdb-client`, `cacheManager`) into `/packages/shared-backend`.
- For each section above, draft extraction tickets noting:
  - Required dependencies (env vars, utils, session exports).
  - Consumers (Admin, Public, User apps).
  - Logging cleanup opportunities.
- Once shared modules exist, migrate routes into their respective app repos without porting the `[KB STEP]` or `[KBM STEP]` logging noise.
