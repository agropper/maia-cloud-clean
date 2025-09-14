/**
 * UserStateManager - Centralized user state management with in-memory caching
 * 
 * This class manages all user state including:
 * - Agent assignments (current, assigned)
 * - Knowledge base assignments
 * - Workflow state
 * - All related metadata
 * 
 * All frontend components should use this as the single source of truth
 * to ensure consistency across the application.
 */

class UserStateManager {
  constructor() {
    this.userStateCache = new Map();
    this.cacheVersion = 1;
    this.lastCacheUpdate = new Date();
  }

  /**
   * Get complete user state from cache
   * @param {string} userId - User ID
   * @returns {Object|null} Complete user state or null if not found
   */
  getUserState(userId) {
    return this.userStateCache.get(userId) || null;
  }

  /**
   * Get specific part of user state
   * @param {string} userId - User ID
   * @param {string} section - 'agent', 'knowledge-bases', 'workflow', or 'all'
   * @returns {Object|null} Requested section or null if not found
   */
  getUserStateSection(userId, section = 'all') {
    const userState = this.getUserState(userId);
    if (!userState) return null;

    switch (section) {
      case 'agent':
        return {
          currentAgentId: userState.currentAgentId,
          currentAgentName: userState.currentAgentName,
          currentAgentEndpoint: userState.currentAgentEndpoint,
          currentAgentSetAt: userState.currentAgentSetAt,
          assignedAgentId: userState.assignedAgentId,
          assignedAgentName: userState.assignedAgentName
        };
      case 'knowledge-bases':
        return {
          assignedKnowledgeBases: userState.assignedKnowledgeBases,
          availableKnowledgeBases: userState.availableKnowledgeBases
        };
      case 'workflow':
        return {
          workflowStage: userState.workflowStage,
          approvalStatus: userState.approvalStatus,
          adminNotes: userState.adminNotes
        };
      case 'all':
      default:
        return userState;
    }
  }

  /**
   * Update user state in cache
   * @param {string} userId - User ID
   * @param {Object} userState - Complete user state object
   */
  updateUserState(userId, userState) {
    const now = new Date();
    const updatedState = {
      ...userState,
      lastUpdated: now.toISOString(),
      cacheVersion: this.cacheVersion
    };
    
    this.userStateCache.set(userId, updatedState);
    this.lastCacheUpdate = now;
    
    console.log(`🔄 [UserStateManager] Updated cache for user ${userId}:`, {
      currentAgent: updatedState.currentAgentName,
      assignedKBs: updatedState.assignedKnowledgeBases?.length || 0,
      workflowStage: updatedState.workflowStage
    });
  }

  /**
   * Update specific section of user state
   * @param {string} userId - User ID
   * @param {string} section - Section to update
   * @param {Object} sectionData - Data for the section
   */
  updateUserStateSection(userId, section, sectionData) {
    const existingState = this.getUserState(userId) || this.getDefaultUserState(userId);
    
    switch (section) {
      case 'agent':
        existingState.currentAgentId = sectionData.currentAgentId;
        existingState.currentAgentName = sectionData.currentAgentName;
        existingState.currentAgentEndpoint = sectionData.currentAgentEndpoint;
        existingState.currentAgentSetAt = sectionData.currentAgentSetAt;
        existingState.assignedAgentId = sectionData.assignedAgentId;
        existingState.assignedAgentName = sectionData.assignedAgentName;
        break;
      case 'knowledge-bases':
        existingState.assignedKnowledgeBases = sectionData.assignedKnowledgeBases || [];
        existingState.availableKnowledgeBases = sectionData.availableKnowledgeBases || [];
        break;
      case 'workflow':
        existingState.workflowStage = sectionData.workflowStage;
        existingState.approvalStatus = sectionData.approvalStatus;
        existingState.adminNotes = sectionData.adminNotes;
        break;
    }
    
    this.updateUserState(userId, existingState);
  }

  /**
   * Get default user state structure
   * @param {string} userId - User ID
   * @returns {Object} Default user state
   */
  getDefaultUserState(userId) {
    return {
      userId: userId,
      displayName: userId,
      
      // Agent State
      currentAgentId: null,
      currentAgentName: null,
      currentAgentEndpoint: null,
      currentAgentSetAt: null,
      assignedAgentId: null,
      assignedAgentName: null,
      
      // Knowledge Base State
      assignedKnowledgeBases: [],
      availableKnowledgeBases: [],
      
      // Workflow State
      workflowStage: 'no_passkey',
      approvalStatus: 'pending',
      adminNotes: '',
      
      // Metadata
      lastUpdated: new Date().toISOString(),
      cacheVersion: this.cacheVersion
    };
  }

