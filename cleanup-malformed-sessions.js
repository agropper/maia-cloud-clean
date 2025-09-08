import dotenv from 'dotenv';
dotenv.config();

import { createCouchDBClient } from './src/utils/couchdb-client.js';

async function cleanupMalformedSessions() {
  try {
    const client = createCouchDBClient();
    
    // Find all session documents
    const query = {
      selector: {
        type: 'session'
      }
    };
    
    const result = await client.findDocuments('maia_chats', query);
    console.log(`Found ${result.docs.length} session documents`);
    
    let cleanedCount = 0;
    for (const doc of result.docs) {
      // Check if the session ID is malformed (contains [object Object])
      if (doc._id.includes('[object Object]') || doc._id.includes('session_[object Object]')) {
        console.log(`Deleting malformed session: ${doc._id}`);
        doc.isActive = false;
        doc.deactivatedAt = new Date().toISOString();
        doc.cleanupReason = 'Malformed session ID';
        await client.saveDocument('maia_chats', doc);
        cleanedCount++;
      }
    }
    
    console.log(`✅ Cleaned up ${cleanedCount} malformed sessions`);
    
    // Show remaining sessions
    const remainingQuery = {
      selector: {
        type: 'session',
        isActive: true
      }
    };
    
    const remainingResult = await client.findDocuments('maia_chats', remainingQuery);
    console.log(`Remaining active sessions: ${remainingResult.docs.length}`);
    
    for (const doc of remainingResult.docs) {
      console.log(`  - ${doc._id} (user: ${doc.userId})`);
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up sessions:', error);
  }
}

cleanupMalformedSessions();
