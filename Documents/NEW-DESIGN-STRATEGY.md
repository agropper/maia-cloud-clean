# New Design Strategy

## Goal
Build a simplified, maintainable MAIA with **two apps** (Public and User) sharing one Cloudant database and one DigitalOcean OpenSearch database, without carrying over dead code, debug messages, or architectural complexity from the old design.

## Repository Strategy

### Option 1: New Repository (RECOMMENDED)
**Advantage:** Complete separation from old complexity

```
Create: maia-cloud-user-app (new repo)
├── user.agropper.xyz (Authenticated User app with passkeys)
│   ├── README.md
│   ├── package.json
│   ├── vite.config.ts
│   ├── server/              # Backend for User app
│   │   ├── index.js         # Express server
│   │   ├── routes/
│   │   │   ├── auth-routes.js
│   │   │   ├── chat-routes.js
│   │   │   └── kb-routes.js
│   │   └── services/
│   │       ├── digitalocean-client.js
│   │       ├── couchdb-client.js
│   │       └── passkey-service.js
│   ├── src/                 # Vue frontend for User app
│   │   ├── components/
│   │   │   ├── ChatPrompt.vue
│   │   │   ├── PasskeyAuth.vue
│   │   │   └── AgentManagement.vue
│   │   └── composables/
│   │       ├── useAuth.ts
│   │       └── useChat.ts
│   └── .env                 # PASSKEY_RPID=user.agropper.xyz
│
Create: maia-cloud-public-app (new repo)
├── public.agropper.xyz (Public demo app)
│   ├── README.md
│   ├── package.json
│   ├── vite.config.ts
│   ├── server/              # Backend for Public app
│   │   ├── index.js
│   │   └── routes/
│   │       ├── demo-routes.js
│   │       └── deeplink-routes.js
│   ├── src/                 # Vue frontend for Public app
│   │   └── components/
│   │       ├── DemoChat.vue
│   │       └── DeepLinkViewer.vue
│   └── .env                 # No passkey config
│
Keep: maia-cloud-clean (current repo)
├── inventory/               # Reference documentation only
│   ├── server-outline.md
│   ├── components-admin-ui-outline.md
│   └── ...
└── Documents/               # Legacy docs
    └── ...
```

### Option 2: Orphan Branch
**Advantage:** Same history, but clean slate

```bash
# From merging branch
git checkout --orphan new-design-clean

# Remove all files
git rm -rf .

# Then selectively copy inventory artifacts
# Then build libraries from scratch
```

**Problem:** Still connected to old repo history. New repos are cleaner.

## Library Extraction Strategy

### Phase 1: Core Libraries (Shared)
Before building apps, extract shared services:

1. **DigitalOcean Client Library**
   - `lib-maia-do-client` (new mini-repo)
   - Functions: `createKB()`, `startIndexing()`, `pollIndexingJob()`, `getAgent()`, `listKB()` 
   - NO debug logging
   - Simple error handling
   - Export from inventory: `server-outline.md` sections 6, 10

2. **Cloudant Client Library**
   - `lib-maia-cloudant` (new mini-repo)
   - Functions: `getDocument()`, `saveDocument()`, `queryView()`, `getSession()`, `saveSession()`
   - NO cache manager complexity
   - Export from inventory: `backend-utilities-outline.md` CouchDB utilities

3. **Passkey Service Library**
   - `lib-maia-passkey` (new mini-repo)
   - Functions: `generateRegistrationOptions()`, `verifyRegistration()`, `generateAuthOptions()`, `verifyAuth()`
   - From: `src/routes/passkey-routes.js`
   - Configuration: `rpID` and `origin` only

### Phase 2: User App Implementation
Build `maia-cloud-user-app` using the libraries:

**Backend (`server/`):**
```
index.js                    # Express setup, minimal
├── routes/
│   ├── auth-routes.js      # Use lib-maia-passkey
│   ├── chat-routes.js      # Use lib-maia-do-client for GenAI
│   ├── kb-routes.js        # Use lib-maia-do-client + lib-maia-cloudant
│   └── user-routes.js      # Use lib-maia-cloudant
└── services/
    ├── session-store.js    # Use lib-maia-cloudant
    └── email-service.js    # Resend wrapper
```

