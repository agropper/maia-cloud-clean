# Multi-User Architecture Analysis

## Overview

This document analyzes the critical multi-user scenarios that need to be addressed for true multi-user support in the MAIA system. The current system has architectural limitations that make it unsuitable for concurrent users.

## Current System Limitations

The current system has several architectural issues that make it unsuitable for true multi-user support:

1. **Session-based authentication** assumes one user per browser session
2. **Global state management** doesn't account for concurrent users
3. **Resource isolation** is not properly implemented
4. **User context switching** is not supported

## Critical Multi-User Scenarios

### Case 1: Deep Link Users (Voluntary Identification)

#### Current Behavior:
- Users access via deep links with `?user=name&email=email`
- They're not authenticated but voluntarily identify themselves
- System treats them as "Unknown User" but with additional context

#### Challenges:
- **Session Confusion**: How to distinguish between different deep link users?
- **State Persistence**: Should their preferences persist across sessions?
- **Resource Access**: What level of access should they have?
- **Privacy**: How to handle their voluntarily provided information?

#### Proposed Solution:
```javascript
// New user type: VOLUNTARILY_IDENTIFIED
USER_TYPES = {
  UNKNOWN: 'unknown',                    // No identification
  VOLUNTARILY_IDENTIFIED: 'identified', // Deep link with name/email
  AUTHENTICATED: 'authenticated',        // Has passkey
  ADMIN: 'admin'                        // Admin privileges
}

// Session management for deep link users
req.session = {
  userId: 'deep-link-' + hash(name + email), // Unique but not persistent
  userType: 'identified',
  voluntaryInfo: { name, email },
  sessionType: 'ephemeral' // Expires on browser close
}
```

#### Implementation Strategy:
1. **Ephemeral Sessions**: Deep link users get temporary sessions
2. **Limited Resource Access**: Can use basic features but not private resources
3. **Session Isolation**: Each deep link user gets their own session context
4. **No Persistence**: Their data doesn't persist beyond browser session

### Case 2: Multiple Unauthenticated Users (Different Frontends)

#### Current Behavior:
- All unauthenticated users share the same "Unknown User" context
- No distinction between different users or frontends
- Shared state causes conflicts

#### Challenges:
- **Session Collision**: Multiple users overwrite each other's state
- **Resource Conflicts**: Users might interfere with each other's operations
- **State Management**: How to maintain separate contexts?
- **Frontend Identification**: How to distinguish different frontend instances?

#### Proposed Solution:
```javascript
// Generate unique session for each unauthenticated user
const generateAnonymousSession = (req) => {
  const sessionId = 'anon-' + crypto.randomUUID();
  const frontendId = req.headers['x-frontend-id'] || 'unknown';
  
  return {
    userId: sessionId,
    userType: 'unknown',
    frontendId: frontendId,
    sessionType: 'anonymous',
    createdAt: new Date().toISOString()
  };
};

// Middleware to handle anonymous users
const anonymousUserMiddleware = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.session = generateAnonymousSession(req);
  }
  next();
};
```

#### Implementation Strategy:
1. **Unique Anonymous Sessions**: Each unauthenticated user gets unique session
2. **Frontend Identification**: Use headers to distinguish frontend instances
3. **Isolated State**: Each user maintains separate state
4. **Resource Isolation**: Anonymous users can't access each other's data

### Case 3: Concurrent Authenticated + Unknown Users

#### Current Behavior:
- Authenticated users and unknown users share the same backend
- No proper resource isolation
- Potential data leakage between user types

#### Challenges:
- **Resource Isolation**: How to prevent data leakage between user types?
- **Agent Access**: Who can access which agents?
- **Knowledge Base Access**: How to control KB visibility?
- **Session Management**: How to handle mixed user types?

