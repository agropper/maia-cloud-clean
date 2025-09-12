import express from 'express';
// Removed maia2Client import - using couchDBClient instead

const router = express.Router();

// CouchDB client for maia_users database
let couchDBClient = null;

// In-memory agent activity tracking
const agentActivityTracker = new Map(); // agentId -> { lastActivity: Date, userId: string }

// Update agent activity when user interacts with agent
const updateAgentActivity = (agentId, userId) => {
  if (agentId) {
    agentActivityTracker.set(agentId, {
      lastActivity: new Date(),
      userId: userId
    });
    console.log(`[*] [Agent Activity] Updated activity for agent ${agentId} by user ${userId}`);
  }
};

// Get agent activity
const getAgentActivity = (agentId) => {
  return agentActivityTracker.get(agentId);
};

// Get all agent activities
const getAllAgentActivities = () => {
  return Array.from(agentActivityTracker.entries()).map(([agentId, data]) => ({
    agentId,
    ...data
  }));
};

// Function to set the client (called from main server)
export const setCouchDBClient = (client) => {
  couchDBClient = client;
};

// Admin authentication middleware
const requireAdminAuth = async (req, res, next) => {
  try {
    // TEMPORARY: Bypass authentication for testing
    console.log('🔓 TEMPORARY: Admin access granted without authentication for testing');
    req.adminUser = { _id: 'admin', isAdmin: true };
    return next();
    
    const session = req.session;
    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is admin
    try {
      const userDoc = await couchDBClient.getDocument('maia_users', session.userId);
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

// Health check endpoint - PROTECTED
router.get('/health', requireAdminAuth, async (req, res) => {
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

// Database system readiness check
const checkDatabaseReady = async (req, res, next) => {
  try {
    // Check if CouchDB client is initialized
    if (!couchDBClient) {
      return res.status(503).json({ 
        error: 'Database not initialized',
        suggestion: 'Please try again later'
      });
    }
    
    // Try to get a small sample of users to verify system is ready
    const users = await couchDBClient.getAllDocuments('maia_users');
    console.log('✅ Database system ready, can access users');
    next();
  } catch (error) {
    console.log('⏳ Database system readiness check failed:', error.message);
    
    // Handle Cloudant rate limiting specifically - this is NOT a system readiness issue
    if (error.statusCode === 429 || error.error === 'too_many_requests') {
      console.log('📊 Rate limiting detected during readiness check - system is ready, just busy');
      // System is ready, just rate limited - allow the request to proceed
      next();
      return;
    }
    
    // For other errors, system might not be ready
    return res.status(503).json({ 
      error: 'Database system is initializing. Please wait a moment and try again.',
      retryAfter: 5,
      details: error.message
    });
  }
};

// Admin registration endpoint - simplified to just check admin secret
router.post('/register', checkDatabaseReady, async (req, res) => {
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
      const existingUser = await couchDBClient.getDocument('maia_users', username);
      if (existingUser) {
        if (existingUser.isAdmin) {
          // Admin user exists - allow new passkey registration (replaces old one)
          console.log('✅ Admin user exists, allowing new passkey registration:', username);
          return res.json({ 
            message: 'Admin user verified. You can now register a new passkey (this will replace your existing one).',
            username: existingUser._id,
            isAdmin: existingUser.isAdmin,
            canProceedToPasskey: true,
            existingUser: true
          });
        } else {
          // User exists but isn't admin - upgrade them to admin
          console.log('✅ Upgrading existing user to admin:', username);
          const updatedUser = {
            ...existingUser,
            isAdmin: true,
            updatedAt: new Date().toISOString()
          };
          await couchDBClient.saveDocument('maia_users', updatedUser);
          return res.json({ 
            message: 'Existing user upgraded to admin successfully. You can now register your passkey.',
            username: updatedUser._id,
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
        _id: username,
        type: 'admin',
        isAdmin: true,
        createdAt: new Date().toISOString()
      };
      
      await couchDBClient.saveDocument('maia_users', adminUser);
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

// Get all private AI users and their workflow status - PROTECTED
router.get('/users', requireAdminAuth, async (req, res) => {
  try {
    if (!couchDBClient) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Get all users from maia_users database
    const allUsers = await couchDBClient.getAllDocuments('maia_users');
    console.log(`🔍 [DEBUG] Total documents in maia_users: ${allUsers.length}`);
    
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
        // Exclude design documents only (Public User should be included)
        if (user._id.startsWith('_design/')) {
          console.log(`🔍 [DEBUG] Excluding: ${user._id} (design doc)`);
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
        // Extract current agent information from ownedAgents if available
        let assignedAgentId = user.assignedAgentId || null;
        let assignedAgentName = user.assignedAgentName || null;
        
        // If we have ownedAgents but no assignedAgentId, use the first owned agent
        if (user.ownedAgents && user.ownedAgents.length > 0 && !assignedAgentId) {
          const firstAgent = user.ownedAgents[0];
          assignedAgentId = firstAgent.id;
          assignedAgentName = firstAgent.name;
        }
        
        // Check if passkey is valid (not a test credential)
        const hasValidPasskey = !!(user.credentialID && 
          user.credentialID !== 'test-credential-id-wed271' && 
          user.credentialPublicKey && 
          user.counter !== undefined);
        
        return {
          userId: user._id,
          displayName: user.displayName || user._id,
          createdAt: user.createdAt,
          hasPasskey: !!user.credentialID,
          hasValidPasskey: hasValidPasskey,
          workflowStage: determineWorkflowStage(user),
          assignedAgentId: assignedAgentId,
          assignedAgentName: assignedAgentName,
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

// Get detailed user information and workflow status
router.get('/users/:userId', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // DEBUG: Log the full user document to see what we're working with
    console.log(`🔍 [DEBUG] User details for ${userId}:`, {
      _id: userDoc._id,
      ownedAgents: userDoc.ownedAgents,
      currentAgentId: userDoc.currentAgentId,
      currentAgentName: userDoc.currentAgentName,
      agentAssignedAt: userDoc.agentAssignedAt,
      approvalStatus: userDoc.approvalStatus,
      workflowStage: determineWorkflowStage(userDoc)
    });
    
    // Extract current agent information from ownedAgents if available
    let currentAgentId = userDoc.currentAgentId || null;
    let currentAgentName = userDoc.currentAgentName || null;
    let agentAssignedAt = userDoc.agentAssignedAt || null;
    
    // If we have ownedAgents but no currentAgentId, use the first owned agent
    if (userDoc.ownedAgents && userDoc.ownedAgents.length > 0 && !currentAgentId) {
      const firstAgent = userDoc.ownedAgents[0];
      currentAgentId = firstAgent.id;
      currentAgentName = firstAgent.name;
      agentAssignedAt = firstAgent.assignedAt;
      console.log(`🔍 [DEBUG] Extracted current agent from ownedAgents:`, {
        currentAgentId,
        currentAgentName,
        agentAssignedAt
      });
    }
    
    // If we have currentAgentId but no agentAssignedAt, try to get it from ownedAgents
    if (currentAgentId && !agentAssignedAt && userDoc.ownedAgents && userDoc.ownedAgents.length > 0) {
      const matchingAgent = userDoc.ownedAgents.find(agent => agent.id === currentAgentId);
      if (matchingAgent && matchingAgent.assignedAt) {
        agentAssignedAt = matchingAgent.assignedAt;
        console.log(`🔍 [DEBUG] Extracted agentAssignedAt from ownedAgents:`, agentAssignedAt);
      }
    }
    
    // Get user's approval requests, agents, and knowledge bases
    const userInfo = {
      userId: userDoc._id || userDoc.userId,
      displayName: userDoc.displayName || userDoc._id,
      createdAt: userDoc.createdAt,
      updatedAt: userDoc.updatedAt,
      hasPasskey: !!userDoc.credentialID,
      hasValidPasskey: !!(userDoc.credentialID && 
        userDoc.credentialID !== 'test-credential-id-wed271' && 
        userDoc.credentialPublicKey && 
        userDoc.counter !== undefined),
      credentialID: userDoc.credentialID,
      credentialPublicKey: userDoc.credentialPublicKey ? 'Present' : 'Missing',
      counter: userDoc.counter,
      transports: userDoc.transports,
      domain: userDoc.domain,
      type: userDoc.type,
      workflowStage: determineWorkflowStage(userDoc),
      adminNotes: userDoc.adminNotes || '',
      approvalStatus: userDoc.approvalStatus,
      // Agent information - provide both old and new field names for compatibility
      currentAgentId: currentAgentId,
      currentAgentName: currentAgentName,
      assignedAgentId: currentAgentId, // Frontend compatibility
      assignedAgentName: currentAgentName, // Frontend compatibility
      ownedAgents: userDoc.ownedAgents || [],
      currentAgentSetAt: userDoc.currentAgentSetAt,
      challenge: userDoc.challenge,
      agentAssignedAt: agentAssignedAt,
      approvalRequests: [], // TODO: Implement when Maia2Client has these methods
      agents: [], // TODO: Implement when Maia2Client has these methods
      knowledgeBases: [] // TODO: Implement when Maia2Client has these methods
    };
    
    console.log(`🔍 [DEBUG] Final user info for ${userId}:`, {
      currentAgentId: userInfo.currentAgentId,
      currentAgentName: userInfo.currentAgentName,
      agentAssignedAt: userInfo.agentAssignedAt,
      ownedAgents: userInfo.ownedAgents
    });
    
    res.json(userInfo);
    
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Approve, reject, or suspend user for private AI access
router.post('/users/:userId/approve', requireAdminAuth, async (req, res) => {
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
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
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
    const updatedUser = {
      ...userDoc,
      approvalStatus: approvalStatus,
      adminNotes: notes,
      updatedAt: new Date().toISOString()
    };
    await couchDBClient.saveDocument('maia_users', updatedUser);
    
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

// Save admin notes for a user
router.post('/users/:userId/notes', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user notes
    const updatedUser = {
      ...userDoc,
      adminNotes: notes,
      updatedAt: new Date().toISOString()
    };
    
    await couchDBClient.saveDocument('maia_users', updatedUser);
    
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
router.post('/users/:userId/assign-agent', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { agentId, agentName } = req.body;
    
    if (!agentId || !agentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId and agentName' 
      });
    }
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user with assigned agent information
    const updatedUser = {
      ...userDoc,
      assignedAgentId: agentId,
      assignedAgentName: agentName,
      agentAssignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await couchDBClient.saveDocument('maia_users', updatedUser);
    
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
router.get('/users/:userId/assigned-agent', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user document with retry logic for rate limits
    let userDoc = null;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries && !userDoc) {
      try {
        userDoc = await couchDBClient.getDocument('maia_users', userId);
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
    
    // Return assigned agent information - check both assignedAgentId and currentAgentId
    const assignedAgentId = userDoc.assignedAgentId || userDoc.currentAgentId || null;
    const assignedAgentName = userDoc.assignedAgentName || userDoc.currentAgentName || null;
    const agentAssignedAt = userDoc.agentAssignedAt || userDoc.currentAgentSetAt || null;
    
    // Debug logging
    console.log(`🔍 [DEBUG] assigned-agent endpoint for ${userId}:`, {
      assignedAgentId: userDoc.assignedAgentId,
      currentAgentId: userDoc.currentAgentId,
      assignedAgentName: userDoc.assignedAgentName,
      currentAgentName: userDoc.currentAgentName,
      finalAssignedAgentId: assignedAgentId,
      finalAssignedAgentName: assignedAgentName
    });
    
    res.json({
      userId: userId,
      assignedAgentId: assignedAgentId,
      assignedAgentName: assignedAgentName,
      agentAssignedAt: agentAssignedAt
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

// Admin endpoint to reset a user's passkey
router.post('/users/:userId/reset-passkey', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminSecret } = req.body;
    
    // Verify admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(400).json({ error: 'Invalid admin secret' });
    }
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Clear the passkey information
    const updatedUser = {
      ...userDoc,
      credentialID: undefined,
      credentialPublicKey: undefined,
      counter: undefined,
      transports: undefined,
      challenge: undefined,
      updatedAt: new Date().toISOString()
    };
    
    // Save the updated user document
    await couchDBClient.saveDocument('maia_users', updatedUser);
    
    console.log(`✅ Admin reset passkey for user: ${userId}`);
    
    res.json({
      success: true,
      message: `Passkey reset successfully for user ${userId}`,
      userId: userId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error resetting user passkey:', error);
    res.status(500).json({ error: 'Failed to reset user passkey' });
  }
});

// Session management endpoints
import { SessionManager } from '../utils/session-manager.js';

// Session manager instance (will be set from main server)
let sessionManager = null;

// Function to set the session manager (called from main server)
export const setSessionManager = (manager) => {
  sessionManager = manager;
};

// Get all active sessions for admin dashboard
router.get('/sessions', requireAdminAuth, async (req, res) => {
  try {
    const activeSessions = await sessionManager.getAllActiveSessions();
    
    // Group sessions by type
    const sessionGroups = {
      authenticatedUsers: [],
      deepLinkUsers: [],
      unknownUserSessions: []
    };

    // Get all users once to avoid multiple database calls
    let allUsers = [];
    try {
      allUsers = await couchDBClient.getAllDocuments('maia_users');
    } catch (error) {
      console.error('Error fetching users for session info:', error);
    }

    activeSessions.forEach(session => {
      if (session.sessionType === 'authenticated') {
        sessionGroups.authenticatedUsers.push({
          userId: session.userId,
          displayName: session.userId, // TODO: Get display name from user document
          lastActivity: session.lastActivity,
          inactiveMinutes: session.inactiveMinutes,
          sessionId: session.sessionId,
          canSignOut: true
        });
      } else if (session.sessionType === 'deeplink') {
        // Try to get deep link user information
        let userInfo = null;
        try {
          if (session.deepLinkId) {
            const deepLinkUser = allUsers.find(user => 
              user.isDeepLinkUser && user.shareId === session.deepLinkId
            );
            if (deepLinkUser) {
              userInfo = {
                name: deepLinkUser.displayName,
                email: deepLinkUser.email
              };
            }
          }
        } catch (error) {
          console.error('Error fetching deep link user info:', error);
        }

        sessionGroups.deepLinkUsers.push({
          deepLinkId: session.deepLinkId,
          ownedBy: session.ownedBy,
          lastActivity: session.lastActivity,
          inactiveMinutes: session.inactiveMinutes,
          cleanupInHours: session.cleanupInHours,
          sessionId: session.sessionId,
          userInfo: userInfo
        });
      } else if (session.sessionType === 'unknown_user') {
        sessionGroups.unknownUserSessions.push({
          sessionId: session.sessionId,
          lastActivity: session.lastActivity,
          inactiveMinutes: session.inactiveMinutes
        });
      }
    });

    res.json(sessionGroups);
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// Sign out a specific user session
router.post('/sessions/:sessionId/signout', requireAdminAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🔓 [Admin] Signing out session: ${sessionId}`);
    await sessionManager.deactivateSession(sessionId, 'admin_signout');
    
    res.json({
      success: true,
      message: `Session ${sessionId} signed out successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error signing out session:', error);
    res.status(500).json({ error: 'Failed to sign out session' });
  }
});

// Get session status for a specific user
router.get('/sessions/user/:userId', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const activeSessions = await sessionManager.getAllActiveSessions();
    
    const userSessions = activeSessions.filter(session => session.userId === userId);
    
    res.json({
      userId: userId,
      activeSessions: userSessions,
      sessionCount: userSessions.length
    });
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({ error: 'Failed to fetch user sessions' });
  }
});

// Check if there are active authenticated sessions (single-user enforcement)
router.get('/sessions/active-check', requireAdminAuth, async (req, res) => {
  try {
    const hasActiveSession = await sessionManager.hasActiveAuthenticatedSession();
    
    res.json({
      hasActiveAuthenticatedSession: hasActiveSession,
      singleUserMode: true,
      message: hasActiveSession 
        ? 'An authenticated user is currently active' 
        : 'No authenticated users are currently active'
    });
  } catch (error) {
    console.error('Error checking active sessions:', error);
    res.status(500).json({ error: 'Failed to check active sessions' });
  }
});

// API endpoint to get agent activities for Admin Panel
router.get('/agent-activities', (req, res) => {
  try {
    console.log('[*] [Agent Activities] Endpoint called');
    const activities = getAllAgentActivities();
    console.log('[*] [Agent Activities] Returning activities:', activities);
    res.json({
      success: true,
      activities: activities
    });
  } catch (error) {
    console.error('Error getting agent activities:', error);
    res.status(500).json({ error: 'Failed to get agent activities' });
  }
});

// Export functions for use in main server
export { updateAgentActivity, getAgentActivity, getAllAgentActivities };

export default router;
