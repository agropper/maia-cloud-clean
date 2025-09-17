#!/usr/bin/env node

/**
 * Direct Agent Ownership Fix
 * 
 * This script will directly update the user documents in maia_users
 * to restore the correct agent ownership relationships.
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

async function directFixOwnership() {
  try {
    console.log('🔧 Direct agent ownership fix...\n');
    
    // First, let's see what's currently in the database
    console.log('📊 Current user data:');
    const usersResponse = await fetch(`${API_BASE_URL}/api/admin-management/users`);
    const usersData = await usersResponse.json();
    
    console.log('Users from admin API:');
    usersData.users.forEach(user => {
      console.log(`  ${user.userId}:`);
      console.log(`    Assigned Agent: ${user.assignedAgentName} (${user.assignedAgentId})`);
      console.log(`    Workflow Stage: ${user.workflowStage}`);
    });
    
    console.log('\n📊 Current agent data:');
    const currentAgentResponse = await fetch(`${API_BASE_URL}/api/current-agent`);
    const currentAgentData = await currentAgentResponse.json();
    
    console.log(`Current Agent: ${currentAgentData.agent.name} (${currentAgentData.agent.id})`);
    
    // Now let's create a script to fix the ownership
    const fixScript = `
// Direct database fix for agent ownership
const { createCouchDBClient } = require('./src/utils/couchdb-client.js');
const couchDBClient = createCouchDBClient();

async function fixAgentOwnership() {
  try {
    console.log('🔧 Starting direct agent ownership fix...');
    
    // Get all users from maia_users
    const allUsers = await couchDBClient.getAllDocuments('maia_users');
    console.log(\`📊 Found \${allUsers.length} users in maia_users\`);
    
    // Define the correct agent ownership
    const agentOwnership = {
      'Unknown User': {
        currentAgentId: 'agent-08032025',
        currentAgentName: 'agent-08032025',
        ownedAgents: [
          { id: 'agent-05102025', name: 'agent-05102025', assignedAt: new Date().toISOString() },
          { id: 'agent-08032025', name: 'agent-08032025', assignedAt: new Date().toISOString() }
        ]
      },
      'wed271': {
        currentAgentId: 'agent-08292025',
        currentAgentName: 'agent-08292025',
        ownedAgents: [
          { id: 'agent-08292025', name: 'agent-08292025', assignedAt: new Date().toISOString() }
        ]
      }
    };
    
    // Update each user
    for (const [userId, agentData] of Object.entries(agentOwnership)) {
      console.log(\`📝 Updating \${userId}...\`);
      
      // Find the user document
      const userDoc = allUsers.find(u => u._id === userId);
      if (!userDoc) {
        console.log(\`  ❌ User \${userId} not found\`);
        continue;
      }
      
      console.log(\`  📄 Current user doc: \${JSON.stringify(userDoc, null, 2)}\`);
      
      // Update with agent ownership data
      const updatedUserDoc = {
        ...userDoc,
        currentAgentId: agentData.currentAgentId,
        currentAgentName: agentData.currentAgentName,
        ownedAgents: agentData.ownedAgents,
        currentAgentSetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log(\`  📄 Updated user doc: \${JSON.stringify(updatedUserDoc, null, 2)}\`);
      
      // Save updated document
      await couchDBClient.saveDocument('maia_users', updatedUserDoc);
      console.log(\`  ✅ Updated \${userId} with agent ownership\`);
    }
    
    console.log('✅ Agent ownership fix completed!');
    
  } catch (error) {
    console.error('❌ Agent ownership fix failed:', error);
  }
}

fixAgentOwnership();
`;
    
    // Write the script
    const fs = await import('fs');
    fs.writeFileSync('temp-direct-fix.js', fixScript);
    
    console.log('\n📝 Direct fix script created: temp-direct-fix.js');
    console.log('\nTo execute the fix, run:');
    console.log('  node temp-direct-fix.js');
    
  } catch (error) {
    console.error('❌ Fix preparation failed:', error.message);
  }
}

directFixOwnership();
