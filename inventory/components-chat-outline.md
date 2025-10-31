# Chat Components Inventory (merging branch)

Line references are approximate for 2025‑10‑31 `merging` snapshot.

## ChatPromptRefactored.vue (~2.3k LOC)
- **Role:** Main chat shell for public, deep-link, and authenticated users. Coordinates prompt submission, AI target selection, knowledge-base management entry points, and dozens of modal workflows.
- **Dependencies:**
  - Imports state/composables (`useChatState`, `useChatLogger`, `useTranscript`, `useAuthHandling`, `useCouchDB`, `useGroupChat`), UI components (`ChatArea`, `BottomToolbar`, `PopUp`, `SavedChatsDialog`, numerous modal dialogs), and utilities (`WorkflowUtils`, `AppStateManager`, `UserService`).
  - Maintains shared constants (`AIoptions`, workflow step metadata) and accesses `API_BASE_URL`.
- **State & watchers:**
  - Large collection of refs for agent dialogs, knowledge-base actions, passkey auth, saved-chat import, deep-link flows, KB polling, bucket files, and workflow progress flags.
  - Watches `appState` and AppStateManager values (`currentUser`, `currentAgent`, `currentKnowledgeBase`, `workflowStage`), file uploads, and route changes to trigger UI transitions.
- **Key behaviors:**
  - Prompt submission via `sendQuery` to whichever provider is selected; handles streaming responses, logging, timeline chunks, transcript generation, and optional NOSH export.
  - File upload pipeline hooking into `/api/upload-file`, `/api/organize-files-for-kb`, `/api/kb-move-file`, `/api/automate-kb-with-organized-files`, `/api/update-kb-files`, `/api/automate-kb-and-summary`.
  - Knowledge-base controls (start indexing, manage KB, reconcile files) reusing backend endpoints inventoried earlier.
  - Deep link onboarding using `/api/deep-link-users`, `/api/shared/:shareId`; toggles modals for user identification and summarization.
  - Tracks admin analytics via `/api/admin-management/agent-activities` and bucket status with `/api/users/:id/kb-file-locations`.
  - Integrates AgentManagementDialog for rich agent management without leaving chat.
- **New Design mapping:**
  - Forms the nucleus of the **Authenticated User App** chat experience, but also contains public/deep-link logic that should become a lighter **Public App** shell.
  - Recommended split: extract provider-agnostic chat composer, separate knowledge-base automation panel, and move admin analytics logging into a shared SDK.

## ChatPrompt.vue (~1.1k LOC)
- **Role:** Legacy chat prompt (pre-refactor) still bundled for fallback/testing.
- **Features:**
  - Simpler template with single textarea, agent dropdown, file uploader, and saved chats list.
  - Interacts with `useChatState`, `useAuthHandling`, `sendQuery`, and `saveChat` but lacks the newer workflow modals.
  - Handles PDF export, file drag/drop, AI provider toggle, and basic admin alerts.
- **New Design mapping:**
  - Candidates: retire once the refactored component fully replaces it. If kept, move into a “legacy tools” area in the user app for support testing only.

## ChatArea.vue (~1.0k LOC)
- **Role:** Conversation display component used by both ChatPrompt variants.
- **Template:**
  - Renders timeline of messages with avatars, role badges, code blocks, attachments, loading skeletons, and transcripts.
  - Contains inline buttons for copy-to-clipboard, regenerate, share, and file preview.
- **Script:**
  - Props for `messages`, `isLoading`, `storyMode`, `selectedAgent`, `currentUser`, etc.; emits `retry`, `cancel`, `save`, `share`, `openAgent`, `openKB` events.
  - Utilities for auto-scrolling, code block copying, Markdown rendering, and streaming token progress.
  - Handles HTML-to-text conversion for transcripts and exposes computed `hasAgent`, `isPublicUser`, `shouldShowSummary`.
- **New Design mapping:**
  - Shared UI widget required by both **Authenticated User** and **Public** apps. Should be moved into a shared front-end package (with styling tokens extracted) so each app can embed it with different chrome.

---

### Cross-cutting observations
- All chat components rely heavily on `AppStateManager` global; refactor toward explicit stores (Pinia/Composable) to make multi-app packaging easier.
- File upload and knowledge-base automation logic in `ChatPromptRefactored` overlaps with `AgentManagementDialog`; consider extracting shared services (e.g., `kbClient`, `bucketClient`) to avoid duplication.
- Public/deep-link UX, admin analytics logging, and private-agent workflow could be separated into feature modules to reduce the size of the main prompt component before migration.

