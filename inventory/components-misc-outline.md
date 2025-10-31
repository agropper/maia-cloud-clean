# Additional Components Inventory (merging branch)

## PasskeyAuthDialog.vue (~600 LOC)
- Modal guiding users through passkey sign-in or registration. Manages multi-step UI (`choose`, `signin`, `register`, `success`, error states) and displays inline instructions.
- Calls `/api/passkey/auth/options`, `/api/passkey/auth/verify`, `/api/passkey/register/options`, `/api/passkey/register/verify`. Handles admin-specific messaging, deep-link restrictions, and fallback to legacy password flow.
- Emits events (`authenticated`, `registration-complete`, `close`) to parent components. Integrates with `useQuasar` dialogs for success toasts and error banners.
- **New Design:** Shared front-end component used by both Public and Authenticated apps. Should depend on a shared auth SDK abstracting passkey endpoints.

## KnowledgeBaseList.vue (~620 LOC)
- Displays grid of knowledge bases with filtering (owned/shared/protected), status badges, token counts, and action buttons (manage, re-index, detach, transfer ownership).
- Fetches via `/api/knowledge-bases`, `/api/knowledge-bases/:id`, `/api/knowledge-bases/:id/data-sources`, `/api/admin/reconcile-kb-indexed-files/:userId`.
- Emits events for reindex, manage, transfer, detach; accepts props for `currentKBId`, `isAdmin`, etc.
- **New Design:** Admin + Authenticated apps both need a KB list component. Consider splitting read-only list vs admin actions; wrap backend calls in shared KB client.

## UserDetailsPage.vue (~600 LOC)
- Legacy user details view (superseded by UserDetailsPage2). Provides cards for user profile, workflow progression, passkey status, bucket files, KB table.
- Interacts with `/admin-management/users/:id`, `/admin-management/users/:id/approve`, `/admin-management/users/:id/reset-passkey`, `/admin-management/users/:id/notes`, etc.
- **New Design:** Evaluate if still necessary; could be dropped or merged with the newer UserDetailsPage2. If kept, place in Admin app “legacy tools”.

## AgentCreationWizard.vue (~550 LOC)
- Stepper-based modal for configuring new agents: details, model selection, instructions preview, confirmation.
- Uses `/api/agents`, `/api/models`, `/api/agents/:id/knowledge-bases` to validate selections; integrates with AppStateManager to set default instructions.
- Emits `agent-created` with configuration payload for parent to trigger server-side creation.
- **New Design:** Belongs in Authenticated User app (and optionally Admin). Should rely on shared agent/KB service to keep steps consistent across apps.

## PopUp.vue (~740 LOC)
- Generic file preview popup handling PDFs (with VuePdfViewer fallback to PDF.js), images, and text files. Provides copy/download controls, annotation placeholders.
- Works with `appStateManager` for current file, loading states, transcript generation.
- **New Design:** Shared component across apps. Abstract file-preview logic into shared UI library with smaller subcomponents (PDF viewer, text preview).

## SavedChatsDialog.vue (~400 LOC)
- Lists saved chats from CouchDB, allows filtering, loading, deletion. Uses `/api/load-chats`, `/api/delete-chat`, `/api/save-chat`.
- Emits `chat-selected`, `close`, `delete` events. Integrates with `useCouchDB` composable and `appState`
- **New Design:** Authenticated User app feature; also reused by Admin for support. Keep in shared chat module.

## GroupManagementModal.vue (~440 LOC)
- Manages shared group chats: lists groups, invites/removes participants, toggles sharing, loads group history.
- Calls `/api/group-chats`, `/api/load-group-chat/:id`, `/api/delete-group-chat/:id`. Coordinates with `useGroupChat` composable.
- **New Design:** Admin app oversight + Authenticated app collaboration. Split responsibility: user-level group management vs admin oversight.

## GroupSharingBadge.vue (~380 LOC)
- Status widget showing group sharing toggle, number of shared chats, and quick access button to GroupManagementModal.
- Watches `groupCount`, `isEnabled`, polls `/api/group-chats` for updates.
- **New Design:** Lives in Authenticated User toolbar module (tie-in with BottomToolbar). Should become part of shared status indicator kit.

## AgentStatusIndicator.vue (~300 LOC)
- Displays current agent status, sign-in/out buttons, workflow prompts, and knowledge-base readiness messages.
- Emits `sign-in`, `sign-out`, `open-agent`, `open-kb`, etc.; integrates with AppStateManager for live state.
- **New Design:** Shared at top level of user experience; also reused within Admin dashboards. Merge with other status cards to reduce duplication.

## VuePdfViewer.vue (~370 LOC)
- Wraps `VuePDF` component (based on pdfjs) for inline PDF preview; exposes page navigation, zoom, download, and text-layer toggles.
- Accepts `file` prop, emits `error`, `loaded`. Has fallback UI for PDF errors. Used by PopUp component.
- **New Design:** Shared UI module (likely part of file management/preview library). Could be extracted into separate package or reused by Admin & User apps.

---

**General Component Notes:**
- All components depend on Quasar; when splitting repos ensure consistent Quasar plugin setup.
- Many rely directly on global `appStateManager`; as noted earlier, migrate toward scoped stores/composables per app.
- API endpoints referenced here should match backend outlines to avoid duplication during migration.

