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
