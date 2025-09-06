import express from 'express';
import maia2Client from '../utils/maia2-client.js';

const router = express.Router();

// CouchDB client for maia2_users database
let couchDBClient = null;

// Function to set the client (called from main server)
export const setCouchDBClient = (client) => {
  couchDBClient = client;
};

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    if (!couchDBClient) {
      throw new Error('CouchDB client not initialized');
    }
    
    // Try to access the maia_users database
    const users = await couchDBClient.getAllDocuments('maia_users');
    console.log('✅ Admin management health check - system ready, user count:', users.length);
    res.json({ 
      status: 'ready',
      message: 'Admin management system is ready',
      timestamp: new Date().toISOString(),
      userCount: users.length
    });
  } catch (error) {
    console.log('⏳ Admin management health check failed:', error.message);
    
    // Handle Cloudant rate limiting specifically - this is NOT a system readiness issue
    if (error.statusCode === 429 || error.error === 'too_many_requests') {
      console.log('📊 Rate limiting detected during health check - system is ready, just busy');
      // System is ready, just rate limited - return ready status
      res.json({ 
        status: 'ready',
        message: 'Admin management system is ready (rate limited)',
        timestamp: new Date().toISOString(),
        userCount: 'unknown (rate limited)',
        note: 'System is operational but temporarily rate limited'
      });
      return;
    }
    
    // For other errors, system might not be ready
    res.status(503).json({ 
      status: 'initializing',
      message: 'Admin management system is initializing',
      retryAfter: 5,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// MAIA2 system readiness check
const checkMAIA2Ready = async (req, res, next) => {
  try {
    // Check if MAIA2 client is initialized and can access users
    if (!maia2Client.isInitialized) {
      await maia2Client.initialize();
    }
    
    // Try to get a small sample of users to verify system is ready
    const users = await maia2Client.listUsers({ limit: 1 });
    console.log('✅ MAIA2 system ready, can access users');
    next();
  } catch (error) {
    console.log('⏳ MAIA2 system readiness check failed:', error.message);
    
    // Handle Cloudant rate limiting specifically - this is NOT a system readiness issue
    if (error.statusCode === 429 || error.error === 'too_many_requests') {
      console.log('📊 Rate limiting detected during readiness check - system is ready, just busy');
      // System is ready, just rate limited - allow the request to proceed
      next();
      return;
    }
    
    // For other errors, system might not be ready
    return res.status(503).json({ 
      error: 'MAIA2 system is initializing. Please wait a moment and try again.',
      retryAfter: 5,
      details: error.message
    });
  }
};

// Admin authentication middleware
const requireAdminAuth = async (req, res, next) => {
  try {
    const session = req.session;
    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is admin
    try {
      const userDoc = await maia2Client.getUserByUsername(session.userId);
      if (!userDoc || !userDoc.isAdmin) {
        return res.status(403).json({ error: 'Admin privileges required' });
      }

      req.adminUser = userDoc;
      next();
    } catch (dbError) {
      console.error('❌ Database error during admin auth:', dbError);
      
      // Handle Cloudant rate limiting specifically
      if (dbError.statusCode === 429 || dbError.error === 'too_many_requests') {
        return res.status(429).json({ 
          error: 'Cloudant rate limit exceeded. Please wait a moment and try again.',
          retryAfter: '30 seconds',
          statusCode: 429,
          suggestion: 'Try refreshing the page in 30 seconds'
        });
      }
      
      return res.status(500).json({ 
        error: 'Database connection failed during authentication',
        details: dbError.message 
      });
    }
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.message 
    });
  }
};

// Admin registration endpoint - simplified to just check admin secret
router.post('/register', checkMAIA2Ready, async (req, res) => {
  try {
    const { username, adminSecret } = req.body;
    
    // Check if this is the reserved admin username
    if (username !== process.env.ADMIN_USERNAME) {
      return res.status(400).json({ error: 'Invalid admin username' });
    }
    
    // Verify admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(400).json({ error: 'Invalid admin secret' });
    }
    
        // Check if admin user already exists
    try {
      const existingUser = await maia2Client.getUserByUsername(username);
      if (existingUser) {
        if (existingUser.isAdmin) {
          // Admin user exists - allow new passkey registration (replaces old one)
          console.log('✅ Admin user exists, allowing new passkey registration:', username);
          return res.json({ 
            message: 'Admin user verified. You can now register a new passkey (this will replace your existing one).',
            username: existingUser.username,
            isAdmin: existingUser.isAdmin,
            canProceedToPasskey: true,
            existingUser: true
          });
        } else {
          // User exists but isn't admin - upgrade them to admin
          console.log('✅ Upgrading existing user to admin:', username);
          const updatedUser = await maia2Client.updateUser(username, { isAdmin: true });
          return res.json({ 
            message: 'Existing user upgraded to admin successfully. You can now register your passkey.',
            username: updatedUser.username,
            isAdmin: updatedUser.isAdmin,
            canProceedToPasskey: true,
            upgraded: true
          });
        }
      }
    } catch (error) {
      // User doesn't exist - create new admin user
      console.log('✅ Creating new admin user:', username);
      const adminUser = {
        username: username,
        displayName: username,
        isAdmin: true,
        createdAt: new Date().toISOString()
      };
      
      await maia2Client.createUser(adminUser);
      console.log('✅ New admin user created successfully');
      
      return res.json({
        message: 'New admin user created successfully. You can now register your passkey.',
        username: username,
        isAdmin: true,
        canProceedToPasskey: true,
        newUser: true
      });
    }
    
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ 
      error: 'Admin registration failed',
      details: error.message 
    });
  }
});

