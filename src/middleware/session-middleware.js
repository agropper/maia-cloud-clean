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
        return next();
      }

      console.log(`🔒 Validating session for protected endpoint: ${req.path}`);
      const sessionId = req.sessionID;
      
      if (!sessionId) {
        return res.status(401).json({ error: 'No session ID found' });
      }

      const validation = await this.sessionManager.validateSession(sessionId);
      
      if (!validation.valid) {
        // Clear the session
        req.session.destroy();
        return res.status(401).json({ 
          error: validation.reason,
          sessionExpired: true 
        });
      }

      // Update last activity
      await this.sessionManager.updateLastActivity(sessionId);

      // Add session info to request
      req.sessionInfo = {
        sessionId,
        sessionType: validation.sessionType,
        userId: validation.userId,
        inactiveMinutes: validation.inactiveMinutes,
        warning: validation.warning || false,
        warningMessage: validation.warningMessage
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
          // Check if session already exists to avoid duplicates
          const existingSession = await this.sessionManager.getSession(sessionId);
          if (!existingSession) {
            // Determine session type
            let sessionType = 'unknown_user';
            if (userId !== 'unknown_user') {
              sessionType = 'authenticated';
            }

            // Create session document
            await this.sessionManager.createSession(sessionId, sessionType, userId);
            console.log(`✅ [createSessionOnAuth] Session created for user: ${userId} (type: ${sessionType})`);
          } else {
            console.log(`🔍 [createSessionOnAuth] Session already exists for user: ${userId}`);
          }
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

      if (deepLinkId && sessionId) {
        await this.sessionManager.createSession(
          sessionId, 
          'deeplink', 
          'anonymous', 
          deepLinkId, 
          ownedBy
        );
      }

      next();
    } catch (error) {
      console.error('❌ Error creating deep link session:', error);
      next(); // Continue even if session creation fails
    }
  };

  // Middleware to check for inactivity warnings
  checkInactivityWarning = async (req, res, next) => {
    try {
      const sessionId = req.sessionID;
      
      if (sessionId) {
        const validation = await this.sessionManager.validateSession(sessionId);
        
        if (validation.warning) {
          // Add warning to response headers
          res.set('X-Session-Warning', 'true');
          res.set('X-Session-Warning-Message', validation.warningMessage);
          res.set('X-Session-Inactive-Minutes', validation.inactiveMinutes.toString());
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
