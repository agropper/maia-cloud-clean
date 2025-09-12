#!/usr/bin/env node

import { CouchDBClient } from './src/utils/couchdb-client.js';

async function migrateToPublicUser() {
  try {
    console.log('🔧 Starting migration to Public User...');
    
    const couchDBClient = new CouchDBClient();
    
    // Step 1: Create Public User document
    console.log('📝 Step 1: Creating Public User document...');
    const publicUserDoc = {
      _id: 'Public User',
      type: 'user',
      displayName: 'Public User',
      createdAt: new Date().toISOString(),
      isPublicUser: true,
      description: 'Shared demo environment for unauthenticated users',
      currentAgentId: null,
      currentAgentName: null
    };
    
    try {
      const existingDoc = await couchDBClient.getDocument('maia_users', 'Public User');
      console.log('✅ Public User document already exists:', existingDoc._id);
    } catch (error) {
      if (error.statusCode === 404) {
        console.log('📝 Creating Public User document...');
        const result = await couchDBClient.saveDocument('maia_users', publicUserDoc);
        console.log('✅ Public User document created:', result);
      } else {
        throw error;
      }
    }
    
    // Step 2: Update existing chats that reference "Unknown User" to "Public User"
    console.log('📝 Step 2: Updating chat references from Unknown User to Public User...');
    try {
      const allChats = await couchDBClient.getAllChats();
      let updatedCount = 0;
      
      for (const chat of allChats) {
        let needsUpdate = false;
        const updatedChat = { ...chat };
        
        // Update currentUser field
        if (chat.currentUser === 'Unknown User') {
          updatedChat.currentUser = 'Public User';
          needsUpdate = true;
        }
        
        // Update patientOwner field if it exists
        if (chat.patientOwner === 'Unknown User') {
          updatedChat.patientOwner = 'Public User';
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          await couchDBClient.saveDocument('maia_chats', updatedChat);
          updatedCount++;
          console.log(`✅ Updated chat ${chat._id}: Unknown User → Public User`);
        }
      }
      
      console.log(`✅ Updated ${updatedCount} chat documents`);
    } catch (error) {
      console.error('❌ Error updating chat documents:', error);
    }
    
    // Step 3: Check if "Unknown User" document exists and optionally remove it
    console.log('📝 Step 3: Checking for Unknown User document...');
    try {
      const unknownUserDoc = await couchDBClient.getDocument('maia_users', 'Unknown User');
      console.log('⚠️  Unknown User document still exists. You may want to delete it manually later.');
      console.log('   Document details:', {
        _id: unknownUserDoc._id,
        type: unknownUserDoc.type,
        hasAgent: !!unknownUserDoc.currentAgentId
      });
    } catch (error) {
      if (error.statusCode === 404) {
        console.log('✅ Unknown User document does not exist (already cleaned up)');
      } else {
        console.error('❌ Error checking Unknown User document:', error);
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    console.log('📋 Summary:');
    console.log('   - Public User document created/verified');
    console.log('   - Chat references updated from Unknown User to Public User');
    console.log('   - System ready for Public User terminology');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateToPublicUser();
