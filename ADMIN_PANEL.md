# Admin Panel Documentation

## Overview
The Admin Panel is a comprehensive interface for managing MAIA users, agents, and sessions. It provides workflow management, user approval, agent assignment, and session monitoring capabilities. The session management system now uses a dedicated `maia_sessions` database with physical deletion to prevent database growth and ensure accurate session tracking.

## Components

### AdminPanel.vue
**Location**: `src/components/AdminPanel.vue`

**Main Features**:
- User management and approval workflow
- Agent assignment and management
- Session monitoring and control
- Admin registration and authentication
- Passkey management

## Functions and Methods

### User Management Functions
- `loadUsers()` - Loads all users from the database
- `viewUserDetails(user)` - Opens detailed view for a specific user
- `approveUser(user)` - Approves a user in the workflow
- `rejectUser(user)` - Rejects a user in the workflow
- `assignAgent(user, agent)` - Assigns an agent to a user
- `resetUserPasskey(user)` - Resets a user's passkey
- `saveNotes()` - Saves admin notes for a user

### Session Management Functions
- `loadSessionStatus()` - Loads current active sessions from `maia_sessions` database
- `signOutUser(sessionId)` - Physically deletes a specific user session from database
- `refreshSessions()` - Refreshes the session list

### Agent Management Functions
- `loadAgents()` - Loads available agents
- `assignAgentToUser(user, agent)` - Assigns an agent to a user

### Admin Authentication Functions
- `registerAdmin()` - Registers a new admin user
- `registerPasskey()` - Creates a passkey for admin authentication
- `checkAdminStatus()` - Checks if current user is admin

## API Endpoints

### User Management Endpoints
- `GET /api/admin-management/users` - Get all users
- `GET /api/admin-management/users/:userId` - Get specific user details
- `POST /api/admin-management/users/:userId/approve` - Approve a user
- `POST /api/admin-management/users/:userId/reject` - Reject a user
- `POST /api/admin-management/users/:userId/assign-agent` - Assign agent to user
- `POST /api/admin-management/users/:userId/reset-passkey` - Reset user passkey
- `POST /api/admin-management/users/:userId/notes` - Save admin notes

### Session Management Endpoints
- `GET /api/admin-management/sessions` - Get all active sessions from `maia_sessions` database
- `POST /api/admin-management/sessions/:sessionId/signout` - Physically delete a session from database
- `GET /api/admin-management/sessions/user/:userId` - Get sessions for a user
- `GET /api/admin-management/sessions/active-check` - Check for active sessions

### Agent Management Endpoints
- `GET /api/agents` - Get all available agents
- `POST /api/agents` - Create a new agent
- `PUT /api/agents/:agentId` - Update an agent
- `DELETE /api/agents/:agentId` - Delete an agent

### Admin Authentication Endpoints
- `POST /api/admin-management/register` - Register as admin
- `POST /api/admin-management/register-passkey` - Create admin passkey
- `GET /api/admin-management/health` - Health check

## Authentication Bypass for Testing

### Current Implementation
The admin authentication is currently **bypassed for testing purposes** in the following locations:

#### 1. Admin Routes Middleware
**File**: `src/routes/admin-management-routes.js`
**Lines**: 15-20

```javascript
const requireAdminAuth = async (req, res, next) => {
  try {
    // TEMPORARY: Bypass authentication for testing
    console.log('🔓 TEMPORARY: Admin access granted without authentication for testing');
    req.adminUser = { _id: 'admin', isAdmin: true };
    return next();
    
    // The actual authentication code is commented out below
    // ... (commented out authentication logic)
  } catch (error) {
    // ... error handling
  }
};
```

#### 2. Admin Registration Bypass
**File**: `src/routes/admin-management-routes.js`
**Lines**: 50-60

```javascript
// TEMPORARY: Bypass admin registration for testing
console.log('🔓 TEMPORARY: Admin registration bypassed for testing');
req.adminUser = { _id: 'admin', isAdmin: true };
return next();
```

