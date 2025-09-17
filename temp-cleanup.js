
// Server-side cleanup script
import { createCouchDBClient } from './src/utils/couchdb-client.js';
const couchDBClient = createCouchDBClient();

const essentialUsers = [
  {
    "_id": "Unknown User",
    "type": "user",
    "createdAt": "2025-09-06T00:19:14.100Z",
    "currentAgentId": null,
    "currentAgentName": null
  },
  {
    "_id": "admin",
    "type": "admin",
    "isAdmin": true,
    "createdAt": "2025-09-06T00:19:14.101Z"
  },
  {
    "_id": "wed271",
    "type": "user",
    "displayName": "wed271",
    "createdAt": "2025-09-06T00:19:14.101Z",
    "credentialID": "test-credential-id-wed271",
    "approvalStatus": "approved"
  },
  {
    "_id": "fri95",
    "type": "user",
    "displayName": "fri95",
    "createdAt": "2025-09-06T00:19:14.101Z",
    "credentialID": "test-credential-id-fri95",
    "approvalStatus": "pending"
  }
];

async function cleanupDatabase() {
  try {
    console.log('🧹 Starting database cleanup...');
    
    // Get all current documents
    const allDocs = await couchDBClient.getAllDocuments('maia_users');
    console.log(`📊 Current documents: ${allDocs.length}`);
    
    // Delete all current documents
    console.log('🗑️  Deleting all current documents...');
    for (const doc of allDocs) {
      try {
        await couchDBClient.deleteDocument('maia_users', doc._id, doc._rev);
        console.log(`  ✅ Deleted: ${doc._id}`);
      } catch (error) {
        console.log(`  ⚠️  Error deleting ${doc._id}: ${error.message}`);
      }
    }
    
    // Insert essential users
    console.log('📤 Inserting essential users...');
    for (const user of essentialUsers) {
      try {
        await couchDBClient.saveDocument('maia_users', user);
        console.log(`  ✅ Inserted: ${user._id}`);
      } catch (error) {
        console.log(`  ❌ Error inserting ${user._id}: ${error.message}`);
      }
    }
    
    // Verify cleanup
    const finalDocs = await couchDBClient.getAllDocuments('maia_users');
    console.log(`✅ Cleanup complete! Final count: ${finalDocs.length} documents`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

cleanupDatabase();
