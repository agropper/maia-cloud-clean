import { createCouchDBClient } from './couchdb-client.js';

class SessionManager {
  constructor(couchDBClient = null) {
    this.couchDBClient = couchDBClient || createCouchDBClient();
    this.INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    this.WARNING_DURATION = 30 * 1000; // 30 seconds
    this.DEEPLINK_CLEANUP_DAYS = 3;
  }

  // Create a new session document
  async createSession(sessionId, sessionType, userId, deepLinkId = null, ownedBy = null) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.INACTIVITY_TIMEOUT);
    
    const sessionDoc = {
      _id: `session_${sessionId}`,
      type: 'session',
      sessionType, // 'authenticated', 'unknown_user', 'deeplink'
      userId,
      isActive: true,
      lastActivity: now.toISOString(),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      warningShown: false,
      warningShownAt: null
    };

    // Add deep link specific fields
    if (sessionType === 'deeplink' && deepLinkId) {
      sessionDoc.deepLinkId = deepLinkId;
      sessionDoc.ownedBy = ownedBy;
      const cleanupDate = new Date(now.getTime() + (this.DEEPLINK_CLEANUP_DAYS * 24 * 60 * 60 * 1000));
      sessionDoc.cleanupDate = cleanupDate.toISOString();
    }

    try {
      // Note: maia_sessions database removed - sessions are now in-memory only
      return sessionDoc;
    } catch (error) {
      console.error('❌ Error creating session:', error);
      throw error;
    }
  }

  // Get a session by ID (in-memory only)
  async getSession(sessionId) {
    try {
      // Note: maia_sessions database removed - sessions are now in-memory only
      return null; // Sessions are now managed by express-session middleware
    } catch (error) {
      // Session doesn't exist - this is normal for new sessions
      return null;
    }
  }

  // Update last activity for a session (in-memory only)
  async updateLastActivity(sessionId) {
    try {
      // Note: maia_sessions database removed - sessions are now in-memory only
      return null; // Sessions are now managed by express-session middleware
    } catch (error) {
      console.error('❌ Error updating last activity:', error);
    }
    return null;
  }

  // Check if session is valid and handle inactivity
  async validateSession(sessionId) {
    try {
      // Note: maia_sessions database removed - sessions are now in-memory only
      const sessionDoc = null;
      
      if (!sessionDoc || !sessionDoc.isActive) {
        return { valid: false, reason: 'Session not found or inactive' };
      }

      const now = new Date();
      const lastActivity = new Date(sessionDoc.lastActivity);
      const inactiveMinutes = (now - lastActivity) / (1000 * 60);

      // Check if session has expired
      if (inactiveMinutes > 10) {
        await this.deactivateSession(sessionId);
        return { valid: false, reason: 'Session expired due to inactivity' };
      }

      // Check if warning should be shown (9.5 minutes of inactivity)
      if (inactiveMinutes > 9.5 && !sessionDoc.warningShown) {
        sessionDoc.warningShown = true;
        sessionDoc.warningShownAt = now.toISOString();
        // Note: maia_sessions database removed - sessions are now in-memory only
        
        return { 
          valid: true, 
          warning: true, 
          warningMessage: 'Session will expire in 30 seconds due to inactivity',
          inactiveMinutes: Math.round(inactiveMinutes)
        };
      }

      return { 
        valid: true, 
        inactiveMinutes: Math.round(inactiveMinutes),
        sessionType: sessionDoc.sessionType,
        userId: sessionDoc.userId
      };

    } catch (error) {
      console.error('❌ Error validating session:', error);
      return { valid: false, reason: 'Session validation error' };
    }
  }

  // Update last activity for a session
  async updateLastActivity(sessionId) {
    try {
      const sessionDocId = `session_${sessionId}`;
      const sessionDoc = await this.couchDBClient.getDocument('maia_sessions', sessionDocId);
      
      if (sessionDoc && sessionDoc.isActive) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.INACTIVITY_TIMEOUT);
        
        sessionDoc.lastActivity = now.toISOString();
        sessionDoc.expiresAt = expiresAt.toISOString();
        
        // Note: maia_sessions database removed - sessions are now in-memory only
      }
    } catch (error) {
      console.error('❌ Error updating last activity:', error);
    }
  }

  // Deactivate a session
  async deactivateSession(sessionId, deactivatedBy = 'admin') {
    try {
      const sessionDocId = `session_${sessionId}`;

      const sessionDoc = await this.couchDBClient.getDocument('maia_sessions', sessionDocId);
      if (sessionDoc) {
        // Physically delete the session document to prevent database growth
        // Note: maia_sessions database removed - sessions are now in-memory only
      } else {
      }
    } catch (error) {
      console.error('❌ [Session Delete] Error deactivating session from maia_sessions database:', error);
    }
  }

  // Check for active authenticated sessions (single-user enforcement)
  async hasActiveAuthenticatedSession() {
    try {
      // Note: maia_sessions database removed - sessions are now in-memory only
      const allSessions = [];
      const activeSessions = allSessions.filter(doc => 
        doc.type === 'session' && 
        doc.isActive && 
        doc.sessionType === 'authenticated'
      );

      return activeSessions.length > 0;
    } catch (error) {
      console.error('❌ Error checking active sessions:', error);
      return false;
    }
  }

  // Get all active sessions for admin dashboard
  async getAllActiveSessions() {
    try {
      // Get in-memory sessions from server.js
      let inMemorySessions = [];
      try {
        // Import the activeSessions from server.js
        const { activeSessions } = await import('../../server.js');
        inMemorySessions = activeSessions || [];
        console.log('🔍 [SessionManager] Retrieved in-memory sessions:', inMemorySessions.length);
      } catch (importError) {
        console.error('❌ [SessionManager] Error importing activeSessions:', importError.message);
      }
      
      const activeSessions = inMemorySessions;
      
      if (activeSessions.length > 0) {
        console.log('🔍 [SessionManager] Active sessions found:', activeSessions.map(s => ({
          sessionId: s.sessionId,
          userType: s.userType,
          userId: s.userId,
          username: s.username
        })));
      }

      const now = new Date();
      return activeSessions.map(session => {
        const lastActivity = new Date(session.lastActivity);
        const inactiveMinutes = Math.round((now - lastActivity) / (1000 * 60));
        
        const sessionInfo = {
          sessionId: session.sessionId,
          sessionType: session.userType, // Map userType to sessionType for compatibility
          userId: session.userId,
          username: session.username,
          lastActivity: session.lastActivity,
          inactiveMinutes,
          createdAt: session.createdAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent
        };

        // Add deep link specific info
        if (session.userType === 'deeplink') {
          const cleanupDate = new Date(session.cleanupDate);
          const cleanupInHours = Math.round((cleanupDate - now) / (1000 * 60 * 60));
          sessionInfo.deepLinkId = session.deepLinkId;
          sessionInfo.ownedBy = session.ownedBy;
          sessionInfo.cleanupInHours = Math.max(0, cleanupInHours);
        }

        return sessionInfo;
      });
    } catch (error) {
      console.error('❌ Error getting active sessions:', error);
      return [];
    }
  }

  // Cleanup expired deep links
  async cleanupExpiredDeepLinks() {
    try {
      // Note: maia_sessions database removed - sessions are now in-memory only
      const allSessions = [];
      const now = new Date();
      
      const expiredDeepLinks = allSessions.filter(doc => 
        doc.type === 'session' && 
        doc.sessionType === 'deeplink' && 
        doc.ownedBy === 'unknown_user' &&
        new Date(doc.cleanupDate) <= now
      );

      for (const session of expiredDeepLinks) {
        await this.deactivateSession(session._id.replace('session_', ''));
      }

      return expiredDeepLinks.length;
    } catch (error) {
      console.error('❌ Error cleaning up expired deep links:', error);
      return 0;
    }
  }
}

export { SessionManager };
