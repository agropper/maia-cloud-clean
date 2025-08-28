import express from 'express';
import maia2Client from '../utils/maia2-client.js';

const router = express.Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Initialize MAIA2 client on first request
const ensureMaia2Initialized = async (req, res, next) => {
  if (!maia2Client.isInitialized) {
    try {
      await maia2Client.initialize();
    } catch (error) {
      console.error('❌ Failed to initialize MAIA2 client:', error.message);
      return res.status(500).json({
        success: false,
        message: 'MAIA2 system unavailable',
        error: error.message
      });
    }
  }
  next();
};

// Set current user from session
const setCurrentUser = (req, res, next) => {
  if (req.session && req.session.user) {
    maia2Client.setCurrentUser(req.session.user);
  }
  next();
};

// Check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// ============================================================================
// HEALTH AND STATUS ENDPOINTS
// ============================================================================

// Health check for maia2 system
router.get('/health', ensureMaia2Initialized, async (req, res) => {
  try {
    const health = await maia2Client.healthCheck();
    res.json({
      success: true,
      message: 'MAIA2 system health check',
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Get system status
router.get('/status', ensureMaia2Initialized, async (req, res) => {
  try {
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
        const info = await maia2Client.getDatabaseInfo(dbName);
        status[dbName] = {
          exists: true,
          docCount: info.doc_count,
          diskSize: info.disk_size,
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
      message: 'MAIA2 system status',
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Status check failed',
      error: error.message
    });
  }
});

// ============================================================================
// USER MANAGEMENT ENDPOINTS
// ============================================================================

// Create new user
router.post('/users', ensureMaia2Initialized, async (req, res) => {
  try {
    const { username, email, displayName } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    // Check if user already exists
    const existingUser = await maia2Client.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists'
      });
    }

    const user = await maia2Client.createUser({
      username,
      email,
      displayName
    });

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: 'system',
      action: 'user_created',
      resourceType: 'user',
      resourceId: user._id,
      details: { username, email, displayName },
      severity: 'low',
      affectsPrivacy: false,
      affectsSecurity: false,
      complianceTags: []
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    console.error('❌ Failed to create user:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

// Get user by username
router.get('/users/:username', ensureMaia2Initialized, requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Users can only access their own profile unless admin
    if (req.session.user.username !== username && !req.session.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await maia2Client.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User retrieved successfully',
      data: user
    });
  } catch (error) {
    console.error('❌ Failed to get user:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get user',
      error: error.message
    });
  }
});

// Update user
router.put('/users/:username', ensureMaia2Initialized, requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const updates = req.body;
    
    // Users can only update their own profile unless admin
    if (req.session.user.username !== username && !req.session.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await maia2Client.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatedUser = await maia2Client.updateUser(user._id, updates);

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: req.session.user.username,
      action: 'user_updated',
      resourceType: 'user',
      resourceId: user._id,
      details: { username, updates },
      severity: 'medium',
      affectsPrivacy: true,
      affectsSecurity: false,
      complianceTags: []
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('❌ Failed to update user:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// List users (admin only)
router.get('/users', ensureMaia2Initialized, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, skip = 0, status, approvalStatus } = req.query;
    
    const users = await maia2Client.listUsers({
      limit: parseInt(limit),
      skip: parseInt(skip),
      status,
      approvalStatus
    });

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: users,
      pagination: {
        limit: parseInt(limit),
        skip: parseInt(skip),
        total: users.length
      }
    });
  } catch (error) {
    console.error('❌ Failed to list users:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to list users',
      error: error.message
    });
  }
});

// ============================================================================
// AGENT MANAGEMENT ENDPOINTS
// ============================================================================

// Create new agent
router.post('/agents', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const { name, description, agentType, model, systemPrompt, temperature, maxTokens } = req.body;
    
    if (!name || !model || !systemPrompt) {
      return res.status(400).json({
        success: false,
        message: 'Name, model, and system prompt are required'
      });
    }

    const agent = await maia2Client.createAgent({
      name,
      description,
      agentType: agentType || 'personal',
      model,
      systemPrompt,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 4096
    });

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: req.session.user.username,
      action: 'agent_created',
      resourceType: 'agent',
      resourceId: agent._id,
      details: { name, agentType, model },
      severity: 'low',
      affectsPrivacy: false,
      affectsSecurity: false,
      complianceTags: []
    });

    res.status(201).json({
      success: true,
      message: 'Agent created successfully',
      data: agent
    });
  } catch (error) {
    console.error('❌ Failed to create agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create agent',
      error: error.message
    });
  }
});

// Get user's agents
router.get('/agents', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const agents = await maia2Client.getUserAgents(req.session.user.username);

    res.json({
      success: true,
      message: 'Agents retrieved successfully',
      data: agents
    });
  } catch (error) {
    console.error('❌ Failed to get agents:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get agents',
      error: error.message
    });
  }
});

// Get specific agent
router.get('/agents/:agentId', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Get agent details (this would need to be implemented in the client)
    // For now, we'll return a placeholder
    res.json({
      success: true,
      message: 'Agent details retrieved successfully',
      data: { id: agentId, message: 'Agent details endpoint to be implemented' }
    });
  } catch (error) {
    console.error('❌ Failed to get agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get agent',
      error: error.message
    });
  }
});

