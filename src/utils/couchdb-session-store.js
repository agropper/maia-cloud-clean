import { createCouchDBClient } from './couchdb-client.js';
import session from 'express-session';

const Store = session.Store;

/**
 * CouchDB Session Store for express-session
 * Replaces the dual session system with a single, database-backed solution
 */
class CouchDBSessionStore extends Store {
  constructor(options = {}) {
    super(options);
    this.couchDBClient = options.couchDBClient || createCouchDBClient();
    this.dbName = options.dbName || 'maia_chats';
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default
    this.inactivityTimeout = options.inactivityTimeout || 10 * 60 * 1000; // 10 minutes
    this.warningDuration = options.warningDuration || 30 * 1000; // 30 seconds
  }

  // Get session from database
  async get(sessionId, callback) {
    try {
      // Ensure sessionId is a string
      const cleanSessionId = String(sessionId);
      if (!cleanSessionId || cleanSessionId === 'undefined' || cleanSessionId === 'null') {
        return callback(null, null);
      }

      const docId = `session_${cleanSessionId}`;
      const sessionDoc = await this.couchDBClient.getDocument(this.dbName, docId);
      
      if (!sessionDoc || !sessionDoc.isActive) {
        return callback(null, null);
      }

      // Check if session has expired due to inactivity
      const now = new Date();
      const lastActivity = new Date(sessionDoc.lastActivity);
      const inactiveMinutes = (now - lastActivity) / (1000 * 60);

      if (inactiveMinutes > (this.inactivityTimeout / (1000 * 60))) {
        // Session expired, deactivate it
        await this.destroy(cleanSessionId, () => {});
        return callback(null, null);
      }

      // Return the session data
      const sessionData = {
        userId: sessionDoc.userId,
        sessionType: sessionDoc.sessionType,
        lastActivity: sessionDoc.lastActivity,
        createdAt: sessionDoc.createdAt,
        deepLinkId: sessionDoc.deepLinkId,
        ownedBy: sessionDoc.ownedBy
      };

      callback(null, sessionData);
    } catch (error) {
      console.error('❌ Error getting session from CouchDB:', error);
      callback(error, null);
    }
  }

  // Set session in database
  async set(sessionId, sessionData, callback) {
    try {
      // Ensure sessionId is a string
      const cleanSessionId = String(sessionId);
      if (!cleanSessionId || cleanSessionId === 'undefined' || cleanSessionId === 'null') {
        console.error('❌ Invalid sessionId provided:', sessionId);
        return callback(new Error('Invalid sessionId'));
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.inactivityTimeout);
      
      // Check if session already exists to avoid conflicts
      let sessionDoc;
      try {
        const existingDoc = await this.couchDBClient.getDocument(this.dbName, `session_${cleanSessionId}`);
        if (existingDoc) {
          // Update existing session
          sessionDoc = {
            ...existingDoc,
            sessionType: sessionData.sessionType || existingDoc.sessionType || 'authenticated',
            userId: sessionData.userId || existingDoc.userId,
            isActive: true,
            lastActivity: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            warningShown: false,
            warningShownAt: null,
            deepLinkId: sessionData.deepLinkId || existingDoc.deepLinkId || null,
            ownedBy: sessionData.ownedBy || existingDoc.ownedBy || null
          };
          console.log(`🔄 [CouchDB Session] Updating existing session: ${cleanSessionId} (user: ${sessionData.userId})`);
        } else {
          // Create new session
          sessionDoc = {
            _id: `session_${cleanSessionId}`,
            type: 'session',
            sessionType: sessionData.sessionType || 'authenticated',
            userId: sessionData.userId,
            isActive: true,
            lastActivity: now.toISOString(),
            createdAt: sessionData.createdAt || now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            warningShown: false,
            warningShownAt: null,
            deepLinkId: sessionData.deepLinkId || null,
            ownedBy: sessionData.ownedBy || null
          };
          console.log(`💾 [CouchDB Session] Creating new session: ${cleanSessionId} (user: ${sessionData.userId})`);
        }
      } catch (getError) {
        // Document doesn't exist, create new one
        sessionDoc = {
          _id: `session_${cleanSessionId}`,
          type: 'session',
          sessionType: sessionData.sessionType || 'authenticated',
          userId: sessionData.userId,
          isActive: true,
          lastActivity: now.toISOString(),
          createdAt: sessionData.createdAt || now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          warningShown: false,
          warningShownAt: null,
          deepLinkId: sessionData.deepLinkId || null,
          ownedBy: sessionData.ownedBy || null
        };
        console.log(`💾 [CouchDB Session] Creating new session (not found): ${cleanSessionId} (user: ${sessionData.userId})`);
      }

      await this.couchDBClient.saveDocument(this.dbName, sessionDoc);
      callback(null);
    } catch (error) {
      console.error('❌ Error setting session in CouchDB:', error);
      callback(error);
    }
  }

