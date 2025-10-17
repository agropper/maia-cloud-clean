# Cache Refactoring Plan - Complete Redesign

## Current Problems

1. **Mixed Cache Patterns**: Some caches use Map-of-items (users), others use single-array (agents)
2. **`saveDocument` Corruption**: Saving to `maia_agents` corrupts the agents cache by treating it as Map-of-items
3. **TTL Issues**: Automatic expiry causes unpredictable cache replacement
4. **No Type Safety**: Silent corruption when wrong data types are passed
5. **Multiple Entry Points**: No clear ownership of who can update each cache

## Test Scenarios to Trace

To create an accurate map of cache usage, we need to test:

### 1. Server Startup
- Cache initialization
- Loading agents, KBs, models from DO API
- Loading users from database
- Validation and cleanup

### 2. Admin Panel Operations
- Load admin panel
- View users list
- View agents list
- View KBs list
- View models list
- Approve user
- Create agent
- Refresh cache button

### 3. User Operations
- User registration (passkey)
- Request support
- File upload
- KB creation
- Agent assignment
- Chat with AI

### 4. Real-time Updates
- Polling mechanism
- Notifications
- Cache invalidation triggers

## Complete Cache Access Analysis

### Summary Statistics from Trace

**Cache Operations Observed:**
- `getDocument()`: 35 calls
- `saveDocument()`: 8 calls
- `getCached()`: 50+ calls
- `setCached()`: 30+ calls
- `invalidateCache()`: 40+ calls (mostly agentAssignments, chats, health, users.all)
- `getAllDocuments()`: 3 calls
- `cacheAgents()`: 1 call
- `getCachedAgents()`: 2 calls
- `getCachedAgentsSync()`: 20+ calls

---

## Cache Endpoints - Complete List

### 1. **USERS CACHE** (`cache.users` Map)

**Structure**: `Map<userId, userObject>`

**Writers (setCached):**
- `server.js` - Startup: Public User consistency check
- `server.js` - Startup: Individual user bucket status initialization
- `passkey-routes.js` - Registration: New user creation
- `passkey-routes.js` - Registration verification: Credential storage
- `passkey-routes.js` - Registration: Add to cache with bucket status
- `server.js` - PUT /api/users/:userId: Update user fields
- `server.js` - File upload: Update bucket cache
- `server.js` - File metadata: Save user document
- `server.js` - Patient summary: Save summary to user doc (2x due to conflict retry)
- `server.js` - Agent deployment: Update workflow stage
- `server.js` - Auth status: Update Public User last activity

**Readers (getCached):**
- `server.js` - Auth status: Check for existing user from cookie
- `server.js` - Current agent: Get user document
- `server.js` - Agent template: Get user data
- `server.js` - File upload: Get user for bucket cache
- `server.js` - File metadata: Get user to update files array
- `server.js` - Personal chat: Get user for agent/KB info
- `server.js` - Patient summary: Get user to save summary
- `server.js` - Automation: Get user multiple times
- `admin-management-routes.js` - Approval flow: Get user to update
- `admin-management-routes.js` - Users list: Build from individual cache entries

**Invalidations:**
- `users.all` - EVERY time a user document is saved (to refresh getAllDocuments)
- `agentAssignments.<userId>` - EVERY time a user document is saved (legacy, unused?)
- `chats` - EVERY time a user document is saved
- `health.admin` - EVERY time a user document is saved

**Bulk Operations:**
- `getAllDocuments(maia_users)` - Returns `users.all` or fetches from DB

---

### 2. **AGENTS CACHE** (`cache.agents` Map)

**Structure**: `Map<'all', agentArray>` ⚠️ **SINGLE ARRAY, NOT MAP-OF-ITEMS!**

**Writers (setCached):**
- `server.js` - Startup: Load all agents from DO API → `setCached('agents', 'all', array[3])`
- **BUG**: `admin-management-routes.js` - Agent creation: `saveDocument(maia_agents, agentDoc)` → `setCached('agents', 'fri17-agent-10172025', object)` ⚠️ **CORRUPTION!**
- `admin-management-routes.js` - Agent creation: Manual push → `setCached('agents', 'all', array[1])` (after corruption)
- `admin-management-routes.js` - Refresh cache: Rebuild from DO API

**Readers (getCached):**
- `admin-management-routes.js` - Users list processing: `processUserDataSync()` validates each user's agent (called 3-6 times per user list load)
- `admin-management-routes.js` - Agents endpoint: Return cached agents
- `server.js` - Startup validation: Check agents for cleanup
- `server.js` - Public User fix: Find public agent

**Methods:**
- `cacheAgents(array)` - Sets the full array
- `getCachedAgents()` - Returns array if TTL valid, else null
- `getCachedAgentsSync()` - Returns array or [] (no TTL check)