#### Proposed Solution:
```javascript
// Enhanced user context with resource isolation
const getUserResourceContext = (userContext) => {
  switch (userContext.userType) {
    case 'admin':
      return {
        canAccessAllAgents: true,
        canAccessAllKBs: true,
        canManageUsers: true,
        resourceScope: 'global'
      };
      
    case 'authenticated':
      return {
        canAccessAllAgents: false,
        canAccessOwnAgents: true,
        canAccessOwnKBs: true,
        canManageUsers: false,
        resourceScope: 'user',
        userId: userContext.user.userId
      };
      
    case 'identified':
      return {
        canAccessAllAgents: false,
        canAccessPublicAgents: true,
        canAccessOwnKBs: false,
        canManageUsers: false,
        resourceScope: 'public',
        sessionId: userContext.user.sessionId
      };
      
    case 'unknown':
    default:
      return {
        canAccessAllAgents: false,
        canAccessPublicAgents: true,
        canAccessOwnKBs: false,
        canManageUsers: false,
        resourceScope: 'public',
        sessionId: userContext.user.sessionId
      };
  }
};
```

## Architectural Requirements for Multi-User Support

### 1. Session Management Overhaul:
```javascript
// Multi-tenant session management
const sessionManager = {
  // Generate unique session for each user type
  createSession: (userType, userData, frontendId) => {
    const sessionId = generateUniqueId(userType, userData, frontendId);
    return {
      sessionId,
      userType,
      userData,
      frontendId,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    };
  },
  
  // Validate and refresh sessions
  validateSession: (sessionId) => {
    // Check session validity and refresh if needed
  },
  
  // Clean up expired sessions
  cleanupSessions: () => {
    // Remove expired anonymous and identified sessions
  }
};
```

### 2. Resource Isolation System:
```javascript
// Resource access control
const resourceAccessControl = {
  // Check if user can access specific resource
  canAccessResource: (userContext, resourceType, resourceId) => {
    const resourceContext = getUserResourceContext(userContext);
    
    switch (resourceType) {
      case 'agent':
        return canAccessAgent(resourceContext, resourceId);
      case 'knowledge_base':
        return canAccessKnowledgeBase(resourceContext, resourceId);
      case 'chat':
        return canAccessChat(resourceContext, resourceId);
      default:
        return false;
    }
  },
  
  // Filter resources based on user context
  filterResources: (userContext, resources) => {
    return resources.filter(resource => 
      canAccessResource(userContext, resource.type, resource.id)
    );
  }
};
```

### 3. Database Schema Changes:
```javascript
// Enhanced user documents
const userDocumentSchema = {
  _id: 'user-id',
  type: 'user|admin|anonymous|identified',
  sessionId: 'unique-session-id',
  frontendId: 'frontend-instance-id',
  resourceScope: 'global|user|public',
  ownedResources: {
    agents: ['agent-id-1', 'agent-id-2'],
    knowledgeBases: ['kb-id-1', 'kb-id-2'],
    chats: ['chat-id-1', 'chat-id-2']
  },
  accessPermissions: {
    canAccessAllAgents: false,
    canAccessAllKBs: false,
    canManageUsers: false
  },
  sessionMetadata: {
    createdAt: 'timestamp',
    lastAccessed: 'timestamp',
    expiresAt: 'timestamp',
    isEphemeral: true // for anonymous/identified users
  }
};
```

### 4. API Endpoint Modifications:
```javascript
// All API endpoints need user context
app.use('/api/*', authMiddleware); // Apply to all routes

// Example: Agent listing with proper filtering
app.get('/api/agents', (req, res) => {
  const userContext = getUserContext(req);
  const allAgents = await getAgents();
  const accessibleAgents = resourceAccessControl.filterResources(
    userContext, 
    allAgents
  );
  res.json(accessibleAgents);
});
```

## Implementation Phases

### Phase 1: Foundation (Current)
- ✅ Basic authentication system
- ✅ User type classification
- ✅ UI panel access rules

### Phase 2: Multi-User Session Management
- Implement unique session generation
- Add frontend identification
- Create session cleanup system

### Phase 3: Resource Isolation
- Implement resource access control
- Add database schema changes
- Create resource filtering system

### Phase 4: Deep Link Support
- Add voluntary identification system
- Implement ephemeral sessions
- Create deep link user management

### Phase 5: Testing & Validation
- Load testing with multiple concurrent users
- Security testing for resource isolation
- Performance optimization

## Critical Considerations

