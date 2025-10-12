/**
 * One-time cleanup script for fri2 user document
 * Removes old files with wrong paths and keeps only the new archived/ file
 */

import { couchDBClient } from './src/utils/couchdb-client.js';

async function cleanupFri2Files() {
  try {
    console.log('🧹 Starting fri2 file cleanup...');
    
    // Get fri2 user document
    const userId = 'fri2';
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    
    if (!userDoc) {
      console.error('❌ User fri2 not found');
      return;
    }
    
    console.log(`📄 Current file count: ${userDoc.files?.length || 0}`);
    
    if (!userDoc.files || userDoc.files.length === 0) {
      console.log('✅ No files to clean up');
      return;
    }
    
    // Keep only files with correct archived/ path
    const correctFiles = userDoc.files.filter(file => {
      const hasArchivedPath = file.bucketPath?.includes('/archived/');
      console.log(`📁 File: ${file.fileName}`);
      console.log(`   Path: ${file.bucketPath}`);
      console.log(`   Keep: ${hasArchivedPath ? 'YES' : 'NO (wrong path)'}`);
      return hasArchivedPath;
    });
    
    console.log(`\n🔄 Files before cleanup: ${userDoc.files.length}`);
    console.log(`🔄 Files after cleanup: ${correctFiles.length}`);
    console.log(`🗑️  Files to remove: ${userDoc.files.length - correctFiles.length}`);
    
    // Update the user document
    userDoc.files = correctFiles;
    userDoc.updatedAt = new Date().toISOString();
    
    // Save to database
    const result = await couchDBClient.updateDocument('maia_users', userId, userDoc);
    
    if (result.ok) {
      console.log(`✅ Successfully cleaned up fri2 file list`);
      console.log(`✅ New revision: ${result.rev}`);
      console.log(`\n📋 Remaining files:`);
      correctFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.fileName}`);
        console.log(`      Path: ${file.bucketPath}`);
        console.log(`      Size: ${file.fileSize} bytes`);
        console.log(`      KBs: ${file.knowledgeBases?.length || 0}`);
      });
    } else {
      console.error('❌ Failed to update fri2 document');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

cleanupFri2Files();

