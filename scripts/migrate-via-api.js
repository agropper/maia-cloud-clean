#!/usr/bin/env node

/**
 * Database Migration Script: Replace maia_users with maia2_users data via API
 * 
 * This script will:
 * 1. Get all users from maia2_users via admin API
 * 2. Create a backup of the current state
 * 3. Use the server's database connection to perform the migration
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

async function migrateViaAPI() {
  try {
    console.log('🔄 Starting migration: maia2_users → maia_users via API');
    
    // Step 1: Get current users from admin API (maia2_users)
    console.log('📥 Step 1: Getting users from maia2_users via admin API...');
    const response = await fetch(`${API_BASE_URL}/api/admin-management/users`);
    
    if (!response.ok) {
      throw new Error(`Failed to get users: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const users = data.users;
    
    console.log(`📊 Found ${users.length} users in maia2_users:`);
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.userId} (${user.workflowStage})`);
    });
    
    // Step 2: Create backup
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backup-maia2-users-${backupTimestamp}.json`;
    
    const fs = await import('fs');
    fs.writeFileSync(backupFile, JSON.stringify(users, null, 2));
    console.log(`✅ Backup saved to: ${backupFile}`);
    
    // Step 3: Show what we would migrate
    console.log('📋 Migration Summary:');
    console.log(`  • Source: maia2_users (${users.length} documents)`);
    console.log(`  • Target: maia_users (will replace all existing documents)`);
    console.log(`  • Backup: ${backupFile}`);
    
    console.log('\n⚠️  WARNING: This will replace ALL documents in maia_users!');
    console.log('   The current maia_users database will be completely replaced.');
    console.log('   Make sure you have a backup if needed.');
    
    // For now, just show what we would do
    console.log('\n✅ Migration plan ready. To execute:');
    console.log('   1. Review the backup file to ensure it contains the expected users');
    console.log('   2. Run the actual migration script when ready');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
migrateViaAPI();
