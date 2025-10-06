/**
 * Unified Cache Manager for Cloudant/CouchDB operations
 * Prevents 429 errors by caching database calls and implementing rate limiting
 */

export class CacheManager {
  constructor() {
    this.cache = {
      users: new Map(),           // userId -> userDocument
      chats: new Map(),           // 'all' -> allChatsArray
      agentAssignments: new Map(), // userId -> { assignedAgentId, assignedAgentName }
      knowledgeBases: new Map(),   // kbId -> kbDocument
      agents: new Map(),          // 'all' -> allAgentsArray
      models: new Map(),          // 'all' -> allModelsArray, 'current' -> currentModel
      health: new Map()           // 'admin' -> health status
    };
    
    this.lastUpdated = {
      users: new Map(),           // userId -> timestamp
      chats: 0,                   // timestamp
      agentAssignments: new Map(), // userId -> timestamp
      knowledgeBases: new Map(),   // kbId -> timestamp
      agents: 0,                  // timestamp
      models: new Map(),          // 'all' -> timestamp, 'current' -> timestamp
      health: new Map()           // key -> timestamp
    };
    
    // Cache TTL (Time To Live) in milliseconds
    this.ttl = {
      users: 15 * 60 * 1000,       // 15 minutes (admin data changes infrequently)
      chats: 2 * 60 * 1000,        // 2 minutes
      agentAssignments: 15 * 60 * 1000, // 15 minutes (admin data)
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
      
      this.cache[cacheType].set(key, data);
      this.lastUpdated[cacheType].set(key, now);
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
      if (this.lastUpdated[cacheType]) {
        this.lastUpdated[cacheType].delete(key);
      }
    } else if (this.cache[cacheType]) {
      this.cache[cacheType].clear();
      if (this.lastUpdated[cacheType]) {
        this.lastUpdated[cacheType].clear();
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
      
      // Cache the result
      this.setCached(cacheType, documentId, result);
      
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
    
    // SECURITY CHECK: Prevent currentUser from being saved to database
    if (databaseName === 'maia_users' && document && document.currentUser) {
      throw new Error(`🚨 SECURITY VIOLATION: Attempted to save 'currentUser' field to maia_users database. This is dangerous and forbidden. Document ID: ${documentId}`);
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded - cannot make database request');
    }
    
    try {
      const result = await this.executeWithCircuitBreaker(
        () => couchDBClient.saveDocument(databaseName, document),
        `saveDocument(${cacheKey})`
      );
      
      // Invalidate related caches
      this.invalidateCache(cacheType, documentId);
      
      // If it's a user document, invalidate related caches
      if (databaseName === 'maia_users') {
        this.invalidateUserRelatedCaches(documentId);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ [CACHE] Failed to save ${cacheKey}:`, error.message);
      throw error;
    }
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
    
    // Invalidate user document
    this.invalidateCache('users', userId);
    
    // Invalidate agent assignments
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
