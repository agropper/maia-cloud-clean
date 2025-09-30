# AGENTS AND KNOWLEDGE BASES - CURRENT STATE ANALYSIS

## Overview
This document provides a comprehensive analysis of the current state of agents, knowledge bases, and user management in the MAIA system.

## Cloudant Databases

### 1. `maia_chats`
- **Purpose**: Stores chat conversations and user session data
- **Usage**: Chat history, user sessions, group chat management
- **Key Collections**: Chat documents, user session data

### 2. `maia_knowledge_bases` 
- **Purpose**: Stores knowledge base ownership and protection metadata
- **Usage**: Tracks which user owns each KB, protection status
- **Key Collections**: Protection documents with format `kb_{uuid}` containing:
  - `owner`: Username who owns the KB
  - `isProtected`: Boolean indicating if KB requires authentication
  - `createdAt`: Timestamp when protection was set

### 3. `maia_users` (inferred from logs)
- **Purpose**: Stores user account information and agent assignments
- **Usage**: User authentication, agent assignments, approval status
- **Key Collections**: User documents with:
  - `userId`: Username
  - `assignedAgentId`: UUID of assigned agent
  - `assignedAgentName`: Name of assigned agent
  - `approvalStatus`: User approval state

## DigitalOcean APIs

### 1. DigitalOcean Personal AI Agent API
- **Endpoint**: `https://api.digitalocean.com/v2/gen-ai/agents`
- **Purpose**: Manage AI agents and their configurations
- **Usage**: 
  - List agents: `GET /agents`
  - Get agent details: `GET /agents/{agent_id}`
  - Attach/detach KBs: `POST/DELETE /agents/{agent_id}/knowledge_bases/{kb_id}`

### 2. DigitalOcean Knowledge Base API
- **Endpoint**: `https://api.digitalocean.com/v2/gen-ai/knowledge_bases`
- **Purpose**: Manage knowledge bases and their content
- **Usage**:
  - List KBs: `GET /knowledge_bases`
  - Create KB: `POST /knowledge_bases`
  - Get KB details: `GET /knowledge_bases/{kb_id}`

### 3. DigitalOcean Agent API Keys
- **Endpoint**: `https://api.digitalocean.com/v2/gen-ai/agents/{agent_uuid}/api_keys`
- **Purpose**: Manage agent-specific API keys for authentication
- **Usage**:
  - List API keys: `GET /agents/{agent_uuid}/api_keys` (returns metadata only)
  - Create API key: `POST /agents/{agent_uuid}/api_keys` (returns actual key)
- **Implementation**: 
  - Each agent requires its own API key for authentication
  - Keys are created via POST request and stored securely in server configuration
  - Keys are retrieved using `getAgentApiKey(agentId)` function
  - Fallback to global `DIGITALOCEAN_PERSONAL_API_KEY` if agent-specific key not found

## Agent-Specific Authentication Implementation

### Current Agent API Keys (Hardcoded in server.js)
```javascript
const agentApiKeys = {
  '2960ae8d-8514-11f0-b074-4e013e2ddde4': 'fnCsOfehzcEemiTKdowBFbjAIf7jSFwz', // agent-08292025
  '059fc237-7077-11f0-b056-36d958d30bcf': 'QDb19YdQi2adFlF76VLCg7qSk6BzS8sS', // agent-08032025
  '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4': '6_LUNA_A-MVAxNkuaPbE3FnErmcBF7JK'  // agent-05102025
};
```

### Authentication Flow
1. **Agent Selection**: User selects agent via Agent Management dialog
2. **Agent Storage**: Agent ID stored in Cloudant (`maia_users` database)
3. **API Key Retrieval**: `getAgentApiKey(agentId)` function looks up agent-specific key
4. **OpenAI Client Creation**: Agent-specific OpenAI client created with:
   - `baseURL`: Agent's deployment URL (`https://{agent-id}.agents.do-ai.run/api/v1`)
   - `apiKey`: Agent-specific API key from `agentApiKeys` map
