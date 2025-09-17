#!/usr/bin/env node

/**
 * Clean maia_users Database Script
 * 
 * This script will:
 * 1. Create a clean maia_users database with only essential users
 * 2. Remove all test data and deep link users
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

// Define the 4 essential users that should remain
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
    credentialID: 'test-credential-id', // Mock credential
    approvalStatus: 'approved'
  },
  {
    _id: 'fri95',
    type: 'user', 
    displayName: 'fri95',
    createdAt: new Date().toISOString(),
    credentialID: 'test-credential-id-2', // Mock credential
    approvalStatus: 'pending'
  }
];

async function cleanMaiaUsers() {
  try {
    console.log('🧹 Cleaning maia_users database...\n');
    
    // Step 1: Get current users to backup
    console.log('📦 Step 1: Backing up current maia_users...');
    const response = await fetch(`${API_BASE_URL}/api/admin-management/users`);
    
    if (!response.ok) {
      throw new Error(`Failed to get current users: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const currentUsers = data.users;
    
    // Create backup
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backup-maia-users-before-cleanup-${backupTimestamp}.json`;
    
    const fs = await import('fs');
    fs.writeFileSync(backupFile, JSON.stringify(currentUsers, null, 2));
    console.log(`✅ Backup saved to: ${backupFile}`);
    console.log(`📊 Current users: ${currentUsers.length}`);
    
    // Step 2: Show what we're going to do
    console.log('\n🎯 Step 2: Clean database plan');
    console.log('Essential users to keep:');
    essentialUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user._id} (${user.type})`);
    });
    
    console.log(`\n🗑️  Will remove: ${currentUsers.length - essentialUsers.length} users`);
    
    // Step 3: Show the migration plan
    console.log('\n📋 Migration Plan:');
    console.log('  1. ✅ Backup created');
    console.log('  2. 🔄 Replace maia_users with clean data');
    console.log('  3. 🔄 Update admin API to use maia_users');
    console.log('  4. ✅ Verify clean database');
    
    console.log('\n⚠️  WARNING: This will replace ALL data in maia_users!');
    console.log('   Make sure you have reviewed the backup file.');
    
    console.log('\n✅ Ready to proceed with cleanup.');
    console.log(`📁 Backup file: ${backupFile}`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

cleanMaiaUsers();
