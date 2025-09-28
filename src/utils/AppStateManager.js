// src/utils/AppStateManager.js
/**
 * Centralized Application State Manager
 * 
 * This class manages all application state in a centralized, predictable way.
 * It provides a single source of truth for user state, agent state, and UI state.
 */

import { UserService } from './UserService.js';
import { WorkflowUtils } from './workflow-utils.js';

export class AppStateManager {
  constructor() {
    this.state = {
      // User state
      currentUser: null,
      isAuthenticated: false,
      userType: 'public',
      
      // Agent state
      currentAgent: null,
      assignedAgent: null,
      currentKnowledgeBase: null,
      
      // UI state
      isLoading: false,
      error: null,
      warnings: [],
      
      // Modal state
      showAgentSelectionModal: false,
      showNoPrivateAgentModal: false,
      showWelcomeModal: false,
      
      // Chat state
      chatHistory: [],
      uploadedFiles: [],
      currentViewingFile: null,
      popupContent: '',
      
      // Workflow state
      workflowStage: 'no_passkey',
      workflowStep: 0,
      
      // Cache state
      lastActivity: null,
      cacheTimestamp: null
    };

    this.listeners = new Map();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get specific state property
   */
  getStateProperty(key) {
    return this.state[key];
  }

  /**
   * Update state and notify listeners
   */
  setState(updates) {
    const oldState = { ...this.state };
    
    // Update state
    Object.assign(this.state, updates);
    
    // Update cache timestamp
    this.state.cacheTimestamp = Date.now();
    
    // Notify listeners of changes
    this.notifyStateChange(oldState, this.state);
  }

  /**
   * Set user and related state
   */
  setUser(user) {
    const normalizedUser = UserService.normalizeUserObject(user);
    const userType = this.determineUserType(normalizedUser);
    const workflowStage = this.determineWorkflowStage(normalizedUser);
    
    this.setState({
      currentUser: normalizedUser,
      isAuthenticated: userType === 'authenticated',
      userType,
      workflowStage,
      workflowStep: WorkflowUtils.getFlowStep(normalizedUser)?.step || 0
    });
  }

  /**
   * Set agent and related state
   */
  setAgent(agent) {
    this.setState({
      currentAgent: agent,
      assignedAgent: agent,
      currentKnowledgeBase: agent?.knowledgeBase || null
    });
  }

  /**
   * Clear agent state
   */
  clearAgent() {
    this.setState({
      currentAgent: null,
      assignedAgent: null,
      currentKnowledgeBase: null
    });
  }

  /**
   * Set loading state
   */
  setLoading(isLoading) {
    this.setState({ isLoading });
  }

  /**
   * Set error state
   */
  setError(error) {
    this.setState({ 
      error: error?.message || error,
      isLoading: false 
    });
  }

  /**
   * Clear error state
   */
  clearError() {
    this.setState({ error: null });
  }

  /**
   * Add warning
   */
  addWarning(warning) {
    const warnings = [...this.state.warnings, warning];
    this.setState({ warnings });
  }

  /**
   * Clear warnings
   */
  clearWarnings() {
    this.setState({ warnings: [] });
  }

  /**
   * Set modal state
   */
  setModal(modalName, show) {
    this.setState({ [modalName]: show });
  }

  /**
   * Set chat state
   */
  setChatState(chatUpdates) {
    this.setState(chatUpdates);
  }

  /**
   * Clear chat state
   */
  clearChatState() {
    this.setState({
      chatHistory: [],
      uploadedFiles: [],
      currentViewingFile: null,
      popupContent: ''
    });
  }

  /**
   * Update activity timestamp
   */
  updateActivity() {
    this.setState({ lastActivity: Date.now() });
  }

  /**
   * Determine user type
   */
  determineUserType(user) {
    if (!user) {
      return 'unknown'; // For deep link users who haven't been identified yet
    }
    if (UserService.isPublicUser(user)) {
      return 'public';
    }
    if (user.isDeepLinkUser || user.userId?.startsWith('deep_link_')) {
      return 'deep_link';
    }
    if (user.isAdmin) {
      return 'admin';
    }
    if (user.isAuthenticated && user.hasPasskey) {
      return 'authenticated';
    }
    return 'unknown';
  }

  /**
   * Determine workflow stage
   */
  determineWorkflowStage(user) {
    if (!user || !user.hasPasskey) {
      return 'no_passkey';
    }
    
    if (user.approvalStatus === 'pending' || !user.approvalStatus) {
      return 'awaiting_approval';
    }
    
    if (user.approvalStatus === 'approved') {
      if (!this.state.currentAgent) {
        return 'approved';
      }
      if (this.state.currentAgent.status !== 'running') {
        return 'waiting_for_deployment';
      }
      if (this.state.currentAgent.status === 'running' && (!this.state.currentAgent.knowledgeBases || this.state.currentAgent.knowledgeBases.length === 0)) {
        return 'has_bucket';
      }
      if (this.state.currentAgent.status === 'running' && this.state.currentAgent.knowledgeBases && this.state.currentAgent.knowledgeBases.length > 0) {
        return 'has_kb';
      }
    }
    
    if (user.approvalStatus === 'rejected') {
      return 'rejected';
    }
    
    if (user.approvalStatus === 'suspended') {
      return 'suspended';
    }
    
    return 'unknown';
  }

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    if (!this.state.cacheTimestamp) return false;
    return (Date.now() - this.state.cacheTimestamp) < this.cacheTimeout;
  }

  /**
   * Get cached data
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cached data
   */
  setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.setState({ cacheTimestamp: null });
  }

  /**
   * Add state change listener
   */
  addListener(callback) {
    const id = Date.now() + Math.random();
    this.listeners.set(id, callback);
    return id;
  }

  /**
   * Remove state change listener
   */
  removeListener(id) {
    this.listeners.delete(id);
  }

  /**
   * Notify listeners of state changes
   */
  notifyStateChange(oldState, newState) {
    this.listeners.forEach(callback => {
      try {
        callback(newState, oldState);
      } catch (error) {
        console.error('❌ [AppStateManager] Listener error:', error);
      }
    });
  }

  /**
   * Reset state to initial values
   */
  reset() {
    this.state = {
      currentUser: null,
      isAuthenticated: false,
      userType: 'public',
      currentAgent: null,
      assignedAgent: null,
      currentKnowledgeBase: null,
      isLoading: false,
      error: null,
      warnings: [],
      showAgentSelectionModal: false,
      showNoPrivateAgentModal: false,
      showWelcomeModal: false,
      chatHistory: [],
      uploadedFiles: [],
      currentViewingFile: null,
      popupContent: '',
      workflowStage: 'no_passkey',
      workflowStep: 0,
      lastActivity: null,
      cacheTimestamp: null
    };
    this.clearCache();
  }

  /**
   * Get state summary for debugging
   */
  getStateSummary() {
    return {
      user: this.state.currentUser?.userId || 'None',
      userType: this.state.userType,
      agent: this.state.currentAgent?.name || 'None',
      knowledgeBase: this.state.currentKnowledgeBase?.name || 'None',
      workflowStage: this.state.workflowStage,
      workflowStep: this.state.workflowStep,
      isLoading: this.state.isLoading,
      hasError: !!this.state.error,
      warningsCount: this.state.warnings.length,
      cacheValid: this.isCacheValid()
    };
  }
}

// Export singleton instance
export const appStateManager = new AppStateManager();
