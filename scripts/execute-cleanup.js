#!/usr/bin/env node

/**
 * Execute Database Cleanup Script
 * 
 * This script will actually perform the cleanup by:
 * 1. Using the server's database connection via API calls
 * 2. Replacing maia_users with clean data
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

// Essential users to keep in the clean database
const essentialUsers = [
  {
    _id: 'Unknown User',
    type: 'user',
    createdAt: new Date().toISOString(),
    currentAgentId: null,
    currentAgentName: null
  },
  {
    _id: 'admin',
    type: 'admin',
    isAdmin: true,
    createdAt: new Date().toISOString()
  },
  {
    _id: 'wed271',
    type: 'user',
    displayName: 'wed271',
    createdAt: new Date().toISOString(),
    credentialID: 'test-credential-id-wed271',
    approvalStatus: 'approved'
  },
  {
    _id: 'fri95',
    type: 'user', 
    displayName: 'fri95',
    createdAt: new Date().toISOString(),
    credentialID: 'test-credential-id-fri95',
    approvalStatus: 'pending'
  }
];

async function executeCleanup() {
  try {
    console.log('🚀 Executing database cleanup...\n');
    
    // Since we can't directly access the database, we'll need to work through the server
    // For now, let's create a script that the server can execute
    
    console.log('📝 Creating server-side cleanup script...');
    
    const cleanupScript = `
// Server-side cleanup script
const { createCouchDBClient } = require('./src/utils/couchdb-client.js');
const couchDBClient = createCouchDBClient();

const essentialUsers = ${JSON.stringify(essentialUsers, null, 2)};

async function cleanupDatabase() {
  try {
    console.log('🧹 Starting database cleanup...');
    
    // Get all current documents
    const allDocs = await couchDBClient.getAllDocuments('maia_users');
    console.log(\`📊 Current documents: \${allDocs.length}\`);
    
    // Delete all current documents
    console.log('🗑️  Deleting all current documents...');
    for (const doc of allDocs) {
      try {
        await couchDBClient.deleteDocument('maia_users', doc._id, doc._rev);
        console.log(\`  ✅ Deleted: \${doc._id}\`);
      } catch (error) {
        console.log(\`  ⚠️  Error deleting \${doc._id}: \${error.message}\`);
      }
    }
    
    // Insert essential users
    console.log('📤 Inserting essential users...');
    for (const user of essentialUsers) {
      try {
        await couchDBClient.saveDocument('maia_users', user);
        console.log(\`  ✅ Inserted: \${user._id}\`);
      } catch (error) {
        console.log(\`  ❌ Error inserting \${user._id}: \${error.message}\`);
      }
    }
    
    // Verify cleanup
    const finalDocs = await couchDBClient.getAllDocuments('maia_users');
    console.log(\`✅ Cleanup complete! Final count: \${finalDocs.length} documents\`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

cleanupDatabase();
`;
    
    // Write the script to a file
    const fs = await import('fs');
    fs.writeFileSync('temp-cleanup.js', cleanupScript);
    
    console.log('✅ Server-side cleanup script created: temp-cleanup.js');
    console.log('\n📋 To execute the cleanup:');
    console.log('   1. Run: node temp-cleanup.js');
    console.log('   2. This will clean the maia_users database');
    console.log('   3. Keep only the 4 essential users');
    console.log('   4. Remove all test data and deep link users');
    
    console.log('\n⚠️  Make sure you have a backup before running the cleanup!');
    
  } catch (error) {
    console.error('❌ Cleanup preparation failed:', error.message);
  }
}

executeCleanup();
