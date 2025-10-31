# New Design Inventory Workspace

This branch is an empty workspace for cataloging the existing MAIA server into the "New Design" architecture.

## Goals
- Document the responsibilities currently handled by `server.js` and related modules.
- Decide which functionality becomes shared services versus app-specific code (Admin, Public, Authenticated User).
- Plan the extraction of DigitalOcean, Cloudant, and Resend integrations into reusable clients.
- Identify logging, session management, and background jobs that must move into shared infrastructure.

## Inventory Artifacts
- [`inventory/server-outline.md`](inventory/server-outline.md) — high-level map of `server.js` responsibilities with proposed destinations in the New Design.

## Next Steps
1. Expand the inventory to cover other large files (`src/routes/admin-management-routes.js`, etc.).
2. Map environment configuration requirements per app (Admin/Public/User).
3. Outline the minimum shared libraries required before copying code into the new apps.
4. Record open questions and risks as we discover entanglements in the legacy architecture.

Add findings and diagrams here as we explore the current codebase.
