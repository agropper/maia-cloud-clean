# New Design Inventory Workspace

This branch is an empty workspace for cataloging the existing MAIA server into the "New Design" architecture.

## Goals
- Document the responsibilities currently handled by `server.js` and related modules.
- Decide which functionality becomes shared services versus app-specific code (Admin, Public, Authenticated User).
- Plan the extraction of DigitalOcean, Cloudant, and Resend integrations into reusable clients.
- Identify logging, session management, and background jobs that must move into shared infrastructure.

## Next Steps
1. Create an inventory of the major feature areas (auth, chat, knowledge base management, admin tools).
2. Map each area to its future home (Admin app, Public app, User app, or shared backend package).
3. Record open questions and dependencies for the new repositories.
4. Outline the minimum shared libraries required before copying code into the new apps.

Add findings and diagrams here as we explore the current codebase.
