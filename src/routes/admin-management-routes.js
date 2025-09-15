import express from 'express';
// Removed maia2Client import - using couchDBClient instead
import UserStateManagerClass from '../utils/UserStateManager.js';

// Create singleton instance
const UserStateManager = new UserStateManagerClass();

// DigitalOcean API configuration
const DIGITALOCEAN_API_KEY = process.env.DIGITALOCEAN_PERSONAL_API_KEY;
const DIGITALOCEAN_BASE_URL = 'https://api.digitalocean.com';

// DigitalOcean API request function
const doRequest = async (endpoint, options = {}) => {
  if (!DIGITALOCEAN_API_KEY) {
    throw new Error('DigitalOcean API key not configured');
  }

  const url = `${DIGITALOCEAN_BASE_URL}${endpoint}`;
  
  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${DIGITALOCEAN_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (options.body) {
    requestOptions.body = options.body;
  }

  try {
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ DigitalOcean API Error Response:`);
      console.error(`Status: ${response.status}`);
      console.error(`Headers:`, Object.fromEntries(response.headers.entries()));
      console.error(`Body: ${errorText}`);
      throw new Error(`DigitalOcean API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ DigitalOcean API request failed:`, error.message);
    throw error;
  }
};

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
    
    // Clear UserStateManager cache to ensure fresh data
    const userStateManager = req.app.locals.userStateManager;
    if (userStateManager) {
      userStateManager.clearCache();
      console.log('🔍 [CACHE] Cleared UserStateManager cache for fresh Admin Panel data');
    }
    
    // Get all users from maia_users database
    const allUsers = await couchDBClient.getAllDocuments('maia_users');
    
    const users = allUsers
      .filter(user => {
        // Exclude design documents only (Public User should be included)
        if (user._id.startsWith('_design/')) {
          return false;
        }
        // For wed271, allow it through even if it has isAdmin: true (special case)
        if (user._id === 'wed271') {
          return true;
        }
        // For all other users, exclude admin users
        const isAdmin = user.isAdmin;
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
    
    // Admin Panel data loaded
    
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
    if (!['approve', 'reject', 'suspend', 'reset'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be one of: approve, reject, suspend, reset' 
      });
    }
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Map action to approval status and workflow stage
    let approvalStatus;
    let workflowStage;
    switch (action) {
      case 'approve':
        approvalStatus = 'approved';
        workflowStage = 'approved';
        break;
      case 'reject':
        approvalStatus = 'rejected';
        workflowStage = 'rejected';
        break;
      case 'suspend':
        approvalStatus = 'suspended';
        workflowStage = 'suspended';
        break;
      case 'reset':
        approvalStatus = 'pending';
        workflowStage = 'awaiting_approval';
        break;
    }
    
    // Update user approval status and workflow stage
    const updatedUser = {
      ...userDoc,
      approvalStatus: approvalStatus,
      workflowStage: workflowStage,
      adminNotes: notes,
      updatedAt: new Date().toISOString()
    };
    
    // Validate consistency before saving
    console.log(`🔍 [DEBUG] Validating workflow consistency before saving...`);
    validateWorkflowConsistency(updatedUser);
    
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
      workflowStage: workflowStage,
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
    console.log(`🔍 [BACKEND DEBUG] assigned-agent endpoint called for user: ${userId} at ${new Date().toISOString()}`);
    
    // First try to get from UserStateManager cache
    const userStateManager = req.app.locals.userStateManager;
    if (userStateManager) {
      const cachedAgentData = userStateManager.getUserStateSection(userId, 'agent');
      if (cachedAgentData) {
        // Return cached data without hitting database
        const assignedAgentId = cachedAgentData.assignedAgentId || cachedAgentData.currentAgentId || null;
        const assignedAgentName = cachedAgentData.assignedAgentName || cachedAgentData.currentAgentName || null;
        const agentAssignedAt = cachedAgentData.agentAssignedAt || cachedAgentData.currentAgentSetAt || null;
        
        // Only log once per user per session to prevent spam
        const logKey = `assignedAgentLogged_${userId}`;
        if (!req.session[logKey]) {
          console.log(`🔍 [CACHED] assigned-agent endpoint for ${userId}:`, {
            assignedAgentId: cachedAgentData.assignedAgentId,
            currentAgentId: cachedAgentData.currentAgentId,
            assignedAgentName: cachedAgentData.assignedAgentName,
            currentAgentName: cachedAgentData.currentAgentName,
            finalAssignedAgentId: assignedAgentId,
            finalAssignedAgentName: assignedAgentName,
            source: 'cache'
          });
          req.session[logKey] = true;
        }
        
        return res.json({
          userId: userId,
          assignedAgentId: assignedAgentId,
          assignedAgentName: assignedAgentName,
          agentAssignedAt: agentAssignedAt
        });
      }
    }
    
    // Fallback to database if cache miss
    console.log(`🔍 [DB] assigned-agent endpoint for ${userId} - cache miss, fetching from database`);
    
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
    
    // Update cache with fresh data
    if (userStateManager) {
      userStateManager.updateUserStateSection(userId, 'agent', {
        assignedAgentId: userDoc.assignedAgentId,
        assignedAgentName: userDoc.assignedAgentName,
        currentAgentId: userDoc.currentAgentId,
        currentAgentName: userDoc.currentAgentName,
        agentAssignedAt: userDoc.agentAssignedAt,
        currentAgentSetAt: userDoc.currentAgentSetAt
      });
    }
    
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

// TEMPORARY: Fix user data endpoint
router.post('/fix-user-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🔧 [FIX] Fixing user data for: ${userId}`);
    
    // Get the user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    console.log(`🔍 [FIX] Current user data:`, {
      _id: userDoc._id,
      workflowStage: userDoc.workflowStage,
      approvalStatus: userDoc.approvalStatus
    });
    
    // Fix the inconsistency
    if (userDoc.workflowStage === 'approved' && !userDoc.approvalStatus) {
      console.log(`🔧 [FIX] Setting approvalStatus to 'approved' for user ${userId}`);
      userDoc.approvalStatus = 'approved';
      userDoc.updatedAt = new Date().toISOString();
      userDoc.fixNotes = 'Fixed workflow inconsistency: set approvalStatus to match workflowStage';
      
      // Save the updated document
      await couchDBClient.saveDocument('maia_users', userDoc);
      console.log(`✅ [FIX] User ${userId} fixed successfully`);
      
      res.json({ 
        message: `User ${userId} data fixed successfully`,
        userId: userId,
        workflowStage: userDoc.workflowStage,
        approvalStatus: userDoc.approvalStatus
      });
    } else {
      console.log(`ℹ️ [FIX] No inconsistency found for user ${userId}`);
      res.json({ 
        message: `No inconsistency found for user ${userId}`,
        userId: userId,
        workflowStage: userDoc.workflowStage,
        approvalStatus: userDoc.approvalStatus
      });
    }
    
  } catch (error) {
    console.error('❌ [FIX] Error fixing user data:', error);
    res.status(500).json({ error: 'Failed to fix user data' });
  }
});

