import express from 'express';

const router = express.Router();

// Get the CouchDB client from the main server
let couchDBClient = null;

// Function to set the client (called from main server)
export const setCouchDBClient = (client) => {
  couchDBClient = client;
};

// Get all KBs with protection status
router.get('/knowledge-bases', async (req, res) => {
  try {
    // Get all KBs from DigitalOcean API
    const doRequest = (endpoint, options = {}) => {
      const baseUrl = 'https://api.digitalocean.com';
      const url = `${baseUrl}${endpoint}`;
      
      const config = {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.DIGITALOCEAN_PERSONAL_API_KEY}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      };
      
      if (options.body) {
        config.body = JSON.stringify(options.body);
      }
      
      return fetch(url, config).then(res => res.json());
    };

    // Get all KBs from DigitalOcean
    const doKBs = await doRequest('/v2/gen-ai/knowledge_bases');
    const allDOKnowledgeBases = doKBs.knowledge_bases || [];
    
    // Fetch protection metadata from Cloudant
    const protectionDocs = await couchDBClient.getAllDocuments('maia_knowledge_bases');
    
    // Create a map of protected KBs
    const protectedKBs = new Map();
    protectionDocs.forEach(doc => {
      protectedKBs.set(doc.kbId || doc._id, {
        isProtected: !!doc.isProtected,
        owner: doc.owner || null
      });
    });
    
    // Transform all KBs to expected format
    const knowledgeBases = allDOKnowledgeBases.map(kb => {
      const protection = protectedKBs.get(kb.uuid);
      return {
        id: kb.uuid,
        name: kb.name,
        description: kb.description || 'No description',
        isProtected: protection ? protection.isProtected : false,
        owner: protection ? protection.owner : null,
        created: kb.created_at,
        updated: kb.updated_at,
        region: kb.region || 'tor1'
      };
    });
    
    res.json({ knowledge_bases: knowledgeBases });
  } catch (error) {
    console.error('❌ Error fetching KB protection data:', error);
    res.status(500).json({ error: 'Failed to fetch knowledge bases' });
  }
});

// Set KB protection
router.post('/protect-kb', async (req, res) => {
  try {
    const { kbId, kbName, owner, description } = req.body;
    
    if (!kbId || !kbName || !owner) {
      return res.status(400).json({ 
        error: 'kbId, kbName, and owner are required' 
      });
    }

    // Create or update protection document
    const protectionDoc = {
      _id: kbId, // Use kbId as the document ID
      kbId: kbId,
      kbName: kbName,
      description: description || 'Protected knowledge base',
      isProtected: true,
      owner: owner,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      region: 'tor1',
      source: 'digitalocean'
    };

    // Check if document already exists
    const existingDoc = await couchDBClient.getDocument('maia_knowledge_bases', kbId);
    
    if (existingDoc) {
      // Update existing document
      protectionDoc._rev = existingDoc._rev;
    }

    await couchDBClient.saveDocument('maia_knowledge_bases', protectionDoc);
    
    res.json({ 
      success: true, 
      message: `Knowledge base ${kbName} is now protected`,
      protection: protectionDoc
    });
  } catch (error) {
    console.error('❌ Error protecting KB:', error);
    res.status(500).json({ error: 'Failed to protect knowledge base' });
  }
});

// Remove KB protection
router.post('/unprotect-kb', async (req, res) => {
  try {
    const { kbId } = req.body;
    
    if (!kbId) {
      return res.status(400).json({ 
        error: 'kbId is required' 
      });
    }

    // Get existing document
    const existingDoc = await couchDBClient.getDocument('maia_knowledge_bases', kbId);
    
    if (!existingDoc) {
      return res.status(404).json({ 
        error: 'Knowledge base protection not found' 
      });
    }

    // Update to remove protection
    const updatedDoc = {
      ...existingDoc,
      isProtected: false,
      owner: null,
      updated: new Date().toISOString()
    };

    await couchDBClient.saveDocument('maia_knowledge_bases', updatedDoc);
    
    res.json({ 
      success: true, 
      message: `Knowledge base protection removed`,
      protection: updatedDoc
    });
  } catch (error) {
    console.error('❌ Error removing KB protection:', error);
    res.status(500).json({ error: 'Failed to remove knowledge base protection' });
  }
});

// Check KB access (simplified for now)
router.post('/check-kb-access', async (req, res) => {
  try {
    const { kbId, username } = req.body;
    
    if (!kbId || !username) {
      return res.status(400).json({ 
        error: 'kbId and username are required' 
      });
    }

    // Get protection status
    const protection = await couchDBClient.getDocument('maia_knowledge_bases', kbId);
    
    if (!protection) {
      return res.json({ canAccess: true, reason: 'KB not protected' });
    }

    if (!protection.isProtected) {
      return res.json({ canAccess: true, reason: 'KB not protected' });
    }

    if (protection.owner === username) {
      return res.json({ canAccess: true, reason: 'KB owner' });
    }

    return res.json({ canAccess: false, reason: 'Access denied' });
  } catch (error) {
    console.error('❌ Error checking KB access:', error);
    res.status(500).json({ error: 'Failed to check knowledge base access' });
  }
});

// Get user's protected KBs
router.get('/user-kbs/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    // Get all protection docs
    const protectionDocs = await couchDBClient.getAllDocuments('maia_knowledge_bases');
    
    // Filter for user's KBs
    const userKBs = protectionDocs
      .filter(doc => doc.owner === username && doc.isProtected)
      .map(doc => ({
        id: doc.kbId || doc._id,
        name: doc.kbName || doc.name,
        description: doc.description || 'No description',
        isProtected: !!doc.isProtected,
        owner: doc.owner,
        created: doc.created || doc.created_at,
        updated: doc.updated || doc.updated_at,
        region: doc.region || 'tor1'
      }));
    
    res.json({ knowledge_bases: userKBs });
  } catch (error) {
    console.error('❌ Error fetching user KBs:', error);
    res.status(500).json({ error: 'Failed to fetch user knowledge bases' });
  }
});

export default router; 