#!/usr/bin/env node

import { CouchDBClient } from './src/utils/couchdb-client.js';

async function createPublicUser() {
  try {
    console.log('🔧 Creating Public User document...');
    
    const couchDBClient = new CouchDBClient();
    
    // Create the Public User document
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
    
    // Try to get existing document first
    try {
      const existingDoc = await couchDBClient.getDocument('maia_users', 'Public User');
      console.log('✅ Public User document already exists:', existingDoc._id);
      return;
    } catch (error) {
      if (error.statusCode === 404) {
        console.log('📝 Public User document does not exist, creating...');
      } else {
        throw error;
      }
    }
    
    // Create the document
    const result = await couchDBClient.saveDocument('maia_users', publicUserDoc);
    console.log('✅ Public User document created successfully:', result);
    
  } catch (error) {
    console.error('❌ Error creating Public User document:', error);
    process.exit(1);
  }
}

createPublicUser();