5. **Query Execution**: Chat completion request sent to agent-specific endpoint

### Error Handling
- **No API Key**: Returns 400 error with message "No API key available for the selected agent"
- **Authentication Failed (401)**: Returns 400 error with message "Authentication failed for the selected agent"
- **Access Denied (403)**: Returns 400 error with message "Access denied for the selected agent"

## Current State Analysis

### DigitalOcean Knowledge Bases (14 total)
1. **wed271-uuid-test** (38f89fef-88dc-11f0-b074-4e013e2ddde4) - Created: 2025-09-03T15:39:47Z
2. **devon-viaapp-kb-06162025** (4c21cdaa-4b04-11f0-bf8f-4e013e2ddde4) - Created: 2025-06-16T22:50:27Z
3. **casandra-fhir-download-json-06162025** (f2c087b8-4aed-11f0-bf8f-4e013e2ddde4) - Created: 2025-06-16T20:10:28Z
4. **casandra-timeline-mpnet-kb-06162025** (9c7103a5-4aeb-11f0-bf8f-4e013e2ddde4) - Created: 2025-06-16T19:53:45Z
5. **casandra-timeline-minilm-kb-06162025** (7274446e-4aeb-11f0-bf8f-4e013e2ddde4) - Created: 2025-06-16T19:52:34Z
6. **casandra-from-timeline-kb-06162025** (c02cb866-4ae1-11f0-bf8f-4e013e2ddde4) - Created: 2025-06-16T18:43:10Z
7. **casandra-via-newapp-kb-05312025** (d2e79af4-3e8b-11f0-bf8f-4e013e2ddde4) - Created: 2025-06-01T01:57:50Z
8. **casandra-claude-kb-05312025** (c14208c6-3e5a-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-31T20:06:35Z
9. **casandra-kb-05302025** (fdfa8e68-3dbd-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-31T01:24:26Z
10. **waylon-timeline-kb-05262025** (aedeb1fa-3a82-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-26T22:42:20Z
11. **ag-applehealth-export-05122025** (31894efb-2f8c-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-12T23:52:42Z
12. **cgm-kb-05122025** (564023b1-2f68-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-12T19:36:01Z
13. **ag-medicare-kb-05122025** (9c6df853-2f62-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-12T18:55:02Z
14. **agropper-kb-05122025** (0fd85f4c-2f5b-11f0-bf8f-4e013e2ddde4) - Created: 2025-05-12T18:01:00Z

### DigitalOcean Agents (3 total)
1. **agent-08292025** (2960ae8d-8514-11f0-b074-4e013e2ddde4)
   - Connected KBs: 1
   - KB: waylon-timeline-kb-05262025

2. **agent-08032025** (059fc237-7077-11f0-b056-36d958d30bcf)
   - Connected KBs: 1
   - KB: devon-viaapp-kb-06162025

3. **agent-05102025** (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)
   - Connected KBs: 2
   - KBs: casandra-timeline-mpnet-kb-06162025, wed271-uuid-test

### Cloudant KB Ownership Data (from maia_knowledge_bases database)
**All KBs show: `owner: null, isProtected: false`**
- This means ALL KBs are currently unprotected and accessible to everyone
- No KBs have ownership metadata stored in Cloudant

### Cloudant User Data (from maia_users database)
1. **admin** (admin)
   - Status: awaiting_approval
   - Assigned Agent: None

2. **wed271** (wed271)
   - Status: approved
   - Assigned Agent: agent-05102025 (16c9edf6-2dee-11f0-bf8f-4e013e2ddde4)

### Agent Badge Test Results
**Unauthenticated User:**
- Agent: agent-05102025
- Connected KBs: 0 (should be 2 - casandra-timeline-mpnet-kb-06162025, wed271-uuid-test)
- Status: ❌ BROKEN - Not showing any KBs despite agent having 2 KBs attached

## Key Issues Identified

1. **Agent Badge Filtering Logic**: The agent badge is not showing any KBs for unauthenticated users, even though the agent has 2 KBs attached and all KBs are unprotected (`isProtected: false`)

2. **KB Ownership Metadata**: All KBs show `owner: null, isProtected: false`, meaning no ownership protection is currently in place

3. **Debug Logging Shows**: The agent badge filtering logic is incorrectly filtering out all KBs for unauthenticated users, even unprotected ones

## Root Cause Analysis

The issue is in the agent badge filtering logic in `server.js`. The debug logs show:
- `🔍 Final access decision for casandra-timeline-mpnet-kb-06162025: hasAccess=false`
- `🔍 Final access decision for wed271-uuid-test: hasAccess=false`

This suggests the protection document lookup is failing or the logic is incorrect for unauthenticated users accessing unprotected KBs.

## 🚀 **DATABASE CONSOLIDATION STRATEGY**

### **PROBLEM IDENTIFIED**
- **Database Limit**: Cloudant has a 20-database limit, and we were approaching it with multiple `maia_`, `maia2_`, and `maia3_` databases
- **Confusion**: Mixed database naming caused confusion about which database was being used
- **Environment Override**: `.env` file had `CLOUDANT_DATABASE=maia_chats` which overrode code defaults

### **SOLUTION IMPLEMENTED**
**CONSOLIDATE TO STANDARD `maia_` DATABASES:**
- `maia_users` - User authentication and management
- `maia_knowledge_bases` - KB ownership and protection metadata  
- `maia_chats` - Chat history and conversations

### **COMPLETED ACTIONS**
1. ✅ **Created maia_users database** with proper design document
2. ✅ **Added design document** with views: by_username, by_email, by_status, by_approval_status
3. ✅ **Migrated 69 users** from maia2_users to maia_users
4. ✅ **Verified migration** - maia_users now contains all user data with proper structure

### **CURRENT DATABASE STATUS**
**ACTIVE DATABASES:**
- `maia_users` - ✅ **ACTIVE** - User authentication and management
- `maia_knowledge_bases` - ✅ **ACTIVE** - KB protection metadata
- `maia3_chats` - ✅ **ACTIVE** - Chat history and conversations

**CLEANUP COMPLETED:**
- ✅ **Removed legacy database setup files** - maia2-database-setup.js, maia3-database-setup.js
- ✅ **Removed legacy migration files** - database-migration.js, maia2-api-routes.js
- ✅ **Removed legacy scripts** - All migration and inspection scripts
- ✅ **Updated code references** - maia2Client now uses maia_users database
- ✅ **Updated documentation** - Removed references to legacy databases

### **BENEFITS**
- ✅ **Avoids database limit** - Only 3 databases instead of 9+
- ✅ **Eliminates confusion** - Clear, consistent naming
- ✅ **Safe for merging branch** - maia_chats is already "unchanged" in MAIA2 design
- ✅ **Simpler maintenance** - Single source of truth for each data type

-------------------------------

September 24, 2025

- Fixed the reporting of bucket status in Admin User Details
- Added a New User Welcome modal that bypasses the Agent Mangement panel
- Removed maia2_admin_approvals references. 
- Added workflowStage field to new users in maia_users database
- Added deep link for Admin User Details

New Array: workflowStateMessages with standardized messages for each workflow stage:
'no_passkey': "No Passkey - Please register a passkey to access private features"
'no_request_yet': "No Request Yet - You can request support for a private AI agent"
'awaiting_approval': "Awaiting Approval - Your request for a private agent has been sent to the administrator"
'approved': "Approved - You have been approved for private AI access"
'agent_assigned': "Agent Assigned - You have access to your private AI agent"
'inconsistent': "Inconsistent State - Please contact administrator for assistance"

---

## 📚 KNOWLEDGE BASE CREATION AND INDEXING SEQUENCE

### **🎯 Overview**
The process involves 6 main steps: **File Upload → Bucket Storage → Knowledge Base Creation → Indexing Job → Monitoring → Completion**

### **📋 Step-by-Step Sequence**

#### **1. File Upload to User's Bucket Folder**
**Frontend**: `AgentManagementDialog.vue` → `uploadSelectedFilesToBucket()`
- User selects files in the Agent Management Dialog
- Files are processed and uploaded to DigitalOcean Spaces bucket
- **Endpoint**: `POST /api/upload-to-bucket`
- **Bucket Structure**: `{username}/filename.ext` (e.g., `wed271/document.pdf`)
- **File Processing**:
  - **PDFs**: Converted to markdown (`file.transcript`) or raw text (`file.content`)
  - **RTFs**: Converted to markdown
  - **Markdown**: Used directly
  - **Validation**: Ensures files have usable content before upload

#### **2. Knowledge Base Creation**
**Frontend**: `AgentManagementDialog.vue` → `createKnowledgeBaseFromBucketFiles()`
- User provides KB name and description
- **Endpoint**: `POST /api/knowledge-bases`
- **Backend Processing** (`server.js` lines 4834-4954):
  ```javascript
  const kbData = {
    name: `${username}-${name}`,  // User-prefixed name
    description: `${kbName} description`,
    project_id: '90179b7c-8a42-4a71-a036-b4c2bea2fe59',
    database_id: '881761c6-e72d-4f35-a48e-b320cd1f46e4',
    region: "tor1",
    datasources: [{
      "spaces_data_source": {
        "bucket_name": "maia",
        "item_path": `${username}/`,  // Points to user's folder
        "region": "tor1"
      }
    }]
  };
  ```
- **DigitalOcean API Call**: `POST /v2/gen-ai/knowledge_bases`
- **Embedding Model**: Automatically selects best available (prefers GTE Large)

#### **3. Indexing Job Creation**
**Frontend**: `AgentManagementDialog.vue` → `startIndexingJob()`
- **Endpoint**: `POST /api/test-start-indexing`
- **Backend Processing** (`server.js` lines 5122-5189):
  1. Get knowledge base details from DigitalOcean API
  2. Extract data source UUID from the spaces_data_source
  3. Create indexing job:
     ```javascript
     const indexingJobData = {
       data_source_uuid: dataSource.spaces_data_source.uuid
     };
     ```
  4. **DigitalOcean API Call**: `POST /v2/gen-ai/knowledge_bases/{kbId}/indexing_jobs`

#### **4. Indexing Monitoring**
**Frontend**: `AgentManagementDialog.vue` → `startIndexingMonitor()`
- **Monitoring Interval**: Every 10 seconds
- **Endpoint**: `GET /api/knowledge-bases/{kbId}/indexing-status`
- **Backend Processing** (`server.js` lines 5042-5119):
  - Calls DigitalOcean API to get indexing job status
  - Returns status: `PENDING`, `INDEX_JOB_STATUS_IN_PROGRESS`, `INDEX_JOB_STATUS_COMPLETED`, `FAILED`
  - Tracks progress and phase information

#### **5. Status Updates and User Feedback**
**Frontend**: Real-time updates via polling
- **Workflow Step 6**: "Knowledge base indexing status monitoring"
- **Status Display**: Shows current indexing status and phase
- **User Notifications**: Success/error notifications via Quasar
- **Progress Tracking**: Records start time and completion time

#### **6. Completion and Cleanup**
**Frontend**: `checkIndexingStatus()` → `stopIndexingMonitor()`
- **Completion Detection**: When status = `INDEX_JOB_STATUS_COMPLETED`
- **Workflow Update**: Marks Step 6 as completed
- **Resource Cleanup**: Stops monitoring interval
- **User Notification**: Shows success message with timing information

### **🔧 Key Technical Components**

#### **Bucket Management**
- **User Folders**: Each user gets `{username}/` folder in `maia` bucket
- **File Organization**: Files stored as `{username}/filename.ext`
- **Access Control**: Users can only access their own folder

#### **DigitalOcean Integration**
- **API Endpoints**: Uses DigitalOcean's GenAI API v2
- **Data Sources**: Spaces data source pointing to user's bucket folder
- **Embedding Models**: Automatically selects best available model
- **Indexing Jobs**: Asynchronous processing with status tracking

#### **Error Handling**
- **Bucket Validation**: Checks if bucket exists before operations
- **File Validation**: Ensures files have content before upload
- **API Error Handling**: Comprehensive error messages and fallbacks
- **Monitoring Timeouts**: Prevents infinite monitoring loops

#### **Security**
- **User Isolation**: Each user's files in separate bucket folders
- **Access Control**: Users can only access their own knowledge bases
- **Data Validation**: Validates file types and content before processing

### **📊 Monitoring and Debugging**

#### **Backend Monitoring**
- **Server Logs**: Detailed logging of each step
- **API Response Tracking**: Logs DigitalOcean API responses
- **Error Logging**: Comprehensive error tracking

#### **Frontend Monitoring**
- **Console Logs**: Real-time status updates
- **User Interface**: Progress indicators and status messages
- **Workflow Steps**: Visual progress through 6-step process

#### **External Monitoring Scripts**
- **`monitor-indexing.sh`**: Standalone indexing progress monitor
- **`monitor-digitalocean-indexing.sh`**: Direct DigitalOcean API monitoring
- **Log Files**: Timestamped progress logs for debugging

### **🎯 Expected Timeline**
- **File Upload**: 1-5 seconds per file
- **Knowledge Base Creation**: 2-10 seconds
- **Indexing Job Creation**: 1-3 seconds
- **Indexing Process**: 30 seconds to several minutes (depends on file size/number)
- **Total Process**: Typically 2-10 minutes for small to medium file sets

This comprehensive system ensures reliable knowledge base creation with proper error handling, user feedback, and monitoring throughout the entire process.

-------------------------------

Admin Panel Backend Functions Analysis
Admin-Only Backend Functions (Not Used by Regular App Users)
1. Authentication & Authorization
/api/admin-management/register - Admin user registration with secret
/api/admin/verify-admin - Admin password verification
requireAdminAuth middleware - Admin privilege checking
2. User Management & Workflow
/api/admin-management/users - Get all users with workflow status
/api/admin-management/users/:userId - Get specific user details
/api/admin-management/users/:userId/approve - Approve/reject users
/api/admin-management/users/:userId/workflow-stage - Update workflow stages
/api/admin-management/users/:userId/assign-agent - Assign agents to users
/api/admin-management/users/:userId/reset-passkey - Reset user passkeys
/api/admin-management/users/:userId/notes - Add admin notes
3. Session Management
/api/admin-management/sessions - Get all active sessions
/api/admin-management/sessions/:sessionId/signout - Force signout
/api/admin-management/sessions/user/:userId - Get user sessions
/api/admin-management/sessions/active-check - Session activity check
4. Database Management
/api/admin-management/database/update-user-agent - Update user-agent mappings
/api/admin-management/database/sync-agent-names - Sync agent names
/api/admin-management/database/user-agent-status - Get agent status
/api/admin-management/database/fix-consistency - Fix data inconsistencies
5. Knowledge Base Ownership Transfer
/api/admin/transfer-kb-ownership - Transfer KB ownership
/api/admin/transfer-history - Get transfer history
6. Email Notifications
/api/admin/request-approval - Send approval request emails
/api/admin/contact-support - Send support emails
7. Real-time Notifications
/api/admin/events - SSE stream for admin notifications
/api/admin/notify - Send SSE notifications
8. System Health
/api/admin-management/health - Admin system health check
9. Activity Tracking
/api/admin-management/agent-activities - Get agent activities
/api/admin-management/update-activity - Update activity tracking