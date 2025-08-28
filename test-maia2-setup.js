#!/usr/bin/env node

/**
 * Test script for MAIA2 system setup
 * Run with: node test-maia2-setup.js
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function testMaia2Setup() {
  console.log('🧪 Testing MAIA2 System Setup...\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health check...');
    const healthResponse = await fetch(`${BASE_URL}/api/maia2/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed:', healthData.message);
      console.log('   Status:', healthData.health.status);
    } else {
      console.log('❌ Health check failed:', healthData.message);
    }

    // Test 2: System status
    console.log('\n2️⃣ Testing system status...');
    const statusResponse = await fetch(`${BASE_URL}/api/maia2/status`);
    const statusData = await statusResponse.json();
    
    if (statusResponse.ok) {
      console.log('✅ System status retrieved');
      console.log('   Databases:', Object.keys(statusData.status).length);
      Object.entries(statusData.status).forEach(([dbName, status]) => {
        console.log(`   ${dbName}: ${status.status}`);
      });
    } else {
      console.log('❌ System status failed:', statusData.message);
    }

    // Test 3: Database setup
    console.log('\n3️⃣ Testing database setup...');
    const setupResponse = await fetch(`${BASE_URL}/api/maia2-setup/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const setupData = await setupResponse.json();
    
    if (setupResponse.ok) {
      console.log('✅ Database setup completed');
      console.log('   Databases created:', setupData.databases.length);
      setupData.databases.forEach(db => console.log(`   - ${db}`));
    } else {
      console.log('❌ Database setup failed:', setupData.message);
      if (setupData.error) {
        console.log('   Error:', setupData.error);
      }
    }

    // Test 4: Verify setup with status check
    console.log('\n4️⃣ Verifying setup with status check...');
    const verifyResponse = await fetch(`${BASE_URL}/api/maia2-setup/status`);
    const verifyData = await verifyResponse.json();
    
    if (verifyResponse.ok) {
      console.log('✅ Setup verification completed');
      Object.entries(verifyData.status).forEach(([dbName, status]) => {
        if (status.exists) {
          console.log(`   ${dbName}: ✅ Created (${status.docCount} docs, ${status.diskSize} bytes)`);
        } else {
          console.log(`   ${dbName}: ❌ Not created`);
        }
      });
    } else {
      console.log('❌ Setup verification failed:', verifyData.message);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('   Make sure the server is running on port 3001');
  }

  console.log('\n🏁 MAIA2 System Setup Test Complete');
}

// Run the test
testMaia2Setup();