1. **Security**: Ensure no data leakage between users
2. **Performance**: Handle multiple concurrent sessions efficiently
3. **Scalability**: System should work with many simultaneous users
4. **Backward Compatibility**: Don't break existing functionality
5. **Session Management**: Proper cleanup of expired sessions
6. **Resource Limits**: Prevent resource exhaustion

## Current Status

This analysis was created on 2025-09-06 and represents the current understanding of multi-user requirements. The system currently has basic authentication but needs significant architectural changes to support true multi-user scenarios safely.

## Next Steps

1. Continue testing authenticated user private AI flows
2. Document current limitations and edge cases
3. Plan implementation phases based on priority
4. Consider creating separate branch for multi-user development
5. Design comprehensive testing strategy for multi-user scenarios

---

**Note**: This is a significant architectural challenge that requires careful planning and implementation. The current system needs substantial changes to support true multi-user scenarios safely.

Added from a regression analysis:
deb33de (HEAD -> main) WIP: Multi-user authentication system
2dfbfd6 Add smart passkey logic - authenticate existing or register new
98411c2 Add automatic authentication after admin passkey registration
7647949 Use SimpleWebAuthn for admin passkey registration (same as regular users)
9e2788f Fix WebAuthn credential ID encoding for passkey verification
f9e3277 Streamline admin registration to go directly to WebAuthn
a78f1de Fix missing isRegistrationRoute variable
5a0a94a Fix WebAuthn challenge conversion and admin status checks
2745d17 Fix admin registration flow to complete passkey registration
75f5a19 Revert to original working admin system
c195472 Fix Vue.js reactive variable error in admin panel
3a75e82 Implement integrated admin passkey registration
74d60b7 Fix admin sign-in flow with automatic redirect
ddce12c Fix admin sign-in session issue
97a44cd Fix admin authentication and redirect issues

-----

Terminal said:
adrian@MacBook-Pro-AG maia-cloud-clean % npm start

> hie-openai-demo@1.0.0 start
> node server.js

🔍 Environment Detection Logic:
  - NODE_ENV: undefined
  - DOMAIN: not set
  - PASSKEY_RPID: not set
  - isLocalhost: true
  - isCloud: false
