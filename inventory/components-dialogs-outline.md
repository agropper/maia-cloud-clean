# Additional Modal & UI Components Inventory (merging branch)

## DeepLinkUserModal.vue
- Collects name/email for users arriving through `/shared/:shareId` deep links. Validates input, calls `/api/deep-link-users` to register/attach share, emits `identified` event for parent to continue onboarding. Includes access control hints (email privacy).
- **New Design:** Shared component used by Public and Authenticated apps. Move to shared front-end module with dedicated deep-link service.

## SignInDialog.vue
- Guided passkey sign-in UI: prompts for user ID, calls `/api/passkey/auth/options` & `/api/passkey/auth/verify`. Handles loading states, errors, success handoff (emits `signed-in`). Works alongside PasskeyAuthDialog.
- **New Design:** Shared front-end component included in Admin and Authenticated apps.

## AppLoadingState.vue
- Overlay spinner with progress percent, messages during background initialization (agent fetch, KB updates). Listens for reactive props `isLoading`, `progress`, `loadingTitle`.
- **New Design:** Provide as reusable UI overlay in user/public apps.

## HelpPage.vue & HelpWelcomeModal.vue
- Display help content (PDF doc) within modal/page overlay. Uses `VuePDF` to render docs, includes navigation, fallback text, contact info.
- **New Design:** Shared documentation module; keep in user app but treat as standalone component to embed in future designs.

## WelcomeModal.vue & NewUserWelcomeModal.vue
- Onboarding flows for new users: explain privacy modes, prompt to request support, track wizard progress. Emit events for `request-support` or closing.
- **New Design:** Authenticated User app; may be split into smaller onboarding steps.

## KnowledgeBaseWelcomeModal.vue, KBUpdateWarningModal.vue, KBOwnershipTransferModal.vue
- Knowledge-base related modals: instruct user to upload files, warn about replacing existing KB, transfer ownership (requires admin password).
- Trigger backend endpoints (`/api/update-kb-files`, `/admin-management/users/:id/fix-orphaned-kbs`, etc.).
- **New Design:** Authenticated + Admin apps; centralize KB action flows in shared KB module.

## HelpWelcomeModal.vue, PublicUserKBWelcomeModal.vue, PublicUserNoKBModal.vue
- Public-mode instructions explaining demo patients, how to attach KB, or to choose patient record. Guide public user to agent management dialog.
- **New Design:** Public app UI kit.

## PatientSummaryModal.vue & PatientSummaryViewModal.vue
- Manage patient summary generation and display: provide choices (view/redo), show saved summary with metadata, allow re-generation.
- Hit `/api/personal-chat` or summary endpoints via parent; rely on `VueMarkdown` for rendering.
- **New Design:** Authenticated User app feature alongside summary management flows.

## FileBadge.vue
- Displays uploaded files as chips with icons/colors, includes quick view button (emits `view`). Used in chat prompts and KB dialogs.
- **New Design:** Shared UI component across apps.

## TooltipTest.vue
- Playground component for testing tooltip behaviors (native, CSS, Vue). Likely not needed in production.
- **New Design:** move to documentation/examples or drop.

---

**General Observations:**
- Most modals depend heavily on Quasar components and `appStateManager` for reactivity. When splitting apps, ensure each repo sets up consistent Quasar plugin config.
- Backend endpoints referenced here should align with the inventories of routes to avoid drift when migrating.
- Consider consolidating overlapping modals (multiple welcome/help variations) to reduce maintenance overhead in the new architecture.

