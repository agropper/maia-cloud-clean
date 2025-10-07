/**
 * Generate API Key for Public Agent
 * 
 * This script generates an API key for the public agent and stores it in the Public User document
 */

import dotenv from 'dotenv';
import { createCouchDBClient } from './src/utils/couchdb-client.js';
import { cacheManager } from './src/utils/CacheManager.js';
import fetch from 'node-fetch';

dotenv.config();

const DIGITALOCEAN_API_KEY = process.env.DIGITALOCEAN_TOKEN;
const DIGITALOCEAN_BASE_URL = 'https://api.digitalocean.com';

const couchDBClient = createCouchDBClient(
  process.env.CLOUDANT_URL,
  process.env.CLOUDANT_USERNAME,
  process.env.CLOUDANT_PASSWORD
);

async function doRequest(path, options = {}) {
  if (!DIGITALOCEAN_API_KEY) {
    throw new Error('DigitalOcean API key not configured');
  }

  const url = `${DIGITALOCEAN_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${DIGITALOCEAN_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DO API request failed: ${response.status} ${response.statusText} - ${text}`);
  }

  return await response.json();
}

async function generatePublicAgentApiKey() {
  console.log('🔧 Generating API key for public agent...\n');

  try {
    const agentId = '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4';
    const agentName = 'public-agent-05102025';

    // 1. Get the Public User document
    console.log('📂 Fetching Public User document...');
    let userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'Public User');
    
    if (!userDoc) {
      console.log('⚠️  Public User document not found, creating new one...');
      userDoc = {
        _id: 'Public User',
        userId: 'Public User',
        type: 'public',
        createdAt: new Date().toISOString()
      };
    }

    console.log('✅ Found Public User document\n');

    // 2. Check if API key already exists
    if (userDoc.agentApiKey) {
      console.log('⚠️  Public User already has an API key stored');
      console.log(`   Current key: ${userDoc.agentApiKey.substring(0, 10)}...`);
      console.log('\n❓ Do you want to generate a new key? (This will replace the old one)');
      console.log('   To proceed, delete the existing agentApiKey field and run this script again.\n');
      return;
    }

    // 3. Generate API key for the agent
    console.log(`🔑 Generating API key for agent: ${agentName}`);
    
    const apiKeyResponse = await doRequest(`/v2/gen-ai/agents/${agentId}/api_keys`, {
      method: 'POST',
      body: JSON.stringify({
        name: `${agentName}-key-${Date.now()}`
      })
    });

    console.log('✅ API key generated successfully\n');

    // 4. Extract the API key from response
    const apiKeyData = apiKeyResponse.api_key_info || apiKeyResponse.api_key || apiKeyResponse.data?.api_key || apiKeyResponse;
    const agentApiKey = apiKeyData.secret_key || apiKeyData.key || apiKeyData.api_key;

    if (!agentApiKey) {
      console.error('❌ Failed to extract API key from response');
      console.error('Response:', JSON.stringify(apiKeyResponse, null, 2));
      throw new Error('Could not extract API key from DigitalOcean response');
    }

    console.log(`🔑 API Key: ${agentApiKey.substring(0, 10)}...${agentApiKey.substring(agentApiKey.length - 4)}`);

    // 5. Update Public User document with the API key
    userDoc.agentApiKey = agentApiKey;
    userDoc.assignedAgentId = agentId;
    userDoc.assignedAgentName = agentName;
    userDoc.agentAssignedAt = userDoc.agentAssignedAt || new Date().toISOString();
    userDoc.updatedAt = new Date().toISOString();

    // 6. Save to database
    console.log('\n💾 Saving API key to database...');
    await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
    console.log('✅ API key saved to Public User document\n');

    // 7. Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Agent ID: ${agentId}`);
    console.log(`Agent Name: ${agentName}`);
    console.log(`API Key: ${agentApiKey.substring(0, 10)}...${agentApiKey.substring(agentApiKey.length - 4)}`);
    console.log(`Stored in: maia_users / Public User / agentApiKey`);
    console.log('='.repeat(60));
    console.log('\n✅ Public agent API key generated and stored successfully!');
    console.log('🔄 Restart the server for changes to take effect.\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    throw error;
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  MAIA Cloud - Generate Public Agent API Key Script        ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

generatePublicAgentApiKey()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

