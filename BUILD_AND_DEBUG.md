# BUILD AND DEBUG GUIDE

## Essential Console Messages

This document defines which console messages are essential and should be preserved during cleanup. Essential messages are marked with `[*]` prefix and provide critical information for debugging and monitoring.

### Essential Messages (Keep These)

#### User Authentication & Session Management
- `[*] Current user: {userId}` - Shows which user is currently active
- `[*] Current agent: {agentId}` - Shows which agent is currently selected
- `[*] Available agents: {count}` - Shows number of agents available to user
- `[*] Available knowledge bases: {count}` - Shows number of KBs available to user

#### API Operations & Performance
- `[*] AI Query: {tokens} tokens, {contextSize}KB context, {files} files` - Query performance metrics
- `[*] AI Response time: {time}ms` - Response time for debugging performance
- `[*] Current user: {user}, Agent: {agent}, Connected KBs: [{kbs}]` - Query context summary

#### System Status & Health
- `✅ Connected to Cloudant: {version}` - Database connection status
- `✅ MAIA2 Client initialized successfully` - Core system initialization
- `🚀 MAIA Secure Server running on port {port}` - Server startup confirmation
- `🔗 Health check: {url}` - Health check endpoint

#### Error Conditions (Critical)
- `❌ Authentication failed for the selected agent` - Agent auth failure
- `❌ No API key available for the selected agent` - Missing API key
- `❌ Access denied for the selected agent` - Permission denied
- `❌ No current agent selected` - Agent selection required

### Non-Essential Messages (Remove These)

#### Debug/Development Messages
- `🔍 [personal-chat] ENDPOINT CALLED - Starting request processing`
- `🔍 [personal-chat] Checking personalChatClient...`
- `🔍 [personal-chat] Using agent-specific authentication (no global personalChatClient needed)`
- `🔍 [personal-chat] Parsing request body...`
- `🔍 [personal-chat] Request body parsed successfully`
- `🔍 [personal-chat] Filtering system messages...`
- `🔍 [personal-chat] System messages filtered`
- `🔍 [personal-chat] Starting Unknown User agent lookup...`
- `🔍 [personal-chat] Retrieved user doc: Found/Not found`
- `🔍 [personal-chat] User has currentAgentId: {id}`
- `🔍 [personal-chat] About to call doRequest for agent: {id}`
- `🔍 [personal-chat] doRequest completed successfully`
- `🔍 [personal-chat] Fetching agent data for Unknown User ID: {id}`
- `🔍 [personal-chat] Agent response: {...}`
- `🔍 [personal-chat] Parsed agent data: {...}`

#### Verbose API Calls
- `🔑 Retrieved agent-specific API key for agent: {id}`
- `🔑 Using API key for agent endpoint: {status}`
- `🔐 [personal-chat] Using Unknown User's current agent selection: {name}`
- `🌐 [personal-chat] Using agent endpoint: {url}`
- `🔍 [current-agent] GET request - Current user: {user}`
- `🔍 [current-agent] Retrieved Unknown User document: {...}`
- `🔐 [current-agent] Using Unknown User's current agent selection: {name}`

#### Redundant Status Messages
- `📚 Refreshed {count} knowledge bases` (when duplicated)
- `🤖 Current agent loaded for authenticated user` (when duplicated)
- `🔍 Backend Session: Active` (removed - not essential)
- `📋 Check server logs for actual agent and knowledge base used` (not essential)

### Message Prefix Standards

#### `[*]` Prefix - Essential Messages
- Used for critical information that should survive cleanup
- Examples: User changes, agent selections, performance metrics
- These messages provide core debugging information

#### Emoji Prefixes - Contextual Messages
- `✅` - Success/confirmation messages
- `❌` - Error conditions
- `🔍` - Debug/development messages (usually non-essential)
- `🔑` - Authentication/API key messages
- `🌐` - Network/endpoint messages
- `📚` - Knowledge base operations
- `🤖` - Agent operations

### Cleanup Guidelines

1. **Keep all `[*]` prefixed messages** - These are essential
2. **Remove debug messages** with `🔍` prefix (unless marked as essential)
3. **Keep error messages** with `❌` prefix (they're essential for troubleshooting)
4. **Keep success messages** with `✅` prefix (they confirm system health)
5. **Remove redundant messages** that appear multiple times
6. **Remove verbose API call logs** that don't add debugging value

### Files to Clean Up

- `server.js` - Remove debug logs from personal-chat endpoint
- `src/components/ChatPrompt.vue` - Remove redundant API call logs
- `src/components/AgentManagementDialog.vue` - Remove verbose KB refresh logs
- `src/components/AgentStatusIndicator.vue` - Remove non-essential watchers

## Build Process

### Frontend Build
```bash
npm run build
```

### Server Restart
```bash
npm start
```

### Development
- Frontend served from backend
- Both built and started with `npm start`
- Server runs on localhost:3001