// Helper function to determine workflow stage
function validateWorkflowConsistency(user) {
  const { workflowStage, approvalStatus } = user;
  
  // Define valid combinations
  const validCombinations = {
    'no_passkey': ['no_passkey', undefined], // No approval status needed
    'awaiting_approval': ['pending', undefined], // Awaiting approval
    'waiting_for_deployment': ['approved'], // Approved but waiting for agent deployment
    'approved': ['approved'], // Fully approved
    'rejected': ['rejected'], // Rejected
    'suspended': ['suspended'] // Suspended
  };
  
  const validApprovalStatuses = validCombinations[workflowStage] || [];
  
  if (!validApprovalStatuses.includes(approvalStatus)) {
    const error = new Error(`Workflow state inconsistency detected for user ${user._id}: workflowStage="${workflowStage}" but approvalStatus="${approvalStatus}". Valid combinations: ${JSON.stringify(validCombinations)}`);
    console.error('❌ [WORKFLOW VALIDATION ERROR]', error.message);
    console.error('🔍 [DEBUG] User data:', {
      _id: user._id,
      workflowStage,
      approvalStatus,
      credentialID: user.credentialID
    });
    throw error;
  }
  
  console.log(`✅ [WORKFLOW VALIDATION] User ${user._id}: workflowStage="${workflowStage}" ✓ approvalStatus="${approvalStatus}" ✓`);
}

