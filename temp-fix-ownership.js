
// Server-side agent ownership fix
import { createCouchDBClient } from './src/utils/couchdb-client.js';
const couchDBClient = createCouchDBClient();

const agentOwnership = {
  "Unknown User": {
    "currentAgentId": "agent-08032025",
    "currentAgentName": "agent-08032025",
    "ownedAgents": [
      {
        "id": "agent-05102025",
        "name": "agent-05102025",
        "assignedAt": "2025-09-06T00:52:20.090Z"
      },
      {
        "id": "agent-08032025",
        "name": "agent-08032025",
        "assignedAt": "2025-09-06T00:52:20.090Z"
      }
    ]
  },
  "wed271": {
    "currentAgentId": "agent-08292025",
    "currentAgentName": "agent-08292025",
    "ownedAgents": [
      {
        "id": "agent-08292025",
        "name": "agent-08292025",
        "assignedAt": "2025-09-06T00:52:20.090Z"
      }
    ]
  }
};

async function fixAgentOwnership() {
  try {
    console.log('🔧 Starting agent ownership fix...');
    
    for (const [userId, agentData] of Object.entries(agentOwnership)) {
      console.log(`📝 Updating ${userId}...`);
      
      // Get current user document
      let userDoc;
      try {
        userDoc = await couchDBClient.getDocument('maia_users', userId);
      } catch (error) {
        if (error.statusCode === 404) {
          console.log(`  ❌ User ${userId} not found, skipping...`);
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
      console.log(`  ✅ Updated ${userId} with agent ownership`);
    }
    
    console.log('✅ Agent ownership fix completed!');
    
  } catch (error) {
    console.error('❌ Agent ownership fix failed:', error);
  }
}

fixAgentOwnership();
