# KILL_CURRENT_USER.md

## Overview
This document outlines a comprehensive plan to completely remove `currentUser` from the entire codebase. This is a breaking change that will eliminate the dual data model problem and simplify the system to use only `assignedUser`-based identification.

## Current State Analysis

### Two Data Models Currently Exist:
1. **Legacy System**: Uses `patientId` field in database (e.g., `'demo_patient_001'`)
2. **New System**: Uses `currentUser` field in database (e.g., `"Public User"`, `"wed271"`)

### Components Using `currentUser`:
- **Authentication**: User identification and session management
- **Data Filtering**: Chat filtering, agent assignment, KB access
- **UI State**: Agent Badge, Welcome Modal, Admin Panel permissions
- **API Calls**: User-specific endpoints and data isolation

## Database Cleanup Plan

### Phase 1: Database Schema Migration
1. **Add `assignedUser` field** to all existing records that only have `currentUser`
2. **Map `currentUser` values to `assignedUser`** (direct mapping):
   - `"Public User"` → `"Public User"`
   - `"wed271"` → `"wed271"`
   - `"wed17"` → `"wed17"`
   - etc.
3. **Add `shareType` field** to all records:
   - Regular user chats: `shareType: "private"` (or undefined)
   - Deep link chats: `shareType: "deep_link"`
4. **Remove `currentUser` field** from all database records
5. **Update all indexes** to use `assignedUser` and `shareType` instead of `currentUser`

### Phase 2: API Endpoint Updates
1. **Update `/api/group-chats`** to filter by `assignedUser` and `shareType` instead of `currentUser`
2. **Update `/api/save-group-chat`** to use `assignedUser` and `shareType` instead of `currentUser`
3. **Update `/api/load-group-chat`** to use `assignedUser` and `shareType` instead of `currentUser`
4. **Update deep link endpoints** to use `shareId` + `shareType: "deep_link"` filtering
5. **Update all other endpoints** that reference `currentUser`

### Phase 3: Frontend Component Updates

#### A. Authentication System
- **Remove `currentUser` from session state**
- **Use `assignedUser` for user identification**
- **Update all authentication checks** to use `assignedUser`

#### B. Data Loading Components
- **`ChatPromptRefactored.vue`**: Update `updateGroupCount()` to use `assignedUser` and `shareType`
- **`AdminPanel.vue`**: Update `loadChatCountsForAgents()` to use `assignedUser` and `shareType`
- **`GroupManagementModal.vue`**: Update filtering logic to use `assignedUser` and `shareType`
- **`SavedChatsDialog.vue`**: Update to use `assignedUser` and `shareType` instead of `currentUser`
- **Deep link components**: Update to use `shareId` + `shareType: "deep_link"` filtering

#### C. UI Components
- **`AgentManagementDialog.vue`**: Remove `currentUser` references
- **`BottomToolbar.vue`**: Update user display logic
- **`WelcomeModal.vue`**: Update user type detection
- **All other components**: Remove `currentUser` dependencies

#### D. Composables and Utilities
- **`useChatState.ts`**: Remove `currentUser` from state
- **`useGroupChat.ts`**: Update to use `assignedUser` and `shareType`
- **`useCouchDB.ts`**: Update to use `assignedUser` and `shareType`
- **`UserService.ts`**: Update user normalization logic
- **Deep link utilities**: Update to handle `shareType: "deep_link"` filtering

### Phase 4: Server-Side Updates

#### A. Session Management
- **Remove `currentUser` from session data**
- **Use `assignedUser` for user identification**
- **Update all middleware** to use `assignedUser`

#### B. Database Queries
- **Update all CouchDB queries** to use `assignedUser` and `shareType`
- **Remove `currentUser` from all database operations**
- **Update all filtering logic** to use `assignedUser` and `shareType`
- **Add deep link filtering** using `shareId` + `shareType: "deep_link"`

#### C. API Routes
- **Update all route handlers** to use `assignedUser` and `shareType`
- **Remove `currentUser` from request/response objects**
- **Update all validation logic** to use `assignedUser` and `shareType`
- **Update deep link routes** to handle `shareType: "deep_link"` filtering

## Implementation Strategy

