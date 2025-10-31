# Backend Utilities & Scripts Inventory (merging branch)

## RTF Processing Scripts (`rtf-cleaner.js`, `rtf-to-md.js`)
- CLI utilities to sanitize inbound RTF files and convert them to Markdown. Handle malformed unicode, provider-specific markers, section detection, and cleaning metadata. They sit outside the runtime server but are part of the ingestion toolchain.
- **New Design:** Move into a separate ingestion/migration repo. Shared text-processing helpers could become a reusable library for the authenticated app’s file pipeline.

## AppInitializer.js
- Frontend helper coordinating bootstrapping for different user types: loads current user/agent state, initializes workflow stages, triggers welcome dialogs, and handles retries with `executionLogger`.
- Tightly coupled with `UserService`, `WorkflowUtils`, cache manager, and passkey state.
- **New Design:** Break into per-app initialization modules; authenticated vs public vs admin flows go to their respective apps. Reusable pieces (user fetch, workflow bootstrap) belong in shared front-end SDK.

## DigitalOcean API wrappers (`digitalocean-api.ts`, `digitalocean-api.js`)
- Provide typed fetch wrappers around DO GenAI endpoints (agents, knowledge bases, indexing jobs). The TS version exposes interfaces for use in modern code; the JS version offers class-based API.
- Handle auth headers, base URL, minimal error handling; used across server routes and scripts.
- **New Design:** Extract into shared backend client package consumed by Admin/User servers and scripts.

## knowledge-base-manager.js
- Utility encapsulating CouchDB operations for `maia_knowledge_bases` and `maia_user_knowledge_bases`. Provides initialization, CRUD, linking/unlinking KBs to users.
- **New Design:** Shared backend service module used by KB-related routes across all apps.

## workflow-utils.js
- Contains workflow stage definitions bridging legacy vs new workflow states. Provides getters for flow steps, stage descriptions, warnings, and determines transitions.
- **New Design:** Shared logic needed by Admin (workflows dashboard) and User app (UI prompts). Convert into TS module for clarity.

## session-manager.js & middleware/session-middleware.js
- `SessionManager` handles CouchDB-backed session documents (create, update, cleanup, warning state). `SessionMiddleware` uses it to validate sessions, enforce inactivity timeouts, bypass public endpoints.
- **New Design:** Shared backend infrastructure; each app’s server should import from a central session package.

## admin-alerts.js
- Admin alert system for logging critical issues, sending notifications via `addUpdateToAllAdmins`, and optionally persisting to CouchDB. Supports severity levels, categories, rate limiting.
- **New Design:** Shared backend alerting service; integrate with whatever logging/monitoring stack we adopt.

## UserService.js
- Static helper for building normalized user objects and deriving user metadata flags (public vs authenticated). Used widely in frontend initialization.
- **New Design:** Move to shared front-end SDK; convert to TS for type-safe user structures.

## RequestThrottler.js
- Simple promise queue that throttles outbound requests to avoid rate limits (e.g., Cloudant). Provides `addRequest` with retry logic.
- **New Design:** Shared utility imported by backend services that hit Cloudant/DO APIs.

## Routes: kb-protection-routes.js
- Express router that exposes `/knowledge-bases` listing with protection metadata, using CouchDB. Used for admin controls around KB access.
- **New Design:** Decide whether protection logic stays in shared backend or becomes part of admin-specific service.

## Maintenance Scripts (`repair-agent-user-relationships.js`, `generate-public-agent-api-key.js`, `scripts/execute-cleanup.js`, `scripts/direct-fix-ownership.js`, `scripts/clean-maia-users.js`, `scripts/fix-agent-ownership.js`)
- One-off Node scripts for DB repair, agent cleanup, data reset. Hit server APIs or manipulate CouchDB directly.
- **New Design:** Move to DevOps/maintenance repo; document which ones remain relevant after repo split.

---

**General Migration Notes:**
- Many utilities assume monolithic `server.js` injection (e.g., relying on global cache manager). When splitting, expose initialization hooks via shared packages.
- Most scripts expect environment variables; standardize `.env` templates for each new repo.
- Consider rewriting critical utilities in TypeScript for clarity and shared type definitions.

