// src/utils/AppInitializer.js
/**
 * Centralized Application Initialization Manager
 * 
 * This class handles the robust initialization of the application based on user type
 * and provides a clean separation of concerns for different initialization paths.
 */

import { UserService } from './UserService.js';
import { WorkflowUtils } from './workflow-utils.js';
import { executionLogger } from './ExecutionLogger.js';

export class AppInitializer {
  constructor() {
    this.initializationState = {
      isInitialized: false,
      isInitializing: false,
      currentUser: null,
      currentAgent: null,
      currentKnowledgeBase: null,
      error: null,
      userType: null
    };
    
    this.listeners = new Map();
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000; // Start with 1 second
  }

  /**
   * Initialize the application based on the current context
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} - Initialization result
   */
  async initialize(options = {}) {
    executionLogger.startFlow('App Initialization');
    
    if (this.initializationState.isInitializing) {
      executionLogger.step('Initialization in progress, waiting...');
      const result = await this.waitForInitialization();
      executionLogger.endFlow(true);
      return result;
    }

    if (this.initializationState.isInitialized) {
      executionLogger.step('Already initialized, returning cached result');
      executionLogger.endFlow(true);
      return this.initializationState;
    }

    this.initializationState.isInitializing = true;
    this.initializationState.error = null;

    try {
      executionLogger.step('Determining user type and context');
      const context = await this.determineContext();
      this.initializationState.userType = context.userType;
      executionLogger.step('User context determined', { userType: context.userType, userId: context.user?.userId });

      executionLogger.step('Initializing based on user type');
      const result = await this.initializeByUserType(context, options);
      executionLogger.step('User type initialization completed', { 
        hasAgent: !!result.agent, 
        agentName: result.agent?.name,
        requiresAgentSelection: result.requiresAgentSelection 
      });
      
      this.initializationState.isInitialized = true;
      this.initializationState.isInitializing = false;
      this.retryAttempts = 0; // Reset retry count on success

      executionLogger.success('Application initialization completed successfully');
      this.notifyListeners('initialized', result);
      executionLogger.endFlow(true);
      return result;

    } catch (error) {
      console.error('❌ [AppInitializer] Initialization failed:', error);
      this.initializationState.error = error;
      this.initializationState.isInitializing = false;

      // Retry logic
      if (this.retryAttempts < this.maxRetries) {
        this.retryAttempts++;
        // Retrying initialization
        
        setTimeout(() => {
          this.initialize(options);
        }, this.retryDelay * this.retryAttempts);
      }

      this.notifyListeners('error', error);
      throw error;
    }
  }

  /**
   * Determine the current user context and type
   * @returns {Promise<Object>} - Context information
   */
  async determineContext() {
    const path = window.location.pathname;
    
    // Check for deep link access
    if (path.startsWith('/shared/')) {
      return {
        userType: 'deep_link',
        shareId: path.split('/shared/')[1],
        isDeepLink: true
      };
    }

    // Check for admin routes
    if (path === '/admin' || path === '/admin/register') {
      return {
        userType: 'admin',
        isAdmin: true
      };
    }

    // Check for authenticated user session
    try {
      const response = await fetch('/api/passkey/auth-status', {
        credentials: 'include',
        method: 'GET'
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData.authenticated && userData.user) {
          return {
            userType: 'authenticated',
            user: UserService.normalizeUserObject(userData.user),
            isAuthenticated: true
          };
        }
      }
    } catch (error) {
      console.warn('⚠️ [AppInitializer] Session verification failed:', error.message);
    }

    // Default to public user
    return {
      userType: 'public',
      user: UserService.createPublicUser(),
      isPublic: true
    };
  }

  /**
   * Initialize application based on user type
   * @param {Object} context - User context
   * @param {Object} options - Initialization options
   * @returns {Promise<Object>} - Initialization result
   */
  async initializeByUserType(context, options) {
    switch (context.userType) {
      case 'public':
        return await this.initializePublicUser(context, options);
      
      case 'authenticated':
        return await this.initializeAuthenticatedUser(context, options);
      
      case 'deep_link':
        return await this.initializeDeepLinkUser(context, options);
      
      case 'admin':
        return await this.initializeAdminUser(context, options);
      
      default:
        throw new Error(`Unknown user type: ${context.userType}`);
    }
  }

  /**
   * Initialize for Public User
   */
  async initializePublicUser(context, options) {
    executionLogger.startFlow('Public User Initialization');
    
    const user = context.user;
    this.initializationState.currentUser = user;
    executionLogger.step('Public User context set', { userId: user.userId });

    executionLogger.step('Loading public agent');
    const agent = await this.loadPublicAgent();
    this.initializationState.currentAgent = agent;
    executionLogger.step('Public agent loaded', { 
      hasAgent: !!agent, 
      agentName: agent?.name,
      agentId: agent?.id 
    });

    // If no agent is available due to security violation, show agent selection
    const requiresAgentSelection = !agent;
    executionLogger.step('Agent selection requirement determined', { requiresAgentSelection });

    const result = {
      user,
      agent,
      knowledgeBase: agent?.knowledgeBase || null,
      userType: 'public',
      requiresAgentSelection
    };

    executionLogger.success('Public User initialization completed');
    executionLogger.endFlow(true);
    return result;
  }

