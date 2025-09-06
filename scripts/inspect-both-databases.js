#!/usr/bin/env node

/**
 * Inspect Both Databases Script
 * 
 * This script will check what's in both maia_users and maia2_users
 * to understand the current state before migration.
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

async function inspectBothDatabases() {
  try {
    console.log('🔍 Inspecting both databases...\n');
    
    // Check maia2_users via admin API (this is what admin panel shows)
    console.log('📊 maia2_users (via admin API):');
    const adminResponse = await fetch(`${API_BASE_URL}/api/admin-management/users`);
    if (adminResponse.ok) {
      const adminData = await adminResponse.json();
      console.log(`  • Total users: ${adminData.users.length}`);
      
      // Show first 10 users
      console.log('  • First 10 users:');
      adminData.users.slice(0, 10).forEach((user, i) => {
        console.log(`    ${i + 1}. ${user.userId} (${user.workflowStage})`);
      });
      if (adminData.users.length > 10) {
        console.log(`    ... and ${adminData.users.length - 10} more`);
      }
    } else {
      console.log(`  ❌ Error: ${adminResponse.status} ${adminResponse.statusText}`);
    }
    
    // Check maia_users by trying to get current agent (this uses maia_users)
    console.log('\n📊 maia_users (via current-agent API):');
    const currentAgentResponse = await fetch(`${API_BASE_URL}/api/current-agent`);
    if (currentAgentResponse.ok) {
      const currentAgentData = await currentAgentResponse.json();
      console.log(`  • Unknown User agent: ${currentAgentData.agent ? 'configured' : 'not configured'}`);
      if (currentAgentData.agent) {
        console.log(`  • Agent name: ${currentAgentData.agent.name}`);
      }
    } else {
      console.log(`  ❌ Error: ${currentAgentResponse.status} ${currentAgentResponse.statusText}`);
    }
    
    console.log('\n🤔 Analysis:');
    console.log('  • The admin panel is reading from maia2_users (70+ users)');
    console.log('  • The main app is reading from maia_users (different database)');
    console.log('  • We need to migrate maia2_users → maia_users');
    console.log('  • Both should end up with the same 4 essential users');
    
  } catch (error) {
    console.error('❌ Inspection failed:', error.message);
  }
}

inspectBothDatabases();
