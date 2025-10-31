# Composables, Layout, and Types Inventory (merging branch)

## Composables
- **useGroupChat.ts (~230 LOC):** Provides CRUD helpers for shared group chats via `/api/group-chats`, `/api/load-group-chat/:id`, `/api/save-group-chat`. Exposes types for `GroupChat` and `SaveGroupChatResponse`. Needed by chat UI and group management modal.
- **useQuery.ts (~200 LOC):** Centralized POST helper with token estimates and error handling. Wraps `fetch`, retries, handles chat provider-specific errors. Shared by chat prompt components.
- **useChatState.ts (~120 LOC):** Reactive store for chat state (messages, loading flags, file attachments). Acts as lightweight global store used across chat components.
- **useTranscript.ts (~170 LOC):** Builds transcripts, audit logs, and session metadata for PDF export; integrates with `useChatLogger`.
- **useCouchDB.ts (~120 LOC):** Encapsulates saved chat persistence through `/api/save-chat`, `/api/load-chats`, `/api/delete-chat` endpoints.
- **useChatLogger.ts (~110 LOC):** Tracks chat log entries, system events, timeline chunks. Used by transcript generation and debugging.
- **useDialogAccessibility.ts (~90 LOC):** Fixes Quasar dialog accessibility by adjusting `aria-hidden` and `inert` attributes.

**New Design:** Convert composables into typed modules; some should live in shared front-end SDK (chat state/logger/transcript). Consider adopting Pinia for state.

## Layout & Entry
- **App.vue (~337 LOC):** Top-level component orchestrating chat prompt, admin panel, onboarding modals. Uses `appInitializer`, `appStateManager`, and dialog accessibility composable.
- **main.ts (~115 LOC):** Bootstraps Vue app with Quasar, global CSS, and fetch interceptor handling 429 errors.
- **CSS (`main.scss`, `base.scss`, `quasar.variables.sass`):** Global styling overrides for Quasar, accessibility tweaks, typography.

**New Design:** Each app (Admin, User, Public) will need its own entry shell and CSS. Shared styles should move to design system package.

## Types
- **types/maia2-types.ts (~380 LOC):** Extensive type definitions for multi-user system (users, agents, KBs, sessions, workflows, events). Some portions unused in current UI but relevant for backend data models.
- **types/index.ts (~90 LOC):** Chat-centric types (`ChatHistoryItem`, `TimelineChunk`), constants (`MAX_SIZE`, `TOKEN_LIMIT`), validation results.

**New Design:** Consolidate type definitions into shared `@maia/types` package. Ensure backend and frontend share these interfaces to avoid drift.

