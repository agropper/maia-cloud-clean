/**
 * Unified Cache Manager for Cloudant/CouchDB operations
 * Prevents 429 errors by caching database calls and implementing rate limiting
 */

export class CacheManager {
  constructor() {
    this.cache = {
      users: new Map(),           // userId -> userDocument (single source of truth)
      chats: new Map(),           // 'all' -> allChatsArray
      knowledgeBases: new Map(),   // kbId -> kbDocument
      agents: new Map(),          // 'all' -> allAgentsArray
      models: new Map(),          // 'all' -> allModelsArray, 'current' -> currentModel
      health: new Map()           // 'admin' -> health status
    };
    
    this.lastUpdated = {
      users: new Map(),           // userId -> timestamp
      chats: 0,                   // timestamp
      knowledgeBases: new Map(),   // kbId -> timestamp
      agents: 0,                  // timestamp
      models: new Map(),          // 'all' -> timestamp, 'current' -> timestamp
      health: new Map()           // key -> timestamp
    };
    
    // Cache TTL (Time To Live) in milliseconds
    // NOTE: Users cache has NO TTL - it's explicitly managed (invalidate on change)
    this.ttl = {
      users: Infinity,             // NO TTL - explicitly invalidated on changes only
      chats: 2 * 60 * 1000,        // 2 minutes
      knowledgeBases: 30 * 60 * 1000,  // 30 minutes (admin data, changes rarely)
      agents: 15 * 60 * 1000,      // 15 minutes (admin data)
      models: 60 * 60 * 1000,      // 60 minutes (DigitalOcean models change rarely)
      health: 30 * 1000            // 30 seconds
    };
    
    // Rate limiting
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.maxRequestsPerMinute = 100;
    
    // Circuit breaker
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: 0,
      failureThreshold: 5,
      recoveryTimeout: 30 * 1000 // 30 seconds
    };
    
  }
  
  /**
   * Check if cache entry is still valid
   */
  isCacheValid(cacheType, key = null) {
    const now = Date.now();
    
    if (cacheType === 'chats') {
      return this.lastUpdated.chats > 0 && (now - this.lastUpdated.chats) < this.ttl.chats;
    }
    
    if (cacheType === 'agents') {
      return this.lastUpdated.agents > 0 && (now - this.lastUpdated.agents) < this.ttl.agents;
    }
    
    if (key && this.lastUpdated[cacheType] && this.lastUpdated[cacheType] instanceof Map) {
      const lastUpdate = this.lastUpdated[cacheType].get(key);
      return lastUpdate && (now - lastUpdate) < this.ttl[cacheType];
    }
    
    return false;
  }
  
  /**
   * Get cached data
   */
  getCached(cacheType, key = null) {
    if (cacheType === 'chats') {
      return this.cache.chats.get('all');
    }
    
    if (cacheType === 'agents') {
      return this.cache.agents.get('all');
    }
    
    if (key && this.cache[cacheType] && this.cache[cacheType] instanceof Map) {
      return this.cache[cacheType].get(key);
    }
    
    
    return null;
  }
  
  /**
   * Set cached data
   */
  setCached(cacheType, key, data) {
    const now = Date.now();
    
    if (cacheType === 'chats') {
      this.cache.chats.set('all', data);
      this.lastUpdated.chats = now;
    } else if (cacheType === 'agents') {
      this.cache.agents.set('all', data);
      this.lastUpdated.agents = now;
    } else if (this.cache[cacheType]) {
      // Ensure both cache and lastUpdated are Maps for this cache type
      if (!(this.cache[cacheType] instanceof Map)) {
        this.cache[cacheType] = new Map();
      }
      if (!(this.lastUpdated[cacheType] instanceof Map)) {
        this.lastUpdated[cacheType] = new Map();
      }
      
      // ⚠️ DEFENSIVE: Prevent caching null/undefined values
      if (data === null || data === undefined) {
        console.error(`❌ [CACHE] Attempted to cache null/undefined value for ${cacheType}:${key}`);
        console.error(`❌ [CACHE] Stack trace:`, new Error().stack);
        return; // Don't cache null values!
      }
      
      this.cache[cacheType].set(key, data);
      this.lastUpdated[cacheType].set(key, now);
      
      // Debug: Log when users with specific workflow stages are cached
      if (cacheType === 'users' && data?.workflowStage === 'polling_for_deployment') {
        console.log(`💾 [USER LIST] Cached user ${key} with workflowStage: polling_for_deployment`);
      }
      
    }
    
  }
  
  /**
   * Invalidate cache entry
   */
  invalidateCache(cacheType, key = null) {
    if (cacheType === 'chats') {
      this.cache.chats.delete('all');
      this.lastUpdated.chats = 0;
    } else if (key && this.cache[cacheType]) {
      this.cache[cacheType].delete(key);
      if (this.lastUpdated[cacheType] && typeof this.lastUpdated[cacheType].delete === 'function') {
        this.lastUpdated[cacheType].delete(key);
      } else if (typeof this.lastUpdated[cacheType] === 'number') {
        this.lastUpdated[cacheType] = 0; // Reset timestamp for simple cache types
      }
    } else if (this.cache[cacheType]) {
      this.cache[cacheType].clear();
      if (this.lastUpdated[cacheType] && typeof this.lastUpdated[cacheType].clear === 'function') {
        this.lastUpdated[cacheType].clear();
      } else if (typeof this.lastUpdated[cacheType] === 'number') {
        this.lastUpdated[cacheType] = 0; // Reset timestamp for simple cache types
      }
    }
    
  }
  
  /**
   * Check rate limiting
   */
  checkRateLimit() {
    const now = Date.now();
    const windowDuration = 60 * 1000; // 1 minute
    
    // Reset counter if window has passed
    if (now - this.windowStart > windowDuration) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    
    if (this.requestCount >= this.maxRequestsPerMinute) {
      console.warn(`⚠️ [CACHE] Rate limit exceeded: ${this.requestCount}/${this.maxRequestsPerMinute} requests`);
      return false;
    }
    
    this.requestCount++;
    return true;
  }
  
  /**
   * Circuit breaker pattern for database operations
   */
  async executeWithCircuitBreaker(operation, operationName) {
    const now = Date.now();
    
    // Check circuit breaker state
    if (this.circuitBreaker.state === 'OPEN') {
      if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.recoveryTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
      } else {
        console.warn(`🚫 [CACHE] Circuit breaker OPEN for ${operationName} - using cache only`);
        throw new Error(`Database circuit breaker OPEN for ${operationName}`);
      }
    }
    
    try {
      const result = await operation();
      this.onCircuitBreakerSuccess();
      return result;
    } catch (error) {
      this.onCircuitBreakerFailure(error);
      throw error;
    }
  }
  
  /**
   * Circuit breaker success handler
   */
  onCircuitBreakerSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failureCount = 0;
    }
  }
  
  /**
   * Circuit breaker failure handler
   */
  onCircuitBreakerFailure(error) {
    // Don't count document update conflicts as circuit breaker failures
    // These are just concurrency issues that can be retried
    if (error && error.message && error.message.includes('Document update conflict')) {
      return;
    }
    
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      console.error(`🚫 [CACHE] Circuit breaker OPEN due to ${this.circuitBreaker.failureCount} failures`);
    }
  }
  
  /**
   * Get document with caching
   */
  async getDocument(couchDBClient, databaseName, documentId, options = {}) {
    const cacheKey = `${databaseName}:${documentId}`;
    const cacheType = options.cacheType || this.getCacheTypeForDatabase(databaseName);
    
    // Check cache first
    if (this.isCacheValid(cacheType, documentId)) {
      const cached = this.getCached(cacheType, documentId);
      if (cached) {
        return cached;
      }
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded - cannot make database request');
    }
    
    // Fetch from database with circuit breaker
    try {
      const result = await this.executeWithCircuitBreaker(
        () => couchDBClient.getDocument(databaseName, documentId),
        `getDocument(${cacheKey})`
      );
      
      // Cache the result only if document exists (don't cache null/undefined)
      if (result) {
        this.setCached(cacheType, documentId, result);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ [CACHE] Failed to fetch ${cacheKey}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Save document with cache invalidation
   */
  async saveDocument(couchDBClient, databaseName, document, options = {}) {
    const documentId = document._id || document.id;
    const cacheKey = `${databaseName}:${documentId}`;
    const cacheType = options.cacheType || this.getCacheTypeForDatabase(databaseName);
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 100; // Initial delay in ms
    
    // SECURITY CHECK: Prevent currentUser from being saved to database
    if (databaseName === 'maia_users' && document && document.currentUser) {
      throw new Error(`🚨 SECURITY VIOLATION: Attempted to save 'currentUser' field to maia_users database. This is dangerous and forbidden. Document ID: ${documentId}`);
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded - cannot make database request');
    }
    
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithCircuitBreaker(
          () => couchDBClient.saveDocument(databaseName, document),
          `saveDocument(${cacheKey})`
        );
        
        // Success - UPDATE cache with saved document (don't delete it!)
        // The saved document now has the updated _rev from the database
        const updatedDocument = {
          ...document,
          _rev: result.rev  // Include the new revision from save result
        };
        
        // For user documents, ensure bucketStatus is preserved from existing cache
        if (databaseName === 'maia_users') {
          const existingCached = this.getCached(cacheType, documentId);
          if (existingCached?.bucketStatus && !updatedDocument.bucketStatus) {
            // Preserve bucketStatus from cache if not in saved document
            updatedDocument.bucketStatus = existingCached.bucketStatus;
          }
        }
        
        this.setCached(cacheType, documentId, updatedDocument);
        
        // If it's a user document, invalidate related caches (chats, health)
        if (databaseName === 'maia_users') {
          this.invalidateUserRelatedCaches(documentId);
        }
        
        // Log retry success if this wasn't the first attempt
        if (attempt > 1) {
          console.log(`✅ [CACHE] Save succeeded on attempt ${attempt} for ${cacheKey}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if it's a document update conflict (409)
        const isConflict = error.message && (
          error.message.includes('conflict') || 
          error.message.includes('409') ||
          error.statusCode === 409
        );
        
        if (isConflict && attempt < maxRetries) {
          // Document conflict - retry with exponential backoff
          const delay = retryDelay * Math.pow(2, attempt - 1);
          console.log(`⚠️ [CACHE] Document conflict for ${cacheKey}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Fetch the latest version of the document
          try {
            const latestDoc = await couchDBClient.getDocument(databaseName, documentId);
            // Merge changes while preserving the latest _rev
            document._rev = latestDoc._rev;
            console.log(`🔄 [CACHE] Refreshed document revision for ${cacheKey}`);
          } catch (fetchError) {
            console.warn(`⚠️ [CACHE] Could not fetch latest revision for ${cacheKey}:`, fetchError.message);
          }
        } else {
          // Non-conflict error or max retries reached
          break;
        }
      }
    }
    
    // All retries exhausted
    console.error(`❌ [CACHE] Failed to save ${cacheKey} after ${maxRetries} attempts:`, lastError.message);
    throw lastError;
  }
  
  /**
   * Get all documents with caching
   */
  async getAllDocuments(couchDBClient, databaseName, options = {}) {
    const cacheKey = `all:${databaseName}`;
    const cacheType = options.cacheType || this.getCacheTypeForDatabase(databaseName);
    
    // Check cache first
    if (this.isCacheValid(cacheType, 'all')) {
      const cached = this.getCached(cacheType, 'all');
      if (cached) {
        return cached;
      }
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded - cannot make database request');
    }
    
    try {
      const result = await this.executeWithCircuitBreaker(
        () => couchDBClient.getAllDocuments(databaseName),
        `getAllDocuments(${databaseName})`
      );
      
      // Cache the result
      this.setCached(cacheType, 'all', result);
      
      return result;
    } catch (error) {
      console.error(`❌ [CACHE] Failed to fetch ${cacheKey}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Determine cache type based on database name
   */
  getCacheTypeForDatabase(databaseName) {
    switch (databaseName) {
      case 'maia_users':
        return 'users';
      case 'maia_chats':
        return 'chats';
      case 'maia_knowledge_bases':
        return 'knowledgeBases';
      case 'maia_agents':
        return 'agents';
      default:
        return 'users'; // Default fallback
    }
  }
  
  /**
   * Invalidate all caches related to a user
   */
  invalidateUserRelatedCaches(userId) {
    // NOTE: We do NOT invalidate the user document itself here!
    // The user was just updated by saveDocument and is already in cache with fresh data.
    
    // Invalidate agent assignments (may reference user data)
    this.invalidateCache('agentAssignments', userId);
    
    // Invalidate all chats (they might contain user data)
    this.invalidateCache('chats');
    
    // Invalidate health cache (admin operations might be affected)
    this.invalidateCache('health', 'admin');
  }
  
  /**
   * Cache agents data
   */
  async cacheAgents(agentsData) {
    this.setCached('agents', 'all', agentsData);
  }

  /**
   * Get cached agents data
   */
  getCachedAgents() {
    if (this.isCacheValid('agents', 'all')) {
      const cached = this.getCached('agents', 'all');
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  /**
   * Get cached knowledge bases data
   */
  getCachedKnowledgeBases() {
    if (this.isCacheValid('knowledgeBases', 'all')) {
      const cached = this.getCached('knowledgeBases', 'all');
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  /**
   * Cache knowledge bases data
   */
  async cacheKnowledgeBases(knowledgeBasesData) {
    this.setCached('knowledgeBases', 'all', knowledgeBasesData);
  }

  /**
   * Cache models data
   */
  async cacheModels(modelsData) {
    this.setCached('models', 'all', modelsData);
  }

  /**
   * Cache users data
   */
  async cacheUsers(usersData) {
    this.setCached('users', 'all', usersData);
  }

  /**
   * Get cached models data
   */
  getCachedModels() {
    if (this.isCacheValid('models', 'all')) {
      const cached = this.getCached('models', 'all');
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  getCachedUsers() {
    if (this.isCacheValid('users', 'all')) {
      const cached = this.getCached('users', 'all');
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  /**
   * Cache current model
   */
  async cacheCurrentModel(modelData) {
    this.setCached('models', 'current', modelData);
  }

  /**
   * Get cached current model
   */
  getCachedCurrentModel() {
    if (this.isCacheValid('models', 'current')) {
      const cached = this.getCached('models', 'current');
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      cacheSizes: {},
      hitRates: {},
      circuitBreaker: this.circuitBreaker,
      rateLimit: {
        requests: this.requestCount,
        maxRequests: this.maxRequestsPerMinute,
        windowStart: this.windowStart
      }
    };
    
    // Calculate cache sizes
    Object.keys(this.cache).forEach(cacheType => {
      if (this.cache[cacheType] instanceof Map) {
        stats.cacheSizes[cacheType] = this.cache[cacheType].size;
      }
    });
    
    return stats;
  }
  
  /**
   * Clear all caches
   */
  clearAllCaches() {
    
    Object.keys(this.cache).forEach(cacheType => {
      if (this.cache[cacheType] instanceof Map) {
        this.cache[cacheType].clear();
      }
    });
    
    Object.keys(this.lastUpdated).forEach(cacheType => {
      if (this.lastUpdated[cacheType] instanceof Map) {
        this.lastUpdated[cacheType].clear();
      } else {
        this.lastUpdated[cacheType] = 0;
      }
    });
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
