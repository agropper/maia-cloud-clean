import express from 'express';
import { cacheManager } from '../utils/CacheManager.js';

// Helper function to get the base URL for internal API calls
const getBaseUrl = () => {
  // Try to get from environment variables first
  if (process.env.ADMIN_BASE_URL) {
    return process.env.ADMIN_BASE_URL;
  }
  if (process.env.ORIGIN) {
    return process.env.ORIGIN;
  }
  // Fallback to localhost for development
  return 'http://localhost:3001';
};

// DigitalOcean API request function (will use the one from server.js)
const doRequest = async (endpoint, options = {}) => {
  if (!doRequestFunction) {
    throw new Error('DigitalOcean API function not configured - setDoRequestFunction not called');
  }
  
  return await doRequestFunction(endpoint, options);
};

const router = express.Router();

// HTTP request logging middleware for admin-management routes
router.use((req, res, next) => {
  next();
});

// CouchDB client for maia_users database
let couchDBClient = null;

// Cache functions (will be set by server.js)
let cacheFunctions = null;
export const setCacheFunctions = (functions) => {
  cacheFunctions = functions;
};

// DigitalOcean API function (will be set by server.js)
let doRequestFunction = null;
export const setDoRequestFunction = (doRequest) => {
  doRequestFunction = doRequest;
};

// General user activity tracking: in-memory + periodic database sync
const userActivityTracker = new Map(); // userId -> { lastActivity: Date, needsDbUpdate: boolean, lastDbUpdate: Date }
let lastDatabaseSync = 0;
const SYNC_INTERVAL = 60 * 1000; // 1 minute
const MIN_UPDATE_INTERVAL = 30 * 1000; // 30 seconds minimum between database updates for same user

// User-level deployment tracking for agents
const userDeploymentTracker = new Map(); // userId -> { agentId, agentName, status, lastCheck, retryCount, maxRetries }
const DEPLOYMENT_CHECK_INTERVAL = 5 * 1000; // Check every 5 seconds
const MAX_DEPLOYMENT_RETRIES = 30; // Max 15 minutes of checking
let deploymentMonitoringInterval = null; // Track the monitoring interval

// User-level cache invalidation function
const invalidateUserCache = (userId) => {
  if (!cacheFunctions) return;
  
  
  // Invalidate user-specific caches
  cacheFunctions.invalidateCache('users', userId);
  cacheFunctions.invalidateCache('agents', userId);
  cacheFunctions.invalidateCache('agentAssignments', userId);
  
  // CRITICAL: Also invalidate the "all" users cache used by Admin2 panel
  cacheFunctions.invalidateCache('users', 'all');
  
  // Also invalidate general caches that might contain user data
  cacheFunctions.invalidateCache('chats');
};

// Start deployment monitoring interval if not already running
const startDeploymentMonitoring = () => {
  if (deploymentMonitoringInterval) {
    return; // Already running
  }
  
  console.log('🚀 [DEPLOYMENT] Starting agent deployment monitoring...');
  deploymentMonitoringInterval = setInterval(async () => {
    try {
      await checkAgentDeployments();
      
      // Stop monitoring if no more deployments to track
      if (userDeploymentTracker.size === 0) {
        console.log('🛑 [DEPLOYMENT] No active deployments - stopping monitoring');
        clearInterval(deploymentMonitoringInterval);
        deploymentMonitoringInterval = null;
      }
  } catch (error) {
      console.error('❌ Error in deployment monitoring:', error);
    }
  }, DEPLOYMENT_CHECK_INTERVAL);
};

// Add user to deployment tracking
const addToDeploymentTracking = (userId, agentId, agentName) => {
  const startTime = Date.now();
  const trackingEntry = {
    agentId,
    agentName,
    status: 'deploying',
    startTime: startTime,
    lastCheck: startTime,
    retryCount: 0,
    maxRetries: MAX_DEPLOYMENT_RETRIES
  };
  
  userDeploymentTracker.set(userId, trackingEntry);
  
  // Start monitoring if this is the first deployment being tracked
  if (userDeploymentTracker.size === 1) {
    startDeploymentMonitoring();
  }
  
  console.log(`🚀 Started tracking deployment for user ${userId}, agent ${agentName}`);
};