🔍 Passkey Configuration:
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
🚨 SERVER.JS IS LOADING - LINE 3
✅ MAIA2 Client initialized successfully with Cloudant
🔧 Using default MemoryStore for development (no inactivity timeout)
⚠️  DigitalOcean Personal API key not configured - using mock responses
✅ Anthropic Claude connected
✅ ChatGPT connected
✅ DeepSeek connected
🔍 Setting CouchDB client for passkey routes: true
✅ MAIA2 Client initialized successfully
🚀 MAIA Secure Server running on port 3001
📊 Environment: development
👤 Single Patient Mode: Disabled
🔗 Health check: http://localhost:3001/health
🔧 CODE VERSION: Updated AgentManagementDialog.vue with workflow fixes and console cleanup
📅 Server started at: 2025-09-06T17:40:01.492Z
Warning: TT: undefined function: 32
✅ Connected to Cloudant: 3.5.0+cloudant
✅ Database 'maia3_chats' already exists
✅ Share ID view created successfully
✅ Database 'maia_knowledge_bases' already exists
✅ Created maia_knowledge_bases database
✅ Connected to Cloudant
✅ Using database 'maia3_chats'
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-06T17:40:20.429Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-06T17:40:20.502Z - GET /api/passkey/auth-status
2025-09-06T17:40:20.520Z - GET /api/admin-management/health
2025-09-06T17:40:23.179Z - POST /api/passkey/authenticate
🔍 [REQUEST] Passkey Config - rpID: localhost origin: http://localhost:3001 NODE_ENV: development
2025-09-06T17:40:33.057Z - POST /api/passkey/authenticate-verify
✅ Session created for user: admin
GroupFilter: SIGN_IN - User: undefined - Chats visible: 0
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-06T17:40:36.014Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-06T17:40:36.079Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-06T17:40:36.534Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-06T17:40:36.620Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-06T17:41:09.735Z - POST /api/sign-out
✅ User admin signed out successfully
2025-09-06T17:41:10.764Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-06T17:41:10.832Z - GET /api/passkey/auth-status
2025-09-06T17:41:10.833Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-06T17:41:10.834Z - GET /api/group-chats
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📋 Returning 13 total chats to frontend
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
2025-09-06T17:41:33.710Z - POST /api/passkey/check-user
2025-09-06T17:41:33.939Z - POST /api/passkey/check-user
2025-09-06T17:41:34.184Z - POST /api/passkey/check-user
2025-09-06T17:41:36.095Z - POST /api/passkey/check-user
2025-09-06T17:41:37.774Z - POST /api/passkey/authenticate
🔍 [REQUEST] Passkey Config - rpID: localhost origin: http://localhost:3001 NODE_ENV: development
2025-09-06T17:41:43.094Z - POST /api/passkey/authenticate-verify
✅ Session created for user: admin
GroupFilter: SIGN_IN - User: undefined - Chats visible: 0
2025-09-06T17:41:45.348Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
2025-09-06T17:41:57.071Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-06T17:41:57.144Z - GET /api/agents
🤖 Listed 3 agents
🔍 [DEBUG] Filtering agents for user: Unknown User
🔍 [DEBUG] Total agents available: 3
🔍 [DEBUG] Getting all authenticated users and their owned agents...
🔍 [DEBUG] Found 1 authenticated users with ownedAgents
🔍 [DEBUG] User wed271 has ownedAgents: [
  {
    id: '2960ae8d-8514-11f0-b074-4e013e2ddde4',
    name: 'agent-08292025',
    assignedAt: '2025-09-06T01:27:19.133Z'
  }
]
🔍 [DEBUG] New format agent: agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4)
🔍 [DEBUG] All owned agent IDs: [ '2960ae8d-8514-11f0-b074-4e013e2ddde4' ]
🔍 [DEBUG] Agent agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4) - owned: true
🔍 [DEBUG] Agent agent-08032025 (059fc237-7077-11f0-b056-36d958d30bcf) - owned: false
🔍 [DEBUG] Agent agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4) - owned: false
[*] Available agents for Unknown User: 2 (unowned agents, filtered out 1 owned by authenticated users)
2025-09-06T17:41:57.700Z - GET /api/knowledge-bases
🔐 Filtering KBs for user: undefined
🔐 Total KBs before filtering: 15
🔐 Filtered KBs for user undefined: 0 of 15 total
2025-09-06T17:46:31.070Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-06T17:46:31.142Z - GET /api/passkey/auth-status
2025-09-06T17:46:31.145Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: admin
2025-09-06T17:46:31.146Z - GET /api/group-chats
2025-09-06T17:46:31.147Z - GET /api/admin-management/users/admin/assigned-agent
📋 Returning 13 total chats to frontend
Current user: undefined
2025-09-06T17:46:31.663Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
2025-09-06T17:46:39.028Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-06T17:46:39.080Z - GET /api/agents
🤖 Listed 3 agents
🔍 [DEBUG] Filtering agents for user: Unknown User
🔍 [DEBUG] Total agents available: 3
🔍 [DEBUG] Getting all authenticated users and their owned agents...
🔍 [DEBUG] Found 1 authenticated users with ownedAgents
🔍 [DEBUG] User wed271 has ownedAgents: [
  {
    id: '2960ae8d-8514-11f0-b074-4e013e2ddde4',
    name: 'agent-08292025',
    assignedAt: '2025-09-06T01:27:19.133Z'
  }
]
🔍 [DEBUG] New format agent: agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4)
🔍 [DEBUG] All owned agent IDs: [ '2960ae8d-8514-11f0-b074-4e013e2ddde4' ]
🔍 [DEBUG] Agent agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4) - owned: true
🔍 [DEBUG] Agent agent-08032025 (059fc237-7077-11f0-b056-36d958d30bcf) - owned: false
🔍 [DEBUG] Agent agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4) - owned: false
[*] Available agents for Unknown User: 2 (unowned agents, filtered out 1 owned by authenticated users)
2025-09-06T17:46:39.550Z - GET /api/knowledge-bases
🔐 Filtering KBs for user: undefined
🔐 Total KBs before filtering: 15
🔐 Filtered KBs for user undefined: 0 of 15 total
2025-09-06T17:47:01.860Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-06T17:47:01.903Z - GET /api/agents
🤖 Listed 3 agents
🔍 [DEBUG] Filtering agents for user: Unknown User
🔍 [DEBUG] Total agents available: 3
🔍 [DEBUG] Getting all authenticated users and their owned agents...
🔍 [DEBUG] Found 1 authenticated users with ownedAgents
🔍 [DEBUG] User wed271 has ownedAgents: [
  {
    id: '2960ae8d-8514-11f0-b074-4e013e2ddde4',
    name: 'agent-08292025',
    assignedAt: '2025-09-06T01:27:19.133Z'
  }
]
🔍 [DEBUG] New format agent: agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4)
🔍 [DEBUG] All owned agent IDs: [ '2960ae8d-8514-11f0-b074-4e013e2ddde4' ]
🔍 [DEBUG] Agent agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4) - owned: true
🔍 [DEBUG] Agent agent-08032025 (059fc237-7077-11f0-b056-36d958d30bcf) - owned: false
🔍 [DEBUG] Agent agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4) - owned: false
[*] Available agents for Unknown User: 2 (unowned agents, filtered out 1 owned by authenticated users)
2025-09-06T17:47:02.336Z - GET /api/knowledge-bases
🔐 Filtering KBs for user: undefined
🔐 Total KBs before filtering: 15
🔐 Filtered KBs for user undefined: 0 of 15 total
2025-09-07T00:19:25.287Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:19:25.377Z - GET /api/passkey/auth-status
2025-09-07T00:19:25.394Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: admin
2025-09-07T00:19:25.395Z - GET /api/group-chats
2025-09-07T00:19:25.400Z - GET /api/admin-management/users/admin/assigned-agent
Current user: undefined
📋 Returning 13 total chats to frontend
2025-09-07T00:19:26.009Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
2025-09-07T00:19:36.555Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:19:36.625Z - GET /api/passkey/auth-status
2025-09-07T00:19:36.625Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-07T00:19:36.626Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-07T00:19:48.421Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:19:48.498Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-07T00:19:48.574Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-07T00:19:49.080Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-07T00:20:26.160Z - POST /api/sign-out
✅ User admin signed out successfully
2025-09-07T00:20:27.188Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:20:27.261Z - GET /api/passkey/auth-status
2025-09-07T00:20:27.261Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-07T00:20:27.262Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-07T00:20:44.353Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:20:44.432Z - GET /api/passkey/auth-status
2025-09-07T00:20:44.442Z - GET /api/admin-management/health
2025-09-07T00:20:52.023Z - POST /api/passkey/authenticate
🔍 [REQUEST] Passkey Config - rpID: localhost origin: http://localhost:3001 NODE_ENV: development
2025-09-07T00:20:58.143Z - POST /api/passkey/authenticate-verify
✅ Session created for user: admin
GroupFilter: SIGN_IN - User: undefined - Chats visible: 0
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-07T00:21:00.319Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:21:00.385Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-07T00:21:00.436Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-07T00:21:00.541Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-07T00:21:09.887Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:21:09.951Z - GET /api/passkey/auth-status
2025-09-07T00:21:09.952Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-07T00:21:09.953Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
2025-09-07T00:21:15.324Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T00:21:15.389Z - GET /api/passkey/auth-status
2025-09-07T00:21:15.390Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-07T00:21:15.391Z - GET /api/group-chats
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📋 Returning 13 total chats to frontend
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
2025-09-07T00:21:22.456Z - GET /api/passkey/auth-status
2025-09-07T00:21:22.468Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
2025-09-07T00:21:23.872Z - GET /api/agents
🤖 Listed 3 agents
🔍 [DEBUG] Filtering agents for user: Unknown User
🔍 [DEBUG] Total agents available: 3
🔍 [DEBUG] Getting all authenticated users and their owned agents...
🔍 [DEBUG] Found 1 authenticated users with ownedAgents
🔍 [DEBUG] User wed271 has ownedAgents: [
  {
    id: '2960ae8d-8514-11f0-b074-4e013e2ddde4',
    name: 'agent-08292025',
    assignedAt: '2025-09-06T01:27:19.133Z'
  }
]
🔍 [DEBUG] New format agent: agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4)
🔍 [DEBUG] All owned agent IDs: [ '2960ae8d-8514-11f0-b074-4e013e2ddde4' ]
🔍 [DEBUG] Agent agent-08292025 (2960ae8d-8514-11f0-b074-4e013e2ddde4) - owned: true
🔍 [DEBUG] Agent agent-08032025 (059fc237-7077-11f0-b056-36d958d30bcf) - owned: false
🔍 [DEBUG] Agent agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4) - owned: false
[*] Available agents for Unknown User: 2 (unowned agents, filtered out 1 owned by authenticated users)
2025-09-07T00:21:24.280Z - GET /api/knowledge-bases
🔐 Filtering KBs for unauthenticated user - hiding protected KBs
🔐 Total KBs before filtering: 15
🔐 KB wed271-ag-test-converted (5da2d850-899b-11f0-b074-4e013e2ddde4) is PROTECTED - Owner: wed271, Protected: true
🔐 KB wed271-uuid-test (38f89fef-88dc-11f0-b074-4e013e2ddde4) is PROTECTED - Owner: wed271, Protected: true
🔐 KB devon-viaapp-kb-06162025 (4c21cdaa-4b04-11f0-bf8f-4e013e2ddde4) is PROTECTED - Owner: devon, Protected: true
🔐 KB ag-applehealth-export-05122025 (31894efb-2f8c-11f0-bf8f-4e013e2ddde4) is PROTECTED - Owner: agropper, Protected: true
🔐 KB ag-medicare-kb-05122025 (9c6df853-2f62-11f0-bf8f-4e013e2ddde4) is PROTECTED - Owner: agropper, Protected: true
🔐 KB agropper-kb-05122025 (0fd85f4c-2f5b-11f0-bf8f-4e013e2ddde4) is PROTECTED - Owner: agropper, Protected: true
🔐 Filtered KBs for unauthenticated user: 9 of 15 total (protected KBs hidden)
2025-09-07T00:21:24.523Z - GET /api/bucket-files
📋 Listing files from DigitalOcean Spaces bucket
✅ Found 5 files in bucket
2025-09-07T00:21:34.657Z - POST /api/personal-chat
[*] AI Query: 5 tokens, 0KB context, 0 files
[*] Current user: Unknown User, Agent: agent-05102025, Connected KBs: [casandra-claude-kb-05312025]
🔑 Using hardcoded API key for agent: 16c9edf6-2dee-11f0-bf8f-4e013e2ddde4
[*] AI Response time: 43137ms
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-07T18:17:17.105Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T18:17:17.194Z - GET /api/passkey/auth-status
2025-09-07T18:17:17.195Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-07T18:17:17.210Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
🔓 TEMPORARY: Admin access granted without authentication for testing
2025-09-07T18:17:26.306Z - GET /.well-known/appspecific/com.chrome.devtools.json
2025-09-07T18:17:26.387Z - GET /api/passkey/auth-status
Current user: undefined
2025-09-07T18:17:26.789Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-07T18:17:27.249Z - GET /api/admin-management/users
🔍 [DEBUG] Total documents in maia_users: 5
🔍 [DEBUG] Sample documents: [
  {
    _id: 'Unknown User',
    isAdmin: undefined,
    hasCredentialID: false,
    type: 'user'
  },
  { _id: 'admin', isAdmin: true, hasCredentialID: true, type: 'admin' },
  {
    _id: 'fri95',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'fri951',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  },
  {
    _id: 'wed271',
    isAdmin: undefined,
    hasCredentialID: true,
    type: 'user'
  }
]
🔍 [DEBUG] Excluding: Unknown User (design doc or Unknown User)
🔍 [DEBUG] Excluding admin user: admin
🔍 [SPECIAL] Including wed271 despite admin status: { userId: 'wed271', isAdmin: undefined }
🔍 [DEBUG] Final filtered users count: 3
🔍 [DEBUG] Users by workflow stage: { awaiting_approval: 2, approved: 1 }
2025-09-07T18:17:48.156Z - GET /api/admin-management/users/wed271
Error fetching user details: ReferenceError: maia2Client is not defined
    at file:///Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/src/routes/admin-management-routes.js:318:21
    at Layer.handle [as handle_request] (/Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/node_modules/express/lib/router/layer.js:95:5)
    at next (/Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/node_modules/express/lib/router/route.js:149:13)
    at requireAdminAuth (file:///Users/adrian/Desktop/HIEofOne-dev/GitHub/maia-cloud-clean/src/routes/admin-management-routes.js:30:7)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
2025-09-07T18:17:48.582Z - GET /api/agents
🤖 Listed 3 agents
🔍 [DEBUG] Filtering agents for user: admin
🔍 [DEBUG] Total agents available: 3
🔍 [DEBUG] Getting owned agents for authenticated user: admin
🔍 [DEBUG] User document: {
  _id: 'admin',
  _rev: '20-1f236a47e4bbc6b44cc05973302c06ab',
  type: 'admin',
  isAdmin: true,
  createdAt: '2025-09-06T00:32:38.509Z',
  updatedAt: '2025-09-07T00:20:58.188Z',
  credentialID: 's-KrifoZghhS-Ya5ruwuuRExutU',
  credentialPublicKey: 'pQECAyYgASFYIKYB6GRq58fX3BN74GDvCqB8ppTN9jeGAcAgbt0voXHfIlggKBDNG1ZxbH4rkWNgWdHuCM1mnLiipwTEdgjGf7iqSNI',
  counter: 0,
  transports: [ 'hybrid', 'internal' ]
}
🔍 [DEBUG] User's owned agent IDs: []
[*] Available agents for admin: 0 (no owned agents - agents must be assigned by admin)
2025-09-07T18:18:50.274Z - POST /api/passkey/check-user
2025-09-07T18:18:50.891Z - POST /api/passkey/check-user
2025-09-07T18:18:51.510Z - POST /api/passkey/check-user
2025-09-07T18:18:53.158Z - POST /api/passkey/check-user
2025-09-07T18:18:54.157Z - POST /api/passkey/authenticate
🔍 [REQUEST] Passkey Config - rpID: localhost origin: http://localhost:3001 NODE_ENV: development
2025-09-07T18:19:10.437Z - POST /api/passkey/check-user
2025-09-07T18:19:11.164Z - POST /api/passkey/check-user
2025-09-07T18:19:11.833Z - POST /api/passkey/check-user
2025-09-07T18:19:13.288Z - POST /api/passkey/check-user
2025-09-07T18:19:14.865Z - POST /api/passkey/authenticate
🔍 [REQUEST] Passkey Config - rpID: localhost origin: http://localhost:3001 NODE_ENV: development
2025-09-07T18:25:28.374Z - POST /api/passkey/authenticate
🔍 [REQUEST] Passkey Config - rpID: localhost origin: http://localhost:3001 NODE_ENV: development
2025-09-07T18:25:37.199Z - GET /api/admin-management/users/wed271
2025-09-07T18:25:44.836Z - GET /api/passkey/user/wed271
2025-09-07T18:32:49.210Z - GET /api/passkey/auth-status
2025-09-07T18:32:49.211Z - GET /api/current-agent
🔍 [current-agent] GET request - Current user: Unknown User
2025-09-07T18:32:49.213Z - GET /api/group-chats
📋 Returning 13 total chats to frontend
🔍 [current-agent] Retrieved Unknown User document: {
  _id: 'Unknown User',
  _rev: '17-198bf62498d9ad470b7f3cf51c8a7cb4',
  type: 'user',
  createdAt: '2025-09-06T00:32:38.509Z',
  currentAgentId: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
  currentAgentName: 'agent-05102025',
  ownedAgents: [
    {
      id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4',
      name: 'agent-05102025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    },
    {
      id: '059fc237-7077-11f0-b056-36d958d30bcf',
      name: 'agent-08032025',
      assignedAt: '2025-09-06T01:27:19.133Z'
    }
  ],
  currentAgentSetAt: '2025-09-06T01:28:22.063Z',
  updatedAt: '2025-09-06T01:28:22.063Z',
  currentAgentEndpoint: 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1'
}
🔐 [current-agent] Using Unknown User's current agent selection: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
📚 Agent Badge: Showing 1 KBs attached to agent (DigitalOcean API source of truth)
^C
adrian@MacBook-Pro-AG maia-cloud-clean % clear    

----