  /**
   * Initialize for Authenticated User
   */
  async initializeAuthenticatedUser(context, options) {
    console.log('🔐 [AppInitializer] Initializing Authenticated User');
    
    const user = context.user;
    this.initializationState.currentUser = user;

    // Check if user should see no private agent modal
    if (WorkflowUtils.shouldShowNoAgentModal(user, null)) {
      return {
        user,
        agent: null,
        knowledgeBase: null,
        userType: 'authenticated',
        showNoPrivateAgentModal: true
      };
    }

    // Load assigned agent
    const agent = await this.loadAssignedAgent(user);
    this.initializationState.currentAgent = agent;

    return {
      user,
      agent,
      knowledgeBase: agent?.knowledgeBase || null,
      userType: 'authenticated',
      requiresAgentSelection: !agent
    };
  }

  /**
   * Initialize for Deep Link User
   */
  async initializeDeepLinkUser(context, options) {
    console.log('🔗 [AppInitializer] Initializing Deep Link User');
    
    const shareId = context.shareId;
    
    // For deep link users, don't load shared chat data automatically
    // Let the frontend handle user identification and chat loading
    return {
      user: null, // No user set yet - will be set after identification
      agent: null, // No agent set yet - will be set after identification
      knowledgeBase: null,
      userType: 'deep_link',
      shareId,
      requiresUserIdentification: true // Flag to indicate user needs to be identified
    };
  }

  /**
   * Initialize for Admin User
   */
  async initializeAdminUser(context, options) {
    console.log('👑 [AppInitializer] Initializing Admin User');
    
    // Admin users don't need agent initialization
    return {
      user: null,
      agent: null,
      knowledgeBase: null,
      userType: 'admin'
    };
  }

  /**
   * Load public agent
   */
  async loadPublicAgent() {
    executionLogger.startFlow('Load Public Agent');
    
    try {
      executionLogger.step('Calling /api/current-agent endpoint');
      const response = await fetch('/api/current-agent', {
        credentials: 'include'
      });
      executionLogger.step('API response received', { status: response.status, statusText: response.statusText });

      if (response.ok) {
        const data = await response.json();
        executionLogger.step('Response data parsed', { hasAgent: !!data.agent, agentName: data.agent?.name });
        
        if (data.agent) {
          executionLogger.step('Performing security check on agent');
          // SECURITY CHECK: Public User should only get public agents
          if (!data.agent.name.startsWith('public-')) {
            executionLogger.error('Security violation detected', { 
              agentName: data.agent.name, 
              expectedPrefix: 'public-' 
            });
            executionLogger.endFlow(false);
            return null; // Don't return the agent if it's not public
          }
          executionLogger.step('Security check passed');
        }
        
        executionLogger.success('Public agent loaded successfully');
        executionLogger.endFlow(true);
        return data.agent;
      } else if (response.status === 403) {
        executionLogger.step('Access denied (403) - this is expected for security');
        executionLogger.endFlow(true);
        return null;
      } else {
        executionLogger.error('Failed to load public agent', { status: response.status, statusText: response.statusText });
        executionLogger.endFlow(false);
      }
    } catch (error) {
      executionLogger.error('Exception while loading public agent', error);
      executionLogger.endFlow(false);
    }
    return null;
  }

  /**
   * Load assigned agent for authenticated user
   */
  async loadAssignedAgent(user) {
    try {
      const response = await fetch('/api/current-agent', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        return data.agent;
      }
    } catch (error) {
      console.warn('⚠️ [AppInitializer] Failed to load assigned agent:', error.message);
    }
    return null;
  }

  /**
   * Load shared chat data
   */
  async loadSharedChat(shareId) {
    try {
      const response = await fetch(`/api/shared/${shareId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('⚠️ [AppInitializer] Failed to load shared chat:', error.message);
    }
    return { user: null, agent: null, knowledgeBase: null, chat: null };
  }

  /**
   * Wait for initialization to complete
   */
  async waitForInitialization() {
    return new Promise((resolve) => {
      if (this.initializationState.isInitialized) {
        resolve(this.initializationState);
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.initializationState.isInitialized || this.initializationState.error) {
          clearInterval(checkInterval);
          resolve(this.initializationState);
        }
      }, 100);
    });
  }

  /**
   * Add event listener
   */
  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  removeListener(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Notify listeners
   */
  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ [AppInitializer] Listener error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Reset initialization state
   */
  reset() {
    this.initializationState = {
      isInitialized: false,
      isInitializing: false,
      currentUser: null,
      currentAgent: null,
      currentKnowledgeBase: null,
      error: null,
      userType: null
    };
    this.retryAttempts = 0;
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.initializationState };
  }
}

// Export singleton instance
export const appInitializer = new AppInitializer();