  /**
   * Build user state from database user document
   * @param {Object} userDoc - User document from database
   * @param {Array} assignedKBs - Assigned knowledge bases
   * @param {Array} availableKBs - Available knowledge bases
   * @returns {Object} Complete user state
   */
  buildUserStateFromDB(userDoc, assignedKBs = [], availableKBs = []) {
    // Calculate passkey status from database fields (reliable)
    const hasPasskey = !!userDoc.credentialID;
    const hasValidPasskey = !!(userDoc.credentialID && 
      userDoc.credentialID !== 'test-credential-id-wed271' && 
      userDoc.credentialPublicKey && 
      userDoc.counter !== undefined);
    
    // Determine workflow stage based on actual database state (not stored workflowStage)
    let workflowStage = 'no_passkey';
    if (hasValidPasskey) {
      if (userDoc.approvalStatus === 'approved') {
        workflowStage = 'hasAgent';
      } else if (userDoc.approvalStatus === 'pending') {
        workflowStage = 'awaiting_approval';
      } else if (userDoc.approvalStatus === 'rejected') {
        workflowStage = 'rejected';
      } else if (userDoc.approvalStatus === 'suspended') {
        workflowStage = 'suspended';
      } else {
        // Has valid passkey but no approval status - assume needs approval
        workflowStage = 'awaiting_approval';
      }
    } else if (hasPasskey) {
      // Has passkey but not valid (e.g., test credential)
      workflowStage = 'no_passkey';
    } else {
      // No passkey at all
      workflowStage = 'no_passkey';
    }
    
    return {
      userId: userDoc.userId || userDoc._id,
      displayName: userDoc.displayName || userDoc.userId || userDoc._id,
      
      // Agent State - Map currentAgent to assignedAgent for consistency
      currentAgentId: userDoc.currentAgentId || null,
      currentAgentName: userDoc.currentAgentName || null,
      currentAgentEndpoint: userDoc.currentAgentEndpoint || null,
      currentAgentSetAt: userDoc.currentAgentSetAt || null,
      assignedAgentId: userDoc.assignedAgentId || userDoc.currentAgentId || null,
      assignedAgentName: userDoc.assignedAgentName || userDoc.currentAgentName || null,
      
      // Knowledge Base State
      assignedKnowledgeBases: assignedKBs,
      availableKnowledgeBases: availableKBs,
      
      // Workflow State - Calculated from database fields, not stored workflowStage
      workflowStage: workflowStage,
      approvalStatus: userDoc.approvalStatus || 'pending',
      adminNotes: userDoc.adminNotes || '',
      
      // Passkey Status - Calculated from database fields
      hasPasskey: hasPasskey,
      hasValidPasskey: hasValidPasskey,
      
      // Bucket Status - Will be populated by bucket status check
      hasBucket: false,
      bucketFileCount: 0,
      bucketCreatedAt: null,
      bucketTotalSize: 0,
      
      // Metadata
      lastUpdated: new Date().toISOString(),
      cacheVersion: this.cacheVersion
    };
  }

  /**
   * Update bucket status for a user
   * @param {string} userId - User ID
   * @param {Object} bucketStatus - Bucket status data
   */
  updateBucketStatus(userId, bucketStatus) {
    if (this.userStateCache.has(userId)) {
      const userState = this.userStateCache.get(userId);
      userState.hasBucket = bucketStatus.hasFolder || false;
      userState.bucketFileCount = bucketStatus.fileCount || 0;
      userState.bucketCreatedAt = bucketStatus.createdAt || null;
      userState.bucketTotalSize = bucketStatus.totalSize || 0;
      userState.lastUpdated = new Date().toISOString();
      
      this.userStateCache.set(userId, userState);
      console.log(`📁 [UserStateManager] Updated bucket status for ${userId}: hasBucket=${userState.hasBucket}, files=${userState.bucketFileCount}`);
    }
  }

