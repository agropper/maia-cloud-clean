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
      
      // Workflow State
      workflowStage: userDoc.workflowStage || 'no_passkey',
      approvalStatus: userDoc.approvalStatus || 'pending',
      adminNotes: userDoc.adminNotes || '',
      
      // Metadata
      lastUpdated: new Date().toISOString(),
      cacheVersion: this.cacheVersion
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