**Frontend (`src/`):**
```
App.vue                     # Root component
├── components/
│   ├── PasskeyAuthDialog.vue        # From existing, clean
│   ├── ChatPromptRefactored.vue     # From existing, remove debug
│   ├── AgentManagementDialog.vue    # From existing, remove admin code
│   └── KnowledgeBaseList.vue        # From existing, simplified
├── composables/
│   ├── useAuth.ts          # Use lib-maia-passkey calls
│   ├── useChat.ts          # Use chat-routes API
│   └── useKB.ts            # Use kb-routes API
└── entry/
    └── main.ts             # Vue init
```

**Configuration:**
```
.env
PASSKEY_RPID=user.agropper.xyz
PASSKEY_ORIGIN=https://user.agropper.xyz
DOMAIN=user.agropper.xyz
CLOUDANT_URL=...
DIGITALOCEAN_TOKEN=...
SPACES_KEY=...
RESEND_KEY=...
```

### Phase 3: Public App Implementation
Build `maia-cloud-public-app` using same libraries:

**Backend:**
```
index.js                    # Express setup, minimal
├── routes/
│   ├── demo-routes.js      # Pre-seeded demo chat
│   └── deeplink-routes.js  # Share retrieval, viewer
└── services/
    └── session-store.js    # Use lib-maia-cloudant (public users)
```

**Frontend:**
```
App.vue                     # Root component
├── components/
│   ├── DeepLinkUserModal.vue       # From existing
│   ├── PublicUserKBWelcomeModal.vue
│   └── DemoChat.vue                # Simplified chat
└── composables/
    └── useDeeplink.ts      # From existing
```

**Configuration:**
```
.env
DOMAIN=public.agropper.xyz
CLOUDANT_URL=...
DIGITALOCEAN_TOKEN=...
SPACES_KEY=...
RESEND_KEY=...
# NO PASSKEY CONFIG
```

## Avoiding Legacy Complexity

### 1. No Cache Manager
- Direct Cloudant queries in routes
- Add simple request caching if needed later

### 2. No AppStateManager
- Use Vue `ref()` / `reactive()` for local state
- API calls go directly to backend routes

### 3. No Complex Middleware
- Session middleware: simple `express-session` with Cloudant store
- Auth middleware: check `req.session.userId`
- Rate limiting: `express-rate-limit` only

### 4. No Debug Messages
- Production logging: Winston with levels (INFO, WARN, ERROR)
- Remove all `[*]`, `[KB STEP]`, `[KBM STEP]` prefixed logs
- Remove all debug console.logs in production

### 5. No Background Jobs in Server
- Indexing polling: client-side frontend (or separate worker)
- No cron-like `setInterval` in Express
- Health checks: simple `/health` endpoint

### 6. Minimal Frontend State
- No global AppState singleton
- Composables return reactive objects
- Components manage their own local state

## Migration Process

### Step 1: Extract Libraries (Week 1)
1. Create `lib-maia-do-client`
   - Read inventory markdown
   - Copy working functions from `server.js`
   - Strip debug logs, add JSDoc
   - Add unit tests
   - Publish as npm package or local symlink

2. Create `lib-maia-cloudant`
   - Read inventory markdown
   - Copy CouchDB utilities
   - Strip cache manager code
   - Add session store adapter
   - Publish as npm package or local symlink

3. Create `lib-maia-passkey`
   - Copy `src/routes/passkey-routes.js`
   - Extract logic to service class
   - Make rpID/origin configurable
   - Publish as npm package or local symlink

### Step 2: Build User App (Week 2)
1. Scaffold Vue + Express app
2. Install libraries from Step 1
3. Copy clean components from inventory:
   - `PasskeyAuthDialog.vue` (remove debug)
   - `ChatPromptRefactored.vue` (remove debug, simplify)
   - `AgentManagementDialog.vue` (remove admin code)