  /**
   * Get bucket status for a user
   * @param {string} userId - User ID
   * @returns {Object} Bucket status
   */
  getBucketStatus(userId) {
    const userState = this.userStateCache.get(userId);
    if (!userState) return null;
    
    return {
      hasBucket: userState.hasBucket,
      bucketFileCount: userState.bucketFileCount,
      bucketCreatedAt: userState.bucketCreatedAt,
      bucketTotalSize: userState.bucketTotalSize
    };
  }

  /**
   * Remove user from cache
   * @param {string} userId - User ID
   */
  removeUser(userId) {
    this.userStateCache.delete(userId);
    console.log(`🗑️ [UserStateManager] Removed user ${userId} from cache`);
  }

  /**
   * Get all cached user IDs
   * @returns {Array} Array of user IDs
   */
  getAllUserIds() {
    return Array.from(this.userStateCache.keys());
  }

  /**
   * Check and ensure bucket folders for all users
   * @returns {Promise<void>}
   */
  async ensureAllUserBuckets() {
    console.log('📁 [UserStateManager] Ensuring bucket folders for all users...');
    
    const userIds = Array.from(this.userStateCache.keys());
    const bucketChecks = [];
    
    for (const userId of userIds) {
      // Skip deep link users and Public User for now
      if (userId.startsWith('deep_link_') || userId === 'Public User') {
        continue;
      }
      
      bucketChecks.push(this.ensureUserBucket(userId));
    }
    
    try {
      await Promise.all(bucketChecks);
      console.log(`✅ [UserStateManager] Completed bucket checks for ${bucketChecks.length} users`);
    } catch (error) {
      console.error('❌ [UserStateManager] Error ensuring user buckets:', error);
    }
  }

  /**
   * Ensure bucket folder exists for a specific user
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async ensureUserBucket(userId) {
    try {
      // First check current status
      const statusResponse = await fetch(`http://localhost:3001/api/bucket/user-status/${userId}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        this.updateBucketStatus(userId, statusData);
        return;
      }
      
      // If no folder exists, create it
      const createResponse = await fetch('http://localhost:3001/api/bucket/ensure-user-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      if (createResponse.ok) {
        const createData = await createResponse.json();
        this.updateBucketStatus(userId, createData);
        console.log(`✅ [UserStateManager] Created bucket folder for ${userId}`);
      }
    } catch (error) {
      console.error(`❌ [UserStateManager] Error ensuring bucket for ${userId}:`, error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      totalUsers: this.userStateCache.size,
      cacheVersion: this.cacheVersion,
      lastCacheUpdate: this.lastCacheUpdate.toISOString(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.userStateCache.clear();
    this.lastCacheUpdate = new Date();
    console.log(`🧹 [UserStateManager] Cache cleared`);
  }

  /**
   * Initialize cache from database
   * This should be called on server startup
   * @param {Function} getUserDocs - Function to get all user documents
   * @param {Function} getKBAssignments - Function to get KB assignments
   */
  async initializeCache(getUserDocs, getKBAssignments) {
    try {
      console.log(`🔄 [UserStateManager] Initializing cache from database...`);
      
      const userDocs = await getUserDocs();
      let initializedCount = 0;
      
      for (const userDoc of userDocs) {
        try {
          console.log(`🔍 [UserStateManager] Processing user: ${userDoc.userId || userDoc._id}, type: ${userDoc.type}`);
          // Get KB assignments for this user
          const assignedKBs = await getKBAssignments(userDoc.userId || userDoc._id);
          const availableKBs = []; // TODO: Implement available KBs logic
          
          // Build user state
          const userState = this.buildUserStateFromDB(userDoc, assignedKBs, availableKBs);
          
          // Add to cache
          this.userStateCache.set(userDoc.userId || userDoc._id, userState);
          initializedCount++;
          console.log(`✅ [UserStateManager] Successfully initialized user: ${userDoc.userId || userDoc._id}`);
        } catch (error) {
          console.error(`❌ [UserStateManager] Error initializing user ${userDoc.userId || userDoc._id}:`, error.message);
          console.error(`❌ [UserStateManager] User document:`, userDoc);
        }
      }
      
      console.log(`✅ [UserStateManager] Cache initialized with ${initializedCount} users`);
    } catch (error) {
      console.error(`❌ [UserStateManager] Error initializing cache:`, error.message);
    }
  }
}

// Export the class
export default UserStateManager;
