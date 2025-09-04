#!/usr/bin/env node

import { CouchDBClient } from './src/utils/couchdb-client.js';

const couchDBClient = new CouchDBClient();

async function consolidateToMaiaDatabases() {
  console.log('🚀 Starting consolidation to maia_ databases...');
  
  try {
    // Step 1: Create maia_users database if it doesn't exist
    console.log('📋 Step 1: Creating maia_users database...');
    try {
      await couchDBClient.createDatabase('maia_users');
      console.log('✅ Created maia_users database');
    } catch (error) {
      if (error.statusCode === 412) {
        console.log('✅ maia_users database already exists');
      } else {
        console.error('❌ Failed to create maia_users database:', error.message);
        return;
      }
    }
    
    // Step 2: Add design document to maia_users
    console.log('📋 Step 2: Adding design document to maia_users...');
    const designDoc = {
      _id: '_design/users',
      views: {
        by_username: {
          map: function(doc) { 
            if (doc.type === 'user') { 
              emit(doc.username, doc); 
            } 
          }.toString()
        },
        by_email: {
          map: function(doc) { 
            if (doc.type === 'user' && doc.email) { 
              emit(doc.email, doc); 
            } 
          }.toString()
        },
        by_status: {
          map: function(doc) { 
            if (doc.type === 'user') { 
              emit(doc.status, doc); 
            } 
          }.toString()
        },
        by_approval_status: {
          map: function(doc) { 
            if (doc.type === 'user') { 
              emit(doc.approvalStatus, doc); 
            } 
          }.toString()
        }
      }
    };
    
    try {
      // Try to get existing design document
      const existing = await couchDBClient.getDocument('maia_users', '_design/users');
      designDoc._rev = existing._rev;
      console.log('📝 Updating existing design document');
    } catch (error) {
      console.log('📝 Creating new design document');
    }
    
    await couchDBClient.saveDocument('maia_users', designDoc);
    console.log('✅ Design document added to maia_users');
    
    // Step 3: Copy user data from maia2_users to maia_users
    console.log('📋 Step 3: Copying user data from maia2_users to maia_users...');
    try {
      const maia2Users = await couchDBClient.getAllDocuments('maia2_users');
      console.log(`📊 Found ${maia2Users.length} documents in maia2_users`);
      
      let copiedCount = 0;
      for (const user of maia2Users) {
        if (user._id.startsWith('_design/')) continue; // Skip design documents
        
        // Copy user document to maia_users
        const newUser = { ...user };
        delete newUser._rev; // Remove revision to create new document
        
        try {
          await couchDBClient.saveDocument('maia_users', newUser);
          console.log(`✅ Copied user: ${user._id}`);
          copiedCount++;
        } catch (error) {
          if (error.statusCode === 409) {
            console.log(`⚠️ User ${user._id} already exists in maia_users`);
          } else {
            console.error(`❌ Failed to copy user ${user._id}:`, error.message);
          }
        }
      }
      
      console.log(`✅ Copied ${copiedCount} users to maia_users`);
      
    } catch (error) {
      console.error('❌ Failed to copy users from maia2_users:', error.message);
    }
    
    // Step 4: Verify the migration
    console.log('📋 Step 4: Verifying migration...');
    try {
      const maiaUsers = await couchDBClient.getAllDocuments('maia_users');
      const userCount = maiaUsers.filter(doc => !doc._id.startsWith('_design/')).length;
      console.log(`✅ maia_users now has ${userCount} users and 1 design document`);
      
      // Show user details
      maiaUsers.forEach(doc => {
        if (!doc._id.startsWith('_design/')) {
          console.log(`  👤 ${doc._id}: ${doc.userId || doc.username || 'unknown'} (${doc.status || 'unknown'})`);
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to verify migration:', error.message);
    }
    
    console.log('🎉 Consolidation to maia_users completed!');
    
  } catch (error) {
    console.error('❌ Consolidation failed:', error.message);
  }
}

consolidateToMaiaDatabases().catch(console.error);
