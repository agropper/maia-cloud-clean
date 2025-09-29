/**
 * Throttled Fetch Utility
 * Wraps fetch requests with throttling and retry logic
 */

import requestThrottler from './RequestThrottler.js'

/**
 * Throttled fetch function that respects rate limits
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} throttleOptions - Throttling options
 * @returns {Promise<Response>} - Fetch response
 */
export async function throttledFetch(url, options = {}, throttleOptions = {}) {
  return requestThrottler.addRequest(async () => {
    const response = await fetch(url, {
      credentials: 'include',
      ...options
    })

    // Check for rate limiting
    if (response.status === 429) {
      const error = new Error(`Rate limited: ${response.status} ${response.statusText}`)
      error.status = 429
      error.response = response
      throw error
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
      error.status = response.status
      error.response = response
      throw error
    }

    return response
  }, throttleOptions)
}

/**
 * Throttled fetch with JSON parsing
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} throttleOptions - Throttling options
 * @returns {Promise<Object>} - Parsed JSON response
 */
export async function throttledFetchJson(url, options = {}, throttleOptions = {}) {
  const response = await throttledFetch(url, options, throttleOptions)
  return response.json()
}

/**
 * Get throttler status
 * @returns {Object} - Throttler status
 */
export function getThrottlerStatus() {
  return requestThrottler.getStatus()
}

/**
 * Clear throttler queue
 */
export function clearThrottlerQueue() {
  requestThrottler.clearQueue()
}