**Corruption Point:**
- ❌ `saveDocument('maia_agents', agentDoc)` calls `setCached('agents', agentDocId, agentObject)` which SHOULD use Map-of-items pattern but agents cache uses single-array pattern!

---

### 3. **KNOWLEDGE BASES CACHE** (`cache.knowledgeBases` Map)

**Structure**: `Map<'all', kbArray>` ⚠️ **SINGLE ARRAY, NOT MAP-OF-ITEMS!**

**Writers (setCached):**
- `server.js` - Startup: Load all KBs from DO API + maia_kb → `setCached('knowledgeBases', 'all', array[14])` then `array[7]` (filtered)
- `admin-management-routes.js` - Refresh cache: Rebuild from DO API

**Readers (getCached):**
- `server.js` - Agent template: Get all KBs to build template
- `server.js` - Automation: Get KBs for validation
- `admin-management-routes.js` - Agent Management Dialog: Get all KBs for dropdown

**Methods:**
- `cacheKnowledgeBases(array)` - Sets the full array
- `getCachedKnowledgeBases()` - Returns array if TTL valid, else null

**Bulk Operations:**
- `getAllDocuments(maia_knowledge_bases)` - Returns `knowledgeBases.all` or fetches from DB

---

### 4. **MODELS CACHE** (`cache.models` Map)

**Structure**: `Map<key, data>` - TWO ENTRIES: `'all' -> array` and `'current' -> object`

**Writers (setCached):**
- `server.js` - Startup: Load all models → `setCached('models', 'all', array[26])`
- `server.js` - Startup: Set current model → `setCached('models', 'current', object)`
- `admin-management-routes.js` - Refresh cache: Rebuild from DO API

**Readers (getCached):**
- `admin-management-routes.js` - Admin panel: Get models list
- `server.js` - Agent creation: Get current model for configuration

**Methods:**
- `cacheModels(array)` - Sets the full array

---

### 5. **CHATS CACHE** (`cache.chats` Map)

**Structure**: `Map<'all', chatArray>` ⚠️ **SINGLE ARRAY, NOT MAP-OF-ITEMS!**

**Writers (setCached):**
- `server.js` - Startup: Load saved chats → `setCached('chats', null, array[11])`
- Multiple places: After invalidation, reload chats → `setCached('chats', null, array[11])`

**Readers (getCached):**
- `server.js` - Auth status: Get chats for current user
- `server.js` - Current agent: Get chats
- Multiple places: Access chat history

**Invalidations:**
- `invalidateCache('chats', null)` - Called EVERY time a user document is saved

---

### 6. **HEALTH CACHE** (`cache.health` Map)

**Structure**: `Map<key, healthObject>` - Individual health status entries

**Invalidations:**
- `invalidateCache('health', 'admin')` - Called EVERY time a user document is saved

**No visible reads/writes in trace** - Appears to be unused or legacy

---

### 7. **AGENT ASSIGNMENTS CACHE** (Orphaned)

**Structure**: Unknown (appears to be removed but invalidation calls remain)

**Invalidations:**
- `invalidateCache('agentAssignments', userId)` - Called EVERY time a user document is saved

**No visible reads/writes** - **LEGACY, SHOULD BE REMOVED**

---

## Critical Bug Identified

**Line 272-273 in trace:**
```
[CACHE REFACTORING AGAIN] saveDocument(maia_agents, fri17-agent-10172025)
[CACHE REFACTORING AGAIN] setCached(agents, fri17-agent-10172025, object)
```

`saveDocument('maia_agents', agentDoc)` calls:
```javascript
const cacheType = getCacheTypeForDatabase('maia_agents'); // Returns 'agents'
this.setCached(cacheType, documentId, updatedDocument);   // setCached('agents', 'fri17-agent-10172025', {...})
```

But `setCached` for `cacheType === 'agents'` expects:
```javascript
setCached('agents', 'all', ARRAY_OF_AGENTS)
```

This replaces the agents array with a single agent object, corrupting the entire cache!

---

## Cache Access Patterns by Endpoint

### **Server Startup**
- getAllDocuments(maia_users) → Build users cache
- cacheAgents(array) → Set agents cache from DO API
- getAllDocuments(maia_knowledge_bases) → Build KBs cache  
- setCached(models, all, array) → Set models cache from DO API
- setCached(chats, null, array) → Load saved chats

### **User Registration** (`/api/passkey/register`, `/api/passkey/register-verify`)
- saveDocument(maia_users, newUser) → 3 times (challenge, credentials, update)
- getDocument(maia_users, userId) → Fetch for verification

