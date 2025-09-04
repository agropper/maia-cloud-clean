#!/usr/bin/env node

import { CouchDBClient } from './src/utils/couchdb-client.js';

const couchDBClient = new CouchDBClient();

async function checkMaiaUsers() {
  console.log('🔍 Checking maia_users database...');
  
  try {
    // Check if maia_users database exists
    const info = await couchDBClient.getDatabaseInfo('maia_users');
    console.log('✅ maia_users database exists');
    console.log('📊 Document count:', info.doc_count);
    console.log('💾 Disk size:', info.disk_size);
    
    // Get all documents to see what's in there
    const docs = await couchDBClient.getAllDocuments('maia_users');
    console.log('📋 Documents in maia_users:');
    
    docs.forEach((doc, index) => {
      if (doc._id.startsWith('_design/')) {
        console.log(`  ${index + 1}. Design Document: ${doc._id}`);
        console.log(`     Views: ${Object.keys(doc.views || {}).join(', ')}`);
      } else {
        console.log(`  ${index + 1}. User: ${doc._id} (${doc.userId || doc.username || 'unknown'})`);
        console.log(`     Type: ${doc.type || 'legacy'}`);
        console.log(`     Has Passkey: ${!!doc.credentialID}`);
        console.log(`     Status: ${doc.status || 'unknown'}`);
      }
    });
    
  } catch (error) {
    if (error.statusCode === 404) {
      console.log('❌ maia_users database does not exist');
    } else {
      console.error('❌ Error checking maia_users:', error.message);
    }
  }
  
  console.log('\n🔍 Checking maia2_users database for comparison...');
  
  try {
    const info2 = await couchDBClient.getDatabaseInfo('maia2_users');
    console.log('✅ maia2_users database exists');
    console.log('📊 Document count:', info2.doc_count);
    console.log('💾 Disk size:', info2.disk_size);
  } catch (error) {
    console.log('❌ maia2_users database does not exist or error:', error.message);
  }
}

checkMaiaUsers().catch(console.error);