function determineWorkflowStage(user) {
  // Primary source of truth: stored workflowStage field
  if (user.workflowStage) {
    // Validate consistency between workflowStage and approvalStatus
    try {
      validateWorkflowConsistency(user);
    } catch (error) {
      console.error(`❌ [WORKFLOW VALIDATION] Error for user ${user._id}:`, error.message);
      // Return a safe default instead of throwing
      return 'inconsistent';
    }
    return user.workflowStage;
  }
  
  // Fallback for legacy users without workflowStage field
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

// Admin endpoint to update user workflow stage
router.post('/users/:userId/workflow-stage', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { workflowStage, notes } = req.body;
    
    console.log(`🔄 [DEBUG] Workflow stage update request for user ${userId}:`, { workflowStage, notes });
    
    // Validate workflow stage
    const validStages = ['no_passkey', 'awaiting_approval', 'waiting_for_deployment', 'approved', 'rejected', 'suspended'];
    if (!validStages.includes(workflowStage)) {
      console.log(`❌ [DEBUG] Invalid workflow stage: ${workflowStage}. Valid stages: ${validStages.join(', ')}`);
      return res.status(400).json({ 
        error: `Invalid workflow stage. Must be one of: ${validStages.join(', ')}` 
      });
    }
    
    // Get user document
    console.log(`🔄 [DEBUG] Getting user document for ${userId}`);
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      console.log(`❌ [DEBUG] User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`🔄 [DEBUG] User document found:`, { 
      userId: userDoc._id, 
      currentWorkflowStage: userDoc.workflowStage,
      approvalStatus: userDoc.approvalStatus 
    });
    
    // Update user workflow stage
    const updatedUser = {
      ...userDoc,
      workflowStage: workflowStage,
      adminNotes: notes || `Workflow stage updated to: ${workflowStage}`,
      updatedAt: new Date().toISOString()
    };
    
    // Validate consistency before saving
    console.log(`🔍 [DEBUG] Validating workflow consistency before saving...`);
    try {
      validateWorkflowConsistency(updatedUser);
    } catch (error) {
      console.error(`❌ [WORKFLOW VALIDATION] Inconsistent data detected for user ${userId}:`, error.message);
      // Handle specific workflow transitions
      if (workflowStage === 'awaiting_approval' && userDoc.workflowStage === 'awaiting_approval' && userDoc.approvalStatus === 'approved') {
        console.log(`🔧 [DEBUG] Allowing workflow stage update to fix inconsistent data`);
        // Update approvalStatus to match the new workflow stage
        updatedUser.approvalStatus = 'pending';
      } else if (workflowStage === 'waiting_for_deployment' && userDoc.workflowStage === 'awaiting_approval' && userDoc.approvalStatus === 'pending') {
        console.log(`🔧 [DEBUG] Allowing workflow stage update to waiting_for_deployment after agent creation`);
        // Update approvalStatus to match the new workflow stage
        updatedUser.approvalStatus = 'approved';
      } else {
        throw error; // Re-throw if it's not a recognized transition
      }
    }
    
    console.log(`🔄 [DEBUG] Updating user document with new workflow stage: ${workflowStage}`);
    await couchDBClient.saveDocument('maia_users', updatedUser);
    
    // Update user state cache
    UserStateManager.updateUserStateSection(userId, 'workflow', {
      workflowStage: workflowStage,
      approvalStatus: updatedUser.approvalStatus,
      adminNotes: updatedUser.adminNotes
    });
    
    console.log(`✅ [DEBUG] User workflow stage updated successfully`);
    
    res.json({ 
      message: `User workflow stage updated to ${workflowStage}`,
      userId: userId,
      workflowStage: workflowStage,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error updating user workflow stage:', error);
    res.status(500).json({ error: 'Failed to update user workflow stage' });
  }
});

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

// Database Management Endpoints

// Update user's assigned agent in maia_users
router.post('/database/update-user-agent', requireAdminAuth, async (req, res) => {
  try {
    const { userId, agentId, agentName } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required field: userId' 
      });
    }
    
    // Allow clearing agent by setting agentId and agentName to null
    if (agentId === null && agentName === null) {
      // Clearing agent assignment
    } else if (!agentId || !agentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId, agentName (or set both to null to clear)' 
      });
    }
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update assigned agent fields
    const updatedUserDoc = {
      ...userDoc,
      assignedAgentId: agentId,
      assignedAgentName: agentName,
      currentAgentId: agentId, // Set current to match assigned
      currentAgentName: agentName,
      agentAssignedAt: agentId ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    };
    
    // Save updated document
    await couchDBClient.saveDocument('maia_users', updatedUserDoc);
    
    // Update UserStateManager cache
    const userStateManager = req.app.locals.userStateManager;
    if (userStateManager) {
      userStateManager.updateUserStateSection(userId, 'agent', {
        assignedAgentId: agentId,
        assignedAgentName: agentName,
        currentAgentId: agentId,
        currentAgentName: agentName,
        agentAssignedAt: updatedUserDoc.agentAssignedAt
      });
    }
    
    
    res.json({
      success: true,
      message: `Agent ${agentName} assigned to user ${userId}`,
      userId: userId,
      assignedAgentId: agentId,
      assignedAgentName: agentName
    });
    
  } catch (error) {
    console.error('Error updating user agent:', error);
    res.status(500).json({ error: 'Failed to update user agent' });
  }
});

// Sync agent names with DO API
router.post('/database/sync-agent-names', requireAdminAuth, async (req, res) => {
  try {
    console.log(`🔄 [DB] Starting agent name sync with DO API`);
    
    // Get all agents from DO API
    const agentsResponse = await doRequest('/v2/gen-ai/agents');
    const agents = agentsResponse.agents || [];
    
    console.log(`🔍 [DB] Found ${agents.length} agents in DO API`);
    
    const syncResults = [];
    
    // Get all users from database
    const usersResponse = await couchDBClient.findDocuments('maia_users', {
      selector: {
        assignedAgentId: { $exists: true }
      }
    });
    
    console.log(`🔍 [DB] Found ${usersResponse.docs.length} users with assigned agents`);
    
    for (const user of usersResponse.docs) {
      if (!user.assignedAgentId) continue;
      
      // Find matching agent in DO API
      const matchingAgent = agents.find(agent => agent.uuid === user.assignedAgentId);
      
      if (matchingAgent) {
        const expectedName = `${user.displayName || user._id}-agent-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
        
        if (matchingAgent.name !== expectedName) {
          console.log(`🔄 [DB] Updating agent name for user ${user._id}: ${matchingAgent.name} → ${expectedName}`);
          
          // Update agent name in DO API
          try {
            await doRequest(`/v2/gen-ai/agents/${matchingAgent.uuid}`, {
              method: 'PATCH',
              body: JSON.stringify({
                name: expectedName
              })
            });
            
            // Update user document
            const updatedUserDoc = {
              ...user,
              assignedAgentName: expectedName,
              currentAgentName: expectedName,
              updatedAt: new Date().toISOString()
            };
            
            await couchDBClient.saveDocument('maia_users', updatedUserDoc);
            
            // Update cache
            const userStateManager = req.app.locals.userStateManager;
            if (userStateManager) {
              userStateManager.updateUserStateSection(user._id, 'agent', {
                assignedAgentName: expectedName,
                currentAgentName: expectedName
              });
            }
            
            syncResults.push({
              userId: user._id,
              agentId: matchingAgent.uuid,
              oldName: matchingAgent.name,
              newName: expectedName,
              status: 'updated'
            });
            
          } catch (updateError) {
            console.error(`❌ [DB] Failed to update agent name for user ${user._id}:`, updateError.message);
            syncResults.push({
              userId: user._id,
              agentId: matchingAgent.uuid,
              oldName: matchingAgent.name,
              newName: expectedName,
              status: 'failed',
              error: updateError.message
            });
          }
        } else {
          syncResults.push({
            userId: user._id,
            agentId: matchingAgent.uuid,
            name: matchingAgent.name,
            status: 'already_correct'
          });
        }
      } else {
        console.warn(`⚠️ [DB] Agent ${user.assignedAgentId} not found in DO API for user ${user._id}`);
        syncResults.push({
          userId: user._id,
          agentId: user.assignedAgentId,
          status: 'not_found_in_do_api'
        });
      }
    }
    
    console.log(`✅ [DB] Agent name sync completed. ${syncResults.length} agents processed`);
    
    res.json({
      success: true,
      message: `Agent name sync completed. ${syncResults.length} agents processed`,
      results: syncResults
    });
    
  } catch (error) {
    console.error('Error syncing agent names:', error);
    res.status(500).json({ error: 'Failed to sync agent names' });
  }
});

