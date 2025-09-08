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
      console.log(`🔍 [SessionManager] Attempting to save session:`, sessionDoc);
      await this.couchDBClient.saveDocument('maia_sessions', sessionDoc);
      console.log(`✅ Session created: ${sessionType} for ${userId}`);
      return sessionDoc;
    } catch (error) {
      console.error('❌ Error creating session:', error);
      throw error;
    }
  }

  // Get a session by ID
  async getSession(sessionId) {
    try {
      const sessionDoc = await this.couchDBClient.getDocument('maia_sessions', `session_${sessionId}`);
      return sessionDoc;
    } catch (error) {
      // Session doesn't exist - this is normal for new sessions
      return null;
    }
  }

  // Update last activity for a session
  async updateLastActivity(sessionId) {
    try {
      const sessionDoc = await this.couchDBClient.getDocument('maia_sessions', `session_${sessionId}`);
      if (sessionDoc && sessionDoc.isActive) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.INACTIVITY_TIMEOUT);
        
        sessionDoc.lastActivity = now.toISOString();
        sessionDoc.expiresAt = expiresAt.toISOString();
        sessionDoc.warningShown = false;
        sessionDoc.warningShownAt = null;

        await this.couchDBClient.saveDocument('maia_sessions', sessionDoc);
        return sessionDoc;
      }
    } catch (error) {
      console.error('❌ Error updating last activity:', error);
    }
    return null;
  }

  // Check if session is valid and handle inactivity
  async validateSession(sessionId) {
    try {
      const sessionDoc = await this.couchDBClient.getDocument('maia_sessions', `session_${sessionId}`);
      
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
        await this.couchDBClient.saveDocument('maia_sessions', sessionDoc);
        
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

  // Deactivate a session
  async deactivateSession(sessionId, deactivatedBy = 'admin') {
    try {
      const sessionDocId = `session_${sessionId}`;
      console.log('[*] [Session Delete] Admin deleting session from maia_sessions database:', sessionDocId);
      
      const sessionDoc = await this.couchDBClient.getDocument('maia_sessions', sessionDocId);
      if (sessionDoc) {
        // Physically delete the session document to prevent database growth
        await this.couchDBClient.deleteDocument('maia_sessions', sessionDocId);
        console.log('[*] [Session Delete] Successfully deleted session from maia_sessions database');
        console.log(`✅ Session deleted: ${sessionId}`);
      } else {
        console.log('[*] [Session Delete] Session not found in maia_sessions database (may have been cleaned up)');
      }
    } catch (error) {
      console.error('❌ [Session Delete] Error deactivating session from maia_sessions database:', error);
    }
  }

  // Check for active authenticated sessions (single-user enforcement)
  async hasActiveAuthenticatedSession() {
    try {
      const allSessions = await this.couchDBClient.getAllDocuments('maia_sessions');
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
      // First, let's see ALL sessions in the database for debugging
      const allSessions = await this.couchDBClient.getAllDocuments('maia_sessions');
      console.log(`🔍 [SessionManager] DEBUG: Total sessions in database: ${allSessions.length}`);
      console.log(`🔍 [SessionManager] DEBUG: All sessions:`, allSessions.map(s => ({
        _id: s._id,
        sessionType: s.sessionType,
        userId: s.userId,
        isActive: s.isActive,
        deactivatedBy: s.deactivatedBy,
        deactivatedAt: s.deactivatedAt
      })));
      
      // Use findDocuments instead of getAllDocuments to avoid connection issues
      const query = {
        selector: {
          type: 'session',
          isActive: true
        }
      };
      
      const result = await this.couchDBClient.findDocuments('maia_sessions', query);
      const activeSessions = result.docs;
      console.log(`🔍 [SessionManager] Active sessions found: ${activeSessions.length}`);
      
      if (activeSessions.length > 0) {
        console.log(`🔍 [SessionManager] Active session details:`, activeSessions.map(s => ({
          _id: s._id,
          sessionType: s.sessionType,
          userId: s.userId,
          isActive: s.isActive
        })));
      }

      const now = new Date();
      return activeSessions.map(session => {
        const lastActivity = new Date(session.lastActivity);
        const inactiveMinutes = Math.round((now - lastActivity) / (1000 * 60));
        
        const sessionInfo = {
          sessionId: session._id.replace('session_', ''),
          sessionType: session.sessionType,
          userId: session.userId,
          lastActivity: session.lastActivity,
          inactiveMinutes,
          createdAt: session.createdAt
        };

        // Add deep link specific info
        if (session.sessionType === 'deeplink') {
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
      const allSessions = await this.couchDBClient.getAllDocuments('maia_sessions');
      const now = new Date();
      
      const expiredDeepLinks = allSessions.filter(doc => 
        doc.type === 'session' && 
        doc.sessionType === 'deeplink' && 
        doc.ownedBy === 'unknown_user' &&
        new Date(doc.cleanupDate) <= now
      );

      for (const session of expiredDeepLinks) {
        await this.deactivateSession(session._id.replace('session_', ''));
        console.log(`🧹 Cleaned up expired deep link: ${session.deepLinkId}`);
      }

      return expiredDeepLinks.length;
    } catch (error) {
      console.error('❌ Error cleaning up expired deep links:', error);
      return 0;
    }
  }
}

export { SessionManager };
