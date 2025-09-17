#!/usr/bin/env node

/**
 * Fix Agent Ownership Script
 * 
 * This script will restore the agent ownership relationships that were lost
 * during the database migration.
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

async function fixAgentOwnership() {
  try {
    console.log('🔧 Fixing agent ownership after migration...\n');
    
    // Define the correct agent ownership relationships
    const agentOwnership = {
      'Unknown User': {
        currentAgentId: 'agent-08032025', // Default agent for Unknown User
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
    
    console.log('🎯 Agent ownership to restore:');
    Object.entries(agentOwnership).forEach(([userId, data]) => {
      console.log(`  ${userId}:`);
      console.log(`    Current Agent: ${data.currentAgentName}`);
      console.log(`    Owned Agents: ${data.ownedAgents.map(a => a.name).join(', ')}`);
    });
    
    // Create a script to update the user documents
    const updateScript = `
// Server-side agent ownership fix
const { createCouchDBClient } = require('./src/utils/couchdb-client.js');
const couchDBClient = createCouchDBClient();

const agentOwnership = ${JSON.stringify(agentOwnership, null, 2)};

async function fixAgentOwnership() {
  try {
    console.log('🔧 Starting agent ownership fix...');
    
    for (const [userId, agentData] of Object.entries(agentOwnership)) {
      console.log(\`📝 Updating \${userId}...\`);
      
      // Get current user document
      let userDoc;
      try {
        userDoc = await couchDBClient.getDocument('maia_users', userId);
      } catch (error) {
        if (error.statusCode === 404) {
          console.log(\`  ❌ User \${userId} not found, skipping...\`);
          continue;
        }
        throw error;
      }
      
      // Update with agent ownership data
      const updatedUserDoc = {
        ...userDoc,
        currentAgentId: agentData.currentAgentId,
        currentAgentName: agentData.currentAgentName,
        ownedAgents: agentData.ownedAgents,
        currentAgentSetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
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
    fs.writeFileSync('temp-fix-ownership.js', updateScript);
    
    console.log('\n📝 Agent ownership fix script created: temp-fix-ownership.js');
    console.log('\nTo execute the fix, run:');
    console.log('  node temp-fix-ownership.js');
    
  } catch (error) {
    console.error('❌ Fix preparation failed:', error.message);
  }
}

fixAgentOwnership();
