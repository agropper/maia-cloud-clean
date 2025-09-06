#!/usr/bin/env node

/**
 * Direct Database Check Script
 * 
 * This script will directly check the maia2_users database
 * to see what documents are actually there.
 */

import { createCouchDBClient } from '../src/utils/couchdb-client.js';

const couchDBClient = createCouchDBClient();

async function checkMaia2Raw() {
  try {
    console.log('🔍 Directly checking maia2_users database...\n');
    
    // Get all documents from maia2_users
    const allDocs = await couchDBClient.getAllDocuments('maia2_users');
    console.log(`📊 Total documents in maia2_users: ${allDocs.length}`);
    
    // Show all documents
    console.log('\n📋 All documents in maia2_users:');
    allDocs.forEach((doc, index) => {
      const isAdmin = doc.isAdmin ? ' (admin)' : '';
      const hasPasskey = doc.credentialID ? ' (has passkey)' : ' (no passkey)';
      const isDeepLink = doc.isDeepLinkUser ? ' (deep link)' : '';
      console.log(`  ${index + 1}. ${doc._id}${isAdmin}${hasPasskey}${isDeepLink}`);
    });
    
    // Filter out deep link users and other non-essential users
    const essentialUsers = allDocs.filter(doc => {
      // Keep admin users
      if (doc.isAdmin) return true;
      
      // Keep users with passkeys (real users)
      if (doc.credentialID) return true;
      
      // Keep Unknown User
      if (doc._id === 'Unknown User') return true;
      
      return false;
    });
    
    console.log(`\n🎯 Essential users (${essentialUsers.length}):`);
    essentialUsers.forEach((doc, index) => {
      const isAdmin = doc.isAdmin ? ' (admin)' : '';
      const hasPasskey = doc.credentialID ? ' (has passkey)' : ' (no passkey)';
      console.log(`  ${index + 1}. ${doc._id}${isAdmin}${hasPasskey}`);
    });
    
    // Show what would be removed
    const toRemove = allDocs.filter(doc => !essentialUsers.includes(doc));
    console.log(`\n🗑️  Would remove (${toRemove.length}):`);
    toRemove.slice(0, 10).forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc._id}`);
    });
    if (toRemove.length > 10) {
      console.log(`  ... and ${toRemove.length - 10} more`);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkMaia2Raw();