// Check agent deployment status and update workflow stage
const checkAgentDeployments = async () => {
  if (userDeploymentTracker.size === 0) {
    return;
  }
  
  const now = Date.now();
  const usersToRemove = [];
  
  for (const [userId, tracking] of userDeploymentTracker.entries()) {
    const timeSinceLastCheck = now - tracking.lastCheck;
    
    // Skip if not enough time has passed since last check
    if (timeSinceLastCheck < DEPLOYMENT_CHECK_INTERVAL) {
      continue;
  }

  try {
      // Check agent deployment status via DO API
      const agentResponse = await doRequest(`/v2/gen-ai/agents/${tracking.agentId}`);
      
      const agentData = agentResponse.agent || agentResponse.data || agentResponse;
      const deploymentStatus = agentData.deployment?.status;
      
      if (deploymentStatus === 'STATUS_RUNNING') {
        // Calculate deployment duration
        const deploymentDuration = Date.now() - tracking.startTime;
        const durationSeconds = Math.round(deploymentDuration / 1000);
        const durationMinutes = Math.round(durationSeconds / 60);
        
        // Agent is deployed - update user workflow stage to 'agent_assigned'
        console.log(`✅ Agent ${tracking.agentName} deployed for user ${userId} - updating workflow stage`);
        
        // Send real-time notification to admin via SSE
        try {
          const notificationResponse = await fetch(`${getBaseUrl()}/api/admin/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'agent_deployment_completed',
              data: {
                userId: userId,
                agentName: tracking.agentName,
                agentId: tracking.agentId || null,
                duration: durationSeconds,
                durationMinutes: durationMinutes,
                message: `Agent ${tracking.agentName} deployed successfully for user ${userId} in ${durationSeconds} seconds`
              }
            })
          });
          
          if (notificationResponse.ok) {
            console.log(`📡 [SSE] [*] Sent agent deployment notification to admin`);
            console.log(`[*] Agent ${tracking.agentName} deployed for user ${userId}`);
          }
        } catch (sseError) {
          console.error(`❌ [SSE] [*] Error sending agent deployment notification:`, sseError.message);
        }
        
        // Get user document (cache-aware) with retry logic for conflicts
        let userDoc;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
            
            if (userDoc) {
              // Check if user is already in agent_assigned stage to avoid duplicate updates
              if (userDoc.workflowStage === 'agent_assigned' && userDoc.assignedAgentId === tracking.agentId) {
                console.log(`ℹ️ User ${userId} already has agent assigned - skipping update`);
                break;
              }
              
              const updatedUser = {
                ...userDoc,
                workflowStage: 'agent_assigned',
                assignedAgentId: tracking.agentId,
                assignedAgentName: tracking.agentName,
                agentDeployedAt: new Date().toISOString(),
                agentAssignedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              
              await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
              
              // Invalidate user cache to ensure fresh data
              invalidateUserCache(userId);
              
              console.log(`🎉 Successfully updated workflow stage to 'agent_assigned' for user ${userId}`);
              break;
            } else {
              console.error(`❌ User document not found for ${userId}`);
              break;
            }
          } catch (saveError) {
            retryCount++;
            if (saveError.message.includes('Document update conflict') && retryCount < maxRetries) {
              console.log(`⚠️ Document conflict for user ${userId}, retrying... (${retryCount}/${maxRetries})`);
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            } else {
              console.error(`❌ Failed to update user ${userId} after ${retryCount} retries:`, saveError.message);
              break;
            }
          }
        }
        
        // Ensure bucket folder exists for knowledge base creation
        try {
          const bucketResponse = await fetch(`${getBaseUrl()}/api/bucket/ensure-user-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          });
          
          if (bucketResponse.ok) {
            const bucketData = await bucketResponse.json();
          }
        } catch (bucketError) {
          // Error handling removed for cleaner console
        }
        
        // Remove from tracking
        usersToRemove.push(userId);
        
      } else if (deploymentStatus === 'STATUS_FAILED' || deploymentStatus === 'STATUS_ERROR' || deploymentStatus === 'status_failed' || deploymentStatus === 'status_error') {
        console.error(`❌ Agent ${tracking.agentName} deployment failed for user ${userId} - status: ${deploymentStatus}`);
        usersToRemove.push(userId);
        
      } else {
        // Still deploying - increment retry count
        tracking.retryCount++;
        tracking.lastCheck = now;
        
        if (tracking.retryCount >= tracking.maxRetries) {
          console.warn(`⚠️ Max retries reached for user ${userId}, agent ${tracking.agentName} - removing from tracking`);
          usersToRemove.push(userId);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error checking deployment for user ${userId}:`, error.message);
      
      // Increment retry count on error
      tracking.retryCount++;
      tracking.lastCheck = now;
      
      if (tracking.retryCount >= tracking.maxRetries) {
        console.warn(`⚠️ Max retries reached for user ${userId} due to errors - removing from tracking`);
        usersToRemove.push(userId);
      }
    }
  }
  
  // Remove completed/failed tracking entries
  usersToRemove.forEach(userId => {
    userDeploymentTracker.delete(userId);
  });
};

// Update user activity in memory (fast, no database writes)
const updateUserActivity = (userId) => {
  if (!userId) return;
  
  const now = new Date();
  const existingData = userActivityTracker.get(userId);
  const wasNewUser = !existingData;
  
  // Only update if enough time has passed since last database update
  const shouldUpdateDb = wasNewUser || 
    !existingData.lastDbUpdate || 
    (now - existingData.lastDbUpdate) > MIN_UPDATE_INTERVAL;
  
  userActivityTracker.set(userId, {
    lastActivity: now,
    needsDbUpdate: shouldUpdateDb,
    lastDbUpdate: existingData?.lastDbUpdate || null
  });
  
  // Sync immediately for new users, then every minute for existing users
  if (wasNewUser || Date.now() - lastDatabaseSync > SYNC_INTERVAL) {
    syncActivityToDatabase();
  }
};

// Sync activity data to database (periodic, not on every interaction)
const syncActivityToDatabase = async () => {
  if (!couchDBClient || userActivityTracker.size === 0) return;
  
  try {
    for (const [userId, data] of userActivityTracker.entries()) {
      if (!data.needsDbUpdate) continue; // Skip users that don't need updates
      
      try {
        // Find user document by _id first (most users are stored this way)
        let userQuery = {
          selector: {
            _id: userId
          },
          limit: 1
        };
        
        let userResult = await couchDBClient.findDocuments('maia_users', userQuery);
        
        // If not found by _id, try userId field (for deep_link users)
        if (userResult.docs.length === 0) {
          userQuery = {
            selector: {
              userId: userId
            },
            limit: 1
          };
          userResult = await couchDBClient.findDocuments('maia_users', userQuery);
        }
        
        if (userResult.docs.length > 0) {
          const userDoc = userResult.docs[0];
          
          // Use atomic update approach to avoid conflicts
          const updatedDoc = {
            ...userDoc,
            lastActivity: data.lastActivity.toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          // Retry logic for document conflicts
          let retryCount = 0;
          const maxRetries = 3;
          let success = false;
          
          while (retryCount < maxRetries && !success) {
            try {
              await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedDoc);
              success = true;
              // Mark as synced and update lastDbUpdate time
              data.needsDbUpdate = false;
              data.lastDbUpdate = new Date();
            } catch (conflictError) {
              if (conflictError.statusCode === 409) {
                // Document conflict - get the latest version and retry
                retryCount++;
                // Document conflict, retrying
                
                // Add small delay between retries to reduce conflict probability
                if (retryCount < maxRetries) {
                  await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                }
                
                // Get the latest version of the document (cache-aware)
                const latestDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userDoc._id);
                if (latestDoc) {
                  // Update with the latest revision and our activity data
                  updatedDoc._rev = latestDoc._rev;
                  updatedDoc.lastActivity = data.lastActivity.toISOString();
                  updatedDoc.updatedAt = new Date().toISOString();
                } else {
                  console.error(`❌ Could not retrieve latest document for ${userId}`);
                  break;
                }
              } else {
                // Non-conflict error, don't retry
                throw conflictError;
              }
            }
          }
          
          if (!success) {
            console.error(`❌ Failed to update ${userId} after ${maxRetries} retries`);
          }
        } else {
          console.error(`❌ User ${userId} not found in database - cannot update lastActivity`);
        }
      } catch (userError) {
        console.error(`❌ Error updating user activity for ${userId}:`, userError);
      }
    }
    
    lastDatabaseSync = Date.now();
  } catch (error) {
    console.error('❌ Error syncing user activities to database:', error);
  }
};

// Get agent activity (in-memory first, fallback to database)
const getAgentActivity = async (agentId) => {
  if (!agentId) return null;
  
  // Check in-memory first (most recent)
  const inMemory = agentActivityTracker.get(agentId);
  if (inMemory) {
    return {
      agentId: agentId,
      userId: inMemory.userId,
      lastActivity: inMemory.lastActivity
    };
  }
  
  // Fallback to database
  if (!couchDBClient) return null;
  
  try {
    const doc = await cacheManager.getDocument(couchDBClient, 'maia_users', `agent_activity_${agentId}`);
    return {
      agentId: doc.agentId,
      userId: doc.userId,
      lastActivity: new Date(doc.lastActivity)
    };
  } catch (error) {
    return null;
  }
};

// Get all user activities (in-memory + database)
const getAllUserActivities = async () => {
  const activities = [];
  
  // First, get all users from database to ensure we have complete data
  if (couchDBClient) {
    try {
      const result = await couchDBClient.findDocuments('maia_users', {
        selector: {
          _id: { $exists: true }
        }
      });
      
      // Add database activities (source of truth)
      for (const userDoc of result.docs) {
        if (userDoc.lastActivity) {
          activities.push({
            userId: userDoc._id, // Use _id as userId for consistency
            lastActivity: userDoc.lastActivity,
            source: 'database'
          });
        }
      }
    } catch (error) {
      console.error('Error loading activities from database:', error);
    }
  }
  
  // Add in-memory activities (most recent) - these will override database if newer
  for (const [userId, data] of userActivityTracker.entries()) {
    const existingIndex = activities.findIndex(a => a.userId === userId);
    if (existingIndex >= 0) {
      // Update existing entry with in-memory data if it's newer
      activities[existingIndex] = {
        userId: userId,
        lastActivity: data.lastActivity,
        needsDbUpdate: data.needsDbUpdate,
        source: 'memory'
      };
    } else {
      // Add new in-memory activity
      activities.push({
        userId: userId,
        lastActivity: data.lastActivity,
        needsDbUpdate: data.needsDbUpdate,
        source: 'memory'
      });
    }
  }
  
  return activities;
};

// Load activity data from database on startup
const loadUserActivityFromDatabase = async () => {
  if (!couchDBClient) return;
  
  try {
    // Load all users and their lastActivity times
    const result = await couchDBClient.findDocuments('maia_users', {
      selector: {
        userId: { $exists: true }
      }
    });
    
    for (const userDoc of result.docs) {
      if (userDoc.userId && userDoc.lastActivity) {
        userActivityTracker.set(userDoc.userId, {
          lastActivity: new Date(userDoc.lastActivity),
          needsDbUpdate: false // Don't update on startup
        });
      }
    }
  } catch (error) {
    console.error('Error loading user activity from database:', error);
  }
};

// Function to set the client (called from main server)
export const setCouchDBClient = (client) => {
  couchDBClient = client;
  // Load existing user activity data when client is set
  loadUserActivityFromDatabase();
};

// Admin authentication middleware
const requireAdminAuth = async (req, res, next) => {
  try {
    // TEMPORARY: Bypass authentication for testing
    req.adminUser = { _id: 'admin', isAdmin: true };
    return next();
    
    const session = req.session;
    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is admin
    try {
      const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', session.userId);
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
    const users = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
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
    const users = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
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
      const existingUser = await cacheManager.getDocument(couchDBClient, 'maia_users', username);
      if (existingUser) {
        if (existingUser.isAdmin) {
          // Admin user exists - allow new passkey registration (replaces old one)
          return res.json({ 
            message: 'Admin user verified. You can now register a new passkey (this will replace your existing one).',
            username: existingUser._id,
            isAdmin: existingUser.isAdmin,
            canProceedToPasskey: true,
            existingUser: true
          });
        } else {
          // User exists but isn't admin - upgrade them to admin
          const updatedUser = {
            ...existingUser,
            isAdmin: true,
            updatedAt: new Date().toISOString()
          };
          await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
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
      const adminUser = {
        _id: username,
        type: 'admin',
        isAdmin: true,
        createdAt: new Date().toISOString()
      };
      
      await cacheManager.saveDocument(couchDBClient, 'maia_users', adminUser);
      
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
    
    
    // Check cache first (use the same pattern as other endpoints)
    const cachedUsers = cacheManager.getCachedUsers();
    
    if (cachedUsers) {
      return res.json({
        users: cachedUsers,
        count: cachedUsers.length,
        cached: true
      });
    }
    
    
    // Get all users from maia_users database
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    
    const filteredUsers = allUsers.filter(user => {
      // Exclude design documents
        if (user._id.startsWith('_design/')) {
          return false;
        }
      // Exclude configuration documents (not real users)
      if (user._id === 'maia_config') {
        return false;
      }
      // Always include these specific users regardless of admin status
      if (user._id === 'Public User' || user._id === 'wed271') {
        return true;
      }
      // Always include deep link users
      if (user._id.startsWith('deep-')) {
          return true;
        }
        // For all other users, exclude admin users
        const isAdmin = user.isAdmin;
        return !isAdmin;
    });
    
    // Process users with async workflow stage determination
    const processedUsers = await Promise.all(filteredUsers.map(async user => {
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
        
        // Get bucket status for the user
        let bucketStatus = {
          hasFolder: false,
          fileCount: 0,
          totalSize: 0
        };
        
        try {
          const bucketResponse = await fetch(`${getBaseUrl()}/api/bucket/user-status/${user._id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (bucketResponse.ok) {
            const bucketData = await bucketResponse.json();
            bucketStatus = {
              hasFolder: bucketData.hasFolder || false,
              fileCount: bucketData.fileCount || 0,
              totalSize: bucketData.totalSize || 0
            };
          }
        } catch (bucketError) {
          // Bucket check failed, use default values
          console.error(`⚠️ Failed to check bucket status for user ${user._id}:`, bucketError.message);
        }
        
        return {
          userId: user._id,
          displayName: user.displayName || user._id,
          createdAt: user.createdAt,
          hasPasskey: !!user.credentialID,
          hasValidPasskey: hasValidPasskey,
        workflowStage: await determineWorkflowStage(user),
          assignedAgentId: assignedAgentId,
          assignedAgentName: assignedAgentName,
          email: user.email || null,
          bucketStatus: bucketStatus
        };
    }));
    
    const users = processedUsers
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
    
    // Cache the processed users data
    await cacheManager.cacheUsers(users);
    
    
    res.json({ 
      users,
      count: users.length,
      cached: false,
      timestamp: new Date().toISOString()
    });
    
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
    
    // Get user document (cache-aware)
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    
    // Debug: Log email field for user details
    
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    
    // Extract agent information from assignedAgentId (source of truth)
    let currentAgentId = userDoc.assignedAgentId || null;
    let currentAgentName = userDoc.assignedAgentName || null;
    let agentAssignedAt = userDoc.agentAssignedAt || null;
    
    // If we have ownedAgents but no assignedAgentId, use the first owned agent
    if (userDoc.ownedAgents && userDoc.ownedAgents.length > 0 && !currentAgentId) {
      const firstAgent = userDoc.ownedAgents[0];
      currentAgentId = firstAgent.id;
      currentAgentName = firstAgent.name;
      agentAssignedAt = firstAgent.assignedAt;
    }
    
    // If we have assignedAgentId but no agentAssignedAt, try to get it from ownedAgents
    if (currentAgentId && !agentAssignedAt && userDoc.ownedAgents && userDoc.ownedAgents.length > 0) {
      const matchingAgent = userDoc.ownedAgents.find(agent => agent.id === currentAgentId);
      if (matchingAgent && matchingAgent.assignedAt) {
        agentAssignedAt = matchingAgent.assignedAt;
      }
    }
    
    // Get bucket status for the user
    let bucketStatus = {
      hasFolder: false,
      fileCount: 0,
      totalSize: 0
    };
    
    try {
      const bucketResponse = await fetch(`${getBaseUrl()}/api/bucket/user-status/${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (bucketResponse.ok) {
        const bucketData = await bucketResponse.json();
        bucketStatus = {
          hasFolder: bucketData.hasFolder || false,
          fileCount: bucketData.fileCount || 0,
          totalSize: bucketData.totalSize || 0
        };
      }
    } catch (bucketError) {
      // Bucket check failed, use default values
      console.error(`⚠️ Failed to check bucket status for user ${userId}:`, bucketError.message);
    }

    // Get user's approval requests, agents, and knowledge bases
    const userInfo = {
      userId: userDoc._id || userDoc.userId,
      displayName: userDoc.displayName || userDoc._id,
      email: userDoc.email || null,
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
      workflowStage: await determineWorkflowStage(userDoc),
      adminNotes: userDoc.adminNotes || '',
      approvalStatus: userDoc.approvalStatus,
      // Agent information - use assignedAgentId as source of truth
      assignedAgentId: currentAgentId,
      assignedAgentName: currentAgentName,
      ownedAgents: userDoc.ownedAgents || [],
      currentAgentSetAt: userDoc.currentAgentSetAt,
      challenge: userDoc.challenge,
      agentAssignedAt: agentAssignedAt,
      // API Key information
      hasApiKey: !!userDoc.agentApiKey,
      agentApiKey: userDoc.agentApiKey ? 'Present' : 'Missing',
      // Bucket status information
      hasBucket: bucketStatus.hasFolder,
      bucketFileCount: bucketStatus.fileCount,
      bucketTotalSize: bucketStatus.totalSize,
      bucketStatus: bucketStatus,
      approvalRequests: [],
      agents: [],
      knowledgeBases: []
    };
    
    
    
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
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
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
    validateWorkflowConsistency(updatedUser);
    
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
    
    // Invalidate user cache to ensure fresh data
    invalidateUserCache(userId);
    
    // If approved, admin will manually create agent via Admin Panel
    
    res.json({ 
      message: `User ${action} successfully`,
      userId: userId,
      action: action,
      approvalStatus: approvalStatus,
      workflowStage: workflowStage,
      timestamp: new Date().toISOString(),
      nextSteps: action === 'approve' ? 'Admin should create agent manually via Admin Panel' : null
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
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user notes
    const updatedUser = {
      ...userDoc,
      adminNotes: notes,
      updatedAt: new Date().toISOString()
    };
    
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
    
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

// Assign agent to a user or create new agent
router.post('/users/:userId/assign-agent', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { agentId, agentName, action } = req.body;
    
    console.log(`🤖 [NEW AGENT] Assign agent request for user ${userId}`);
    
    // Handle agent creation request
    if (action === 'create') {
      console.log(`🤖 [NEW AGENT] Creating new agent for user: ${userId}`);
      
      // Get user document
      const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
      if (!userDoc) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!userDoc.email) {
        return res.status(400).json({ 
          error: 'User must have an email address to create an agent' 
        });
      }
      
      // Generate agent name based on user ID and date
      const today = new Date();
      const dateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}${today.getFullYear()}`;
      const agentName = `${userId}-agent-${dateStr}`;
      
      // Agent name generated
      
      // Get the current model configuration from database
      console.log(`🤖 [NEW AGENT] Loading current model configuration...`);
      
      const configDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'maia_config');
      
      if (!configDoc || !configDoc.current_model) {
        throw new Error('No model configured for new agents. Please select a model in the Admin Panel Models tab.');
      }
      
      const selectedModel = configDoc.current_model;
      // Using configured model
      
      // Create agent using DigitalOcean API
      const agentData = {
        name: agentName,
        model_uuid: selectedModel.uuid,
        description: `Private AI agent for ${userDoc.email}`,
        instruction: "You are MAIA, a medical AI assistant that can search through a patient's health records in a knowledge base and provide relevant answers to their requests. Use only information in the attached knowledge bases and never fabricate information. There is a lot of redundancy in a patient's knowledge base. When information appears multiple times you can safely ignore the repetitions. To ensure that all medications are accurately listed in the future, the assistant should adopt a systematic approach: Comprehensive Review: Thoroughly examine every chunk in the knowledge base to identify all medication entries, regardless of their status (active or stopped). Avoid Premature Filtering: Refrain from filtering medications based on their status unless explicitly instructed to do so. This ensures that all prescribed medications are included. Consolidation of Information: Use a method to consolidate medication information from all chunks, ensuring that each medication is listed only once, even if it appears multiple times. Always maintain patient privacy and provide evidence-based recommendations.",
        project_id: "90179b7c-8a42-4a71-a036-b4c2bea2fe59",
        region: "tor1"
      };
      
      console.log(`🤖 [NEW AGENT] Calling DigitalOcean API to create agent...`);
      
      try {
        const agentResponse = await doRequest('/v2/gen-ai/agents', {
          method: 'POST',
          body: JSON.stringify(agentData)
        });
        
        const newAgent = agentResponse.agent || agentResponse.data?.agent || agentResponse;
        const newAgentId = newAgent.uuid || newAgent.id;
        
        console.log(`🤖 [NEW AGENT] Agent created successfully: ${newAgentId}`);
        
        // Create API key for the agent
        let agentApiKey = null;
        try {
          console.log(`🔑 [NEW AGENT] Creating API key for agent ${newAgentId}...`);
          const apiKeyResponse = await doRequest(`/v2/gen-ai/agents/${newAgentId}/api_keys`, {
            method: 'POST',
            body: JSON.stringify({
              name: `${userId}-agent-${Date.now()}-api-key`
            })
          });
          
          const apiKeyData = apiKeyResponse.api_key || apiKeyResponse.api_key_info || apiKeyResponse.data || apiKeyResponse;
          agentApiKey = apiKeyData.key || apiKeyData.secret_key;
          
          if (agentApiKey) {
            console.log(`🔑 [NEW AGENT] ✅ API key created successfully for agent ${newAgentId}`);
          } else {
            console.error(`🔑 [NEW AGENT] ❌ Failed to extract API key from response:`, apiKeyResponse);
          }
        } catch (apiKeyError) {
          console.error(`🔑 [NEW AGENT] ❌ Failed to create API key for agent ${newAgentId}:`, apiKeyError.message);
        }
        
        // Update user with assigned agent information and API key
        const updatedUser = {
          ...userDoc,
          assignedAgentId: newAgentId,
          assignedAgentName: agentName,
          agentApiKey: agentApiKey, // Store the API key in the user document
          agentAssignedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
        
        // Cache the API key in memory for immediate access
        if (agentApiKey) {
          // Import the agentApiKeys from server.js context (we'll need to access it)
          // For now, we'll let the getAgentApiKey function handle the database lookup
          console.log(`🔑 [NEW AGENT] API key stored in user document for agent ${newAgentId}`);
        }
        
        // Start tracking deployment for this user
        addToDeploymentTracking(userId, newAgentId, agentName);
        
        // Invalidate user cache to ensure fresh data
        invalidateUserCache(userId);
        
        console.log(`🤖 [NEW AGENT] Agent assignment completed for user ${userId}`);
        
        res.json({ 
          message: 'Agent created and assigned successfully',
          userId: userId,
          agentId: newAgentId,
          agentName: agentName,
          hasApiKey: !!agentApiKey,
          timestamp: new Date().toISOString()
        });
        
      } catch (agentError) {
        console.error(`🤖 [NEW AGENT] Failed to create agent:`, agentError);
        return res.status(500).json({ 
          error: `Failed to create agent: ${agentError.message}` 
        });
      }
      
    } else {
      // Handle existing agent assignment
    if (!agentId || !agentName) {
      return res.status(400).json({ 
        error: 'Missing required fields: agentId and agentName' 
      });
    }
    
    // Get user document
      const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
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
    
      await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
      
      // Start tracking deployment for this user
      addToDeploymentTracking(userId, agentId, agentName);
      
      // Invalidate user cache to ensure fresh data
      invalidateUserCache(userId);
    
    res.json({ 
      message: 'Agent assigned successfully',
      userId: userId,
      agentId: agentId,
      agentName: agentName,
      timestamp: new Date().toISOString()
    });
    }
    
  } catch (error) {
    console.error('Error assigning agent:', error);
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

// Get user's assigned agent
router.get('/users/:userId/assigned-agent', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get fresh data from database
    
    // Fallback to database if cache miss
    
    // Get user document with retry logic for rate limits
    let userDoc = null;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries && !userDoc) {
      try {
        userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
        break;
      } catch (error) {
        if (error.statusCode === 429 && retries < maxRetries - 1) {
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
    
    // Return assigned agent information - use assignedAgentId as source of truth
    const assignedAgentId = userDoc.assignedAgentId || null;
    const assignedAgentName = userDoc.assignedAgentName || null;
    const agentAssignedAt = userDoc.agentAssignedAt || null;
    
    // Cache will be updated on next database read
    
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
    
    // Get the user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    
    // Fix the inconsistency
    if (userDoc.workflowStage === 'approved' && !userDoc.approvalStatus) {
      userDoc.approvalStatus = 'approved';
      userDoc.updatedAt = new Date().toISOString();
      userDoc.fixNotes = 'Fixed workflow inconsistency: set approvalStatus to match workflowStage';
      
      // Save the updated document
      await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
      
      res.json({ 
        message: `User ${userId} data fixed successfully`,
        userId: userId,
        workflowStage: userDoc.workflowStage,
        approvalStatus: userDoc.approvalStatus
      });
    } else {
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
    'no_request_yet': [undefined], // User has passkey but hasn't requested support yet
    'awaiting_approval': ['pending', undefined], // Awaiting approval
    'waiting_for_deployment': ['approved', undefined], // Approved but waiting for agent deployment (allow undefined for legacy)
    'approved': ['approved'], // Fully approved
    'agent_assigned': ['approved', undefined], // Agent has been assigned and deployed (allow undefined for legacy)
    'rejected': ['rejected'], // Rejected
    'suspended': ['suspended'] // Suspended
  };
  
  const validApprovalStatuses = validCombinations[workflowStage] || [];
  
  if (!validApprovalStatuses.includes(approvalStatus)) {
    const error = new Error(`Workflow state inconsistency detected for user ${user._id}: workflowStage="${workflowStage}" but approvalStatus="${approvalStatus}". Valid combinations: ${JSON.stringify(validCombinations)}`);
    console.error('❌ [WORKFLOW VALIDATION ERROR]', error.message);
    console.error('🔍 User data:', {
      _id: user._id,
      workflowStage,
      approvalStatus,
      credentialID: user.credentialID
    });
    throw error;
  }
  
}

async function determineWorkflowStage(user) {
  
  // CRITICAL: If user has an assigned agent, validate against DO API (source of truth)
  if (user.assignedAgentId && user.assignedAgentName) {
    try {
      // Check DO API to see if agent is actually deployed
      const agentResponse = await doRequest(`/v2/gen-ai/agents/${user.assignedAgentId}`);
      const agentData = agentResponse.agent || agentResponse.data || agentResponse;
      const deploymentStatus = agentData.deployment?.status;
      
      if (deploymentStatus === 'STATUS_RUNNING') {
        // Agent is deployed and running - workflow stage MUST be 'agent_assigned'
        if (user.workflowStage !== 'agent_assigned') {
          console.log(`🔧 [WORKFLOW FIX] User ${user._id} has deployed agent ${user.assignedAgentName} but workflow stage is '${user.workflowStage}' - correcting to 'agent_assigned'`);
          // Schedule automatic database fix
          scheduleWorkflowStageFix(user._id, 'agent_assigned');
        }
        return 'agent_assigned';
      } else {
        // Agent exists but not deployed - workflow stage should not be 'agent_assigned'
        console.log(`⚠️ [WORKFLOW WARNING] User ${user._id} has agent ${user.assignedAgentName} but deployment status is '${deploymentStatus}' - not 'agent_assigned'`);
        // Don't return 'agent_assigned' if agent isn't actually running
      }
    } catch (error) {
      console.error(`❌ [WORKFLOW ERROR] Failed to validate agent ${user.assignedAgentId} for user ${user._id}:`, error.message);
      // If we can't validate against DO API, fall back to database state
    }
  }
  
  // Primary source of truth: stored workflowStage field (when no agent or validation fails)
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
  
  // Check if user has made any approval requests by looking for email field
  // If no email and no approvalStatus, they haven't requested support yet
  if (!user.approvalStatus && !user.email) {
    return 'no_request_yet';
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
    return 'approved'; // For now, just return approved
  }
  
  return 'unknown';
}

// Schedule automatic workflow stage fix to prevent database inconsistencies
const scheduleWorkflowStageFix = async (userId, correctWorkflowStage) => {
  try {
    console.log(`🔧 [WORKFLOW FIX] Scheduling automatic fix for user ${userId} to workflow stage '${correctWorkflowStage}'`);
    
    // Get user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      console.error(`❌ [WORKFLOW FIX] User ${userId} not found in database`);
      return;
    }
    
    // Update workflow stage
    const updatedUser = {
      ...userDoc,
      workflowStage: correctWorkflowStage,
      updatedAt: new Date().toISOString()
    };
    
    // Save to database
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
    
    // Invalidate cache
    invalidateUserCache(userId);
    
    console.log(`✅ [WORKFLOW FIX] Successfully updated user ${userId} workflow stage to '${correctWorkflowStage}'`);
  } catch (error) {
    console.error(`❌ [WORKFLOW FIX] Failed to fix workflow stage for user ${userId}:`, error.message);
  }
};

// Admin endpoint to update user workflow stage
router.post('/users/:userId/workflow-stage', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { workflowStage, notes } = req.body;
    
    
    // Validate workflow stage
    const validStages = ['no_passkey', 'no_request_yet', 'awaiting_approval', 'waiting_for_deployment', 'approved', 'rejected', 'suspended', 'agent_assigned'];
    if (!validStages.includes(workflowStage)) {
      return res.status(400).json({ 
        error: `Invalid workflow stage. Must be one of: ${validStages.join(', ')}` 
      });
    }
    
    // Get user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    
    // Update user workflow stage
    const updatedUser = {
      ...userDoc,
      workflowStage: workflowStage,
      adminNotes: notes || `Workflow stage updated to: ${workflowStage}`,
      updatedAt: new Date().toISOString()
    };
    
    // Validate consistency before saving
    try {
      validateWorkflowConsistency(updatedUser);
    } catch (error) {
      console.error(`❌ [WORKFLOW VALIDATION] Inconsistent data detected for user ${userId}:`, error.message);
      // Handle specific workflow transitions
      if (workflowStage === 'awaiting_approval' && userDoc.workflowStage === 'awaiting_approval' && userDoc.approvalStatus === 'approved') {
        // Update approvalStatus to match the new workflow stage
        updatedUser.approvalStatus = 'pending';
      } else if (workflowStage === 'waiting_for_deployment' && userDoc.workflowStage === 'awaiting_approval' && userDoc.approvalStatus === 'pending') {
        // Update approvalStatus to match the new workflow stage
        updatedUser.approvalStatus = 'approved';
      } else {
        throw error; // Re-throw if it's not a recognized transition
      }
    }
    
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
    
    // Invalidate user cache to ensure fresh data
    invalidateUserCache(userId);
    
    
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
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Set passkey reset flag and clear the passkey information
    const resetExpiryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const updatedUser = {
      ...userDoc,
      credentialID: undefined,
      credentialPublicKey: undefined,
      counter: undefined,
      transports: undefined,
      challenge: undefined,
      passkeyResetFlag: true,
      passkeyResetExpiry: resetExpiryTime.toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Save the updated user document
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
    
    // Set a timer to clear the reset flag after 1 hour
    setTimeout(async () => {
      try {
        const currentUserDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
        if (currentUserDoc && currentUserDoc.passkeyResetFlag) {
          const clearedUser = {
            ...currentUserDoc,
            passkeyResetFlag: undefined,
            passkeyResetExpiry: undefined,
            updatedAt: new Date().toISOString()
          };
          await cacheManager.saveDocument(couchDBClient, 'maia_users', clearedUser);
          console.log(`⏰ Passkey reset flag expired and cleared for user: ${userId}`);
        }
      } catch (error) {
        console.error(`❌ Error clearing passkey reset flag for user ${userId}:`, error);
      }
    }, 60 * 60 * 1000); // 1 hour
    
    console.log(`✅ Admin reset passkey for user: ${userId} - Reset flag set for 1 hour`);
    
    res.json({
      success: true,
      message: `Passkey reset successfully for user ${userId}. They have 1 hour to register a new passkey.`,
      userId: userId,
      resetExpiry: resetExpiryTime.toISOString(),
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
      allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
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

// API endpoint to get user activities for Admin Panel
router.get('/agent-activities', async (req, res) => {
  try {
    const activities = await getAllUserActivities();
    res.json({
      success: true,
      activities: activities
    });
  } catch (error) {
    console.error('Error getting user activities:', error);
    res.status(500).json({ error: 'Failed to get user activities' });
  }
});

// API endpoint to track user activities from frontend
router.post('/agent-activities', async (req, res) => {
  try {
    const { agentId, userId, action } = req.body;
    
    if (userId) {
      // Track general user activity (any frontend interaction)
      updateUserActivity(userId);
    } else {
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking activity:', error);
    res.status(500).json({ error: 'Failed to track activity' });
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
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update assigned agent fields
    const updatedUserDoc = {
      ...userDoc,
      assignedAgentId: agentId,
      assignedAgentName: agentName,
      agentAssignedAt: agentId ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    };
    
    // Save updated document
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
    
    // Start tracking deployment for this user
    addToDeploymentTracking(userId, agentId, agentName);
    
    // Invalidate user cache to ensure fresh data
    invalidateUserCache(userId);
    
    
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
    
    
    const syncResults = [];
    
    // Get all users from database
    const usersResponse = await couchDBClient.findDocuments('maia_users', {
      selector: {
        assignedAgentId: { $exists: true }
      }
    });
    
    
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
            
            await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
            
            // Cache will be updated on next database read
            
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
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const status = {
      userId: userId,
      hasAssignedAgent: !!userDoc.assignedAgentId,
      assignedAgentId: userDoc.assignedAgentId || null,
      assignedAgentName: userDoc.assignedAgentName || null,
      agentAssignedAt: userDoc.agentAssignedAt || null,
      isConsistent: true // No more currentAgentId to check consistency against
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

// Fix consistency issues endpoint
router.post('/database/fix-consistency', async (req, res) => {
  try {
    const { inconsistencies } = req.body;
    
    if (!inconsistencies || !Array.isArray(inconsistencies)) {
      return res.status(400).json({ error: 'Invalid inconsistencies data' });
    }
    
    console.log(`🔧 [CONSISTENCY FIX] Processing ${inconsistencies.length} inconsistencies...`);
    
    const results = [];
    
    for (const issue of inconsistencies) {
      try {
        if (issue.type === 'agent_assignment_mismatch') {
          // Find user and update their agent assignment
          const userQuery = {
            selector: {
              $or: [
                { _id: issue.userId },
                { userId: issue.userId }
              ]
            },
            limit: 1
          };
          
          const userResult = await couchDBClient.findDocuments('maia_users', userQuery);
          
          if (userResult.docs.length > 0) {
            const userDoc = userResult.docs[0];
            const updatedDoc = {
              ...userDoc,
              assignedAgentId: issue.expectedAgentId,
              assignedAgentName: issue.agentName,
              workflowStage: 'agent_assigned', // Update workflow stage when agent is assigned
              approvalStatus: 'approved', // Set approval status when agent is assigned
              agentAssignedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedDoc);
            
            // Start tracking deployment for this user
            addToDeploymentTracking(issue.userId, issue.expectedAgentId, issue.agentName);
            
            // Invalidate user cache to ensure fresh data
            invalidateUserCache(issue.userId);
            
            console.log(`✅ [CONSISTENCY FIX] Assigned agent ${issue.agentName} to user ${issue.userId} and updated workflow stage to 'agent_assigned'`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              agentId: issue.expectedAgentId,
              agentName: issue.agentName,
              status: 'fixed'
            });
          } else {
            console.log(`❌ [CONSISTENCY FIX] User ${issue.userId} not found in database`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'failed',
              error: 'User not found'
            });
          }
        } else if (issue.type === 'workflow_stage_mismatch') {
          // Fix workflow stage mismatch
          const userQuery = {
            selector: {
              $or: [
                { _id: issue.userId },
                { userId: issue.userId }
              ]
            },
            limit: 1
          };
          
          const userResult = await couchDBClient.findDocuments('maia_users', userQuery);
          
          if (userResult.docs.length > 0) {
            const userDoc = userResult.docs[0];
            const updatedDoc = {
              ...userDoc,
              workflowStage: issue.expectedWorkflowStage,
              approvalStatus: issue.expectedWorkflowStage === 'agent_assigned' ? 'approved' : userDoc.approvalStatus,
              updatedAt: new Date().toISOString()
            };
            
            await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedDoc);
            
            // Invalidate user cache to ensure fresh data
            invalidateUserCache(issue.userId);
            
            console.log(`✅ [CONSISTENCY FIX] Fixed workflow stage for user ${issue.userId}: ${issue.currentWorkflowStage} → ${issue.expectedWorkflowStage}`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'fixed',
              change: `${issue.currentWorkflowStage} → ${issue.expectedWorkflowStage}`
            });
          } else {
            console.log(`❌ [CONSISTENCY FIX] User ${issue.userId} not found in database`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'failed',
              error: 'User not found'
            });
          }
        } else if (issue.type === 'orphaned_agent') {
          // Remove orphaned agent assignment
          const userQuery = {
            selector: {
              $or: [
                { _id: issue.userId },
                { userId: issue.userId }
              ]
            },
            limit: 1
          };
          
          const userResult = await couchDBClient.findDocuments('maia_users', userQuery);
          
          if (userResult.docs.length > 0) {
            const userDoc = userResult.docs[0];
            const updatedDoc = {
              ...userDoc,
              assignedAgentId: null,
              assignedAgentName: null
            };
            
            await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedDoc);
            
            console.log(`✅ [CONSISTENCY FIX] Removed orphaned agent from user ${issue.userId}`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'fixed'
            });
          } else {
            console.log(`❌ [CONSISTENCY FIX] User ${issue.userId} not found in database`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'failed',
              error: 'User not found'
            });
          }
        } else if (issue.type === 'security_violation') {
          // Remove invalid agent assignment
          const userQuery = {
            selector: {
              $or: [
                { _id: issue.userId },
                { userId: issue.userId }
              ]
            },
            limit: 1
          };
          
          const userResult = await couchDBClient.findDocuments('maia_users', userQuery);
          
          if (userResult.docs.length > 0) {
            const userDoc = userResult.docs[0];
            const updatedDoc = {
              ...userDoc,
              assignedAgentId: null,
              assignedAgentName: null
            };
            
            await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedDoc);
            
            console.log(`✅ [CONSISTENCY FIX] Removed invalid agent from user ${issue.userId}`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'fixed'
            });
          } else {
            console.log(`❌ [CONSISTENCY FIX] User ${issue.userId} not found in database`);
            results.push({
              type: issue.type,
              userId: issue.userId,
              status: 'failed',
              error: 'User not found'
            });
          }
        }
      } catch (error) {
        console.error(`❌ [CONSISTENCY FIX] Error fixing issue for user ${issue.userId}:`, error);
        results.push({
          type: issue.type,
          userId: issue.userId,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.status === 'fixed').length;
    const failCount = results.filter(r => r.status === 'failed').length;
    
    console.log(`🔧 [CONSISTENCY FIX] Completed: ${successCount} fixed, ${failCount} failed`);
    
    res.json({
      success: true,
      results: results,
      summary: {
        total: inconsistencies.length,
        fixed: successCount,
        failed: failCount
      }
    });
    
  } catch (error) {
    console.error('❌ [CONSISTENCY FIX] Error fixing consistency issues:', error);
    res.status(500).json({ error: 'Failed to fix consistency issues' });
  }
});

// New endpoint for high-frequency activity updates (in-memory only)
router.post('/update-activity', async (req, res) => {
  try {
    const { userId, action } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    // Only update in-memory activity tracker (no database writes)
    updateUserActivity(userId);
    
    res.json({ 
      success: true, 
      message: 'Activity updated in memory',
      userId,
      action 
    });
  } catch (error) {
    console.error('❌ Error updating activity:', error);
    res.status(500).json({ message: 'Failed to update activity' });
  }
});

// Get all agents - PROTECTED (cached)
router.get('/agents', requireAdminAuth, async (req, res) => {
  try {
    
    // Check cache first
    const cachedAgents = cacheManager.getCachedAgents();
    
    if (cachedAgents) {
      return res.json({
        agents: cachedAgents,
        count: cachedAgents.length,
        cached: true
      });
    }
    
    
    // Add delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get agents from DigitalOcean API (same as /api/agents)
    const agents = await doRequest('/v2/gen-ai/agents');
    
    // Transform agents to match frontend expectations (simplified to avoid multiple API calls)
    const allAgents = (agents.agents || []).map((agent) => {
      return {
        id: agent.id,
        name: agent.name,
        status: agent.status || 'unknown',
        model: agent.model || 'unknown',
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
        knowledgeBases: [], // Simplified - avoid additional API calls
        endpoint: null,
        description: null
      };
    });
    
    // Cache the agents data
    await cacheManager.cacheAgents(allAgents);
    
    
    res.json({
      agents: allAgents,
      count: allAgents.length,
      cached: false
    });
    
  } catch (error) {
    console.error('❌ [ADMIN-AGENTS] Failed to fetch agents:', error);
    
    // If rate limited, serve empty data instead of failing
    if (error.message.includes('Too many requests') || error.message.includes('429') || error.message.includes('DigitalOcean API error: 429')) {
      console.log('⚠️ [ADMIN-AGENTS] Rate limited - serving empty agents data');
      return res.json({
        agents: [],
        count: 0,
        cached: false,
        rateLimited: true,
        message: 'Agents data temporarily unavailable due to rate limiting'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch agents',
      details: error.message 
    });
  }
});

// Get all knowledge bases - PROTECTED (cached)
router.get('/knowledge-bases', requireAdminAuth, async (req, res) => {
  try {
    
    // Check cache first
    const cachedKBs = cacheManager.getCachedKnowledgeBases();
    
    if (cachedKBs) {
      return res.json({
        knowledgeBases: cachedKBs,
        count: cachedKBs.length,
        cached: true
      });
    }
    
    if (!couchDBClient) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Get all knowledge bases from maia_knowledge_bases database
    const allKBs = await cacheManager.getAllDocuments(couchDBClient, 'maia_knowledge_bases');
    
    // Transform to expected format
    const knowledgeBases = allKBs.map(doc => ({
      id: doc.kbId || doc._id,
      name: doc.kbName || doc.name,
      description: doc.description || 'No description',
      isProtected: !!doc.isProtected,
      owner: doc.owner || 'Unknown',
      createdAt: doc.createdAt || doc.timestamp,
      status: doc.status || 'unknown'
    })).filter(kb => !kb.id.startsWith('_design/'));
    
    // Found knowledge bases
    
    res.json({
      knowledgeBases: knowledgeBases,
      count: knowledgeBases.length
    });
    
  } catch (error) {
    console.error('❌ [ADMIN-KB] Failed to fetch knowledge bases:', error);
    
    // If rate limited, serve empty data instead of failing
    if (error.message.includes('Too many requests') || error.message.includes('429') || error.message.includes('DigitalOcean API error: 429')) {
      console.log('⚠️ [ADMIN-KB] Rate limited - serving empty knowledge bases data');
      return res.json({
        knowledgeBases: [],
        count: 0,
        rateLimited: true,
        message: 'Knowledge bases data temporarily unavailable due to rate limiting'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch knowledge bases',
      details: error.message 
    });
  }
});

// Models configuration endpoints
router.get('/models', requireAdminAuth, async (req, res) => {
  try {
    
    // Check cache first
    const cachedModels = cacheManager.getCachedModels();
    
    if (cachedModels) {
      return res.json({
        models: cachedModels,
        count: cachedModels.length,
        cached: true
      });
    }
    
    const models = await doRequest('/v2/gen-ai/models');
    const modelArray = models.models || [];
    
    if (!Array.isArray(modelArray)) {
      return res.status(500).json({ error: 'Failed to get models from DigitalOcean API' });
    }
    
    const validModels = modelArray.filter(m => m && m.name);
    
    // Cache the models data
    await cacheManager.cacheModels(validModels);
    
    
    res.json({
      models: validModels,
      count: validModels.length,
      cached: false
    });
    
  } catch (error) {
    console.error('❌ [MODELS] Failed to fetch models:', error);
    res.status(500).json({ error: `Failed to fetch models: ${error.message}` });
  }
});

router.get('/models/current', requireAdminAuth, async (req, res) => {
  try {
    
    // Check cache first
    const cachedCurrentModel = cacheManager.getCachedCurrentModel();
    if (cachedCurrentModel) {
      return res.json({
        model: cachedCurrentModel,
        cached: true
      });
    }
    
    const configDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'maia_config');
    
    if (!configDoc || !configDoc.current_model) {
      return res.status(404).json({ error: 'No current model configured' });
    }
    
    // Cache the current model
    await cacheManager.cacheCurrentModel(configDoc.current_model);
    
    
    res.json({
      model: configDoc.current_model,
      cached: false
    });
    
  } catch (error) {
    console.error('❌ [MODELS] Failed to load current model:', error);
    res.status(500).json({ error: `Failed to load current model: ${error.message}` });
  }
});

router.post('/models/current', requireAdminAuth, async (req, res) => {
  try {
    const { model_uuid, model_name, model_description } = req.body;
    
    if (!model_uuid || !model_name) {
      return res.status(400).json({ error: 'model_uuid and model_name are required' });
    }
    
    console.log(`🤖 [MODELS] Setting current model: ${model_name} (${model_uuid})`);
    
    // Get or create config document
    let configDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'maia_config');
    
    if (!configDoc) {
      configDoc = {
        _id: 'maia_config',
        type: 'config',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    
    // Update current model
    configDoc.current_model = {
      uuid: model_uuid,
      name: model_name,
      description: model_description || null,
      selectedAt: new Date().toISOString()
    };
    
    configDoc.updatedAt = new Date().toISOString();
    
    await cacheManager.saveDocument(couchDBClient, 'maia_users', configDoc);
    
    console.log(`✅ [MODELS] Current model set to: ${model_name}`);
    
    res.json({
      message: 'Current model updated successfully',
      model: configDoc.current_model
    });
    
  } catch (error) {
    console.error('❌ [MODELS] Failed to set current model:', error);
    res.status(500).json({ error: `Failed to set current model: ${error.message}` });
  }
});

// Generate API key for user's existing agent
router.post('/users/:userId/generate-api-key', requireAdminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`🔑 [GENERATE API KEY] Request for user: ${userId}`);
    
    // Get user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user has an assigned agent
    const agentId = userDoc.assignedAgentId;
    if (!agentId) {
      return res.status(400).json({ 
        error: 'User does not have an assigned agent. Please assign an agent first.' 
      });
    }
    
    // Check if user already has an API key
    if (userDoc.agentApiKey) {
      return res.status(400).json({ 
        error: 'User already has an API key. No need to generate a new one.' 
      });
    }
    
    console.log(`🔑 [GENERATE API KEY] Creating API key for agent ${agentId}...`);
    
    try {
      // Create API key via DigitalOcean API
      const apiKeyResponse = await doRequest(`/v2/gen-ai/agents/${agentId}/api_keys`, {
        method: 'POST',
        body: JSON.stringify({
          name: `${userId}-agent-${Date.now()}-api-key`
        })
      });
      
      const apiKeyData = apiKeyResponse.api_key || apiKeyResponse.api_key_info || apiKeyResponse.data || apiKeyResponse;
      const agentApiKey = apiKeyData.key || apiKeyData.secret_key;
      
      if (!agentApiKey) {
        console.error(`🔑 [GENERATE API KEY] ❌ Failed to extract API key from response:`, apiKeyResponse);
        return res.status(500).json({ 
          error: 'Failed to extract API key from DigitalOcean response' 
        });
      }
      
      console.log(`🔑 [GENERATE API KEY] ✅ API key created successfully for agent ${agentId}`);
      
      // Update user document with the new API key
      const updatedUser = {
        ...userDoc,
        agentApiKey: agentApiKey,
        updatedAt: new Date().toISOString()
      };
      
      await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
      
      // Invalidate user cache to ensure fresh data
      invalidateUserCache(userId);
      
      console.log(`🔑 [GENERATE API KEY] ✅ API key saved to database for user ${userId}`);
      
      res.json({ 
        message: 'API key generated successfully',
        hasApiKey: true,
        timestamp: new Date().toISOString()
      });
      
    } catch (apiKeyError) {
      console.error(`🔑 [GENERATE API KEY] ❌ Failed to create API key for agent ${agentId}:`, apiKeyError.message);
      return res.status(500).json({ 
        error: `Failed to create API key: ${apiKeyError.message}` 
      });
    }
    
  } catch (error) {
    console.error(`🔑 [GENERATE API KEY] ❌ Error:`, error);
    res.status(500).json({ 
      error: `Failed to generate API key: ${error.message}` 
    });
  }
});

// Export functions for use in main server
export { updateUserActivity, getAllUserActivities, checkAgentDeployments, addToDeploymentTracking };

export default router;