4. Build minimal backend routes
5. Test with local Cloudant and DO accounts

### Step 3: Build Public App (Week 3)
1. Scaffold Vue + Express app
2. Install libraries from Step 1
3. Copy clean components:
   - `DeepLinkUserModal.vue`
   - `PublicUserKBWelcomeModal.vue`
   - `DemoChat.vue`
4. Build minimal backend routes
5. Test with shared Cloudant

### Step 4: Deployment
1. Deploy User app to `user.agropper.xyz` on DO App Platform
2. Deploy Public app to `public.agropper.xyz` on DO App Platform
3. Both apps share same Cloudant database
4. Both apps use same DO OpenSearch database
5. Test end-to-end flows

## Example Code Comparison

### OLD (Complex)
```javascript
// server.js line 8000+
console.log(`📦 [KB STEP] MOVING ${sourceKey} to ${destKey}`);
const copyCommand = new CopyObjectCommand({...});
cacheManager.getCached('kb', kbId, async () => {
  const doData = await fetchDOAPI();
  await updateCouchDB();
  await cacheManager.setCached('kb', kbId, doData);
  appStateManager.notifyKBUpdate(kbId);
});
```

### NEW (Simple)
```javascript
// server/routes/kb-routes.js
app.post('/api/kb/create', async (req, res) => {
  const kbId = await doClient.createKB(req.body);
  await cloudant.saveDocument('maia_kb', { _id: kbId });
  res.json({ kbId });
});
```

## Success Criteria

1. User app works with passkeys on `user.agropper.xyz`
2. Public app works without passkeys on `public.agropper.xyz`
3. Both apps share Cloudant and DO databases
4. No debug messages in production logs
5. Total codebase < 5,000 lines per app
6. No library > 500 lines
7. All inventory docs describe migration path

## Repository Organization

With **new repos**, the final structure is:

```
maia-cloud-repos/
├── lib-maia-do-client/         # Shared DigitalOcean client
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Main export
│   │   ├── kb.js               # KB operations
│   │   ├── agent.js            # Agent operations
│   │   └── indexing.js         # Indexing jobs
│   └── README.md
│
├── lib-maia-cloudant/          # Shared Cloudant client
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Main export
│   │   ├── document-client.js  # getDocument, saveDocument
│   │   └── session-store.js    # express-session store
│   └── README.md
│
├── lib-maia-passkey/           # Shared passkey service
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Main export
│   │   ├── registration.js     # Registration flow
│   │   └── authentication.js   # Authentication flow
│   └── README.md
│
├── maia-cloud-user-app/        # User app (user.agropper.xyz)
│   ├── package.json             # Dependencies on lib-*
│   ├── server/
│   ├── src/
│   └── README.md
│
├── maia-cloud-public-app/      # Public app (public.agropper.xyz)
│   ├── package.json             # Dependencies on lib-*
│   ├── server/
│   ├── src/
│   └── README.md
│
└── maia-cloud-clean/           # Current repo (inventory only)
    ├── inventory/
    ├── Documents/
    └── README.md
```

**Development workflow:**
1. Libraries are independent npm packages (publish to npm or use local symlinks during development)
2. During development: use `npm link` to symlink libraries for instant changes
3. During production: publish libraries to npm and `npm install` normally
4. Each app has its own `.env` and deployment config
5. DigitalOcean App Platform deploys each app separately

**Example symlink workflow (development):**
```bash
# In lib-maia-do-client/
npm link

# In maia-cloud-user-app/
npm link lib-maia-do-client

# Now changes to lib-maia-do-client immediately reflect in user-app
# No need to publish and reinstall
```

## Next Steps

1. Review and approve this strategy
2. Create library repos (`lib-maia-do-client`, `lib-maia-cloudant`, `lib-maia-passkey`)
3. Extract first library as proof of concept
4. Build User app MVP
5. Test with real Cloudant and DO accounts
6. Iterate on libraries based on app needs

