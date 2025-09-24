import { CouchDBClient } from './couchdb-client.js';

/**
 * MAIA2 Database Client for Enhanced Multi-User Privacy System
 * Provides comprehensive access to all maia2 databases with proper access control
 */
class Maia2Client {
  constructor() {
    this.couchDBClient = null;
    this.currentUser = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the CouchDB connection
   */
  async initialize() {
    try {
      const serviceUrl = process.env.CLOUDANT_URL || process.env.COUCHDB_URL;
      if (!serviceUrl) {
        throw new Error('CLOUDANT_URL or COUCHDB_URL environment variable not set');
      }

      this.couchDBClient = new CouchDBClient();
      
      // Test connection by trying to get service info
      const serviceInfo = this.couchDBClient.getServiceInfo();
      this.isInitialized = true;
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize MAIA2 Client:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Set the current authenticated user for access control
   */
  setCurrentUser(user) {
    this.currentUser = user;
  }

  /**
   * Get the current authenticated user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user has permission to access a resource
   */
  hasPermission(userId, resourceOwner, resourceType = 'read') {
    if (!this.currentUser) return false;
    
    // Admin users have full access
    if (this.currentUser.isAdmin) return true;
    
    // Users can always access their own resources
    if (this.currentUser.username === resourceOwner) return true;
    
    // Check specific permissions based on resource type
    switch (resourceType) {
      case 'read':
        // Users can read public resources or resources shared with them
        return true; // This will be refined based on specific resource permissions
      case 'write':
      case 'admin':
        // Only owners and explicitly granted users can write/admin
        return false;
      default:
        return false;
    }
  }

  // ============================================================================
  // USER MANAGEMENT METHODS
  // ============================================================================

  /**
   * Create a new user
   */
  async createUser(userData) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      const user = {
        _id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        ...userData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        approvalStatus: 'pending',
        privacyLevel: 'private',
        maxAgents: 1,
        maxKnowledgeBases: 2,
        maxStorageGB: 1,
        loginCount: 0
      };

      const result = await this.couchDBClient.saveDocument('maia_users', user);

      return { ...user, _id: result.id, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to create user:', error.message);
      throw error;
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      // For now, get all users and filter by username
      // In production, this would use a proper CouchDB view
      const allUsers = await this.couchDBClient.getAllDocuments('maia_users');
      
      // Filter for users with type='user' OR users without type field (legacy users)
      const filteredUsers = allUsers.filter(u => (u.type === 'user' || !u.type));
      
      // Look for user by username or _id
      const user = filteredUsers.find(u => u.username === username || u._id === username);
      if (user) {
      }
      
      return user || null;
    } catch (error) {
      console.error('❌ Failed to get user by username:', error.message);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      // Get current user document
      const currentUser = await this.couchDBClient.getDocument('maia_users', userId);

      const updatedUser = {
        ...currentUser,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const result = await this.couchDBClient.saveDocument('maia_users', updatedUser);

      return { ...updatedUser, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to update user:', error.message);
      throw error;
    }
  }

  /**
   * Update user approval status
   */
  async updateUserApprovalStatus(username, approvalStatus, adminNotes = '') {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      // Get user by username first
      const user = await this.getUserByUsername(username);
      if (!user) {
        throw new Error(`User ${username} not found`);
      }

      const updates = {
        approvalStatus: approvalStatus,
        adminNotes: adminNotes,
        approvalDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // If approved, also set up initial resources
      if (approvalStatus === 'approved') {
        updates.status = 'active';
        updates.approvedAt = new Date().toISOString();
      } else if (approvalStatus === 'rejected') {
        updates.status = 'suspended';
        updates.rejectedAt = new Date().toISOString();
      }

      const result = await this.updateUser(user._id, updates);

      return result;
    } catch (error) {
      console.error('❌ Failed to update user approval status:', error.message);
      throw error;
    }
  }

  /**
   * List users with filtering and pagination
   */
  async listUsers(options = {}) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      const { limit = 50, skip = 0, status, approvalStatus } = options;
      
      // Get all users and filter in memory for now
      // In production, this would use proper CouchDB views
      const allUsers = await this.couchDBClient.getAllDocuments('maia_users');
      
      // Filter for users with type='user' OR users without type field (legacy users)
      // Also include users with _id that matches common user patterns (like wed271)
      let filteredUsers = allUsers.filter(u => {
        // Include users with type='user'
        if (u.type === 'user') return true;
        // Include users without type field (legacy users)
        if (!u.type) return true;
        // Include users with userId field (like wed271)
        if (u.userId) return true;
        // Include users whose _id doesn't start with underscore or contain "design"
        if (u._id && !u._id.startsWith('_') && !u._id.includes('design')) return true;
        return false;
      });
      
      if (status) {
        filteredUsers = filteredUsers.filter(u => u.status === status);
      }
      
      if (approvalStatus) {
        filteredUsers = filteredUsers.filter(u => u.approvalStatus === approvalStatus);
      }
      
      // Apply pagination
      return filteredUsers.slice(skip, skip + limit);
    } catch (error) {
      console.error('❌ Failed to list users:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // AGENT MANAGEMENT METHODS
  // ============================================================================

  /**
   * Create a new agent
   */
  async createAgent(agentData) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      const agent = {
        _id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'agent',
        ...agentData,
        owner: this.currentUser.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        knowledgeBases: [],
        usageCount: 0,
        maxContextLength: 8192
      };

      const result = await this.couchDBClient.saveDocument('maia2_agents', agent);

      return { ...agent, _id: result.id, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to create agent:', error.message);
      throw error;
    }
  }

  /**
   * Get agents owned by current user
   */
  async getUserAgents(username = null) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    const targetUser = username || (this.currentUser ? this.currentUser.username : null);
    if (!targetUser) throw new Error('No user specified');

    try {
      // Get all agents and filter by owner
      const allAgents = await this.couchDBClient.getAllDocuments('maia2_agents');
      return allAgents.filter(a => a.type === 'agent' && a.owner === targetUser);
    } catch (error) {
      console.error('❌ Failed to get user agents:', error.message);
      throw error;
    }
  }

  /**
   * Update agent
   */
  async updateAgent(agentId, updates) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      const currentAgent = await this.couchDBClient.getDocument('maia2_agents', agentId);

      // Check permissions
      if (!this.hasPermission(this.currentUser?.username, currentAgent.owner, 'write')) {
        throw new Error('Insufficient permissions to update agent');
      }

      const updatedAgent = {
        ...currentAgent,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const result = await this.couchDBClient.saveDocument('maia2_agents', updatedAgent);

      return { ...updatedAgent, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to update agent:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // KNOWLEDGE BASE MANAGEMENT METHODS
  // ============================================================================

  /**
   * Create a new knowledge base
   */
  async createKnowledgeBase(kbData) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      const knowledgeBase = {
        _id: `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'knowledge_base',
        ...kbData,
        owner: this.currentUser.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        isIndexed: false,
        indexStatus: 'pending',
        documentCount: 0,
        totalSizeBytes: 0,
        isPublic: false,
        sharedWith: [],
        accessLevel: 'read',
        accessCount: 0
      };

      const result = await this.couchDBClient.saveDocument('maia2_knowledge_bases', knowledgeBase);

      return { ...knowledgeBase, _id: result.id, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to create knowledge base:', error.message);
      throw error;
    }
  }

  /**
   * Get knowledge bases owned by current user
   */
  async getUserKnowledgeBases(username = null) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    const targetUser = username || (this.currentUser ? this.currentUser.username : null);
    if (!targetUser) throw new Error('No user specified');

    try {
      const allKBs = await this.couchDBClient.getAllDocuments('maia2_knowledge_bases');
      return allKBs.filter(kb => kb.type === 'knowledge_base' && kb.owner === targetUser);
    } catch (error) {
      console.error('❌ Failed to get user knowledge bases:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // RESOURCE ALLOCATION METHODS
  // ============================================================================

  /**
   * Request resource allocation
   */
  async requestResourceAllocation(resourceData) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    if (!this.currentUser) throw new Error('User not authenticated');
    
    try {
      const resource = {
        _id: `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'user_resource',
        ...resourceData,
        userId: this.currentUser.username,
        approvalStatus: 'pending',
        requestedBy: this.currentUser.username,
        requestedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        used: 0,
        remaining: resourceData.allocated,
        usageHistory: []
      };

      const result = await this.couchDBClient.saveDocument('maia2_user_resources', resource);

      return { ...resource, _id: result.id, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to request resource allocation:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // ADMIN APPROVAL METHODS
  // ============================================================================
  // Note: Admin approval methods removed - approval requests are handled via email notifications

  // ============================================================================
  // AUDIT LOGGING METHODS
  // ============================================================================

  /**
   * Log an audit event
   */
  async logAuditEvent(auditData) {
    if (!this.isInitialized) throw new Error('MAIA2 Client not initialized');
    
    try {
      const auditLog = {
        _id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'audit_log',
        ...auditData,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        indexed: false
      };

      const result = await this.couchDBClient.saveDocument('maia2_audit_logs', auditLog);

      return { ...auditLog, _id: result.id, _rev: result.rev };
    } catch (error) {
      console.error('❌ Failed to log audit event:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if a database exists
   */
  async databaseExists(dbName) {
    try {
      await this.couchDBClient.getDatabaseInfo(dbName);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get database information
   */
  async getDatabaseInfo(dbName) {
    try {
      const result = await this.couchDBClient.getDatabaseInfo(dbName);
      return result;
    } catch (error) {
      console.error(`❌ Failed to get database info for ${dbName}:`, error.message);
      throw error;
    }
  }

  /**
   * Health check for all maia2 databases
   */
  async healthCheck() {
    if (!this.isInitialized) return { status: 'not_initialized' };

    const databases = [
      'maia_users',
      'maia2_agents',
      'maia2_knowledge_bases',
      'maia2_user_resources',
      'maia2_audit_logs'
    ];

    const results = {};
    let allHealthy = true;

    for (const dbName of databases) {
      try {
        const info = await this.getDatabaseInfo(dbName);
        results[dbName] = {
          status: 'healthy',
          docCount: info.doc_count,
          diskSize: info.disk_size
        };
      } catch (error) {
        results[dbName] = {
          status: 'unhealthy',
          error: error.message
        };
        allHealthy = false;
      }
    }

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      databases: results,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
const maia2Client = new Maia2Client();
export default maia2Client;
