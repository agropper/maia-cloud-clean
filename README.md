# New Design Inventory Workspace

This branch is an empty workspace for cataloging the existing MAIA server into the "New Design" architecture.

## Goals
- Document the responsibilities currently handled by `server.js` and related modules.
- Decide which functionality becomes shared services versus app-specific code (Admin, Public, Authenticated User).
- Plan the extraction of DigitalOcean, Cloudant, and Resend integrations into reusable clients.
- Identify logging, session management, and background jobs that must move into shared infrastructure.

## Inventory Artifacts
- [`inventory/server-outline.md`](inventory/server-outline.md) — high-level map of `server.js` responsibilities with proposed destinations in the New Design.
- [`inventory/admin-management-outline.md`](inventory/admin-management-outline.md) — breakdown of `src/routes/admin-management-routes.js` and how each admin feature maps to the split architecture.
- [`inventory/components-admin-ui-outline.md`](inventory/components-admin-ui-outline.md) — summary of the large admin-facing Vue components and how they split across future apps.
- [`inventory/components-chat-outline.md`](inventory/components-chat-outline.md) — inventory of chat prompt and chat area components shared between public and authenticated experiences.
- [`inventory/routes-outline.md`](inventory/routes-outline.md) — overview of remaining legacy route modules (`passkey-routes.js`, `admin-routes.js`).
- [`inventory/utilities-outline.md`](inventory/utilities-outline.md) — shared utility modules (cache manager, state manager, auth handling, CouchDB clients) and their future homes.
- [`inventory/components-misc-outline.md`](inventory/components-misc-outline.md) — additional UI components (passkey dialog, KB list, saved chats, group management, file preview).
- [`inventory/backend-utilities-outline.md`](inventory/backend-utilities-outline.md) — remaining backend utilities, middleware, and maintenance scripts.
- [`inventory/components-dialogs-outline.md`](inventory/components-dialogs-outline.md) — onboarding/help/patient summary modals and their target apps.
- [`inventory/composables-and-layout-outline.md`](inventory/composables-and-layout-outline.md) — composables, global layout, and shared type definitions.

## Next Steps
1. Expand the inventory to cover any newly created files as the refactor proceeds.
2. Map environment configuration requirements per app (Admin/Public/User).
3. Outline the minimum shared libraries required before copying code into the new apps.
4. Record open questions and risks as we discover entanglements in the legacy architecture.

Add findings and diagrams here as we explore the current codebase.
