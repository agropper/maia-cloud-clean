import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import '@/css/quasar.variables.sass'
import '@/css/main.scss'
import 'overlayscrollbars/styles/overlayscrollbars.css'

import App from '@/entry/App.vue'
import { Quasar } from 'quasar'
import { createApp } from 'vue'
import quasarUserOptions from '@/quasar-user-options'

// Global fetch interceptor to check for session verification headers and Cloudant errors
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  // Check for Cloudant rate limiting (429 errors)
  if (response.status === 429) {
    try {
      const errorData = await response.clone().json();
      console.warn('🚨 [Browser] Cloudant Rate Limit Exceeded (429):', {
        error: errorData.error || 'Too many requests',
        retryAfter: errorData.retryAfter || '30 seconds',
        suggestion: errorData.suggestion || 'Please wait and try again',
        url: args[0],
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.warn('🚨 [Browser] Cloudant Rate Limit Exceeded (429): Too many requests - please wait and try again', {
        url: args[0],
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Check for session verification headers (based on actual database reads)
  const sessionVerifiedHeader = response.headers.get('X-Session-Verified');
  const sessionErrorHeader = response.headers.get('X-Session-Error');
  const sessionExpiredHeader = response.headers.get('X-Session-Expired');
  const sessionWarningHeader = response.headers.get('X-Session-Warning');
  
  if (sessionVerifiedHeader) {
    try {
      const data = JSON.parse(sessionVerifiedHeader);
      console.log(data.message, {
        sessionId: data.sessionId,
        userId: data.userId,
        isActive: data.isActive,
        createdAt: data.createdAt,
        timestamp: data.timestamp
      });
    } catch (e) {
    }
  }
  
  if (sessionErrorHeader) {
    try {
      const data = JSON.parse(sessionErrorHeader);
      console.error(data.message, {
        sessionId: data.sessionId,
        error: data.error,
        timestamp: data.timestamp
      });
    } catch (e) {
      console.error('❌ [Browser] Session database error');
    }
  }
  
  if (sessionExpiredHeader) {
    const reason = response.headers.get('X-Session-Expired-Reason');
    
    // Show user notification about session expiration
    if (window.location.pathname.startsWith('/shared/')) {
      // For deep link users, show a notification and potentially redirect
    }
  }
  
  if (sessionWarningHeader) {
    const warningMessage = response.headers.get('X-Session-Warning-Message');
    const inactiveMinutes = response.headers.get('X-Session-Inactive-Minutes');
  }
  
  return response;
};

// Window close detection for deep link sessions
window.addEventListener('beforeunload', async (event) => {
  // Check if we're on a deep link page
  const isDeepLink = window.location.pathname.startsWith('/shared/');
  
  if (isDeepLink) {
    try {
      // Send a request to delete the session when user closes window
      const shareId = window.location.pathname.split('/shared/')[1];
      
      // Use sendBeacon for reliable delivery even when page is closing
      if (navigator.sendBeacon) {
        const data = JSON.stringify({ shareId, action: 'window_close' });
        navigator.sendBeacon('/api/deep-link-session/cleanup', data);
      }
    } catch (error) {
      console.error('❌ [Deep Link] Error cleaning up session on window close:', error);
    }
  }
});

const app = createApp(App)
app.use(Quasar, quasarUserOptions)
app.mount('#app')
