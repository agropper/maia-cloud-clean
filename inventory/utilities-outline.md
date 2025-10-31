# Shared Utilities Inventory (merging branch)

## CacheManager.js (~600 LOC)
- Centralized in-memory cache for CouchDB/Cloudant queries with rate limiting safeguards.
- Manages per-entity caches (`users`, `chats`, `knowledgeBases`, `agents`, `models`, `health`). Users cache stores individual docs keyed by userId; others store bulk arrays.
- Provides helpers: `getDocument`, `saveDocument`, `invalidateCache`, `cacheAgents`, `cacheKnowledgeBases`, etc., wrapping CouchDB client calls with retries/backoffs; prevents 429 errors by short-circuiting frequent accesses.
- Synchronizes caches with database changes (called from server routes, admin services). Has minimal TTLs (users 60s) but mostly relies on explicit invalidation.
- **New Design:** Extract into shared backend library used by all apps. Consider splitting responsibilities: generic cache wrapper + domain-specific services (user cache, KB cache). Ensure consistent logging and metrics, avoid direct console calls.

## AppStateManager.js (~380 LOC)
- Singleton-like class storing global frontend app state: current user, agent, KB, UI modals, chat history, workflow metadata.
- Provides getters/setters (`setState`, `setAgent`, `setUser`, `clearAgent`, `updateWorkflowStage`, etc.) and persistence utilities (localStorage sync, bucket status fetch).
- Integrates with `UserService`, `WorkflowUtils`, session refresh timers, bucket status polling, analytics logging.
- **New Design:** Needs to be modularized into dedicated stores (e.g., Pinia modules) per app. Core data structures (user, agent, workflow) should live in a shared front-end SDK so Admin/User/Public apps can opt-in to relevant slices without global singleton.

## useAuthHandling.ts (~870 LOC)
- Large composable bundling numerous responsibilities: patient timeline loading, JWT flows, file validation, RTF/PDF ingestion, transcript processing, NOSH export, workflow triggers, bucket cleanup, KB organization.
- Imports many utilities (`convertJSONtoMarkdown`, `processTimeline`, `validateFile`, `extractTextFromPDF`, `WorkflowUtils`, etc.) and coordinates with backend endpoints (e.g., `/api/organize-files-for-kb`, `/api/kb-move-file`, `/api/automate-kb-with-organized-files`).
- Provides `showAuth`, `showJWT`, `saveToNosh`, `uploadFile`, `validate`, and timeline processing helpers used across chat components.
- **New Design:** Break apart by concern: authentication gate (Public vs Private), file ingestion pipeline, transcript generation. Each app (Public vs Authenticated) should import only the relevant pieces. Shared backend SDK needs consistent endpoints/config.

## utils/index.ts (~650 LOC)
- Legacy catch-all exporting numerous helpers used across frontend: speech recognition, timeline formatting, Markdown conversion, token counting, file validation wrappers, chat history utilities, environment detection (`isRunningInApp`), etc.
- Heavy reliance on browser APIs (SpeechRecognition, Blob, html2canvas), asynchronous processing (RTF/PDF parsing), and central constants (`TOKEN_LIMIT`, `PAUSE_THRESHOLD`).
- **New Design:** Distribute into focused utility modules (timeline helpers, speech, file processing). Some pieces belong in Node/shared backend (token math) while others are front-end only. Aim to avoid monolithic `index.ts` barrel to ease tree-shaking.

## couchdb-client.js (~430 LOC)
- Wraps `nano` client with Cloudant-aware configuration, connection handling, and rate-limited retries.
- Provides high-level methods: `initializeDatabase`, `createDatabase`, `saveDocument`, `getDocument`, `getAllDocuments`, `findDocuments`, `bulkDocs`, `createShareIdView`, `testConnection`, etc., all with `handleCloudantError` retry logic.
- Uses environment variables to auto-detect cloud vs local, normalizes connection string, and logs Cloudant detection.
- **New Design:** Shared backend package to be imported by each app’s server (Admin, User, Public). Could be spun into an independent NPM package for reuse. Ensure secrets/config handled consistently.

## couchdb-session-store.js (~350 LOC)
- Express session store implementation backed by CouchDB using `couchdb-client`. Handles serialization/deserialization, TTL, inactivity warnings, cleanup tasks.
- Methods: `get`, `set`, `destroy`, `touch`, `all`, `length`, `clear`. Manages database structure `_id: session_<sessionId>` and ensures valid session IDs before DB calls.
- **New Design:** Since long-term plan is DB-backed sessions for multi-app setup, this module should move into shared backend infrastructure. Evaluate splitting session persistence (shared library) from session middleware (per-app express servers). Consider aligning TTL/inactivity configurations with new apps’ needs.

---

**General notes:**
- All utilities rely on `cacheManager`, `AppStateManager`, and CouchDB client being set up in `server.js`. In the New Design, expose a bootstrap that wires these once and make each module import from the shared package instead of the monolith.
- Logging should be standardized (structured logger vs `console.log`) before distributing across repositories.
- Many async helpers include inline retry loops; evaluate centralizing exponential backoff logic for reuse.