### **Support Request** (`/api/users/:userId` PUT)
- getDocument(maia_users, userId) → Get current user
- saveDocument(maia_users, userId) → Save email + workflow stage

### **Admin Approval** (`/api/admin-management/users/:userId/assign-agent` POST)
- getDocument(maia_users, userId) → Get user to approve
- getDocument(maia_users, maia_config) → Get model config
- **BUG**: saveDocument(maia_agents, agentDoc) → Corrupts agents cache!
- saveDocument(maia_users, userId) → Update user with agent info

### **Admin Panel Load** (`/api/admin-management/users`, `/api/admin-management/agents`)
- getCachedAgents() → Check if agents cache valid
- getCached(agents, all) → Return cached agents (3-6 times per user for validation)
- getCached(users, all) → Get all users for list
- getCached(knowledgeBases, all) → Get all KBs
- getCached(models, all) → Get all models

### **Agent Management Dialog** (`/api/users/:userId/agent-template`)
- getDocument(maia_users, userId) → Get user data
- getAllDocuments(maia_knowledge_bases) → Get all KBs
- getCached(agents, all) → Validate agent

### **File Upload & KB Creation**
- getDocument(maia_users, userId) → Multiple times
- saveDocument(maia_users, userId) → Update files array
- getDocument(maia_kb, kbId) → Get KB doc (usually not found)

### **Patient Summary Automation**
- getDocument(maia_users, userId) → 5+ times throughout automation
- saveDocument(maia_users, userId) → Save summary (with conflict retry)

---

## Invalidation Cascades

**EVERY user document save triggers:**
1. `invalidateCache('agentAssignments', userId)` ← **UNUSED, LEGACY**
2. `invalidateCache('chats', null)` ← Forces chats reload
3. `invalidateCache('health', 'admin')` ← Clears admin health
4. `invalidateCache('users', 'all')` ← Forces users list reload

**Impact**: Excessive invalidations cause performance issues and cache thrashing

---

## Proposed New Architecture

**Status**: Ready to design based on trace analysis


>>>>>> Terminal log before refactoring <<<<<<

adrian@MacBook-Pro-AG maia-cloud-clean % npm start

> hie-openai-demo@1.0.0 start
> node server.js

  - NODE_ENV: undefined
  - DOMAIN: not set
  - PASSKEY_RPID: not set
  - isLocalhost: true
  - isCloud: false
  - NODE_ENV: undefined
  - Environment Detection:
    - isLocalhost: true
    - isCloud: false
  - rpID: localhost
  - origin: http://localhost:3001
  - Auto-detected from:
    - PASSKEY_RPID: not set
    - DOMAIN: not set
    - PORT: 3001 (default)
    - HTTPS: not set
