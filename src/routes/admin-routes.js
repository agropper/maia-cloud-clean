import express from 'express';

const router = express.Router();

// Get the CouchDB client from the main server
let couchDBClient = null;

// Function to set the client (called from main server)
export const setCouchDBClient = (client) => {
  couchDBClient = client;
};

/**
 * Verify admin password for ownership transfer operations
 */
const verifyAdminPassword = (req, res, next) => {
  const { adminPassword } = req.body;
  
  if (!adminPassword) {
    return res.status(400).json({ 
      error: 'Admin password required',
      requiresAdminAuth: true
    });
  }
  
  const expectedPassword = process.env.ADMIN_PASSWORD;
  
  if (!expectedPassword) {
    console.error('❌ ADMIN_PASSWORD environment variable not set');
    return res.status(500).json({ 
      error: 'Admin authentication not configured',
      requiresAdminAuth: true
    });
  }
  
  if (adminPassword !== expectedPassword) {
    console.log('🚨 Invalid admin password attempt');
    return res.status(403).json({ 
      error: 'Invalid admin password',
      requiresAdminAuth: true
    });
  }
  
  console.log('✅ Admin password verified successfully');
  next();
};

/**
 * Transfer KB ownership to a new user
 */
router.post('/transfer-kb-ownership', verifyAdminPassword, async (req, res) => {
  try {
    const { kbId, newOwner, displayName } = req.body;
    
    if (!kbId || !newOwner || !displayName) {
      return res.status(400).json({ 
        error: 'kbId, newOwner, and displayName are required' 
      });
    }
    
    console.log(`🔄 [ADMIN] Transferring KB ${kbId} ownership to ${newOwner}`);
    
    // Get the current KB document
    let kbDoc;
    try {
      kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Knowledge base not found' });
      }
      throw error;
    }
    
    if (!kbDoc) {
      return res.status(404).json({ error: 'Knowledge base not found' });
    }
    
    // Record the transfer details
    const transferRecord = {
      _id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      kbId: kbId,
      kbName: kbDoc.kbName || kbDoc.name,
      previousOwner: kbDoc.owner || 'unknown',
      newOwner: newOwner,
      displayName: displayName,
      transferredBy: 'admin',
      transferredAt: new Date().toISOString(),
      adminPasswordUsed: true
    };
    
    // Update the KB document with new ownership
    const updatedKbDoc = {
      ...kbDoc,
      owner: newOwner,
      displayName: displayName,
      isProtected: true,
      updatedAt: new Date().toISOString(),
      lastTransfer: {
        from: kbDoc.owner || 'unknown',
        to: newOwner,
        at: new Date().toISOString(),
        by: 'admin'
      }
    };
    
    // Save both documents
    await couchDBClient.saveDocument("maia_knowledge_bases", updatedKbDoc);
    await couchDBClient.saveDocument("maia_kb_transfers", transferRecord);
    
    console.log(`✅ [ADMIN] KB ${kbId} ownership transferred from ${kbDoc.owner || 'unknown'} to ${newOwner}`);
    
    res.json({
      success: true,
      message: `Knowledge base ownership transferred to ${newOwner}`,
      transfer: {
        kbId: kbId,
        kbName: kbDoc.kbName || kbDoc.name,
        previousOwner: kbDoc.owner || 'unknown',
        newOwner: newOwner,
        displayName: displayName,
        transferredAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error transferring KB ownership:', error);
    res.status(500).json({ error: 'Failed to transfer knowledge base ownership' });
  }
});

/**
 * Get transfer history for audit purposes
 */
router.get('/transfer-history', verifyAdminPassword, async (req, res) => {
  try {
    const transfers = await couchDBClient.getAllDocuments('maia_kb_transfers');
    
    res.json({
      success: true,
      transfers: transfers.map(transfer => ({
        id: transfer._id,
        kbId: transfer.kbId,
        kbName: transfer.kbName,
        previousOwner: transfer.previousOwner,
        newOwner: transfer.newOwner,
        displayName: transfer.displayName,
        transferredAt: transfer.transferredAt,
        transferredBy: transfer.transferredBy
      }))
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error fetching transfer history:', error);
    res.status(500).json({ error: 'Failed to fetch transfer history' });
  }
});

/**
 * Verify admin password without performing any action
 */
router.post('/verify-admin', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    if (!adminPassword) {
      return res.status(400).json({ 
        error: 'Admin password required',
        requiresAdminAuth: true
      });
    }
    
    const expectedPassword = process.env.ADMIN_PASSWORD;
    
    if (!expectedPassword) {
      return res.status(500).json({ 
        error: 'Admin authentication not configured',
        requiresAdminAuth: true
      });
    }
    
    if (adminPassword !== expectedPassword) {
      return res.status(403).json({ 
        error: 'Invalid admin password',
        requiresAdminAuth: true
      });
    }
    
    res.json({
      success: true,
      message: 'Admin password verified successfully'
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error verifying admin password:', error);
    res.status(500).json({ error: 'Failed to verify admin password' });
  }
});

export default router;
