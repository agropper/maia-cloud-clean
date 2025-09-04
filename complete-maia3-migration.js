#!/usr/bin/env node

import { CouchDBClient } from './src/utils/couchdb-client.js';

const couchDBClient = new CouchDBClient();

async function migrateKnowledgeBaseProtection() {
  console.log('🔄 Migrating KB protection data from maia_knowledge_bases to maia3_knowledge_bases...');
  
  try {
    // Get all KB protection documents from the old database
    const oldKBs = await couchDBClient.getAllDocuments('maia_knowledge_bases');
    console.log(`📊 Found ${oldKBs.length} documents in maia_knowledge_bases`);
    
    let migratedCount = 0;
    for (const kb of oldKBs) {
      if (kb._id.startsWith('_design/')) continue; // Skip design documents
      
      // Create new KB protection document for maia3_knowledge_bases
      const newKBDoc = {
        _id: kb._id,
        type: 'knowledge_base',
        kbName: kb.kbName,
        isProtected: kb.isProtected,
        owner: kb.owner,
        description: kb.description,
        created: kb.created,
        updated: kb.updated,
        region: kb.region,
        source: kb.source || 'digitalocean'
      };
      
      await couchDBClient.saveDocument('maia3_knowledge_bases', newKBDoc);
      console.log(`✅ Migrated KB protection: ${kb.kbName || kb._id}`);
      migratedCount++;
    }
    
    console.log(`✅ Migrated ${migratedCount} KB protection documents`);
  } catch (error) {
    console.error('❌ KB protection migration failed:', error.message);
  }
}

async function migrateUsers() {
  console.log('🔄 Migrating users from maia2_users to maia3_users...');
  
  try {
    // Get all users from maia2_users
    const maia2Users = await couchDBClient.getAllDocuments('maia2_users');
    console.log(`📊 Found ${maia2Users.length} documents in maia2_users`);
    
    let migratedCount = 0;
    for (const user of maia2Users) {
      if (user._id.startsWith('_design/')) continue; // Skip design documents
      
      // Create new user document for maia3_users
      const newUser = {
        _id: user._id,
        type: 'user',
        userId: user.userId,
        displayName: user.displayName,
        domain: user.domain,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        credentialID: user.credentialID,
        credentialPublicKey: user.credentialPublicKey,
        counter: user.counter,
        transports: user.transports,
        approvalStatus: user.approvalStatus,
        adminNotes: user.adminNotes,
        approvalDate: user.approvalDate,
        status: user.status,
        approvedAt: user.approvedAt,
        assignedAgentId: user.assignedAgentId,
        assignedAgentName: user.assignedAgentName,
        agentAssignedAt: user.agentAssignedAt
      };
      
      await couchDBClient.saveDocument('maia3_users', newUser);
      console.log(`✅ Migrated user: ${user.userId}`);
      migratedCount++;
    }
    
    console.log(`✅ Migrated ${migratedCount} users`);
  } catch (error) {
    console.error('❌ User migration failed:', error.message);
  }
}

async function migrateChats() {
  console.log('🔄 Migrating chats from maia_chats to maia3_chats...');
  
  try {
    // Get all chats from maia_chats
    const maiaChats = await couchDBClient.getAllDocuments('maia_chats');
    console.log(`📊 Found ${maiaChats.length} documents in maia_chats`);
    
    let migratedCount = 0;
    for (const chat of maiaChats) {
      if (chat._id.startsWith('_design/')) continue; // Skip design documents
      
      // Create new chat document for maia3_chats
      const newChat = {
        _id: chat._id,
        type: 'chat',
        userId: chat.userId,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        shareId: chat.shareId,
        isShared: chat.isShared,
        title: chat.title
      };
      
      await couchDBClient.saveDocument('maia3_chats', newChat);
      migratedCount++;
    }
    
    console.log(`✅ Migrated ${migratedCount} chats`);
  } catch (error) {
    console.error('❌ Chat migration failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting complete maia3 migration...');
  
  try {
    await migrateKnowledgeBaseProtection();
    await migrateUsers();
    await migrateChats();
    
    console.log('🎉 Complete migration finished!');
    
    // Verify the migration
    console.log('\n📊 Migration verification:');
    const kbCount = await couchDBClient.getAllDocuments('maia3_knowledge_bases');
    const userCount = await couchDBClient.getAllDocuments('maia3_users');
    const chatCount = await couchDBClient.getAllDocuments('maia3_chats');
    
    console.log(`- maia3_knowledge_bases: ${kbCount.length} documents`);
    console.log(`- maia3_users: ${userCount.length} documents`);
    console.log(`- maia3_chats: ${chatCount.length} documents`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
