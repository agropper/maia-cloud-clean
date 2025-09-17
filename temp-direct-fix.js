
// Direct database fix for agent ownership
import { createCouchDBClient } from './src/utils/couchdb-client.js';
const couchDBClient = createCouchDBClient();

async function fixAgentOwnership() {
  try {
    console.log('🔧 Starting direct agent ownership fix...');
    
    // Get all users from maia_users
    const allUsers = await couchDBClient.getAllDocuments('maia_users');
    console.log(`📊 Found ${allUsers.length} users in maia_users`);
    
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
      console.log(`📝 Updating ${userId}...`);
      
      // Find the user document
      const userDoc = allUsers.find(u => u._id === userId);
      if (!userDoc) {
        console.log(`  ❌ User ${userId} not found`);
        continue;
      }
      
      console.log(`  📄 Current user doc: ${JSON.stringify(userDoc, null, 2)}`);
      
      // Update with agent ownership data
      const updatedUserDoc = {
        ...userDoc,
        currentAgentId: agentData.currentAgentId,
        currentAgentName: agentData.currentAgentName,
        ownedAgents: agentData.ownedAgents,
        currentAgentSetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log(`  📄 Updated user doc: ${JSON.stringify(updatedUserDoc, null, 2)}`);
      
      // Save updated document
      await couchDBClient.saveDocument('maia_users', updatedUserDoc);
      console.log(`  ✅ Updated ${userId} with agent ownership`);
    }
    
    console.log('✅ Agent ownership fix completed!');
    
  } catch (error) {
    console.error('❌ Agent ownership fix failed:', error);
  }
}

fixAgentOwnership();
