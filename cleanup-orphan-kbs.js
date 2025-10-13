/**
 * One-time cleanup script to remove orphaned KB records from database
 * Deletes KBs that exist in local DB but not in DigitalOcean
 * 
 * RUN THIS WITH THE SERVER RUNNING (server.js must be active for DB access)
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

const DIGITALOCEAN_TOKEN = process.env.DIGITALOCEAN_TOKEN;
const DIGITALOCEAN_BASE_URL = 'https://api.digitalocean.com';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

if (!DIGITALOCEAN_TOKEN) {
  console.error('❌ DIGITALOCEAN_TOKEN not found in environment');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function doRequest(endpoint, options = {}) {
  const url = `${DIGITALOCEAN_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${DIGITALOCEAN_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`DigitalOcean API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function cleanupOrphanKBs() {
  try {
    console.log('🔍 Starting orphaned KB cleanup...\n');
    
    // 1. Get all KBs from DigitalOcean API (source of truth)
    console.log('📡 Fetching KBs from DigitalOcean API...');
    const doResponse = await doRequest('/v2/gen-ai/knowledge_bases?page=1&per_page=1000');
    const doKBs = doResponse.knowledge_bases || [];
    console.log(`✅ Found ${doKBs.length} KBs in DigitalOcean\n`);
    
    // Create set of DO KB IDs
    const doKBIds = new Set(doKBs.map(kb => kb.uuid));
    console.log('DigitalOcean KB IDs:');
    doKBs.forEach(kb => {
      console.log(`  - ${kb.uuid}: ${kb.name}`);
    });
    console.log('');
    
    // 2. Get all KBs from local database via server API
    console.log('💾 Fetching KBs from local database via server API...');
    const dbResponse = await fetch(`${SERVER_URL}/api/admin-management/knowledge-bases`);
    if (!dbResponse.ok) {
      throw new Error(`Server API error: ${dbResponse.status}. Is the server running?`);
    }
    const dbData = await dbResponse.json();
    const dbKBs = dbData.knowledgeBases || [];
    console.log(`✅ Found ${dbKBs.length} KBs in local database\n`);
    
    console.log('Database KB IDs:');
    dbKBs.forEach(kb => {
      console.log(`  - ${kb.id}: ${kb.name || 'NO NAME'} (owner: ${kb.owner || 'Unknown'})`);
    });
    console.log('');
    
    // 3. Find orphaned KBs (in DB but not in DO)
    const orphanedKBs = dbKBs.filter(kb => {
      return !doKBIds.has(kb.id);
    });
    
    if (orphanedKBs.length === 0) {
      console.log('✅ No orphaned KBs found - database is in sync with DigitalOcean\n');
      return;
    }
    
    console.log(`🗑️  Found ${orphanedKBs.length} orphaned KBs to delete:\n`);
    orphanedKBs.forEach(kb => {
      console.log(`  - ${kb.id}: ${kb.name || 'NO NAME'} (owner: ${kb.owner || 'Unknown'})`);
    });
    console.log('');
    
    // 4. Confirm deletion
    const answer = await question('⚠️  Delete these orphaned KBs from the database? (yes/no): ');
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Deletion cancelled');
      rl.close();
      return;
    }
    
    // 5. Delete orphaned KBs via server API
    console.log('\n🗑️  Deleting orphaned KBs from database...\n');
    let deletedCount = 0;
    
    for (const kb of orphanedKBs) {
      try {
        // Use server API to delete KB document
        const deleteResponse = await fetch(`${SERVER_URL}/api/admin-management/knowledge-bases/${kb.id}`, {
          method: 'DELETE'
        });
        
        if (deleteResponse.ok) {
          console.log(`✅ Deleted: ${kb.name} (${kb.id})`);
          deletedCount++;
        } else {
          const error = await deleteResponse.text();
          console.error(`❌ Failed to delete KB ${kb.id}: ${error}`);
        }
      } catch (error) {
        console.error(`❌ Failed to delete KB ${kb.id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Cleanup complete: Deleted ${deletedCount} of ${orphanedKBs.length} orphaned KBs`);
    console.log(`📊 Remaining KBs in database: ${dbKBs.length - deletedCount}`);
    rl.close();
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

cleanupOrphanKBs();

