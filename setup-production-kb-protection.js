import dotenv from 'dotenv';
dotenv.config();

import { createCouchDBClient } from './src/utils/couchdb-client.js';

const couchDBClient = createCouchDBClient();

const setupProductionKBProtection = async () => {
  try {
    console.log('🔒 Setting up production KB protection...');
    
    // Test connection
    const connected = await couchDBClient.testConnection();
    if (!connected) {
      console.error('❌ Database connection failed');
      return;
    }
    
    // Initialize database
    await couchDBClient.initializeDatabase();
    
    // Protection records for production KBs
    const protectionRecords = [
      {
        _id: 'agropper-kb-05122025',
        kbName: 'agropper-kb-05122025',
        owner: 'agropper',
        isProtected: true,
        created_at: new Date().toISOString()
      },
      {
        _id: 'ag-medicare-kb-05122025',
        kbName: 'ag-medicare-kb-05122025',
        owner: 'agropper',
        isProtected: true,
        created_at: new Date().toISOString()
      },
      {
        _id: 'devon-viaapp-kb-06162025',
        kbName: 'devon-viaapp-kb-06162025',
        owner: 'devon',
        isProtected: true,
        created_at: new Date().toISOString()
      }
    ];
    
    // Insert protection records
    for (const record of protectionRecords) {
      try {
        await couchDBClient.saveDocument('maia_knowledge_bases', record);
        console.log(`✅ Created protection record for ${record.kbName} (owner: ${record.owner})`);
      } catch (error) {
        if (error.message.includes('Document update conflict')) {
          console.log(`⚠️ Protection record already exists for ${record.kbName}`);
        } else {
          console.error(`❌ Error creating protection record for ${record.kbName}:`, error);
        }
      }
    }
    
    console.log('✅ Production KB protection setup complete!');
    
  } catch (error) {
    console.error('❌ Error setting up production KB protection:', error);
  }
};

setupProductionKBProtection(); 