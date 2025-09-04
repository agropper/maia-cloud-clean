import express from 'express';
import { CouchDBClient } from '../utils/couchdb-client.js';

const router = express.Router();

// Initialize CouchDB client
let couchDBClient;

// Initialize CouchDB connection
const initCouchDB = async () => {
  try {
    const serviceUrl = process.env.CLOUDANT_URL || process.env.COUCHDB_URL;
    if (!serviceUrl) {
      throw new Error('CLOUDANT_URL or COUCHDB_URL environment variable not set');
    }

    couchDBClient = new CouchDBClient();
    
    // Test connection by trying to get service info
    const serviceInfo = couchDBClient.getServiceInfo();
    console.log(`✅ Connected to ${serviceInfo.isCloudant ? 'Cloudant' : 'CouchDB'} for maia3 setup`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize CouchDB client:', error.message);
    return false;
  }
};

// Create maia3_users database and design documents
const setupMaia3Users = async () => {
  try {
    const dbName = 'maia3_users';
    
    // Create database if it doesn't exist
    try {
      await couchDBClient.createDatabase(dbName);
      console.log(`✅ Database '${dbName}' created`);
    } catch (error) {
      if (error.statusCode === 412) {
        console.log(`✅ Database '${dbName}' already exists`);
      } else {
        throw error;
      }
    }

    // Create design document for user queries
    const userDesignDoc = {
      _id: '_design/users',
      views: {
        by_username: {
          map: 'function(doc) { if (doc.type === "user") { emit(doc.username, doc); } }'
        },
        by_email: {
          map: 'function(doc) { if (doc.type === "user" && doc.email) { emit(doc.email, doc); } }'
        },
        by_status: {
          map: 'function(doc) { if (doc.type === "user") { emit(doc.status, doc); } }'
        },
        by_approval_status: {
          map: 'function(doc) { if (doc.type === "user") { emit(doc.approvalStatus, doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, userDesignDoc);
      console.log(`✅ Design document created for ${dbName}`);
    } catch (error) {
      if (error.statusCode === 409) {
        console.log(`✅ Design document already exists for ${dbName}`);
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed to setup maia3_users:`, error.message);
    return false;
  }
};

// Create maia3_knowledge_bases database and design documents
const setupMaia3KnowledgeBases = async () => {
  try {
    const dbName = 'maia3_knowledge_bases';
    
    // Create database if it doesn't exist
    try {
      await couchDBClient.createDatabase(dbName);
      console.log(`✅ Database '${dbName}' created`);
    } catch (error) {
      if (error.statusCode === 412) {
        console.log(`✅ Database '${dbName}' already exists`);
      } else {
        throw error;
      }
    }

    // Create design document for knowledge base queries
    const kbDesignDoc = {
      _id: '_design/knowledge_bases',
      views: {
        by_owner: {
          map: 'function(doc) { if (doc.type === "knowledge_base") { emit(doc.owner, doc); } }'
        },
        by_status: {
          map: 'function(doc) { if (doc.type === "knowledge_base") { emit(doc.status, doc); } }'
        },
        by_type: {
          map: 'function(doc) { if (doc.type === "knowledge_base") { emit(doc.kbType, doc); } }'
        },
        by_digitalocean_id: {
          map: 'function(doc) { if (doc.type === "knowledge_base" && doc.digitalOceanId) { emit(doc.digitalOceanId, doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, kbDesignDoc);
      console.log(`✅ Design document created for ${dbName}`);
    } catch (error) {
      if (error.statusCode === 409) {
        console.log(`✅ Design document already exists for ${dbName}`);
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed to setup maia3_knowledge_bases:`, error.message);
    return false;
  }
};

// Create maia3_chats database and design documents
const setupMaia3Chats = async () => {
  try {
    const dbName = 'maia3_chats';
    
    // Create database if it doesn't exist
    try {
      await couchDBClient.createDatabase(dbName);
      console.log(`✅ Database '${dbName}' created`);
    } catch (error) {
      if (error.statusCode === 412) {
        console.log(`✅ Database '${dbName}' already exists`);
      } else {
        throw error;
      }
    }

    // Create design document for chat queries
    const chatDesignDoc = {
      _id: '_design/chats',
      views: {
        by_user: {
          map: 'function(doc) { if (doc.type === "chat") { emit(doc.userId, doc); } }'
        },
        by_date: {
          map: 'function(doc) { if (doc.type === "chat") { emit(doc.createdAt, doc); } }'
        },
        by_share_id: {
          map: 'function(doc) { if (doc.type === "chat" && doc.shareId) { emit(doc.shareId, doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, chatDesignDoc);
      console.log(`✅ Design document created for ${dbName}`);
    } catch (error) {
      if (error.statusCode === 409) {
        console.log(`✅ Design document already exists for ${dbName}`);
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Failed to setup maia3_chats:`, error.message);
    return false;
  }
};

// Main setup function
const setupAllMaia3Databases = async () => {
  console.log('🚀 Starting maia3 database setup...');
  
  if (!await initCouchDB()) {
    return false;
  }

  const results = await Promise.all([
    setupMaia3Users(),
    setupMaia3KnowledgeBases(),
    setupMaia3Chats()
  ]);

  const successCount = results.filter(Boolean).length;
  const totalCount = results.length;

  if (successCount === totalCount) {
    console.log(`✅ All ${totalCount} maia3 databases setup successfully!`);
    return true;
  } else {
    console.log(`⚠️ ${successCount}/${totalCount} maia3 databases setup successfully`);
    return false;
  }
};

// API endpoint to trigger database setup
router.post('/setup', async (req, res) => {
  try {
    const success = await setupAllMaia3Databases();
    
    if (success) {
      res.json({
        success: true,
        message: 'All maia3 databases setup successfully',
        databases: [
          'maia3_users',
          'maia3_knowledge_bases',
          'maia3_chats'
        ]
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Some databases failed to setup'
      });
    }
  } catch (error) {
    console.error('❌ Database setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Database setup failed',
      error: error.message
    });
  }
});

// API endpoint to migrate data from old databases to maia3
router.post('/migrate', async (req, res) => {
  try {
    if (!couchDBClient) {
      await initCouchDB();
    }

    console.log('🚀 Starting maia3 data migration...');
    
    // Migrate KB protection data
    try {
      const oldKBs = await couchDBClient.getAllDocuments('maia_knowledge_bases');
      console.log(`📊 Found ${oldKBs.length} KB protection documents`);
      
      let kbCount = 0;
      for (const kb of oldKBs) {
        if (kb._id.startsWith('_design/')) continue;
        
        const newKBDoc = {
          _id: kb._id,
          type: 'knowledge_base',
          kbName: kb.kbName,
          isProtected: kb.isProtected,
          owner: kb.owner,
          description: kb.description,
          created: kb.created,
          updated: kb.updated,
          region: kb.region,
          source: kb.source || 'digitalocean'
        };
        
        await couchDBClient.saveDocument('maia3_knowledge_bases', newKBDoc);
        kbCount++;
      }
      console.log(`✅ Migrated ${kbCount} KB protection documents`);
    } catch (error) {
      console.error('❌ KB migration failed:', error.message);
    }

    // Migrate users
    try {
      const oldUsers = await couchDBClient.getAllDocuments('maia2_users');
      console.log(`📊 Found ${oldUsers.length} user documents`);
      
      let userCount = 0;
      for (const user of oldUsers) {
        if (user._id.startsWith('_design/')) continue;
        
        const newUser = {
          _id: user._id,
          type: 'user',
          userId: user.userId,
          displayName: user.displayName,
          domain: user.domain,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          credentialID: user.credentialID,
          credentialPublicKey: user.credentialPublicKey,
          counter: user.counter,
          transports: user.transports,
          approvalStatus: user.approvalStatus,
          adminNotes: user.adminNotes,
          approvalDate: user.approvalDate,
          status: user.status,
          approvedAt: user.approvedAt,
          assignedAgentId: user.assignedAgentId,
          assignedAgentName: user.assignedAgentName,
          agentAssignedAt: user.agentAssignedAt
        };
        
        await couchDBClient.saveDocument('maia3_users', newUser);
        userCount++;
      }
      console.log(`✅ Migrated ${userCount} users`);
    } catch (error) {
      console.error('❌ User migration failed:', error.message);
    }

    // Migrate chats
    try {
      const oldChats = await couchDBClient.getAllDocuments('maia_chats');
      console.log(`📊 Found ${oldChats.length} chat documents`);
      
      let chatCount = 0;
      for (const chat of oldChats) {
        if (chat._id.startsWith('_design/')) continue;
        
        const newChat = {
          _id: chat._id,
          type: 'chat',
          userId: chat.userId,
          messages: chat.messages,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          shareId: chat.shareId,
          isShared: chat.isShared,
          title: chat.title
        };
        
        await couchDBClient.saveDocument('maia3_chats', newChat);
        chatCount++;
      }
      console.log(`✅ Migrated ${chatCount} chats`);
    } catch (error) {
      console.error('❌ Chat migration failed:', error.message);
    }

    res.json({
      success: true,
      message: 'Data migration completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

// API endpoint to fix KB protection data
router.post('/fix-kb-protection', async (req, res) => {
  try {
    if (!couchDBClient) {
      await initCouchDB();
    }

    console.log('🔧 Fixing KB protection data...');
    
    // Delete the incorrect document (without kb_ prefix)
    try {
      await couchDBClient.deleteDocument('maia3_knowledge_bases', '38f89fef-88dc-11f0-b074-4e013e2ddde4');
      console.log('✅ Deleted incorrect KB document');
    } catch (error) {
      console.log('⚠️ Could not delete incorrect document:', error.message);
    }
    
    // Ensure the correct document exists
    const wed271KbId = 'kb_38f89fef-88dc-11f0-b074-4e013e2ddde4';
    const wed271KbDoc = {
      _id: wed271KbId,
      type: 'knowledge_base',
      kbName: 'wed271-uuid-test',
      isProtected: true,
      owner: 'wed271',
      description: 'wed271 test KB',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      source: 'digitalocean'
    };
    
    await couchDBClient.saveDocument('maia3_knowledge_bases', wed271KbDoc);
    console.log('✅ Fixed wed271-uuid-test KB protection');
    
    res.json({
      success: true,
      message: 'KB protection data fixed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ KB protection fix failed:', error);
    res.status(500).json({
      success: false,
      message: 'KB protection fix failed',
      error: error.message
    });
  }
});

// API endpoint to inspect maia3_knowledge_bases data
router.get('/inspect-kbs', async (req, res) => {
  try {
    if (!couchDBClient) {
      await initCouchDB();
    }

    const kbs = await couchDBClient.getAllDocuments('maia3_knowledge_bases');
    const kbData = kbs.filter(kb => !kb._id.startsWith('_design/')).map(kb => ({
      _id: kb._id,
      kbName: kb.kbName,
      owner: kb.owner,
      isProtected: kb.isProtected,
      type: kb.type
    }));

    res.json({
      success: true,
      count: kbData.length,
      data: kbData
    });
  } catch (error) {
    console.error('❌ KB inspection failed:', error);
    res.status(500).json({
      success: false,
      message: 'KB inspection failed',
      error: error.message
    });
  }
});

// API endpoint to consolidate to maia_ databases
router.post('/consolidate-to-maia', async (req, res) => {
  try {
    if (!couchDBClient) {
      await initCouchDB();
    }

    console.log('🚀 Starting consolidation to maia_ databases...');
    
    // Step 1: Create maia_users database if it doesn't exist
    console.log('📋 Step 1: Creating maia_users database...');
    try {
      await couchDBClient.createDatabase('maia_users');
      console.log('✅ Created maia_users database');
    } catch (error) {
      if (error.statusCode === 412) {
        console.log('✅ maia_users database already exists');
      } else {
        console.error('❌ Failed to create maia_users database:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to create maia_users database', error: error.message });
      }
    }
    
    // Step 2: Add design document to maia_users
    console.log('📋 Step 2: Adding design document to maia_users...');
    const designDoc = {
      _id: '_design/users',
      views: {
        by_username: {
          map: function(doc) { 
            if (doc.type === 'user') { 
              emit(doc.username, doc); 
            } 
          }.toString()
        },
        by_email: {
          map: function(doc) { 
            if (doc.type === 'user' && doc.email) { 
              emit(doc.email, doc); 
            } 
          }.toString()
        },
        by_status: {
          map: function(doc) { 
            if (doc.type === 'user') { 
              emit(doc.status, doc); 
            } 
          }.toString()
        },
        by_approval_status: {
          map: function(doc) { 
            if (doc.type === 'user') { 
              emit(doc.approvalStatus, doc); 
            } 
          }.toString()
        }
      }
    };
    
    try {
      // Try to get existing design document
      const existing = await couchDBClient.getDocument('maia_users', '_design/users');
      designDoc._rev = existing._rev;
      console.log('📝 Updating existing design document');
    } catch (error) {
      console.log('📝 Creating new design document');
    }
    
    await couchDBClient.saveDocument('maia_users', designDoc);
    console.log('✅ Design document added to maia_users');
    
    // Step 3: Copy user data from maia2_users to maia_users
    console.log('📋 Step 3: Copying user data from maia2_users to maia_users...');
    try {
      const maia2Users = await couchDBClient.getAllDocuments('maia2_users');
      console.log(`📊 Found ${maia2Users.length} documents in maia2_users`);
      
      let copiedCount = 0;
      for (const user of maia2Users) {
        if (user._id.startsWith('_design/')) continue; // Skip design documents
        
        // Copy user document to maia_users
        const newUser = { ...user };
        delete newUser._rev; // Remove revision to create new document
        
        try {
          await couchDBClient.saveDocument('maia_users', newUser);
          console.log(`✅ Copied user: ${user._id}`);
          copiedCount++;
        } catch (error) {
          if (error.statusCode === 409) {
            console.log(`⚠️ User ${user._id} already exists in maia_users`);
          } else {
            console.error(`❌ Failed to copy user ${user._id}:`, error.message);
          }
        }
      }
      
      console.log(`✅ Copied ${copiedCount} users to maia_users`);
      
    } catch (error) {
      console.error('❌ Failed to copy users from maia2_users:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to copy users from maia2_users', error: error.message });
    }
    
    // Step 4: Verify the migration
    console.log('📋 Step 4: Verifying migration...');
    try {
      const maiaUsers = await couchDBClient.getAllDocuments('maia_users');
      const userCount = maiaUsers.filter(doc => !doc._id.startsWith('_design/')).length;
      console.log(`✅ maia_users now has ${userCount} users and 1 design document`);
      
      res.json({
        success: true,
        message: 'Consolidation to maia_users completed successfully',
        details: {
          usersCopied: userCount,
          designDocumentAdded: true,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to verify migration:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to verify migration', error: error.message });
    }
    
  } catch (error) {
    console.error('❌ Consolidation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Consolidation failed',
      error: error.message
    });
  }
});

// API endpoint to check database status
router.get('/status', async (req, res) => {
  try {
    if (!couchDBClient) {
      await initCouchDB();
    }

    const databases = [
      'maia3_users',
      'maia3_knowledge_bases',
      'maia3_chats'
    ];

    const status = {};
    
    for (const dbName of databases) {
      try {
        // Try to get a document to check if database exists
        const result = await couchDBClient.getAllDocuments(dbName);
        status[dbName] = {
          exists: true,
          docCount: result.length,
          status: 'healthy'
        };
      } catch (error) {
        status[dbName] = {
          exists: false,
          status: 'unhealthy',
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
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Status check failed',
      error: error.message
    });
  }
});

export default router;