### Step 1: Create Database Migration Script
```javascript
// migrate-currentUser-to-assignedUser.js
const migrateDatabase = async () => {
  // 1. Get all records with currentUser field
  // 2. Map currentUser values to assignedUser values (direct mapping)
  // 3. Add assignedUser field to all records
  // 4. Add shareType field to all records:
  //    - Regular chats: shareType: "private" (or undefined)
  //    - Deep link chats: shareType: "deep_link"
  // 5. Remove currentUser field from all records
  // 6. Update all indexes to use assignedUser and shareType
};
```

### Step 2: Update API Endpoints
- **Start with `/api/group-chats`** (most critical)
- **Update all group chat related endpoints**
- **Update deep link endpoints** to use `shareId` + `shareType: "deep_link"`
- **Update authentication endpoints**
- **Update all other endpoints systematically**

### Step 3: Update Frontend Components
- **Start with data loading components** (ChatPromptRefactored, AdminPanel)
- **Update deep link components** to use `shareId` + `shareType: "deep_link"`
- **Update UI components** (AgentManagementDialog, BottomToolbar)
- **Update composables and utilities**
- **Remove all currentUser references**

### Step 4: Testing and Validation
- **Test all user flows** (Public User, authenticated users)
- **Test deep link functionality** (shareId-based access)
- **Verify data consistency** across all components
- **Test Admin Panel functionality**
- **Verify deep link isolation** (users only see their specific shared chat)
- **Verify chat loading and saving**

## Risk Assessment

### High Risk Areas:
1. **Authentication system** - Core user identification
2. **Data filtering** - Chat and agent filtering logic
3. **Admin Panel** - Complex user management logic
4. **Database migration** - Data integrity concerns

### Mitigation Strategies:
1. **Comprehensive testing** before deployment
2. **Database backup** before migration
3. **Gradual rollout** with rollback capability
4. **Extensive logging** during migration process

## Benefits After Completion

### Simplified Architecture:
- **Single data model** (assignedUser only)
- **Consistent filtering logic** across all components
- **Easier maintenance** and debugging
- **Better performance** (no dual data model overhead)

### Eliminated Problems:
- **No more data model mismatch**
- **No more filtering inconsistencies**
- **No more currentUser vs assignedUser confusion**
- **Unified user identification system**

## Deep Link User Handling

### Current Deep Link Flow:
1. **User clicks deep link** (e.g., `https://app.com/chat/abc123`)
2. **App extracts `shareId`** from URL (`abc123`)
3. **App loads specific chat** associated with that `shareId`
4. **User sees only that one shared chat** (not all their chats)

### Updated Data Structure:
```javascript
// Regular user chats:
{
  assignedUser: "wed271",
  shareType: "private"  // or undefined
}

// Deep link chats:
{
  assignedUser: "wed271",  // Original creator
  shareType: "deep_link",
  shareId: "abc123"
}
```

### Filtering Logic:
```javascript
// For regular users:
const userChats = allChats.filter(chat => 
  chat.assignedUser === currentUser && 
  chat.shareType !== "deep_link"
);

// For deep link users:
const deepLinkChat = allChats.find(chat => 
  chat.shareId === shareId && 
  chat.shareType === "deep_link"
);
```

## Database Consistency Check Integration

### New Admin Panel Feature:
```javascript
// Add to Admin Panel Database Consistency Check
const removeCurrentUserFromDatabase = async () => {
  // 1. Scan all databases for currentUser fields
  // 2. Map currentUser values to assignedUser values (direct mapping)
  // 3. Add shareType field (private or deep_link)
  // 4. Update all records with assignedUser and shareType
  // 5. Remove currentUser fields
  // 6. Verify data integrity
  // 7. Report results to admin
};
```

### Admin Panel UI:
- **Add "Remove currentUser" button** to Database Consistency Check
- **Show progress** during migration
- **Display results** and any errors
- **Provide rollback option** if needed

## Conclusion

This is a major refactoring that will eliminate the dual data model problem and simplify the entire system. The key is to do it systematically, with proper testing and validation at each step. The end result will be a cleaner, more maintainable codebase with consistent data handling throughout.

**Estimated Timeline**: 2-3 days for complete implementation and testing
**Risk Level**: High (breaking change)
**Benefit Level**: Very High (eliminates major architectural issues)
