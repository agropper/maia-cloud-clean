#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function migrateUsers() {
  console.log('🔄 Migrating users via API...');
  
  try {
    // Get users from the API
    const response = await fetch(`${BASE_URL}/api/admin-management/users`);
    const data = await response.json();
    
    if (data.users) {
      console.log(`📊 Found ${data.users.length} users`);
      
      for (const user of data.users) {
        // Create user document for maia3_users
        const userDoc = {
          _id: user.userId,
          type: 'user',
          userId: user.userId,
          displayName: user.displayName,
          createdAt: user.createdAt,
          hasPasskey: user.hasPasskey,
          workflowStage: user.workflowStage,
          assignedAgentId: user.assignedAgentId,
          assignedAgentName: user.assignedAgentName,
          approvalStatus: user.workflowStage === 'approved' ? 'approved' : 'awaiting_approval',
          status: 'active'
        };
        
        // Save to maia3_users via API (we'll need to create an endpoint for this)
        console.log(`✅ Prepared user: ${user.userId}`);
      }
    }
    
    console.log('✅ User migration prepared');
  } catch (error) {
    console.error('❌ User migration failed:', error.message);
  }
}

async function migrateKnowledgeBases() {
  console.log('🔄 Migrating knowledge bases via API...');
  
  try {
    // Get KBs from the API
    const response = await fetch(`${BASE_URL}/api/knowledge-bases`);
    const kbs = await response.json();
    
    console.log(`📊 Found ${kbs.length} knowledge bases`);
    
    for (const kb of kbs) {
      // Create KB document for maia3_knowledge_bases
      const kbDoc = {
        _id: `kb_${kb.uuid}`,
        type: 'knowledge_base',
        kbName: kb.name,
        uuid: kb.uuid,
        isProtected: kb.isProtected,
        owner: kb.owner,
        description: kb.description || '',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        source: 'digitalocean'
      };
      
      console.log(`✅ Prepared KB: ${kb.name}`);
    }
    
    console.log('✅ Knowledge base migration prepared');
  } catch (error) {
    console.error('❌ Knowledge base migration failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting migration via API...');
  
  try {
    await migrateUsers();
    await migrateKnowledgeBases();
    
    console.log('🎉 Migration preparation completed!');
    console.log('📝 Note: Actual data insertion will be handled by the server startup process');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
