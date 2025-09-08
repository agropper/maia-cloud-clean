import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import '@/css/quasar.variables.sass'
import '@/css/main.scss'
import 'overlayscrollbars/styles/overlayscrollbars.css'

import App from '@/entry/App.vue'
import { Quasar } from 'quasar'
import { createApp } from 'vue'
import quasarUserOptions from '@/quasar-user-options'

// Global fetch interceptor to check for session verification headers
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  // Check for session verification headers (based on actual database reads)
  const sessionVerifiedHeader = response.headers.get('X-Session-Verified');
  const sessionErrorHeader = response.headers.get('X-Session-Error');
  
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
      console.log('[*] [Browser] Session verified in maia_sessions database');
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
  
  return response;
};

const app = createApp(App)
app.use(Quasar, quasarUserOptions)
app.mount('#app')