### How the Bypass Works
1. **Middleware Override**: The `requireAdminAuth` middleware immediately grants access without checking credentials
2. **Mock Admin User**: Sets `req.adminUser = { _id: 'admin', isAdmin: true }` for all requests
3. **Console Logging**: Logs `🔓 TEMPORARY: Admin access granted without authentication for testing` for each request
4. **Full Access**: All admin endpoints are accessible without authentication

### Security Implications
- **Development Only**: This bypass should only be used in development
- **Production Risk**: If deployed to production, this would allow anyone to access admin functions
- **Data Exposure**: All user data, sessions, and system information is accessible
- **No Audit Trail**: No logging of who accessed what admin functions

## Session Management Issue

### Problem Identified
The Admin Panel shows "No active sessions" by default because:

1. **Initial State**: `sessionStatus` is initialized with empty arrays:
   ```javascript
   const sessionStatus = ref({
     authenticatedUsers: [],
     deepLinkUsers: [],
     unknownUserSessions: []
   });
   ```

2. **No Auto-Load**: The `loadSessionStatus()` function is only called when the "Refresh Sessions" button is clicked

3. **Default Display**: The template shows "No active sessions" when all arrays are empty:
   ```html
   <div v-if="sessionStatus.authenticatedUsers.length === 0 && sessionStatus.deepLinkUsers.length === 0 && sessionStatus.unknownUserSessions.length === 0" class="text-center q-pa-md">
     <QIcon name="check_circle" size="2rem" color="positive" class="q-mb-md" />
     <div class="text-grey-6">No active sessions</div>
   </div>
   ```

### Solution Implemented ✅
Added `loadSessionStatus()` to the component's `onMounted` lifecycle hook to automatically load sessions when the Admin Panel loads.

**Fix Applied**:
1. Modified the `onMounted` hook to always call `loadSessionStatus()`
2. Removed the admin authentication check from `loadSessionStatus()` since auth is bypassed for testing
3. Added comments indicating this is for testing purposes

## Database Schema

### Users Collection (`maia_users`)
- `_id`: User ID
- `type`: 'user' | 'admin'
- `displayName`: User's display name
- `createdAt`: Creation timestamp
- `approvalStatus`: 'pending' | 'approved' | 'rejected'
- `currentAgentId`: Currently assigned agent ID
- `ownedAgents`: Array of owned agent objects
- `adminNotes`: Admin notes for the user
- `credentialID`: Passkey credential ID
- `credentialPublicKey`: Passkey public key

### Sessions Collection (`maia_sessions`)
- `_id`: Session ID (prefixed with 'session_')
- `type`: 'session'
- `sessionType`: 'authenticated' | 'deeplink' | 'unknown_user'
- `userId`: User ID for authenticated sessions
- `isActive`: Boolean indicating if session is active
- `lastActivity`: Last activity timestamp
- `createdAt`: Session creation timestamp
- `expiresAt`: Session expiration timestamp
- `warningShown`: Boolean for inactivity warnings
- `deepLinkId`: Deep link ID for deeplink sessions
- `ownedBy`: Owner of deeplink session
- `cleanupDate`: Cleanup date for deeplink sessions
- `deactivatedBy`: Who deactivated the session ('user_logout' | 'admin_signout')
- `deactivatedAt`: When the session was deactivated

## Workflow Stages

### User Workflow
1. **Registration**: User registers with passkey
2. **Pending Approval**: User waits for admin approval
3. **Approved**: Admin approves user
4. **Agent Assignment**: Admin assigns agent to user
5. **Active**: User can use the system

### Admin Workflow
1. **Admin Registration**: Register with admin username and secret
2. **Passkey Creation**: Create passkey for secure authentication
3. **User Management**: Approve/reject users, assign agents
4. **Session Monitoring**: Monitor active sessions
5. **System Maintenance**: Reset passkeys, manage agents

## Testing Notes