// Update agent
router.put('/agents/:agentId', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const { agentId } = req.params;
    const updates = req.body;
    
    const updatedAgent = await maia2Client.updateAgent(agentId, updates);

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: req.session.user.username,
      action: 'agent_updated',
      resourceType: 'agent',
      resourceId: agentId,
      details: { updates },
      severity: 'medium',
      affectsPrivacy: false,
      affectsSecurity: false,
      complianceTags: []
    });

    res.json({
      success: true,
      message: 'Agent updated successfully',
      data: updatedAgent
    });
  } catch (error) {
    console.error('❌ Failed to update agent:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update agent',
      error: error.message
    });
  }
});

// ============================================================================
// KNOWLEDGE BASE MANAGEMENT ENDPOINTS
// ============================================================================

// Create new knowledge base
router.post('/knowledge-bases', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const { name, description, kbType, contentType } = req.body;
    
    if (!name || !kbType || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'Name, type, and content type are required'
      });
    }

    const knowledgeBase = await maia2Client.createKnowledgeBase({
      name,
      description,
      kbType,
      contentType
    });

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: req.session.user.username,
      action: 'knowledge_base_created',
      resourceType: 'knowledge_base',
      resourceId: knowledgeBase._id,
      details: { name, kbType, contentType },
      severity: 'low',
      affectsPrivacy: false,
      affectsSecurity: false,
      complianceTags: []
    });

    res.status(201).json({
      success: true,
      message: 'Knowledge base created successfully',
      data: knowledgeBase
    });
  } catch (error) {
    console.error('❌ Failed to create knowledge base:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create knowledge base',
      error: error.message
    });
  }
});

// Get user's knowledge bases
router.get('/knowledge-bases', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const knowledgeBases = await maia2Client.getUserKnowledgeBases(req.session.user.username);

    res.json({
      success: true,
      message: 'Knowledge bases retrieved successfully',
      data: knowledgeBases
    });
  } catch (error) {
    console.error('❌ Failed to get knowledge bases:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get knowledge bases',
      error: error.message
    });
  }
});

// ============================================================================
// RESOURCE ALLOCATION ENDPOINTS
// ============================================================================

// Request resource allocation
router.post('/resources/request', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const { resourceType, amount, unit, justification, urgency } = req.body;
    
    if (!resourceType || !amount || !unit || !justification) {
      return res.status(400).json({
        success: false,
        message: 'Resource type, amount, unit, and justification are required'
      });
    }

    const resource = await maia2Client.requestResourceAllocation({
      resourceType,
      allocated: amount,
      unit,
      justification,
      urgency: urgency || 'medium'
    });

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: req.session.user.username,
      action: 'resource_allocation_requested',
      resourceType: 'resource',
      resourceId: resource._id,
      details: { resourceType, amount, unit, justification, urgency },
      severity: 'medium',
      affectsPrivacy: false,
      affectsSecurity: false,
      complianceTags: []
    });

    res.status(201).json({
      success: true,
      message: 'Resource allocation requested successfully',
      data: resource
    });
  } catch (error) {
    console.error('❌ Failed to request resource allocation:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to request resource allocation',
      error: error.message
    });
  }
});

// ============================================================================
// ADMIN APPROVAL ENDPOINTS
// ============================================================================

// Submit approval request
router.post('/approvals', ensureMaia2Initialized, requireAuth, setCurrentUser, async (req, res) => {
  try {
    const { approvalType, requestedResources, justification, urgency } = req.body;
    
    if (!approvalType || !requestedResources || !justification) {
      return res.status(400).json({
        success: false,
        message: 'Approval type, requested resources, and justification are required'
      });
    }

    const approval = await maia2Client.submitApprovalRequest({
      approvalType,
      requestedResources,
      justification,
      urgency: urgency || 'medium'
    });

    // Log audit event
    await maia2Client.logAuditEvent({
      userId: req.session.user.username,
      action: 'approval_request_submitted',
      resourceType: 'approval',
      resourceId: approval._id,
      details: { approvalType, requestedResources, justification, urgency },
      severity: 'medium',
      affectsPrivacy: false,
      affectsSecurity: false,
      complianceTags: []
    });

    res.status(201).json({
      success: true,
      message: 'Approval request submitted successfully',
      data: approval
    });
  } catch (error) {
    console.error('❌ Failed to submit approval request:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to submit approval request',
      error: error.message
    });
  }
});

// Get pending approvals (admin only)
router.get('/approvals/pending', ensureMaia2Initialized, requireAdmin, setCurrentUser, async (req, res) => {
  try {
    const approvals = await maia2Client.getPendingApprovals();

    res.json({
      success: true,
      message: 'Pending approvals retrieved successfully',
      data: approvals
    });
  } catch (error) {
    console.error('❌ Failed to get pending approvals:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending approvals',
      error: error.message
    });
  }
});

// ============================================================================
// AUDIT LOG ENDPOINTS
// ============================================================================

// Get audit logs (admin only)
router.get('/audit-logs', ensureMaia2Initialized, requireAdmin, async (req, res) => {
  try {
    const { limit = 100, skip = 0, userId, action, resourceType, startDate, endDate } = req.query;
    
    // This would need to be implemented in the client
    // For now, return a placeholder
    res.json({
      success: true,
      message: 'Audit logs retrieved successfully',
      data: [],
      message: 'Audit logs endpoint to be implemented'
    });
  } catch (error) {
    console.error('❌ Failed to get audit logs:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs',
      error: error.message
    });
  }
});

export default router;