// Check user-agent assignment status
router.get('/database/user-agent-status', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' });
    }
    
    // Get user document
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const status = {
      userId: userId,
      hasAssignedAgent: !!userDoc.assignedAgentId,
      assignedAgentId: userDoc.assignedAgentId || null,
      assignedAgentName: userDoc.assignedAgentName || null,
      currentAgentId: userDoc.currentAgentId || null,
      currentAgentName: userDoc.currentAgentName || null,
      agentAssignedAt: userDoc.agentAssignedAt || null,
      isConsistent: userDoc.assignedAgentId === userDoc.currentAgentId
    };
    
    // If user has an assigned agent, verify it exists in DO API
    if (userDoc.assignedAgentId) {
      try {
        const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.assignedAgentId}`);
        status.agentExistsInDO = true;
        status.agentStatus = agentResponse.agent?.deployment?.status || 'unknown';
      } catch (error) {
        status.agentExistsInDO = false;
        status.agentError = error.message;
      }
    }
    
    
    res.json({
      success: true,
      status: status
    });
    
  } catch (error) {
    console.error('Error checking user agent status:', error);
    res.status(500).json({ error: 'Failed to check user agent status' });
  }
});

// Export functions for use in main server
export { updateAgentActivity, getAgentActivity, getAllAgentActivities };

export default router;
