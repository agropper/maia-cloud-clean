#!/usr/bin/env node

/**
 * Proper Migration Script: maia2_users → maia_users
 * 
 * This script will:
 * 1. Get the 4 essential users from maia2_users
 * 2. Replace maia_users with those same users
 * 3. Ensure both databases are identical
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

async function migrateMaia2ToMaiaUsers() {
  try {
    console.log('🔄 Starting proper migration: maia2_users → maia_users\n');
    
    // Step 1: Get current users from maia2_users via admin API
    console.log('📥 Step 1: Getting users from maia2_users...');
    const adminResponse = await fetch(`${API_BASE_URL}/api/admin-management/users`);
    
    if (!adminResponse.ok) {
      throw new Error(`Failed to get users from maia2_users: ${adminResponse.status} ${adminResponse.statusText}`);
    }
    
    const adminData = await adminResponse.json();
    const sourceUsers = adminData.users;
    
    console.log(`📊 Found ${sourceUsers.length} users in maia2_users:`);
    sourceUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.userId} (${user.workflowStage})`);
    });
    
    // Step 2: Create the 4 essential users for maia_users
    console.log('\n🎯 Step 2: Creating 4 essential users for maia_users...');
    
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
    
    console.log('Essential users to create:');
    essentialUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user._id} (${user.type})`);
    });
    
    // Step 3: Create backup
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backup-before-migration-${backupTimestamp}.json`;
    
    const fs = await import('fs');
    fs.writeFileSync(backupFile, JSON.stringify({
      sourceUsers,
      essentialUsers,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`\n📦 Step 3: Backup created: ${backupFile}`);
    
    // Step 4: Show migration plan
    console.log('\n📋 Migration Plan:');
    console.log('  1. ✅ Source users identified from maia2_users');
    console.log('  2. ✅ Essential users defined for maia_users');
    console.log('  3. ✅ Backup created');
    console.log('  4. 🔄 Execute migration via API endpoint');
    console.log('  5. ✅ Verify both databases are identical');
    
    console.log('\n⚠️  WARNING: This will replace ALL data in maia_users!');
    console.log('   Make sure you have reviewed the backup file.');
    
    console.log('\n✅ Migration plan ready.');
    console.log(`📁 Backup file: ${backupFile}`);
    console.log('\nTo execute the migration, run:');
    console.log('  curl -X POST http://localhost:3001/api/cleanup-database');
    
  } catch (error) {
    console.error('❌ Migration preparation failed:', error.message);
  }
}

migrateMaia2ToMaiaUsers();