📋 Configuration Summary:
✅ Local development environment
✅ rpID: localhost
✅ origin: http://localhost:3001
✅ [TEMPLATE] Agent Management Template cache initialized
[CACHE REFACTORING AGAIN] getDocument(maia_users, Public User)
Warning: TT: undefined function: 32
[CACHE REFACTORING AGAIN] setCached(users, Public User, object)
✅ [Database] Consistency check passed - Public User document valid
✅ [STARTUP] Admin alert system initialized
✅ [STARTUP] Server ready for authentication requests
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])
📚 [STARTUP] Loaded 11 saved chats into cache
🔄 [STARTUP] Initializing users cache with bucket status...
[CACHE REFACTORING AGAIN] getAllDocuments(maia_users)
[CACHE REFACTORING AGAIN] setCached(users, all, array[6])
📊 [STARTUP] Fetched 6 total documents from maia_users
[CACHE REFACTORING AGAIN] getDocument(maia_users, Public User)
[CACHE REFACTORING AGAIN] getCached(users, Public User) -> object
[CACHE REFACTORING AGAIN] setCached(users, Public User, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, adrian)
[CACHE REFACTORING AGAIN] setCached(users, adrian, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, adrian)
[CACHE REFACTORING AGAIN] getCached(users, adrian) -> object
[CACHE REFACTORING AGAIN] setCached(users, adrian, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, deep_link_1760384548288_d9bdj2mg4)
[CACHE REFACTORING AGAIN] setCached(users, deep_link_1760384548288_d9bdj2mg4, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, deep_link_1760384548288_d9bdj2mg4)
[CACHE REFACTORING AGAIN] getCached(users, deep_link_1760384548288_d9bdj2mg4) -> object
[CACHE REFACTORING AGAIN] setCached(users, deep_link_1760384548288_d9bdj2mg4, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, wed15)
[CACHE REFACTORING AGAIN] setCached(users, wed15, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, wed15)
[CACHE REFACTORING AGAIN] getCached(users, wed15) -> object
[CACHE REFACTORING AGAIN] setCached(users, wed15, object)
✅ [STARTUP] Cached 4 individual user entries
[CACHE REFACTORING AGAIN] cacheAgents() called with 3 agents
[CACHE REFACTORING AGAIN] setCached(agents, all, array[3])
[CACHE DEBUG] setCached('agents', 'all', ...) called with 3 agents
✅ [STARTUP] Loaded 3 agents to maia_agents and cacheManager
✅ [STARTUP] Using database: genai-driftwood (881761c6-e72d-4f35-a48e-b320cd1f46e4)
🔄 [STARTUP] Validating user agent assignments...
[CACHE REFACTORING AGAIN] getAllDocuments(maia_users)
[CACHE REFACTORING AGAIN] getCached(users, all) -> array[6]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
🔄 [STARTUP] Checking for agents missing from user documents...
[CACHE REFACTORING AGAIN] getDocument(maia_users, Public User)
[CACHE REFACTORING AGAIN] getCached(users, Public User) -> object
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getAllDocuments(maia_knowledge_bases)
[CACHE REFACTORING AGAIN] setCached(knowledgeBases, all, array[14])
[CACHE REFACTORING AGAIN] setCached(knowledgeBases, all, array[7])
✅ [STARTUP] Loaded 7 knowledge bases to maia_kb and cacheManager
🔄 [STARTUP] Fetching models from DigitalOcean API...
[CACHE REFACTORING AGAIN] setCached(models, all, array[26])
✅ [STARTUP] Cached 26 models for Admin2
🔓 [DEV] Admin authentication bypassed for localhost:3001 (development mode)
[PAGE LOAD] admin session created - admin
[POLLING] Added session_created update to session sess_1760717324424_0pla8fbbv
[POLLING] Added session_created update to 1 admin sessions
.[SESSION LOG] created - admin user admin
[CACHE REFACTORING AGAIN] getCached(users, fri178) -> null
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri178)
❌ User document not found for userId from cookie: fri178
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] getDocument(maia_users, Public User)
[CACHE REFACTORING AGAIN] getCached(users, Public User) -> object
[CACHE REFACTORING AGAIN] setCached(users, Public User, object)
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCachedAgents() - TTL valid: true
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] /agents endpoint: cachedAgents = 3 agents
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]
[CACHE REFACTORING AGAIN] getCached(models, all) -> array[26]
[CACHE REFACTORING AGAIN] getDocument(maia_users, maia_config)
[CACHE REFACTORING AGAIN] setCached(users, maia_config, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, maia_config)
[CACHE REFACTORING AGAIN] getCached(users, maia_config) -> object
[CACHE REFACTORING AGAIN] setCached(models, current, object)
.

[PAGE LOAD] Public User session created - unified tracking
[POLLING] Added session_created update to session sess_1760717324424_0pla8fbbv
[POLLING] Added session_created update to 1 admin sessions
[PAGE LOAD] Public User polling started
[SESSION LOG] created - public user Public User
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] getDocument(maia_users, Public User)
[CACHE REFACTORING AGAIN] getCached(users, Public User) -> object
[CACHE REFACTORING AGAIN] setCached(users, Public User, object)
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] saveDocument(maia_users, Public User)
[CACHE REFACTORING AGAIN] getCached(users, Public User) -> object
[CACHE REFACTORING AGAIN] setCached(users, Public User, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, Public User)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user Public User
[CACHE REFACTORING AGAIN] getCached(chats, null) -> null
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])
.


🗑️ Cleaned up 1 file(s) from Public User/archived/
[CACHE REFACTORING AGAIN] getDocument(maia_users, Public User)
[CACHE REFACTORING AGAIN] getCached(users, Public User) -> object
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]