  // Destroy session
  async destroy(sessionId, callback) {
    try {
      // Ensure sessionId is a string
      const cleanSessionId = String(sessionId);
      if (!cleanSessionId || cleanSessionId === 'undefined' || cleanSessionId === 'null') {
        return callback(null);
      }

      const docId = `session_${cleanSessionId}`;
      const sessionDoc = await this.couchDBClient.getDocument(this.dbName, docId);
      
      if (sessionDoc) {
        sessionDoc.isActive = false;
        sessionDoc.deactivatedAt = new Date().toISOString();
        await this.couchDBClient.saveDocument(this.dbName, sessionDoc);
        console.log(`🗑️ [CouchDB Session] Deactivated session: ${cleanSessionId}`);
      }
      
      callback(null);
    } catch (error) {
      console.error('❌ Error destroying session in CouchDB:', error);
      callback(error);
    }
  }

  // Touch session (update last activity)
  async touch(sessionId, sessionData, callback) {
    try {
      // Ensure sessionId is a string
      const cleanSessionId = String(sessionId);
      if (!cleanSessionId || cleanSessionId === 'undefined' || cleanSessionId === 'null') {
        return callback(null);
      }

      const docId = `session_${cleanSessionId}`;
      
      try {
        const sessionDoc = await this.couchDBClient.getDocument(this.dbName, docId);
        
        if (sessionDoc && sessionDoc.isActive) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + this.inactivityTimeout);
          
          sessionDoc.lastActivity = now.toISOString();
          sessionDoc.expiresAt = expiresAt.toISOString();
          sessionDoc.warningShown = false; // Reset warning on activity
          sessionDoc.warningShownAt = null;

          await this.couchDBClient.saveDocument(this.dbName, sessionDoc);
          console.log(`🔄 [CouchDB Session] Touched session: ${cleanSessionId} (user: ${sessionDoc.userId})`);
        }
      } catch (getError) {
        // Session doesn't exist, that's okay for touch operations
        console.log(`🔍 [CouchDB Session] Session ${cleanSessionId} not found for touch operation`);
      }
      
      callback(null);
    } catch (error) {
      console.error('❌ Error touching session in CouchDB:', error);
      callback(error);
    }
  }

  // Get all sessions (for admin purposes)
  async all(callback) {
    try {
      const query = {
        selector: {
          type: 'session',
          isActive: true
        }
      };
      
      const result = await this.couchDBClient.findDocuments(this.dbName, query);
      const sessions = {};
      
      result.docs.forEach(doc => {
        const sessionId = doc._id.replace('session_', '');
        sessions[sessionId] = {
          userId: doc.userId,
          sessionType: doc.sessionType,
          lastActivity: doc.lastActivity,
          createdAt: doc.createdAt,
          deepLinkId: doc.deepLinkId,
          ownedBy: doc.ownedBy
        };
      });
      
      callback(null, sessions);
    } catch (error) {
      console.error('❌ Error getting all sessions from CouchDB:', error);
      callback(error, null);
    }
  }

  // Get session count
  async length(callback) {
    try {
      const query = {
        selector: {
          type: 'session',
          isActive: true
        }
      };
      
      const result = await this.couchDBClient.findDocuments(this.dbName, query);
      callback(null, result.docs.length);
    } catch (error) {
      console.error('❌ Error getting session count from CouchDB:', error);
      callback(error, 0);
    }
  }

  // Clear all sessions
  async clear(callback) {
    try {
      const query = {
        selector: {
          type: 'session',
          isActive: true
        }
      };
      
      const result = await this.couchDBClient.findDocuments(this.dbName, query);
      
      for (const doc of result.docs) {
        doc.isActive = false;
        doc.deactivatedAt = new Date().toISOString();
        await this.couchDBClient.saveDocument(this.dbName, doc);
      }
      
      console.log(`🧹 [CouchDB Session] Cleared ${result.docs.length} sessions`);
      callback(null);
    } catch (error) {
      console.error('❌ Error clearing sessions from CouchDB:', error);
      callback(error);
    }
  }

  // Create session method (required by express-session)
  async createSession(sessionId, sessionData, callback) {
    // This is just an alias for set() method
    return this.set(sessionId, sessionData, callback);
  }

  // Reload method (required by express-session)
  async reload(sessionId, callback) {
    // This is just an alias for get() method
    return this.get(sessionId, callback);
  }

  // Generate session ID (optional but recommended)
  generate() {
    // Use the default session ID generation from express-session
    return require('uid-safe').sync(24);
  }

  // Regenerate session ID (optional but recommended)
  async regenerate(req, callback) {
    // This is handled by express-session itself, but we can provide a stub
    if (callback) callback();
  }
}

export { CouchDBSessionStore };