### Current Test Setup
- Admin authentication is completely bypassed
- All admin functions are accessible without credentials
- Session management works with automatic loading and physical deletion
- User approval workflow is functional
- Agent assignment is working
- Session database uses `maia_sessions` with physical deletion

### Known Issues
1. ~~**Session Auto-Load**: Sessions don't load automatically on page load~~ ✅ **Fixed**
2. **Authentication Bypass**: No real authentication for admin functions
3. ~~**Session Cleanup**: Expired sessions may not be cleaned up automatically~~ ✅ **Fixed**

### Recommendations
1. ~~**Add Auto-Load**: Call `loadSessionStatus()` in `onMounted`~~ ✅ **Completed**
2. **Implement Real Auth**: Remove authentication bypass for production
3. ~~**Add Session Cleanup**: Implement automatic cleanup of expired sessions~~ ✅ **Completed**

## Session Management Implementation

### Physical Session Deletion ✅
**Status**: Implemented and working correctly

**Key Changes**:
1. **Database Migration**: Sessions moved from `maia_chats` to dedicated `maia_sessions` database
2. **Physical Deletion**: Sessions are now completely removed from database instead of soft deletion
3. **Database Growth Prevention**: Prevents accumulation of inactive sessions over time

**Implementation Details**:
- **User Logout**: `POST /api/passkey/logout` physically deletes session document
- **Admin Signout**: `POST /api/admin-management/sessions/:sessionId/signout` physically deletes session document
- **Console Logging**: All session deletion events are logged with `[*] [Session Delete]` prefix
- **Error Handling**: Graceful handling if session document doesn't exist

**Console Messages**:
- `[*] [Session Delete] Deleting session from maia_sessions database: session_<ID>`
- `[*] [Session Delete] Successfully deleted session from maia_sessions database`
- `[*] [Session Delete] Session not found in maia_sessions database (may have been cleaned up)`

### Session Creation and Verification ✅
**Status**: Implemented with database verification

**Key Features**:
1. **Database-Verified Console Messages**: Browser console messages are based on actual database reads
2. **Proper Timing**: Session verification messages appear after user authentication
3. **Response Headers**: Custom headers (`X-Session-Verified`, `X-Session-Error`) communicate server events to frontend
4. **Session Write Helper**: Dedicated utility for writing sessions to database

**Console Messages**:
- `[*] [Session Write] Writing session to maia_sessions database after auth confirmation`
- `[*] [Session Verify] Session confirmed in database: {sessionId, userId, isActive, createdAt}`
- `[*] [Browser] Session verified in maia_sessions database` (in browser console)

### Session Event Tracking ✅
**Status**: Implemented for debugging and analysis

**Features**:
1. **Memory Cache**: Captures session events before database writes
2. **Event Analysis**: Tracks session creation, authentication, and activity events
3. **Debug Logging**: Comprehensive logging of session lifecycle events

**Console Messages**:
- `[*] [Session Event] Captured authenticated event: {eventKey, sessionId, userId, route, timestamp}`
- `[*] [Session Event] Cache size: <number>`

## Session Management Architecture

### Database Structure
- **Primary Database**: `maia_sessions` (dedicated session storage)
- **Legacy Database**: `maia_chats` (no longer used for sessions)
- **Session Store**: Default memory store (CouchDB store disabled for stability)

### Session Lifecycle
1. **Creation**: Session created in memory store during authentication
2. **Database Write**: Session document written to `maia_sessions` after auth confirmation
3. **Verification**: Database read confirms session exists and is active
4. **Activity Tracking**: Session activity updates `lastActivity` timestamp
5. **Deletion**: Session physically removed from database on logout/signout

### Key Files
- `src/routes/passkey-routes.js` - User logout and session verification
- `src/utils/session-manager.js` - Admin session management
- `src/utils/session-write-helper.js` - Session database operations
- `src/entry/main.ts` - Frontend session verification interceptor

### Console Debugging
All session operations include comprehensive console logging with `[*]` prefix for essential messages:
- Session creation and database writes
- Session verification and confirmation
- Session deletion and cleanup
- Error handling and edge cases
