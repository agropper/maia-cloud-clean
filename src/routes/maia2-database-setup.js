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
    console.log(`✅ Connected to ${serviceInfo.isCloudant ? 'Cloudant' : 'CouchDB'} for maia2 setup`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize CouchDB client:', error.message);
    return false;
  }
};

// Create maia2_users database and design documents
const setupMaia2Users = async () => {
  try {
    const dbName = 'maia2_users';
    
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
    console.error(`❌ Failed to setup maia2_users:`, error.message);
    return false;
  }
};

// Create maia2_agents database and design documents
const setupMaia2Agents = async () => {
  try {
    const dbName = 'maia2_agents';
    
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

    // Create design document for agent queries
    const agentDesignDoc = {
      _id: '_design/agents',
      views: {
        by_owner: {
          map: 'function(doc) { if (doc.type === "agent") { emit(doc.owner, doc); } }'
        },
        by_status: {
          map: 'function(doc) { if (doc.type === "agent") { emit(doc.status, doc); } }'
        },
        by_type: {
          map: 'function(doc) { if (doc.type === "agent") { emit(doc.agentType, doc); } }'
        },
        by_digitalocean_id: {
          map: 'function(doc) { if (doc.type === "agent" && doc.digitalOceanId) { emit(doc.digitalOceanId, doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, agentDesignDoc);
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
    console.error(`❌ Failed to setup maia2_agents:`, error.message);
    return false;
  }
};

// Create maia2_knowledge_bases database and design documents
const setupMaia2KnowledgeBases = async () => {
  try {
    const dbName = 'maia2_knowledge_bases';
    
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
    console.error(`❌ Failed to setup maia2_knowledge_bases:`, error.message);
    return false;
  }
};

// Create maia2_user_resources database and design documents
const setupMaia2UserResources = async () => {
  try {
    const dbName = 'maia2_user_resources';
    
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

    // Create design document for user resource queries
    const resourceDesignDoc = {
      _id: '_design/user_resources',
      views: {
        by_user: {
          map: 'function(doc) { if (doc.type === "user_resource") { emit(doc.userId, doc); } }'
        },
        by_resource_type: {
          map: 'function(doc) { if (doc.type === "user_resource") { emit(doc.resourceType, doc); } }'
        },
        by_status: {
          map: 'function(doc) { if (doc.type === "user_resource") { emit(doc.status, doc); } }'
        },
        by_approval_status: {
          map: 'function(doc) { if (doc.type === "user_resource") { emit(doc.approvalStatus, doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, resourceDesignDoc);
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
    console.error(`❌ Failed to setup maia2_user_resources:`, error.message);
    return false;
  }
};

// Create maia2_admin_approvals database and design documents
const setupMaia2AdminApprovals = async () => {
  try {
    const dbName = 'maia2_admin_approvals';
    
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

    // Create design document for admin approval queries
    const approvalDesignDoc = {
      _id: '_design/admin_approvals',
      views: {
        by_user: {
          map: 'function(doc) { if (doc.type === "admin_approval") { emit(doc.userId, doc); } }'
        },
        by_status: {
          map: 'function(doc) { if (doc.type === "admin_approval") { emit(doc.status, doc); } }'
        },
        by_type: {
          map: 'function(doc) { if (doc.type === "admin_approval") { emit(doc.approvalType, doc); } }'
        },
        by_date: {
          map: 'function(doc) { if (doc.type === "admin_approval") { emit(doc.createdAt, doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, approvalDesignDoc);
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
    console.error(`❌ Failed to setup maia2_admin_approvals:`, error.message);
    return false;
  }
};

// Create maia2_audit_logs database and design documents
const setupMaia2AuditLogs = async () => {
  try {
    const dbName = 'maia2_audit_logs';
    
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

    // Create design document for audit log queries
    const auditDesignDoc = {
      _id: '_design/audit_logs',
      views: {
        by_user: {
          map: 'function(doc) { if (doc.type === "audit_log") { emit(doc.userId, doc); } }'
        },
        by_action: {
          map: 'function(doc) { if (doc.type === "audit_log") { emit(doc.action, doc); } }'
        },
        by_resource: {
          map: 'function(doc) { if (doc.type === "audit_log") { emit(doc.resourceType, doc); } }'
        },
        by_date: {
          map: 'function(doc) { if (doc.type === "audit_log") { emit(doc.timestamp, doc); } }'
        },
        by_date_range: {
          map: 'function(doc) { if (doc.type === "audit_log") { emit([doc.timestamp, doc.userId], doc); } }'
        }
      }
    };

    try {
      await couchDBClient.saveDocument(dbName, auditDesignDoc);
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
    console.error(`❌ Failed to setup maia2_audit_logs:`, error.message);
    return false;
  }
};

// Main setup function
const setupAllMaia2Databases = async () => {
  console.log('🚀 Starting maia2 database setup...');
  
  if (!await initCouchDB()) {
    return false;
  }

  const results = await Promise.all([
    setupMaia2Users(),
    setupMaia2Agents(),
    setupMaia2KnowledgeBases(),
    setupMaia2UserResources(),
    setupMaia2AdminApprovals(),
    setupMaia2AuditLogs()
  ]);

  const successCount = results.filter(Boolean).length;
  const totalCount = results.length;

  if (successCount === totalCount) {
    console.log(`✅ All ${totalCount} maia2 databases setup successfully!`);
    return true;
  } else {
    console.log(`⚠️ ${successCount}/${totalCount} maia2 databases setup successfully`);
    return false;
  }
};

// API endpoint to trigger database setup
router.post('/setup', async (req, res) => {
  try {
    const success = await setupAllMaia2Databases();
    
    if (success) {
      res.json({
        success: true,
        message: 'All maia2 databases setup successfully',
        databases: [
          'maia2_users',
          'maia2_agents', 
          'maia2_knowledge_bases',
          'maia2_user_resources',
          'maia2_admin_approvals',
          'maia2_audit_logs'
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

// API endpoint to check database status
router.get('/status', async (req, res) => {
  try {
    if (!couchDBClient) {
      await initCouchDB();
    }

    const databases = [
      'maia2_users',
      'maia2_agents',
      'maia2_knowledge_bases', 
      'maia2_user_resources',
      'maia2_admin_approvals',
      'maia2_audit_logs'
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
