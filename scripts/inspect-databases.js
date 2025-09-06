#!/usr/bin/env node

/**
 * Database Inspection Script
 * 
 * This script will inspect both maia_users and maia2_users databases
 * to understand what data is in each one.
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

async function inspectDatabases() {
  try {
    console.log('🔍 Inspecting databases...\n');
    
    // Check maia2_users via admin API
    console.log('📊 maia2_users (via admin API):');
    const adminResponse = await fetch(`${API_BASE_URL}/api/admin-management/users`);
    if (adminResponse.ok) {
      const adminData = await adminResponse.json();
      console.log(`  • Total users: ${adminData.users.length}`);
      
      // Group by workflow stage
      const byStage = adminData.users.reduce((acc, user) => {
        acc[user.workflowStage] = (acc[user.workflowStage] || 0) + 1;
        return acc;
      }, {});
      
      console.log('  • By workflow stage:');
      Object.entries(byStage).forEach(([stage, count]) => {
        console.log(`    - ${stage}: ${count}`);
      });
      
      // Show sample users
      console.log('  • Sample users:');
      adminData.users.slice(0, 5).forEach((user, i) => {
        console.log(`    ${i + 1}. ${user.userId} (${user.workflowStage})`);
      });
    } else {
      console.log(`  ❌ Error: ${adminResponse.status} ${adminResponse.statusText}`);
    }
    
    console.log('\n📊 maia_users (via current-agent API):');
    
    // Try to get current agent info for Unknown User (this uses maia_users)
    const unknownUserResponse = await fetch(`${API_BASE_URL}/api/current-agent`);
    if (unknownUserResponse.ok) {
      const unknownUserData = await unknownUserResponse.json();
      console.log(`  • Unknown User agent: ${unknownUserData.agent ? 'configured' : 'not configured'}`);
    } else {
      console.log(`  ❌ Error: ${unknownUserResponse.status} ${unknownUserResponse.statusText}`);
    }
    
    // Try to get current agent info for a known user
    const testUserResponse = await fetch(`${API_BASE_URL}/api/current-agent`, {
      headers: {
        'Cookie': 'connect.sid=test' // This might not work without proper session
      }
    });
    
    console.log('\n🤔 Analysis:');
    console.log('  • maia2_users appears to be the "dirty" database with 70+ test users');
    console.log('  • maia_users is likely the "clean" database with fewer users');
    console.log('  • We need to determine which database should be the source of truth');
    
  } catch (error) {
    console.error('❌ Inspection failed:', error.message);
  }
}

inspectDatabases();
