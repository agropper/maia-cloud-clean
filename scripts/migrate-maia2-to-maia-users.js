#!/usr/bin/env node

/**
 * Database Migration Script: Replace maia_users with maia2_users data
 * 
 * This script will:
 * 1. Backup the current maia_users database (70+ documents)
 * 2. Get all documents from maia2_users database (4 documents)
 * 3. Replace maia_users database contents with maia2_users data
 */

import { createCouchDBClient } from '../src/utils/couchdb-client.js';
import fs from 'fs';
import path from 'path';

const couchDBClient = createCouchDBClient();

async function migrateMaia2ToMaiaUsers() {
  try {
    console.log('🔄 Starting migration: maia2_users → maia_users');
    
    // Step 1: Backup current maia_users database
    console.log('📦 Step 1: Backing up current maia_users database...');
    const currentMaiaUsers = await couchDBClient.getAllDocuments('maia_users');
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backup-maia-users-${backupTimestamp}.json`;
    
    fs.writeFileSync(backupFile, JSON.stringify(currentMaiaUsers, null, 2));
    console.log(`✅ Backup saved to: ${backupFile}`);
    console.log(`📊 Current maia_users documents: ${currentMaiaUsers.length}`);
    
    // Step 2: Get all documents from maia2_users
    console.log('📥 Step 2: Getting documents from maia2_users...');
    const maia2Users = await couchDBClient.getAllDocuments('maia2_users');
    console.log(`📊 maia2_users documents: ${maia2Users.length}`);
    
    // Log what we're migrating
    console.log('📋 Documents to migrate:');
    maia2Users.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc._id} (${doc.isAdmin ? 'admin' : 'user'})`);
    });
    
    // Step 3: Clear maia_users database
    console.log('🗑️  Step 3: Clearing maia_users database...');
    for (const doc of currentMaiaUsers) {
      try {
        await couchDBClient.deleteDocument('maia_users', doc._id, doc._rev);
        console.log(`  ✅ Deleted: ${doc._id}`);
      } catch (error) {
        if (error.statusCode !== 404) {
          console.log(`  ⚠️  Error deleting ${doc._id}: ${error.message}`);
        }
      }
    }
    
    // Step 4: Copy documents from maia2_users to maia_users
    console.log('📤 Step 4: Copying documents to maia_users...');
    for (const doc of maia2Users) {
      try {
        // Remove _rev to create new document
        const { _rev, ...docWithoutRev } = doc;
        await couchDBClient.saveDocument('maia_users', docWithoutRev);
        console.log(`  ✅ Copied: ${doc._id}`);
      } catch (error) {
        console.log(`  ❌ Error copying ${doc._id}: ${error.message}`);
      }
    }
    
    // Step 5: Verify migration
    console.log('🔍 Step 5: Verifying migration...');
    const newMaiaUsers = await couchDBClient.getAllDocuments('maia_users');
    console.log(`📊 New maia_users documents: ${newMaiaUsers.length}`);
    
    console.log('✅ Migration completed successfully!');
    console.log(`📁 Backup file: ${backupFile}`);
    console.log(`📊 Final count: ${newMaiaUsers.length} documents in maia_users`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateMaia2ToMaiaUsers();
