import express from 'express';
import { CouchDBClient } from '../utils/couchdb-client.js';

const router = express.Router();
const couchDBClient = new CouchDBClient();

// Helper function to wait for rate limits
const waitForRateLimit = (seconds = 60) => {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

// Migrate specific data with retry logic
router.post('/migrate-with-retry', async (req, res) => {
  try {
    console.log('🔄 Starting database migration with retry logic...');
    
    const migrationResults = {
      maia2_users: { migrated: 0, errors: [] },
      maia2_agents: { migrated: 0, errors: [] },
      maia2_knowledge_bases: { migrated: 0, errors: [] },
      maia2_admin_approvals: { migrated: 0, errors: [] },
      maia3_users: { migrated: 0, errors: [] },
      maia3_knowledge_bases: { migrated: 0, errors: [] },
      maia3_chats: { migrated: 0, errors: [] }
    };

    // Function to migrate documents with retry
    const migrateDocuments = async (sourceDb, targetDb, docType = 'document') => {
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`📋 Attempting to migrate ${sourceDb} to ${targetDb} (attempt ${retryCount + 1})`);
          const docs = await couchDBClient.getAllDocuments(sourceDb);
          const realDocs = docs.filter(doc => !doc._id.startsWith('_design/'));
          
          let migrated = 0;
          for (const doc of realDocs) {
            try {
              // Remove revision for new document
              const newDoc = { ...doc };
              delete newDoc._rev;
              
              // Special handling for different document types
              if (docType === 'user' && !newDoc.type) {
                newDoc.type = 'user';
              }
              
              await couchDBClient.saveDocument(targetDb, newDoc);
              migrated++;
              console.log(`✅ Migrated ${doc._id} from ${sourceDb} to ${targetDb}`);
            } catch (docError) {
              if (docError.statusCode === 409) {
                console.log(`⚠️ Document ${doc._id} already exists in ${targetDb}`);
                migrated++; // Count as migrated since it exists
              } else {
                console.error(`❌ Failed to migrate ${doc._id}:`, docError.message);
                migrationResults[sourceDb].errors.push(`${doc._id}: ${docError.message}`);
              }
            }
          }
          
          migrationResults[sourceDb].migrated = migrated;
          console.log(`✅ Successfully migrated ${migrated} documents from ${sourceDb}`);
          return;
          
        } catch (error) {
          if (error.message.includes('rate limit')) {
            retryCount++;
            console.log(`⏰ Rate limit hit for ${sourceDb}. Waiting 60 seconds... (attempt ${retryCount}/${maxRetries})`);
            if (retryCount < maxRetries) {
              await waitForRateLimit(60);
            }
          } else {
            throw error;
          }
        }
      }
      
      if (retryCount >= maxRetries) {
        migrationResults[sourceDb].errors.push('Max retries exceeded due to rate limits');
      }
    };

    // Migrate maia2_ databases to maia_
    console.log('📋 Phase 1: Migrating maia2_ databases...');
    
    try {
      await migrateDocuments('maia2_users', 'maia_users', 'user');
    } catch (error) {
      console.error('❌ maia2_users migration failed:', error.message);
      migrationResults.maia2_users.errors.push(error.message);
    }

    // Wait between migrations to avoid rate limits
    await waitForRateLimit(30);

    try {
      await migrateDocuments('maia2_knowledge_bases', 'maia_knowledge_bases', 'knowledge_base');
    } catch (error) {
      console.error('❌ maia2_knowledge_bases migration failed:', error.message);
      migrationResults.maia2_knowledge_bases.errors.push(error.message);
    }

    // Wait between migrations
    await waitForRateLimit(30);

    try {
      await migrateDocuments('maia2_admin_approvals', 'maia_chats', 'admin_approval');
    } catch (error) {
      console.error('❌ maia2_admin_approvals migration failed:', error.message);
      migrationResults.maia2_admin_approvals.errors.push(error.message);
    }

    // Migrate maia3_ databases to maia_
    console.log('📋 Phase 2: Migrating maia3_ databases...');
    
    await waitForRateLimit(30);
    
    try {
      await migrateDocuments('maia3_users', 'maia_users', 'user');
    } catch (error) {
      console.error('❌ maia3_users migration failed:', error.message);
      migrationResults.maia3_users.errors.push(error.message);
    }

    await waitForRateLimit(30);

    try {
      await migrateDocuments('maia3_knowledge_bases', 'maia_knowledge_bases', 'knowledge_base');
    } catch (error) {
      console.error('❌ maia3_knowledge_bases migration failed:', error.message);
      migrationResults.maia3_knowledge_bases.errors.push(error.message);
    }

    await waitForRateLimit(30);

    try {
      await migrateDocuments('maia3_chats', 'maia_chats', 'chat');
    } catch (error) {
      console.error('❌ maia3_chats migration failed:', error.message);
      migrationResults.maia3_chats.errors.push(error.message);
    }

    console.log('✅ Migration completed!');
    res.json({
      success: true,
      message: 'Database migration completed with retry logic',
      results: migrationResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

// Check migration status
router.get('/status', async (req, res) => {
  try {
    const status = {};
    
    const databases = [
      'maia_users',
      'maia_knowledge_bases', 
      'maia_chats',
      'maia2_users',
      'maia2_agents',
      'maia2_knowledge_bases',
      'maia2_admin_approvals',
      'maia3_users',
      'maia3_knowledge_bases',
      'maia3_chats'
    ];
    
    for (const dbName of databases) {
      try {
        const info = await couchDBClient.getDatabaseInfo(dbName);
        status[dbName] = {
          exists: true,
          docCount: info.doc_count,
          status: 'healthy'
        };
      } catch (error) {
        status[dbName] = {
          exists: false,
          status: 'not found or inaccessible',
          error: error.message
        };
      }
    }
    
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Status check failed',
      error: error.message
    });
  }
});

export default router;
