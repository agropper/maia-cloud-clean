import { createCouchDBClient } from './couchdb-client.js';

// Function to write session to maia_sessions database
export const writeSessionToDatabase = async (sessionEvent) => {
  try {
    console.log('[*] [Session Write] Writing session to maia_sessions database:', {
      sessionId: sessionEvent.sessionId,
      userId: sessionEvent.userId,
      route: sessionEvent.route,
      timestamp: sessionEvent.timestamp
    });

    // Create CouchDB client for sessions database
    const couchDBClient = createCouchDBClient({ database: 'maia_sessions' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    const sessionDoc = {
      _id: `session_${sessionEvent.sessionId}`,
      type: 'session',
      sessionType: 'authenticated',
      userId: sessionEvent.userId,
      isActive: true,
      lastActivity: sessionEvent.timestamp,
      createdAt: sessionEvent.timestamp,
      expiresAt: expiresAt.toISOString(),
      warningShown: false,
      warningShownAt: null,
      deepLinkId: null,
      ownedBy: null
    };

    // Write to database
    console.log('[*] [Session Write] Writing to maia_sessions:', JSON.stringify(sessionDoc, null, 2));
    
    await couchDBClient.saveDocument('maia_sessions', sessionDoc);
    
    console.log('[*] [Session Write] Successfully wrote session to maia_sessions database');
  } catch (error) {
    console.error('❌ [Session Write] Error writing session to CouchDB:', error);
    throw error;
  }
};
