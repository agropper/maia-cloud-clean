/**
 * Repair Agent-User Relationships Script
 * 
 * This script repairs the agent-user relationships in the maia_users database
 * by matching agents from the DigitalOcean API with users based on the agent naming pattern.
 * 
 * Agent naming pattern: {userId}-agent-{date}
 * Example: sun105-agent-10062025 belongs to user sun105
 */

import dotenv from 'dotenv';
import { createCouchDBClient } from './src/utils/couchdb-client.js';
import { cacheManager } from './src/utils/CacheManager.js';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Initialize CouchDB client
const couchDBClient = createCouchDBClient(
  process.env.CLOUDANT_URL,
  process.env.CLOUDANT_USERNAME,
  process.env.CLOUDANT_PASSWORD
);

// DigitalOcean API configuration
const DIGITALOCEAN_API_KEY = process.env.DIGITALOCEAN_TOKEN;
const DIGITALOCEAN_BASE_URL = 'https://api.digitalocean.com';

/**
 * Make a request to the DigitalOcean API
 */
async function doRequest(path, options = {}) {
  if (!DIGITALOCEAN_API_KEY) {
    throw new Error('DigitalOcean API key not configured. Please set DIGITALOCEAN_TOKEN in .env file');
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
    throw new Error(`DO API request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Main repair function
 */
async function repairAgentUserRelationships() {
  console.log('🔧 Starting agent-user relationship repair...\n');

  try {
    // 1. Get all agents from DigitalOcean API
    console.log('📡 Fetching agents from DigitalOcean API...');
    const agentsResponse = await doRequest('/v2/gen-ai/agents?page=1&per_page=1000');
    const agentArray = agentsResponse.agents || [];
    console.log(`✅ Found ${agentArray.length} agents in DO API\n`);

    // 2. Get all users from maia_users database
    console.log('📂 Fetching users from maia_users database...');
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    console.log(`✅ Found ${allUsers.length} documents in maia_users\n`);

    // 3. Build a map of agents by their expected owner
    console.log('🔍 Analyzing agent naming patterns...');
    const agentsByOwner = new Map();
    const agentNamePattern = /^([a-z0-9]+)-agent-/;

    for (const agent of agentArray) {
      // Skip public agents
      if (agent.name.startsWith('public-')) {
        console.log(`   ⏭️  Skipping public agent: ${agent.name}`);
        continue;
      }

      // Extract user ID from agent name
      const match = agent.name.match(agentNamePattern);
      if (match) {
        const userId = match[1];
        agentsByOwner.set(userId, {
          id: agent.uuid,
          name: agent.name,
          status: agent.status || 'unknown'
        });
        console.log(`   ✓ Mapped agent ${agent.name} → user ${userId}`);
      } else {
        console.log(`   ⚠️  Could not parse agent name: ${agent.name}`);
      }
    }

    console.log(`\n✅ Mapped ${agentsByOwner.size} agents to users\n`);

    // 4. Update each user's document with their assigned agent
    console.log('💾 Updating user documents...\n');
    const updates = [];
    const skipped = [];
    const errors = [];

    for (const user of allUsers) {
      const userId = user._id || user.userId;

      // Skip system users
      if (userId === 'Public User' || userId === 'maia_config' || userId === 'Unknown User') {
        console.log(`   ⏭️  Skipping system user: ${userId}`);
        continue;
      }
      if (userId.startsWith('_design/')) {
        continue;
      }

      // Skip deep link users
      if (userId.startsWith('deep_link_')) {
        console.log(`   ⏭️  Skipping deep link user: ${userId}`);
        continue;
      }

      // Find matching agent for this user
      const assignedAgent = agentsByOwner.get(userId);

      if (assignedAgent) {
        try {
          // Check if user already has this agent assigned
          if (user.assignedAgentId === assignedAgent.id && user.assignedAgentName === assignedAgent.name) {
            console.log(`   ✓ User ${userId} already has correct agent: ${assignedAgent.name}`);
            skipped.push({ userId, reason: 'already_correct' });
            continue;
          }

          // Update user document with agent assignment
          const updatedUser = {
            ...user,
            assignedAgentId: assignedAgent.id,
            assignedAgentName: assignedAgent.name,
            agentAssignedAt: user.agentAssignedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          // Save updated user document
          await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);

          updates.push({
            userId: userId,
            agentId: assignedAgent.id,
            agentName: assignedAgent.name,
            status: assignedAgent.status
          });

          console.log(`   ✅ Updated user ${userId} with agent ${assignedAgent.name}`);
        } catch (error) {
          console.error(`   ❌ Failed to update user ${userId}: ${error.message}`);
          errors.push({ userId, error: error.message });
        }
      } else {
        console.log(`   ⚠️  No matching agent found for user: ${userId}`);
        skipped.push({ userId, reason: 'no_agent_found' });
      }
    }

    // 5. Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPAIR SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully updated: ${updates.length} users`);
    console.log(`⏭️  Skipped: ${skipped.length} users`);
    console.log(`❌ Errors: ${errors.length} users`);
    console.log('='.repeat(60));

    if (updates.length > 0) {
      console.log('\n✅ Updated users:');
      updates.forEach(u => {
        console.log(`   - ${u.userId} → ${u.agentName} (${u.status})`);
      });
    }

    if (skipped.length > 0) {
      console.log('\n⏭️  Skipped users:');
      skipped.forEach(s => {
        console.log(`   - ${s.userId} (${s.reason})`);
      });
    }

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(e => {
        console.log(`   - ${e.userId}: ${e.error}`);
      });
    }

    console.log('\n✅ Agent-user relationship repair completed!\n');
    return { updates, skipped, errors };

  } catch (error) {
    console.error('\n❌ Fatal error during repair:', error);
    throw error;
  }
}

// Run the repair script
console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  MAIA Cloud - Agent-User Relationship Repair Script       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

repairAgentUserRelationships()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

