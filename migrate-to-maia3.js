#!/usr/bin/env node

import { CouchDBClient } from './src/utils/couchdb-client.js';

const couchDBClient = new CouchDBClient();

async function migrateUsers() {
  console.log('🔄 Migrating users from maia2_users to maia3_users...');
  
  try {
    // Get all users from maia2_users
    const maia2Users = await couchDBClient.getAllDocuments('maia2_users');
    console.log(`📊 Found ${maia2Users.length} users in maia2_users`);
    
    for (const user of maia2Users) {
      if (user._id.startsWith('_design/')) continue; // Skip design documents
      
      // Create new document for maia3_users
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
    }
    
    console.log('✅ User migration completed');
  } catch (error) {
    console.error('❌ User migration failed:', error.message);
  }
}

async function migrateKnowledgeBases() {
  console.log('🔄 Migrating knowledge bases from maia_knowledge_bases to maia3_knowledge_bases...');
  
  try {
    // Get all KBs from maia_knowledge_bases
    const maiaKBs = await couchDBClient.getAllDocuments('maia_knowledge_bases');
    console.log(`📊 Found ${maiaKBs.length} knowledge bases in maia_knowledge_bases`);
    
    for (const kb of maiaKBs) {
      if (kb._id.startsWith('_design/')) continue; // Skip design documents
      
      // Create new document for maia3_knowledge_bases
      const newKB = {
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
      
      await couchDBClient.saveDocument('maia3_knowledge_bases', newKB);
      console.log(`✅ Migrated KB: ${kb.kbName || kb._id}`);
    }
    
    console.log('✅ Knowledge base migration completed');
  } catch (error) {
    console.error('❌ Knowledge base migration failed:', error.message);
  }
}

async function migrateChats() {
  console.log('🔄 Migrating chats from maia_chats to maia3_chats...');
  
  try {
    // Get all chats from maia_chats
    const maiaChats = await couchDBClient.getAllDocuments('maia_chats');
    console.log(`📊 Found ${maiaChats.length} documents in maia_chats`);
    
    let chatCount = 0;
    for (const chat of maiaChats) {
      if (chat._id.startsWith('_design/')) continue; // Skip design documents
      
      // Create new document for maia3_chats
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
      chatCount++;
    }
    
    console.log(`✅ Migrated ${chatCount} chats`);
    console.log('✅ Chat migration completed');
  } catch (error) {
    console.error('❌ Chat migration failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting migration to maia3 databases...');
  
  try {
    await migrateUsers();
    await migrateKnowledgeBases();
    await migrateChats();
    
    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