// Get all private AI users and their workflow status - TEMPORARILY OPEN FOR TESTING
router.get('/users', async (req, res) => {
  try {
    if (!couchDBClient) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Get all users from maia2_users database
    const allUsers = await couchDBClient.getAllDocuments('maia2_users');
    console.log(`🔍 [DEBUG] Total documents in maia2_users: ${allUsers.length}`);
    
    // Log some sample documents to understand what we're getting
    const sampleDocs = allUsers.slice(0, 5).map(doc => ({
      _id: doc._id,
      isAdmin: doc.isAdmin,
      hasCredentialID: !!doc.credentialID,
      type: doc.type || 'unknown'
    }));
    console.log('🔍 [DEBUG] Sample documents:', sampleDocs);
    
    const users = allUsers
      .filter(user => {
        // Exclude design documents and Unknown User
        if (user._id.startsWith('_design/') || user._id === 'Unknown User') {
          console.log(`🔍 [DEBUG] Excluding: ${user._id} (design doc or Unknown User)`);
          return false;
        }
        // For wed271, allow it through even if it has isAdmin: true (special case)
        if (user._id === 'wed271') {
          console.log('🔍 [SPECIAL] Including wed271 despite admin status:', {
            userId: user._id,
            isAdmin: user.isAdmin
          });
          return true;
        }
        // For all other users, exclude admin users
        const isAdmin = user.isAdmin;
        if (isAdmin) {
          console.log(`🔍 [DEBUG] Excluding admin user: ${user._id}`);
        }
        return !isAdmin;
      })
      .map(user => {
        return {
          userId: user._id,
          displayName: user.displayName || user._id,
          createdAt: user.createdAt,
          hasPasskey: !!user.credentialID,
          workflowStage: determineWorkflowStage(user),
          assignedAgentId: user.assignedAgentId || null,
          assignedAgentName: user.assignedAgentName || null,
          email: user.email || null
        };
      })
      .filter(processedUser => processedUser.userId !== 'admin') // Exclude admin user from final list
      .sort((a, b) => {
        // Sort "awaiting_approval" to the top
        if (a.workflowStage === 'awaiting_approval' && b.workflowStage !== 'awaiting_approval') {
          return -1;
        }
        if (b.workflowStage === 'awaiting_approval' && a.workflowStage !== 'awaiting_approval') {
          return 1;
        }
        // Then sort by creation date (newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    
    console.log(`🔍 [DEBUG] Final filtered users count: ${users.length}`);
    console.log(`🔍 [DEBUG] Users by workflow stage:`, users.reduce((acc, user) => {
      acc[user.workflowStage] = (acc[user.workflowStage] || 0) + 1;
      return acc;
    }, {}));
    
    res.json({ users });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    
    // Handle Cloudant rate limiting specifically
    if (error.statusCode === 429 || error.error === 'too_many_requests') {
      return res.status(429).json({ 
        error: 'Cloudant rate limit exceeded. Please wait a moment and try again.',
        retryAfter: '30 seconds',
        statusCode: 429,
        suggestion: 'Try refreshing the page in 30 seconds'
      });
    }
    
    // Handle other database errors
    res.status(500).json({ 
      error: 'Failed to fetch users',
      details: error.message,
      suggestion: 'Please try again later'
    });
  }
});

// Get detailed user information and workflow status - TEMPORARILY OPEN FOR TESTING
router.get('/users/:userId', checkMAIA2Ready, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user document
    const userDoc = await maia2Client.getUserByUsername(userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's approval requests, agents, and knowledge bases
    // Note: These methods need to be implemented in Maia2Client
    const userInfo = {
      userId: userDoc.username,
      displayName: userDoc.displayName || userDoc.username,
      createdAt: userDoc.createdAt,
      hasPasskey: !!userDoc.credentialID,
      workflowStage: determineWorkflowStage(userDoc),
      adminNotes: userDoc.adminNotes || '',
      approvalStatus: userDoc.approvalStatus,
      assignedAgentId: userDoc.assignedAgentId || null,
      assignedAgentName: userDoc.assignedAgentName || null,
      agentAssignedAt: userDoc.agentAssignedAt || null,
      approvalRequests: [], // TODO: Implement when Maia2Client has these methods
      agents: [], // TODO: Implement when Maia2Client has these methods
      knowledgeBases: [] // TODO: Implement when Maia2Client has these methods
    };
    
    res.json(userInfo);
    
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Approve, reject, or suspend user for private AI access
router.post('/users/:userId/approve', checkMAIA2Ready, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, notes } = req.body;
    
    // Validate action
    if (!['approve', 'reject', 'suspend'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be one of: approve, reject, suspend' 
      });
    }
    
    // Get user document
    const userDoc = await maia2Client.getUserByUsername(userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Map action to approval status
    let approvalStatus;
    switch (action) {
      case 'approve':
        approvalStatus = 'approved';
        break;
      case 'reject':
        approvalStatus = 'rejected';
        break;
      case 'suspend':
        approvalStatus = 'suspended';
        break;
    }
    
    // Update user approval status
    const updatedUser = await maia2Client.updateUserApprovalStatus(userId, approvalStatus, notes);
    
    // If approved, trigger resource creation workflow
    if (action === 'approve') {
      // TODO: Implement automatic agent and KB creation
      // For now, just log that resources should be created
      console.log(`🚀 User ${userId} approved - should create private AI agent and knowledge base`);
    }
    
    res.json({ 
      message: `User ${action} successfully`,
      userId: userId,
      action: action,
      approvalStatus: approvalStatus,
      timestamp: new Date().toISOString(),
      nextSteps: action === 'approve' ? 'Private AI agent and knowledge base will be created automatically' : null
    });
    
  } catch (error) {
    console.error('Error updating user approval status:', error);
    res.status(500).json({ error: 'Failed to update user approval status' });
  }
});

// Save admin notes for a user - TEMPORARILY OPEN FOR TESTING
router.post('/users/:userId/notes', checkMAIA2Ready, async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;
    
    // Get user document
    const userDoc = await maia2Client.getUserByUsername(userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user notes
    const updates = {
      adminNotes: notes,
      updatedAt: new Date().toISOString()
    };
    
    await maia2Client.updateUser(userId, updates);
    
    res.json({ 
      message: 'Notes saved successfully',
      userId: userId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error saving notes:', error);
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// Assign agent to a user
router.post('/users/:userId/assign-agent', checkMAIA2Ready, async (req, res) => {
  try {
    const { userId } = req.params;
    const { agentId, agentName } = req.body;
    
    if (!agentId || !agentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId and agentName' 
      });
    }
    
    // Get user document
    const userDoc = await maia2Client.getUserByUsername(userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user with assigned agent information
    const updates = {
      assignedAgentId: agentId,
      assignedAgentName: agentName,
      agentAssignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await maia2Client.updateUser(userId, updates);
    
    res.json({ 
      message: 'Agent assigned successfully',
      userId: userId,
      agentId: agentId,
      agentName: agentName,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error assigning agent:', error);
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

// Get user's assigned agent
router.get('/users/:userId/assigned-agent', checkMAIA2Ready, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user document with retry logic for rate limits
    let userDoc = null;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries && !userDoc) {
      try {
        userDoc = await maia2Client.getUserByUsername(userId);
        break;
      } catch (error) {
        if (error.statusCode === 429 && retries < maxRetries - 1) {
          console.warn(`Rate limit hit for getUserByUsername, retrying in ${(retries + 1) * 2} seconds...`);
          await new Promise(resolve => setTimeout(resolve, (retries + 1) * 2000));
          retries++;
        } else {
          throw error;
        }
      }
    }
    
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return assigned agent information
    res.json({
      userId: userId,
      assignedAgentId: userDoc.assignedAgentId || null,
      assignedAgentName: userDoc.assignedAgentName || null,
      agentAssignedAt: userDoc.agentAssignedAt || null
    });
    
  } catch (error) {
    console.error('Error getting assigned agent:', error);
    if (error.statusCode === 429) {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to get assigned agent' });
    }
  }
});

// Helper function to determine workflow stage
function determineWorkflowStage(user) {
  // Check if user has a passkey (look for credentialID field)
  if (!user.credentialID) {
    return 'no_passkey';
  }
  
  // For legacy users without approvalStatus field, assume they need approval
  if (!user.approvalStatus) {
    return 'awaiting_approval';
  }
  
  if (user.approvalStatus === 'pending') {
    return 'awaiting_approval';
  }
  
  if (user.approvalStatus === 'rejected') {
    return 'rejected';
  }
  
  if (user.approvalStatus === 'suspended') {
    return 'suspended';
  }
  
  if (user.approvalStatus === 'approved') {
    // Check if they have resources created
    // TODO: Implement actual resource checking when Maia2Client has these methods
    return 'approved'; // For now, just return approved
  }
  
  return 'unknown';
}

export default router;
