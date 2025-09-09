import { SessionManager } from '../utils/session-manager.js';

class SessionMiddleware {
  constructor(sessionManager = null) {
    this.sessionManager = sessionManager || new SessionManager();
  }

  // Middleware to validate sessions and handle inactivity
  validateSession = async (req, res, next) => {
    try {
      // Skip session validation for public endpoints
      const publicEndpoints = [
        '/api/passkey/auth-status',
        '/api/passkey/check-user',
        '/api/passkey/register',
        '/api/passkey/register-verify',
        '/api/passkey/authenticate',
        '/api/passkey/authenticate-verify',
        '/api/health',
        '/api/current-agent', // Allow checking current agent without session
        '/api/group-chats'    // Allow loading group chats without session
      ];
      
      if (publicEndpoints.includes(req.path)) {
        console.log(`🔓 Skipping session validation for public endpoint: ${req.path}`);
        // Session activity is now handled automatically by CouchDBSessionStore
        return next();
      }

      console.log(`🔒 Validating session for protected endpoint: ${req.path}`);
      const sessionId = req.sessionID;
      
      if (!sessionId) {
        return res.status(401).json({ error: 'No session ID found' });
      }

      // Check if session exists and is active (CouchDBSessionStore handles expiration automatically)
      if (!req.session || !req.session.userId) {
        return res.status(401).json({ 
          error: 'No valid session found',
          sessionExpired: true 
        });
      }

      // Calculate inactivity time for warnings
      const now = new Date();
      const lastActivity = new Date(req.session.lastActivity);
      const inactiveMinutes = (now - lastActivity) / (1000 * 60);

      // Check if warning should be shown (9.5 minutes of inactivity)
      let warning = false;
      let warningMessage = null;
      
      if (inactiveMinutes > 9.5) {
        warning = true;
        warningMessage = 'Session will expire in 30 seconds due to inactivity';
      }

      // Add session info to request
      req.sessionInfo = {
        sessionId,
        sessionType: req.session.sessionType,
        userId: req.session.userId,
        inactiveMinutes: Math.round(inactiveMinutes),
        warning: warning,
        warningMessage: warningMessage
      };

      next();
    } catch (error) {
      console.error('❌ Session middleware error:', error);
      res.status(500).json({ error: 'Session validation failed' });
    }
  };

  // Middleware to enforce single-user access
  enforceSingleUser = async (req, res, next) => {
    try {
      // Skip single-user enforcement for public endpoints
      const publicEndpoints = [
        '/api/passkey/auth-status',
        '/api/passkey/check-user',
        '/api/passkey/register',
        '/api/passkey/register-verify',
        '/api/passkey/authenticate',
        '/api/passkey/authenticate-verify',
        '/api/health',
        '/api/current-agent',
        '/api/group-chats'
      ];
      
      if (publicEndpoints.includes(req.path)) {
        return next();
      }

      // Allow Unknown User to always access
      if (req.session && req.session.userId === 'unknown_user') {
        return next();
      }

      // Check if there's an active authenticated session
      const hasActiveSession = await this.sessionManager.hasActiveAuthenticatedSession();
      
      if (hasActiveSession && (!req.session || !req.session.userId)) {
        return res.status(403).json({
          error: 'Private session in progress',
          message: 'Another user is currently signed in. Please wait or contact the administrator.',
          singleUserMode: true
        });
      }

      next();
    } catch (error) {
      console.error('❌ Single user enforcement error:', error);
      res.status(500).json({ error: 'Access control failed' });
    }
  };

  // Middleware to create session on authentication
  createSessionOnAuth = async (req, res, next) => {
    try {
      console.log(`🔍 [createSessionOnAuth] Route: ${req.path}`);
      console.log(`🔍 [createSessionOnAuth] Session ID: ${req.sessionID}`);
      console.log(`🔍 [createSessionOnAuth] Session data:`, req.session);
      
      // Run the passkey route first
      await next();
      
      // Wait a moment for session save to complete, then check if session was created
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const sessionId = req.sessionID;
      const userId = req.session.userId;
      
      console.log(`🔍 [createSessionOnAuth] After route - Session ID: ${sessionId}, User ID: ${userId}`);
      
      if (userId && sessionId) {
        try {
          // Session creation is now handled automatically by CouchDBSessionStore
          // when req.session is saved with userId. The store will create the session document.
          console.log(`✅ [createSessionOnAuth] Session will be created automatically by CouchDBSessionStore for user: ${userId}`);
        } catch (error) {
          console.error('❌ [createSessionOnAuth] Error in session creation logic:', error);
          // Don't throw - let the response continue
        }
      } else {
        console.log(`🔍 [createSessionOnAuth] No session data to create - userId: ${userId}, sessionId: ${sessionId}`);
      }
    } catch (error) {
      console.error('❌ [createSessionOnAuth] Error creating session on auth:', error);
      next(error); // Pass error to error handler
    }
  };

  // Middleware to handle deep link sessions
  createDeepLinkSession = async (req, res, next) => {
    try {
      const sessionId = req.sessionID;
      const deepLinkId = req.params.shareId || req.query.shareId;
      const ownedBy = req.session.userId || 'unknown_user';

      // Only create session if this is the initial page load (not API calls)
      // and we don't already have a session for this deep link
      if (deepLinkId && sessionId && req.path === `/shared/${deepLinkId}`) {
        // Check if session already exists
        const existingSession = await this.sessionManager.getSession(sessionId);
        
        if (!existingSession) {
          console.log(`🔗 [Deep Link] Creating session for initial access to: ${deepLinkId}`);
          await this.sessionManager.createSession(
            sessionId, 
            'deeplink', 
            'anonymous', 
            deepLinkId, 
            ownedBy
          );
        } else {
          console.log(`🔗 [Deep Link] Session already exists for: ${deepLinkId}`);
        }
      }

      next();
    } catch (error) {
      console.error('❌ Error creating deep link session:', error);
      next(); // Continue even if session creation fails
    }
  };

  // Middleware to check for inactivity warnings and cleanup expired sessions
  checkInactivityWarning = async (req, res, next) => {
    try {
      const sessionId = req.sessionID;
      
      if (sessionId) {
        const validation = await this.sessionManager.validateSession(sessionId);
        
        if (!validation.valid) {
          // Session is invalid or expired, add headers to inform frontend
          res.set('X-Session-Expired', 'true');
          res.set('X-Session-Expired-Reason', validation.reason);
          console.log('🔗 [Session] Session expired:', sessionId, validation.reason);
        } else if (validation.warning) {
          // Add warning to response headers
          res.set('X-Session-Warning', 'true');
          res.set('X-Session-Warning-Message', validation.warningMessage);
          res.set('X-Session-Inactive-Minutes', validation.inactiveMinutes.toString());
          console.log('⚠️ [Session] Inactivity warning for session:', sessionId, validation.inactiveMinutes, 'minutes');
        } else {
          // Update last activity for valid sessions
          await this.sessionManager.updateLastActivity(sessionId);
        }
      }

      next();
    } catch (error) {
      console.error('❌ Error checking inactivity warning:', error);
      next(); // Continue even if warning check fails
    }
  };
}

export { SessionMiddleware };
