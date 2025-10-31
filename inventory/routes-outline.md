# Route Modules Inventory (merging branch)

## src/routes/passkey-routes.js (~1.1k LOC)
- **Purpose:** Complete WebAuthn passkey lifecycle for public, authenticated, and admin users; exposes both credential registration and authentication endpoints and coordinates CouchDB persistence.
- **Structure:**
  - Environment/rpID detection and logging (lines ~20-150) with warnings for misconfigured DOMAIN/PASSKEY_RPID; computes `rpID`, `origin`, and exposes helpers for local vs cloud.
  - Injected dependencies: `setCouchDBClient`, `setCacheFunctions` from `server.js`; relies on `cacheManager` for caching passkey challenges/user docs.
  - Registration flow (lines ~180-520):
    - `/passkey/register/options` – generates registration options via `@simplewebauthn/server`, stores challenge in cache/DB.
    - `/passkey/register/verify` – verifies attestation, persists credential metadata to `maia_users`, updates workflow stage, triggers admin notifications (`addUpdateToAllAdmins`).
    - Includes admin-specific registration gating (`requiresAdminAuth`), fallback to email-based admin secret, rate limit guards, and detection of duplicate credentials.
  - Authentication flow (lines ~520-880):
    - `/passkey/auth/options` & `/passkey/auth/verify` – issue/verify authentication challenges, update last-login, create sessions via `createSession`, attach cookies (`maia_auth`, `maia_admin_auth`).
    - Handles deep-link users, admin cookie renewal, “remember device” toggles; clears stale credentials; logs via `logSessionEvent`.
  - Maintenance & utilities:
    - `/passkey/credentials`, `/passkey/credential/:id/delete`, `/passkey/users/:userId/reset` – manage stored credentials for troubleshooting.
    - `/passkey/auth-status` – allows frontend to poll session validity.
    - Uses helper functions `getUserForLogin`, `sanitizeUser`, `updateUserWorkflowStage`, and caching of `pendingChallenges` in memory.
- **New Design destination:**
  - Shared backend service (accessible by Admin, Public, and User apps) providing REST endpoints for passkey management.
  - Consider splitting into auth microservice or shared package, as both Admin and User frontends rely on it for sign-in gates. Environment detection should move to shared config loader.

## src/routes/admin-routes.js (~0.68k LOC)
- **Purpose:** Legacy admin REST endpoints used by earlier UI pieces; handles KB ownership transfer, session polling, agent analytics, cache refresh triggers, and knowledge-base reconciliation jobs.
- **Structure:**
  - Imports `requireAdminAuth` from admin-management routes and server-side session helpers (`activeSessions`, `addUpdateToAllAdmins`, etc.).
  - Injected `couchDBClient` via `setCouchDBClient`.
  - Endpoint groups:
    - **KB ownership & maintenance:** `/transfer-kb-ownership`, `/resend-invite`, `/remove-public-kb`, hitting CouchDB, calling DigitalOcean indexing jobs, sending Resend emails.
    - **Session + polling:** `/poll/updates`, `/notify`, `/stats`, reuse `addUpdateToSession` and `getPendingUpdates` for admin dashboards.
    - **User management utilities:** `/reset-user-session`, `/users/:userId/agent`, `/users/:userId/kb-summary`, bridging to main server functions.
    - **Cache/Bucket tasks:** endpoints to refresh caches, copy files, ensure bucket folders, call `trackPublicUserActivity` for analytics.
  - Heavy reliance on direct imports from `server.js`; duplicates logic now present in `admin-management-routes.js` but still required for legacy AdminPanel.
- **New Design destination:**
  - Either fully replaced by the richer admin-management routes or moved into a separate “legacy admin API” module until decommissioned.
  - Any still-needed utilities (KB transfer, manual cache refresh) should be ported into smaller, well-scoped Admin backend controllers using the shared services proposed earlier.

---

### Shared considerations
- Both modules expect `server.js` to inject CouchDB client and cache helpers at boot; in the New Design, expose a backend bootstrap that wires these dependencies once, then imports modular routes.
- Logging is verbose (environment dumps, `[AUTO PS]`), providing an opportunity to centralize structured logging before migration.
- Rate-limiting, challenge caching, and admin-password verification logic should move into reusable middleware when splitting into multiple repos.