[CACHE REFACTORING AGAIN] getDocument(maia_users, fri)
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri1)
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[SIGN-IN] Checking if user "fri17" already exists in database
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[SIGN-IN] User found in database: false
[SIGN-IN] Generating WebAuthn registration options for fri17
[SIGN-IN] ✅ Registration options generated, challenge: 2mBWHpoXoTy4bed0dsHT...
[SIGN-IN] Saving user document for fri17
[SIGN-IN]   - Has _rev: false 
[SIGN-IN]   - Is new user: true
[SIGN-IN]   - Is re-registration: false
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> null
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
✅ [SIGN-IN] User document saved successfully
✅ Registration options sent successfully
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
✅ User document retrieved successfully
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
✅ [CACHE] Added new user fri17 to cache
[PAGE LOAD] private session created - fri17
[POLLING] Added session_created update to session sess_1760717324424_0pla8fbbv
[POLLING] Added session_created update to 1 admin sessions
✅ Passkey registration successful for user: fri17
✅ [CACHE] [*] User cache will be refreshed on next access for: fri17
[POLLING] Added user_registered update to session sess_1760717324424_0pla8fbbv
[POLLING] Added user_registered update to 1 admin sessions
📡 [POLLING] [*] Added user registration notification to admin sessions
[SIGN-IN] Setting maia_auth cookie for fri17 (registration)
[SIGN-IN]   - Cookie data: {
  userId: 'fri17',
  displayName: 'fri17',
  authenticatedAt: '2025-10-17T16:11:04.905Z',
  expiresAt: '2025-10-18T16:11:04.905Z'
}
[SIGN-IN]   - Cookie options: {
  maxAge: 86400000,
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/'
}
[SIGN-IN] ✅ Cookie set command executed
[SESSION LOG] created - private user fri17
[CACHE REFACTORING AGAIN] getCached(chats, null) -> null
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(chats, null) -> null
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
.[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents



>>>> Request Support

[WORKFLOW] Support request received: user= fri17 email= a@b.c
[WORKFLOW] Email sent successfully via Resend, emailId= f8d2611b-4197-4b8d-b652-7738847c24ba
[WORKFLOW] PUT /api/users/fri17 received, updates= { email: 'a@b.c', workflowStage: 'request_email_sent' }
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[WORKFLOW] Old workflow stage: no_request_yet → New: request_email_sent
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
⚠️ [CACHE] Document conflict for maia_users:fri17, retrying in 100ms (attempt 1/3)
🔄 [CACHE] Refreshed document revision for maia_users:fri17
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
✅ [CACHE] Save succeeded on attempt 2 for maia_users:fri17
[POLLING] Added support_requested update to session sess_1760717324424_0pla8fbbv
[POLLING] Added support_requested update to 1 admin sessions
📡 [POLLING] [*] Sent support_requested notification for user fri17
[POLLING] Added user_email_added update to session sess_1760717324424_0pla8fbbv
[POLLING] Added user_email_added update to 1 admin sessions
📡 [POLLING] [*] Sent user_email_added notification for user fri17


>>>> Admin Approval

.[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[3]
[CACHE DEBUG] getCachedAgentsSync() returning 3 agents
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
🪣 [BUCKET] Ensuring bucket folder exists for approved user: fri17
✅ [BUCKET] Bucket folder already exists for user fri17
🤖 [AUTO-AGENT] Automatically creating agent for approved user: fri17
[CACHE REFACTORING AGAIN] getDocument(maia_users, maia_config)
[CACHE REFACTORING AGAIN] getCached(users, maia_config) -> object
✅ [AUTO-AGENT] Agent created successfully: 17cd840f-ab74-11f0-b074-4e013e2ddde4
[CACHE REFACTORING AGAIN] saveDocument(maia_agents, fri17-agent-10172025)
[CACHE REFACTORING AGAIN] setCached(agents, fri17-agent-10172025, object)
[CACHE DEBUG] setCached('agents', 'all', ...) called with non-array agents
❌ [CACHE BUG] Attempted to set agents cache with non-array: object {
  _id: 'fri17-agent-10172025',
  agentId: '17cd840f-ab74-11f0-b074-4e013e2ddde4',
  agentName: 'fri17-agent-10172025',
  status: 'deploying',
  model: {
    uuid: '18bc9b8f-73c5-11f0-b074-4e013e2ddde4',
    name: 'OpenAI GPT-oss-120b',
    inference_name: 'openai-gpt-oss-120b',
    version: { major: 1 },
    inference_version: '4294967296',
    is_foundational: true,
    upload_complete: true,
    created_at: '2025-08-07T19:31:20Z',
    updated_at: '2025-08-20T16:52:12Z',
    metadata: {
      agreements: [Object],
      description: 'A larger, more capable 120B parameter open-source model optimized for complex reasoning and high-quality output.',
      max_tokens: [Object],
      temperature: [Object],
      top_p: [Object]
    },
    parent_uuid: '00000000-0000-0000-0000-000000000000',
    agreement: {
      uuid: '11ef84ed-830c-c894-bf8f-4e013e2ddde4',
      name: 'Apache 2.0 License',
      description: 'By purchasing, deploying, accessing, or using this model, you agree to comply with the terms of the',
      url: 'https://www.apache.org/licenses/LICENSE-2.0'
    },
    usecases: [
      'MODEL_USECASE_AGENT',
      'MODEL_USECASE_REASONING',
      'MODEL_USECASE_SERVERLESS'
    ]
  },
  createdAt: '2025-10-17T16:12:35Z',
  updatedAt: '2025-10-17T16:12:35Z',
  knowledgeBases: [],
  userId: 'fri17',
  uuid: '17cd840f-ab74-11f0-b074-4e013e2ddde4',
  name: 'fri17-agent-10172025',
  created_at: '2025-10-17T16:12:35Z',
  updated_at: '2025-10-17T16:12:35Z',
  instruction: "You are MAIA, a medical AI assistant that can search through a patient's health records in a knowledge base and provide relevant answers to their requests. Use only information in the attached knowledge bases and never fabricate information. There is a lot of redundancy in a patient's knowledge base. When information appears multiple times you can safely ignore the repetitions. To ensure that all medications are accurately listed in the future, the assistant should adopt a systematic approach: Comprehensive Review: Thoroughly examine every chunk in the knowledge base to identify all medication entries, regardless of their status (active or stopped). Avoid Premature Filtering: Refrain from filtering medications based on their status unless explicitly instructed to do so. This ensures that all prescribed medications are included. Consolidation of Information: Use a method to consolidate medication information from all chunks, ensuring that each medication is listed only once, even if it appears multiple times. Always maintain patient privacy and provide evidence-based recommendations.",
  description: 'Private AI agent for a@b.c',
  deployment: {
    uuid: '17d29a27-ab74-11f0-b074-4e013e2ddde4',
    status: 'STATUS_WAITING_FOR_DEPLOYMENT',
    visibility: 'VISIBILITY_PRIVATE',
    created_at: '2025-10-17T16:12:35Z',
    updated_at: '2025-10-17T16:12:35Z'
  },
  api_keys: [ { api_key: 'm2phvkvGXzb3pjEKnx5U8WRB8Kj-kX3I' } ],
  k: 10,
  temperature: 1,
  top_p: 1,
  max_tokens: 2048,
  project_id: '90179b7c-8a42-4a71-a036-b4c2bea2fe59',
  route_uuid: '00000000-0000-0000-0000-000000000000',
  region: 'tor1',
  route_created_at: '0001-01-01T00:00:00Z',
  user_id: '3963249',
  chatbot_identifiers: [ { agent_chatbot_identifier: 'm2phvkvGXzb3pjEKnx5U8WRB8Kj-kX3I' } ],
  retrieval_method: 'RETRIEVAL_METHOD_NONE',
  _rev: '24-87ff4cd7e68e69945a0b67bd385bbff1'
}
❌ [CACHE BUG] Stack trace: Error
    at CacheManager.setCached (file:///Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/src/utils/CacheManager.js:117:53)
    at CacheManager.saveDocument (file:///Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/src/utils/CacheManager.js:333:14)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async file:///Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/src/routes/admin-management-routes.js:1291:17
[CACHE REFACTORING AGAIN] getCached(agents, all) -> object
[CACHE DEBUG] getCachedAgentsSync() returning 0 agents
[CACHE DEBUG] BEFORE push: cache has 0 agents: []
[CACHE DEBUG] AFTER push: cache has 1 agents: [ 'fri17-agent-10172025' ]
[CACHE REFACTORING AGAIN] setCached(agents, all, array[1])
[CACHE DEBUG] setCached('agents', 'all', ...) called with 1 agents
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
[CACHE DEBUG] AFTER setCached: cache has 1 agents: [ 'fri17-agent-10172025' ]
✅ [AUTO-AGENT] Saved agent to maia_agents database and cache: fri17-agent-10172025
🔑 [AUTO-AGENT] API key created for agent 17cd840f-ab74-11f0-b074-4e013e2ddde4
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
🚀 [DEPLOYMENT] Starting agent deployment monitoring...
🚀 Started tracking deployment for user fri17, agent fri17-agent-10172025
[*] Agent created and assigned to user fri17: 17cd840f-ab74-11f0-b074-4e013e2ddde4
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
⚠️ [ADMIN-USERS] Agent public-agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4) for user Public User not found in maia_agents cache
[CACHE DEBUG] Cache has 1 agents: [ 'fri17-agent-10172025(17cd840f-ab74-11f0-b074-4e013e2ddde4)' ]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
⚠️ [ADMIN-USERS] Agent adrian-agent-10172025 (c5b29c48-ab12-11f0-b074-4e013e2ddde4) for user adrian not found in maia_agents cache
[CACHE DEBUG] Cache has 1 agents: [ 'fri17-agent-10172025(17cd840f-ab74-11f0-b074-4e013e2ddde4)' ]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
⚠️ [ADMIN-USERS] Agent wed15-agent-10152025 (541fc9f4-aa30-11f0-b074-4e013e2ddde4) for user wed15 not found in maia_agents cache
[CACHE DEBUG] Cache has 1 agents: [ 'fri17-agent-10172025(17cd840f-ab74-11f0-b074-4e013e2ddde4)' ]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
✅ Agent fri17-agent-10172025 deployed for user fri17 - updating workflow stage
[POLLING] Added agent_deployment_completed update to session sess_1760717324424_0pla8fbbv
[POLLING] Added agent_deployment_completed update to 1 admin sessions
📡 [POLLING] [*] Added agent deployment notification to admin sessions
[*] Agent fri17-agent-10172025 deployed for user fri17
✅ [DEPLOYMENT] Preserving API key for user fri17 during workflow transition
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
🎉 Successfully updated workflow stage to 'agent_assigned' for user fri17
🛑 [DEPLOYMENT] No active deployments - stopping monitoring
.[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
⚠️ [ADMIN-USERS] Agent public-agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4) for user Public User not found in maia_agents cache
[CACHE DEBUG] Cache has 1 agents: [ 'fri17-agent-10172025(17cd840f-ab74-11f0-b074-4e013e2ddde4)' ]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
⚠️ [ADMIN-USERS] Agent adrian-agent-10172025 (c5b29c48-ab12-11f0-b074-4e013e2ddde4) for user adrian not found in maia_agents cache
[CACHE DEBUG] Cache has 1 agents: [ 'fri17-agent-10172025(17cd840f-ab74-11f0-b074-4e013e2ddde4)' ]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
⚠️ [ADMIN-USERS] Agent wed15-agent-10152025 (541fc9f4-aa30-11f0-b074-4e013e2ddde4) for user wed15 not found in maia_agents cache
[CACHE DEBUG] Cache has 1 agents: [ 'fri17-agent-10172025(17cd840f-ab74-11f0-b074-4e013e2ddde4)' ]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
[CACHE REFACTORING AGAIN] getCachedAgents() - TTL valid: true
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] /agents endpoint: cachedAgents = 1 agents
[CACHE REFACTORING AGAIN] getCached(chats, null) -> null
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])



