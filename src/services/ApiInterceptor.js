/**
 * Global API Call Interceptor
 * Prevents race conditions during logout by blocking all API requests
 */
class ApiInterceptor {
  constructor() {
    this.isShuttingDown = false;
    this.pendingRequests = new Set();
    this.originalFetch = null;
  }

  /**
   * Check if new requests should be blocked
   * @returns {boolean} True if requests should be blocked
   */
  shouldBlockRequest() {
    return this.isShuttingDown;
  }

  /**
   * Start the shutdown process - blocks all new API requests
   */
  startShutdown() {
    this.isShuttingDown = true;
    console.log('🚫 [API Interceptor] Blocking all new API requests during shutdown');
  }

  /**
   * Cancel all pending requests
   */
  cancelPendingRequests() {
    console.log(`🚫 [API Interceptor] Cancelling ${this.pendingRequests.size} pending requests`);
    this.pendingRequests.forEach(request => {
      if (request.abort) {
        request.abort();
      }
    });
    this.pendingRequests.clear();
  }

  /**
   * Reset the interceptor state (for testing or recovery)
   */
  reset() {
    this.isShuttingDown = false;
    this.pendingRequests.clear();
    console.log('🔄 [API Interceptor] Reset to normal state');
  }

  /**
   * Intercept all fetch calls to add shutdown protection
   */
  interceptFetch() {
    if (this.originalFetch) {
      console.warn('⚠️ [API Interceptor] Fetch already intercepted, skipping');
      return;
    }

    this.originalFetch = window.fetch;
    const interceptor = this;

    window.fetch = function(...args) {
      // Check if we should block this request
      if (interceptor.shouldBlockRequest()) {
        console.log('🚫 [API Interceptor] Blocked request during shutdown:', args[0]);
        return Promise.reject(new Error('Request blocked during shutdown - app is signing out'));
      }
      
      // Make the original request
      const request = interceptor.originalFetch.apply(this, args);
      
      // Track pending requests
      interceptor.pendingRequests.add(request);
      
      // Clean up when request completes
      request.finally(() => {
        interceptor.pendingRequests.delete(request);
      });
      
      return request;
    };

    console.log('✅ [API Interceptor] Fetch interception enabled');
  }

  /**
   * Restore original fetch function
   */
  restoreFetch() {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
      console.log('🔄 [API Interceptor] Restored original fetch function');
    }
  }
}

// Export singleton instance
export const apiInterceptor = new ApiInterceptor();
