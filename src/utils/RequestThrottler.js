/**
 * Request Throttler Utility
 * Prevents API rate limiting by queuing and throttling requests
 */

class RequestThrottler {
  constructor(options = {}) {
    this.queue = []
    this.isProcessing = false
    this.delay = options.delay || 200 // 200ms between requests
    this.maxRetries = options.maxRetries || 3
    this.retryDelay = options.retryDelay || 1000 // 1 second retry delay
  }

  /**
   * Add a request to the queue
   * @param {Function} requestFn - Function that returns a Promise
   * @param {Object} options - Request options
   * @returns {Promise} - Promise that resolves with the request result
   */
  async addRequest(requestFn, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn,
        resolve,
        reject,
        retries: 0,
        ...options
      })
      
      this.processQueue()
    })
  }

  /**
   * Process the request queue
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    while (this.queue.length > 0) {
      const request = this.queue.shift()
      
      try {
        const result = await request.requestFn()
        request.resolve(result)
      } catch (error) {
        // Handle 429 errors with exponential backoff
        if (error.status === 429 || (error.message && typeof error.message === 'string' && error.message.includes('429'))) {
          if (request.retries < this.maxRetries) {
            request.retries++
            const backoffDelay = this.retryDelay * Math.pow(2, request.retries - 1)
            
            // Re-queue the request with backoff
            setTimeout(() => {
              this.queue.unshift(request)
              this.processQueue()
            }, backoffDelay)
            
            continue
          } else {
            request.reject(error)
          }
        } else {
          request.reject(error)
        }
      }

      // Add delay between requests to prevent rate limiting
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay))
      }
    }

    this.isProcessing = false
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    this.queue.forEach(request => {
      request.reject(new Error('Request cancelled'))
    })
    this.queue = []
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing
    }
  }
}

// Create a global instance
const requestThrottler = new RequestThrottler({
  delay: 300, // 300ms between requests
  maxRetries: 3,
  retryDelay: 1000
})

export default requestThrottler