>>>> [CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
✅ Session: fri17
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]
[CACHE REFACTORING AGAIN] getCached(chats, null) -> null
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])


>>>> Import a file

Warning: TT: undefined function: 32
📄 Storing PDF as binary (6348874 bytes): GROPPER_ADRIAN_09_24_25_1314.PDF
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
✅ [CACHE] Updated bucket cache for user fri17: 1 files, 6348874 bytes
[POLLING] Added user_file_uploaded update to session sess_1760717324424_0pla8fbbv
[POLLING] Added user_file_uploaded update to 1 admin sessions
[*] User fri17 uploaded file GROPPER_ADRIAN_09_24_25_1314.PDF to bucket
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
✅ Updated file metadata for user fri17: GROPPER_ADRIAN_09_24_25_1314.PDF
.

>>>> Do it

[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
🤖 [AUTO PS] Starting automation for user fri17, file: GROPPER_ADRIAN_09_24_25_1314.PDF
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
🤖 [AUTO PS] User has agent: 17cd840f-ab74-11f0-b074-4e013e2ddde4
🤖 [AUTO PS] Using project: 90179b7c-8a42-4a71-a036-b4c2bea2fe59
🤖 [AUTO PS] Using database: genai-driftwood (881761c6-e72d-4f35-a48e-b320cd1f46e4)
🤖 [AUTO PS] Copying file from archived/ to root for indexing
🤖 [AUTO PS] Copied file to root: fri17/archived/GROPPER_ADRIAN_09_24_25_1314.PDF -> fri17/GROPPER_ADRIAN_09_24_25_1314.PDF
🤖 [AUTO PS] Using embedding model: GTE Large EN v1.5 (22653204-79ed-11ef-bf8f-4e013e2ddde4)
🤖 [AUTO PS] Creating KB "fri17-kb-1760717742277" from file GROPPER_ADRIAN_09_24_25_1314.PDF
🤖 [AUTO PS] Created KB: 87c974df-ab74-11f0-b074-4e013e2ddde4
🤖 [AUTO PS] Indexing started automatically, polling for completion...
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 1/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 2/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 3/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 4/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 5/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 6/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 7/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 8/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 9/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 0, Attempt: 10/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 220990, Attempt: 11/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_IN_PROGRESS, Phase: BATCH_JOB_PHASE_RUNNING, Tokens: 220990, Attempt: 12/60
🤖 [AUTO PS] Indexing status: INDEX_JOB_STATUS_COMPLETED, Phase: BATCH_JOB_PHASE_SUCCEEDED, Tokens: 220990, Attempt: 13/60
🤖 [AUTO PS] Indexing complete in 78 seconds
🤖 [AUTO PS] Attaching KB to agent 17cd840f-ab74-11f0-b074-4e013e2ddde4
🤖 [AUTO PS] KB attached to agent successfully
🤖 [AUTO PS] Cleaning up temp file from root folder
🤖 [AUTO PS] Cleaned up temp file: fri17/GROPPER_ADRIAN_09_24_25_1314.PDF
🤖 [AUTO PS] Updating maia_kb document for fri17-kb-1760717742277
[CACHE REFACTORING AGAIN] getDocument(maia_kb, fri17-kb-1760717742277)
🤖 [AUTO PS] Requesting patient summary from agent 17cd840f-ab74-11f0-b074-4e013e2ddde4
[PS SAVE2] 🚀 Starting patient summary generation
[PS SAVE2]   - User: fri17
[PS SAVE2]   - Agent: 17cd840f-ab74-11f0-b074-4e013e2ddde4
[PS SAVE2]   - KB: 87c974df-ab74-11f0-b074-4e013e2ddde4
🤖 [AUTO PS] Calling internal /api/personal-chat endpoint with forceRegenerate
[PS SAVE2] 📤 Sending request to /api/personal-chat
[PS SAVE2]   - Prompt: "Create a comprehensive patient summary according to your agent instructions"
[PS SAVE2]   - forceRegenerate: true
📋 [PATIENT SUMMARY] Bypassing cache - forceRegenerate flag set
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[*] AI Query: 19 tokens, 0KB context, 0 files
[*] Current user: fri17, Agent: fri17-agent-10172025, Connected KBs: [fri17-kb-1760717742277]
🔑 [API KEY] Found user fri17 with agent 17cd840f-ab74-11f0-b074-4e013e2ddde4
🔑 Using database-stored API key for agent: fri17-agent-10172025 (user: fri17)
🔑 ✅ API key found: 3UbgeF3Kmf...



>[*] AI Response time: 13291ms
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
📋 [PATIENT SUMMARY] Saving new patient summary for fri17
[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
>[CACHE REFACTORING AGAIN] saveDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
>⚠️ [CACHE] Document conflict for maia_users:fri17, retrying in 100ms (attempt 1/3)
🔄 [CACHE] Refreshed document revision for maia_users:fri17
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] invalidateCache(agentAssignments, fri17)
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[CACHE REFACTORING AGAIN] invalidateCache(health, admin)
[CACHE REFACTORING AGAIN] invalidateCache(users, all)
🔄 [CACHE] Invalidated "all users" cache after saving user fri17
✅ [CACHE] Save succeeded on attempt 2 for maia_users:fri17
📋 [PATIENT SUMMARY] ✅ Patient summary saved successfully
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]
📋 [PATIENT SUMMARY] Template rebuilt for fri17
[CACHE REFACTORING AGAIN] invalidateCache(chats, null)
[PS SAVE2] 📥 Response received from /api/personal-chat
[PS SAVE2]   - Status: 200
[PS SAVE2] 📋 Response data type: Array
[PS SAVE2]   - Array length: 1
[PS SAVE2] 🔍 Assistant message found: true
[PS SAVE2]   - Content length: 4843
[PS SAVE2]   - Content preview: **Patient:** Adrian Gropper, M R N 2852409  
**Date of Birth:** 15 June 1952 (age 73)  
**Sex:** Mal...
🤖 [AUTO PS] ✅ Patient summary generated (4843 characters)
[PS SAVE2] ✅ Successfully extracted summary from response
🤖 [AUTO PS] Patient summary already saved by /api/personal-chat endpoint
[PS SAVE2] 📊 Summary extraction result: 4843 chars
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[PS SAVE2] 🔄 Fetched fresh user document
[PS SAVE2]   - Has patientSummary: true
[PS SAVE2]   - Summary length in DB: 4843
[PS SAVE2]   - Summary preview: **Patient:** Adrian Gropper, M R N 2852409  
**Date of Birth:** 15 June 1952 (age 73)  
**Sex:** Mal...
🤖 [AUTO PS] Rebuilding agent template for fri17
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]
🤖 [AUTO PS] ✅ Automation complete for fri17
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(chats, null) -> null
[CACHE REFACTORING AGAIN] setCached(chats, null, array[11])
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]



>>>> Patient summary is saved and staus icons are good <<<<

>>>> Admin Panel 

[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)


>>>> Agent Management Dialog

[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(chats, null) -> array[11]
[CACHE REFACTORING AGAIN] getAllDocuments(maia_knowledge_bases)
[CACHE REFACTORING AGAIN] getCached(knowledgeBases, all) -> array[7]
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] getCached(agents, all) -> array[1]
[CACHE DEBUG] getCachedAgentsSync() returning 1 agents
[CACHE REFACTORING AGAIN] getDocument(maia_users, fri17)
[CACHE REFACTORING AGAIN] getCached(users, fri17) -> object
[CACHE REFACTORING AGAIN] setCached(users, fri17, object)
