# Admin Vue Components Inventory (merging branch)

Line numbers are approximate snapshots from the `merging` branch on 2025‑10‑31. Each component listed here is slated for the Admin-centric front ends in the “New Design”.

## AgentManagementDialog.vue (~5.3k LOC)
- **Role:** Primary orchestration dialog for assigning/maintaining a user’s private agent and knowledge bases. Drives workflow steps, file selection, indexing jobs, and passkey auth flows.
- **Template highlights:**
  - Multi-step workflow banner, inline warnings, KB creation/start indexing buttons, document tables, and numerous nested dialogs (passkey, KB ownership transfer, KB update warning, new-user welcome, cancelation confirmations).
  - Conditional branches for authenticated users vs public/deep-link sessions.
- **State & dependencies (script):**
  - Imports `UserService`, `API_BASE_URL`, various Quasar components, and child modals (`AgentCreationWizard`, `PasskeyAuthDialog`, `KBOwnershipTransferModal`, etc.).
  - Extensive `ref` state for agent/Kb selection (`assignedAgent`, `availableKnowledgeBases`, `selectedBucketFiles`, etc.), UI modals, workflow flags, indexing tokens, and passkey auth gating.
  - Watches `props.currentUser`, `props.assignedAgent`, `props.currentKnowledgeBase`, dialog open state, and bucket-file arrays to auto-synchronize workflow.
- **Key actions:**
  - Authentication check via `/api/passkey/auth-status` to toggle “sign in” prompts.
  - Agent lifecycle: `createAgent`, `updateAgent`, `deleteAgent`, `onAgentSelected`, `loadCurrentUserState`, `loadAvailableKnowledgeBases` (backed by `/api/current-agent`, `/api/agents`, `/api/knowledge-bases`).
  - KB workflows: `handleCreateKnowledgeBase`, `startIndexingJob`, `loadKnowledgeBaseStatus`, `refreshKnowledgeBases` hitting `/api/automate-kb-with-organized-files`, `/api/update-kb-files`, `/api/knowledge-bases/:id/indexing-status`.
  - File orchestration: fetches `/api/bucket/user-status/:userId`, `/api/bucket-files`; tracks post-index cleanup list.
  - Admin notifications: numerous calls into `addUpdateToAllAdmins` (via server export) when stages change.
- **New Design mapping:**
  - Core of the **Authenticated User App**; should live in that repo with dependencies on shared backend SDKs for agents, KBs, and bucket services.
  - Modal components (e.g., KB ownership transfer) move alongside or become standalone packages.
  - Logging cleanup opportunity: drop `[KB STEP]`-style logs during migration.

## AdminPanel2.vue (~3.3k LOC)
- **Role:** Current admin dashboard shell (Quasar) covering registration, passkey enrollment, dashboards for users/sessions/buckets, and automation controls.
- **Template breakdown:**
  - Loading gate, admin registration form, passkey registration card, login banner, and main tabbed admin workspace.
  - Sub-tabs for Users, Sessions, Requests, Attention Queue, Buckets, Events, Models, and Maintenance utilities.
  - Embeds many child components (`AgentManagementDialog`, `UserDetailsPage2`, charts, status panels).
- **Script setup:**
  - Tracks admin auth cookie state, registration form, passkey dialogs, polling intervals, SSE streams, and Quasar notifications.
  - Fetches from `/admin-management/*` endpoints for users, sessions, and events; also touches `/api/admin/*` legacy routes and `/api/knowledge-bases` for cross-checks.
  - Coordinates cache invalidation via `/admin-management/refresh-cache` and orchestrates bucket reconciliations.
  - Maintains large computed sets for filtered tables, unread counts, color coding for workflow stages.
- **New Design mapping:**
  - Entire component belongs in the **Admin App** repo, likely to be split into smaller feature modules (registration flow, dashboards, maintenance tools).
  - Shared pieces (charts, table utilities, SSE client) should move into reusable admin UI kit.

## AdminPanel.vue (~2.6k LOC)
- **Role:** Legacy admin interface still bundled for backwards compatibility.
- **Features:**
  - Similar functionality to AdminPanel2 but with older layout, modal management, and direct fetch calls.
  - Handles approval queue, KB sync, user search, and log inspection.
- **New Design mapping:**
  - Evaluate for deprecation. Any still-used utilities should be folded into AdminPanel2 successor. Remaining code can move to archival repo or be used as design reference only.

## BottomToolbar.vue (~1.4k LOC)
- **Role:** Shared toolbar at bottom of app; toggles between chat, agent management, KB creation, analytics, and admin shortcuts.
- **Template:**
  - Quasar `QToolbar` with segmented buttons, icons, user info, connection indicators, admin/manage toggles, and quick links (Help, Audit Log, etc.).
- **Script:**
  - Emits events (`open-agent-dialog`, `open-knowledge-base`, `toggle-admin-panel`, etc.).
  - Tracks session, selected agent, KB counts, `isAdmin`, `isPublicUser`, connection heartbeat warnings.
  - Interacts with `useAuthHandling`, `useChatState`, and watchers on props like `currentUser`, `connectedKbs`.
  - Polls `/api/session-status`, `/admin-management/agent-activities`, and surfaces caching flags.
- **New Design mapping:**
  - Should be split: a slimmer toolbar for the **Authenticated User App**, and admin shortcuts moved to Admin app shell. Shared status indicators can become reusable components.

## UserDetailsPage2.vue (~1.2k LOC)
- **Role:** Detailed admin view for a single user (linked from AdminPanel2), showing workflow, bucket files, KBs, session history, and manual controls.
- **Template:**
  - Multi-column layout with user profile card, workflow timeline, KB & file tables, session list, and action buttons (approve, suspend, transfer KBs, regenerate passkeys).
- **Script:**
  - Props: `userRecord`, `currentAgent`, etc.; uses `useQuasar` for notifications.
  - Functions to trigger admin routes: `/admin-management/users/:id/approve`, `/admin-management/users/:id/notes`, `/admin-management/users/:id/reset-passkey`, `/admin-management/users/:id/generate-api-key`.
  - Local filters for bucket search, toggles for advanced metadata, computed status icons.
- **New Design mapping:**
  - Lives squarely in **Admin App**. Extraction opportunity: break into smaller panels (workflow timeline component, bucket files table, KB summary) and reuse them across new admin pages.

---

### Notes & Dependencies
- All components rely heavily on Quasar UI primitives; migrating to separate repos will require a shared Quasar config (or replacement design system).
- Shared utilities (`UserService`, `API_BASE_URL`, `useAuthHandling`, etc.) should become part of a **shared frontend SDK** accessible to the future Admin and User apps.
- Many fetch calls hit REST endpoints slated for refactor; pair each inventory with the backend inventory docs to ensure endpoint mapping stays consistent during the split.

