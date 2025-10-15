import dotenv from 'dotenv'
dotenv.config()

// console.log('🚨 SERVER.JS IS LOADING - LINE 3');

// Import session management utilities
import { SessionManager } from './src/utils/session-manager.js';
import { SessionMiddleware } from './src/middleware/session-middleware.js';
import cookieParser from 'cookie-parser';

// Import throttling utilities
import requestThrottler from './src/utils/RequestThrottler.js';

// Global error handling to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Debug environment variables - commented out for cleaner logs
// console.log('🔍 Environment Debug:');
// console.log('Current working directory:', process.cwd());
// console.log('DIGITALOCEAN_PERSONAL_API_KEY exists:', !!process.env.DIGITALOCEAN_PERSONAL_API_KEY);
// console.log('DIGITALOCEAN_PERSONAL_API_KEY length:', process.env.DIGITALOCEAN_PERSONAL_API_KEY?.length || 0);

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import pdf from 'pdf-parse';
import multer from 'multer';
import session from 'express-session';
import fs from 'fs';
import { cacheManager } from './src/utils/CacheManager.js';
import { initializeAlertSystem, sendAdminAlert, AlertCategory, AlertSeverity } from './src/utils/admin-alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Unified Cloudant/CouchDB setup
import { createCouchDBClient } from './src/utils/couchdb-client.js';

const couchDBClient = createCouchDBClient();

// Global session tracking
const activeSessions = [];
const serverStartTime = Date.now(); // Track when this server instance started
process.env.SERVER_START_TIME = serverStartTime.toString(); // Set for session validation

// Session management functions
const generateSessionId = () => {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const createSession = (userType, userData, req) => {
  const session = {
    sessionId: generateSessionId(),
    userType: userType,           // 'public', 'deep_link', 'private', 'admin'
    userId: userData.userId,
    username: userData.username,
    userEmail: userData.userEmail,
    shareId: userData.shareId,    // For deep link users
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    lastPoll: null,               // When client last polled for updates
    expiresAt: new Date(Date.now() + getSessionTimeout(userType)).toISOString(),
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    pendingUpdates: []            // Queue of updates to send to this session
  };
  
  activeSessions.push(session);
  console.log(`[PAGE LOAD] ${userType} session created - ${userData.userId || userData.username}`);
  
  // Log to database
  logSessionEvent('created', session);
  
  // Send session creation update to admin panels
  try {
    const updateData = {
      sessionId: session.sessionId,
      userType: userType,
      userId: userData.userId || userData.username,
      message: `${userType} session created for ${userData.userId || userData.username}`
    };
    addUpdateToAllAdmins('session_created', updateData);
  } catch (error) {
    console.error('Error sending session created update:', error.message);
  }
  
  return session;
};

const removeSession = (sessionId) => {
  const sessionIndex = activeSessions.findIndex(s => s.sessionId === sessionId);
  if (sessionIndex !== -1) {
    const session = activeSessions[sessionIndex];
    activeSessions.splice(sessionIndex, 1);
    
    console.log(`[PAGE LOAD] ${session.userType} session destroyed - ${session.userId || session.username}`);
    
    // Log to database
    logSessionEvent('destroyed', session);
    
    // Send session ended update to admin panels
    try {
      const updateData = {
        sessionId: sessionId,
        userType: session.userType,
        userId: session.userId || session.username,
        message: `${session.userType} session ended for ${session.userId || session.username}`
      };
      addUpdateToAllAdmins('session_ended', updateData);
    } catch (error) {
      console.error('Error sending session ended update:', error.message);
    }
  }
};

const updateSessionActivity = (sessionId, activityType = 'api_request') => {
  const sessionIndex = activeSessions.findIndex(s => s.sessionId === sessionId);
  if (sessionIndex !== -1) {
    const session = activeSessions[sessionIndex];
    const previousActivity = session.lastActivity;
    session.lastActivity = new Date().toISOString();
    
    // Only send session_updated notifications for significant activities
    // (not for every API request to avoid spam)
    if (activityType === 'user_action' || activityType === 'file_upload') {
      try {
        const updateData = {
          sessionId: sessionId,
          userType: session.userType,
          userId: session.userId || session.username,
          activityType: activityType,
          message: `${session.userType} session activity: ${activityType} for ${session.userId || session.username}`
        };
        addUpdateToAllAdmins('session_updated', updateData);
      } catch (error) {
        console.error('Error sending session updated update:', error.message);
      }
    }
  }
};

const getSessionTimeout = (userType) => {
  const timeouts = {
    'public': 0,           // No session tracking
    'deep_link': 30 * 60 * 1000,      // 30 minutes
    'private': 24 * 60 * 60 * 1000,   // 24 hours
    'admin': 24 * 60 * 60 * 1000      // 24 hours
  };
  return timeouts[userType] || 24 * 60 * 60 * 1000;
};

const logSessionEvent = async (event, session, reason = null) => {
  try {
    // Ensure the session logs database exists (only create if it doesn't exist)
    try {
      await couchDBClient.createDatabase('maia_session_logs');
    } catch (dbError) {
      // Database already exists, ignore error
      // No need to log this as it's expected behavior
    }
    
    const logDoc = {
      _id: `session_log_${session.sessionId}_${Date.now()}`,
      type: 'session_log',
      event: event,
      sessionId: session.sessionId,
      userType: session.userType,
      userId: session.userId,
      username: session.username,
      userEmail: session.userEmail,
      shareId: session.shareId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      timestamp: new Date().toISOString(),
      reason: reason
    };
    
    await couchDBClient.saveDocument('maia_session_logs', logDoc);
    console.log(`[SESSION LOG] ${event} - ${session.userType} user ${session.userId || session.username}`);
  } catch (error) {
    console.error(`[SESSION LOG] Failed to log ${event} event:`, error.message);
  }
};

// Update management functions
const addUpdateToSession = (sessionId, updateType, updateData) => {
  const session = activeSessions.find(s => s.sessionId === sessionId);
  if (session) {
    const update = {
      type: updateType,
      data: updateData,
      timestamp: new Date().toISOString(),
      id: `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    session.pendingUpdates.push(update);
    
    // Keep only last 50 updates to prevent memory bloat
    if (session.pendingUpdates.length > 50) {
      session.pendingUpdates = session.pendingUpdates.slice(-50);
    }
    
    console.log(`[POLLING] Added ${updateType} update to session ${sessionId}`);
    return update;
  }
  return null;
};

const addUpdateToUser = (userId, updateType, updateData) => {
  const session = activeSessions.find(s => s.userId === userId);
  if (session) {
    return addUpdateToSession(session.sessionId, updateType, updateData);
  }
  return null;
};

const addUpdateToAllAdmins = (updateType, updateData) => {
  const adminSessions = activeSessions.filter(s => s.userType === 'admin');
  const updates = [];
  
  adminSessions.forEach(session => {
    const update = addUpdateToSession(session.sessionId, updateType, updateData);
    if (update) {
      updates.push({ sessionId: session.sessionId, update });
    }
  });
  
  console.log(`[POLLING] Added ${updateType} update to ${updates.length} admin sessions`);
  return updates;
};

const getPendingUpdates = (sessionId, lastPollTimestamp) => {
  const session = activeSessions.find(s => s.sessionId === sessionId);
  if (!session) {
    return { updates: [], hasMore: false, nextPollIn: 5000 };
  }
  
  // Update lastPoll timestamp
  session.lastPoll = new Date().toISOString();
  session.lastActivity = new Date().toISOString();
  
  // Filter updates newer than lastPollTimestamp
  let pendingUpdates = session.pendingUpdates;
  if (lastPollTimestamp) {
    const lastPoll = new Date(lastPollTimestamp);
    pendingUpdates = session.pendingUpdates.filter(update => 
      new Date(update.timestamp) > lastPoll
    );
  }
  
  // Clear delivered updates (keep only last 10 for debugging)
  session.pendingUpdates = session.pendingUpdates.slice(-10);
  
  // Determine next poll interval based on user type
  const nextPollIn = session.userType === 'admin' ? 5000 : 10000; // 5s for admin, 10s for users
  
  return {
    updates: pendingUpdates,
    hasMore: false,
    nextPollIn: nextPollIn,
    sessionId: sessionId,
    userType: session.userType
  };
};

// Public User session management
let publicUserSession = null;

const getOrCreatePublicUserSession = (req) => {
  if (!publicUserSession) {
    publicUserSession = {
      sessionId: 'public_user_session',
      userType: 'public',
      userId: 'Public User',
      username: 'Public User',
      userEmail: null,
      shareId: null,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      lastPoll: null,
      expiresAt: null, // Public sessions don't expire
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      pendingUpdates: []
    };
    
    activeSessions.push(publicUserSession);
    console.log(`[PAGE LOAD] Public User session created - unified tracking`);
    
    // Log to database
    logSessionEvent('created', publicUserSession);
    
    // Send session creation update to admin panels
    try {
      const updateData = {
        sessionId: publicUserSession.sessionId,
        userType: 'public',
        userId: 'Public User',
        message: `public session created for Public User`
      };
      addUpdateToAllAdmins('session_created', updateData);
    } catch (error) {
      console.error('Error sending Public User session created update:', error.message);
    }
  } else {
    // Update last activity for existing session
    publicUserSession.lastActivity = new Date().toISOString();
    publicUserSession.ipAddress = req.ip || req.connection.remoteAddress;
    publicUserSession.userAgent = req.headers['user-agent'];
  }
  
  return publicUserSession;
};

const trackPublicUserActivity = (req) => {
  // Check if there's an authenticated user - if so, don't create Public User session
  const authCookie = req.cookies?.maia_auth;
  if (authCookie) {
    try {
      const authData = JSON.parse(authCookie);
      const now = new Date();
      const expiresAt = new Date(authData.expiresAt);
      
      // If there's a valid authenticated user, don't create Public User session
      if (now < expiresAt && authData.userId && authData.userId !== 'Public User') {
        // console.log(`[SESSION] Skipping Public User session - authenticated as ${authData.userId}`);
        return null;
      }
    } catch (error) {
      // Invalid cookie, proceed to create Public User session
    }
  }
  
  // No authenticated user - create/update Public User session
  const session = getOrCreatePublicUserSession(req);
  // Only log on initial page load, not on every polling request
  if (req.path === '/') {
    console.log(`[PAGE LOAD] Public User polling started`);
  }
  return session;
};

// Export session management functions for use in route files
export { activeSessions, createSession, removeSession, updateSessionActivity, logSessionEvent, addUpdateToSession, addUpdateToUser, addUpdateToAllAdmins, getPendingUpdates, trackPublicUserActivity, getBucketStatusForUser, buildAgentManagementTemplate };

const initializeDatabase = async () => {
  try {
    // Debug: Log environment variables (masked for security) - commented out for cleaner logs
    // console.log('🔍 Debug: Environment variables check:');
    // console.log('🔍 COUCHDB_URL:', process.env.COUCHDB_URL ? 'SET' : 'NOT SET');
    // console.log('🔍 COUCHDB_USERNAME:', process.env.COUCHDB_USERNAME ? 'SET' : 'NOT SET');
    // console.log('🔍 COUCHDB_PASSWORD:', process.env.COUCHDB_PASSWORD ? 'SET' : 'NOT SET');
    // console.log('🔍 COUCHDB_DATABASE:', process.env.COUCHDB_DATABASE ? 'SET' : 'NOT SET');
    
    // Test the connection
    const connected = await couchDBClient.testConnection();
    if (connected) {
      // Initialize main database
      await couchDBClient.initializeDatabase();
      await couchDBClient.createShareIdView(); // Create the share ID view
      
      // Create knowledge base protection database
      try {
        await couchDBClient.createDatabase('maia_knowledge_bases');
//         console.log('✅ Created maia_knowledge_bases database');
      } catch (error) {
        if (error.statusCode === 412) {
//           console.log('✅ maia_knowledge_bases database already exists');
        } else {
          console.warn('⚠️ Could not create maia_knowledge_bases database:', error.message);
        }
      }
      
      // Sessions are now handled in-memory only
//       console.log('✅ Using in-memory session management');
      
      // Get service info
      const serviceInfo = couchDBClient.getServiceInfo();
//       console.log(`✅ Connected to ${serviceInfo.isCloudant ? 'Cloudant' : 'CouchDB'}`);
//       console.log(`✅ Using database '${serviceInfo.databaseName}'`);
    } else {
      throw new Error('Database connection failed');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
};

// Initialize database
initializeDatabase();




// Security middleware - Safari-compatible configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", "data:"], // Safari + PDF.js compatibility
      connectSrc: ["'self'", "https:", "wss:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"], // Prevent object/embed attacks
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"], // Allow frames from same origin
      frameAncestors: ["'self'"], // Allow embedding in same origin
      workerSrc: ["'self'", "blob:", "data:"], // Safari + PDF.js compatibility
      childSrc: ["'self'", "blob:", "data:"], // Safari + blob URLs
      baseUri: ["'self'"], // Safari compatibility
      formAction: ["'self'"], // Safari compatibility
      manifestSrc: ["'self'"] // Safari compatibility
    },
    upgradeInsecureRequests: process.env.NODE_ENV === 'production'
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Add Safari-specific headers for better compatibility
app.use((req, res, next) => {
  // Safari-specific headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Allow Safari to cache resources properly
  if (req.path.startsWith('/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year for assets
  }
  
  next();
});

// Trust proxy for production (needed for session cookies behind load balancer)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
//   console.log('🔧 Trust proxy enabled for production');
}

// Session configuration for authentication
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this',
  resave: true, // Enable resave for activity tracking
  saveUninitialized: false,
  name: 'maia.sid', // Custom session name
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours base timeout
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    path: '/'
  }
};

// TEMPORARILY DISABLED: Use CouchDB session store for both development and production
// import { CouchDBSessionStore } from './src/utils/couchdb-session-store.js';

// Create a separate CouchDB client for sessions with the correct database
// const sessionCouchDBClient = createCouchDBClient({ database: 'maia_sessions' });

// Essential: Session client configuration
// console.log('[*] [Session] Using separate CouchDB client for maia_sessions database');

// const couchDBSessionStore = new CouchDBSessionStore({
//   couchDBClient: sessionCouchDBClient,
//   dbName: 'maia_sessions',
//   ttl: 24 * 60 * 60 * 1000, // 24 hours
//   inactivityTimeout: 10 * 60 * 1000, // 10 minutes
//   warningDuration: 30 * 1000 // 30 seconds
// });

// Essential: Session store configuration
// console.log('[*] [Session] Session store configured with database:', couchDBSessionStore.dbName);

// sessionConfig.store = couchDBSessionStore;
// console.log('[*] [Session] Using default memory session store (maia_sessions disabled)');

// Memory cache to track session creation events
const sessionEventCache = new Map();
const writtenSessions = new Set(); // Track which sessions have been written to database
// console.log('[*] [Session] Memory cache initialized for session event tracking');

// Agent Management Template Cache - Pre-computed status for each user
const agentManagementTemplates = new Map();
console.log('✅ [TEMPLATE] Agent Management Template cache initialized');

app.use(session(sessionConfig));

// Middleware to capture session creation events
app.use((req, res, next) => {
  const sessionId = req.sessionID;
  const userId = req.session?.userId;
  const route = req.path;
  const method = req.method;
  const timestamp = new Date().toISOString();
  
  // Only capture events for authenticated users on API routes (not static assets)
  if (userId && userId !== 'undefined' && route.startsWith('/api/')) {
    // Create event key
    const eventKey = `${sessionId}_${timestamp}`;
    
    // Capture session event
    const sessionEvent = {
      sessionId,
      userId,
      route,
      method,
      timestamp,
      sessionData: req.session ? {
        userId: req.session.userId,
        username: req.session.username,
        displayName: req.session.displayName,
        authenticatedAt: req.session.authenticatedAt,
        lastActivity: req.session.lastActivity
      } : null
    };
    
    // Add to memory cache
    sessionEventCache.set(eventKey, sessionEvent);
    
    // Session events are tracked silently for debugging purposes
    
    // Database writes are now handled in the route handlers themselves
    // This ensures proper timing - writes happen after authentication is confirmed
  }
  
  next();
});

// Initialize session management with shared database client
const sessionManager = new SessionManager(couchDBClient);
const sessionMiddleware = new SessionMiddleware(sessionManager);

// In-memory session tracking (no database writes needed)

// Agent activity tracking is now handled in admin-management routes

// Endpoint to view session events in cache
app.get('/api/debug/session-events', (req, res) => {
  const events = Array.from(sessionEventCache.values());
  // Retrieved events from cache silently
  
  res.json({
    totalEvents: events.length,
    events: events.map(event => ({
      sessionId: event.sessionId,
      userId: event.userId,
      route: event.route,
      method: event.method,
      timestamp: event.timestamp,
      hasSessionData: !!event.sessionData,
      sessionData: event.sessionData
    }))
  });
});

// Endpoint to write the first authenticated session to database
app.post('/api/debug/write-session', async (req, res) => {
  const events = Array.from(sessionEventCache.values());
  const authenticatedEvents = events.filter(event => event.userId && event.userId !== 'undefined');
  
  if (authenticatedEvents.length > 0) {
    const firstAuthenticatedEvent = authenticatedEvents[0];
    res.json({ success: true, message: 'Session events available in memory', event: firstAuthenticatedEvent });
  } else {
    res.json({ success: false, message: 'No authenticated events found' });
  }
});

// Session activity tracking middleware for API routes only
app.use('/api', (req, res, next) => {
  if (req.session && req.sessionID) {
    // Force a session update to trigger touch() for API requests
    req.session.lastActivity = new Date().toISOString();
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session for activity tracking:', err);
      }
      next();
    });
  } else {
  next();
  }
});

// Session middleware will be applied to specific protected routes only
// No global session validation for API routes

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Get current authenticated user
const getCurrentUser = (req) => {
  return req.session.userId ? {
    userId: req.session.userId,
    username: req.session.username,
    displayName: req.session.displayName
  } : null;
};

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      timestamp: new Date().toISOString()
    });
  }
});

// Stricter rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 uploads per windowMs
  message: 'Too many file uploads from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes (excluding essential routes)
app.use('/api/', (req, res, next) => {
  // Skip rate limiting for essential routes:
  // - admin-management routes (they have their own caching)
  // - admin events (SSE) to prevent connection issues  
  // - admin polling (essential for real-time updates)
  // - passkey routes (essential for authentication)
  // - current-agent (needed for user initialization)
  // - group-chats (needed for admin panel functionality)
  // - bucket routes (needed for file operations)
  // - admin notify (needed for deployment notifications)
  if (req.path.startsWith('/admin-management/') || 
      req.path === '/admin/events' ||
      req.path === '/admin/poll/updates' ||
      req.path.startsWith('/passkey/') ||
      req.path === '/current-agent' ||
      req.path === '/group-chats' ||
      req.path.startsWith('/bucket/') ||
      req.path === '/admin/notify') {
    return next();
  }
  return apiLimiter(req, res, next);
});
app.use('/api/parse-pdf', uploadLimiter);

// Cookie parser middleware
app.use(cookieParser());

// CORS configuration for local development
const corsOptions = {
          origin: process.env.ALLOWED_ORIGINS?.split(',') || [process.env.ORIGIN || 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Set up EJS template engine for dynamic HTML
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'dist'));

// Cache-busting headers for development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Custom route for index.html with environment variables (must come before static files)
app.get('/', (req, res) => {
  // Track Public User activity (only if not authenticated)
  trackPublicUserActivity(req);
  
  const appTitle = process.env.APP_TITLE || 'MAIA';
  const environment = process.env.NODE_ENV || 'development';
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  
  res.render('index.ejs', {
    APP_TITLE: appTitle,
    ENVIRONMENT: environment,
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    CLOUDANT_DASHBOARD_URL: cloudantUrl
  });
});

// OLD ADMIN ROUTES REMOVED - Now redirect to admin2

// Admin2 panel route - PROTECTED (new admin panel)
app.get('/admin2', (req, res) => {
//   console.log('🔓 TEMPORARY: Admin2 access granted without authentication for testing');
  
  const appTitle = process.env.APP_TITLE || 'MAIA';
  const environment = process.env.NODE_ENV || 'development';
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  
  res.render('index.ejs', {
    APP_TITLE: appTitle,
    ENVIRONMENT: environment,
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    CLOUDANT_DASHBOARD_URL: cloudantUrl
  });
});

// Admin2 panel deep link route for specific user details - PROTECTED
app.get('/admin2/user/:userId', (req, res) => {
//   console.log('🔓 TEMPORARY: Admin2 access granted without authentication for testing');
  
  const { userId } = req.params;
  const appTitle = process.env.APP_TITLE || 'MAIA';
  const environment = process.env.NODE_ENV || 'development';
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  
  res.render('index.ejs', {
    APP_TITLE: appTitle,
    ENVIRONMENT: environment,
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    CLOUDANT_DASHBOARD_URL: cloudantUrl,
    ADMIN_DEEP_LINK_USER_ID: userId // Pass userId to frontend
  });
});

// Admin2 registration route - no authentication required (this is how admins initially register)
app.get('/admin2/register', (req, res) => {
  const appTitle = process.env.APP_TITLE || 'MAIA';
  const environment = process.env.NODE_ENV || 'development';
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  
  res.render('index.ejs', {
    APP_TITLE: appTitle,
    ENVIRONMENT: environment,
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    CLOUDANT_DASHBOARD_URL: cloudantUrl
  });
});

// REDIRECTS: Redirect old admin routes to admin2 for migration
app.get('/admin', (req, res) => {
  console.log('🔄 [Migration] Redirecting /admin to /admin2');
  res.redirect(301, '/admin2');
});

app.get('/admin/register', (req, res) => {
  console.log('🔄 [Migration] Redirecting /admin/register to /admin2/register');
  res.redirect(301, '/admin2/register');
});

app.get('/admin/user/:userId', (req, res) => {
  const { userId } = req.params;
  console.log(`🔄 [Migration] Redirecting /admin/user/${userId} to /admin2/user/${userId}`);
  res.redirect(301, `/admin2/user/${userId}`);
});

// Serve static files with cache busting
app.use(express.static(path.join(__dirname, 'dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    // Set proper content type for PDFs
    if (path.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
    
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Request logging middleware - only log the first request per page load
let lastRequestTime = 0;
app.use((req, res, next) => {
  const now = Date.now();
  const userAgent = req.headers['user-agent'] || 'Unknown';
  
  // Only log the first request every 2 seconds to avoid spam
  if (now - lastRequestTime > 2000 && !userAgent.includes('node-fetch') && !userAgent.includes('axios')) {
    lastRequestTime = now;
  }
  
  next();
});

// Input validation middleware
app.use((req, res, next) => {
  // Sanitize JSON payloads
  if (req.body && typeof req.body === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        // Remove potential script tags and dangerous content
        sanitized[key] = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      } else {
        sanitized[key] = value;
      }
    }
    req.body = sanitized;
  }
  next();
});

// Request logging middleware
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
  app.use((req, res, next) => {
    // console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    singlePatientMode: false
  });
});

// Migration endpoint removed - migration completed successfully

// Debug endpoint to test session manager connection
app.get('/debug/sessions', async (req, res) => {
  try {
    // Test the session manager's database connection
    const sessions = await sessionManager.getAllActiveSessions();
    
    // Test direct database connection
    const query = {
      selector: {
        type: 'session',
        isActive: true
      }
    };
    const result = await couchDBClient.findDocuments('maia_chats', query);
    
    res.json({
      sessionManagerSessions: sessions.length,
      directDatabaseSessions: result.docs.length,
      sessionManagerResults: sessions,
      directDatabaseResults: result.docs
    });
  } catch (error) {
    console.error('❌ Error testing sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Session status endpoint
app.get('/api/session-status', (req, res) => {
  if (req.session && req.session.userId) {
    const timeUntilExpiry = req.session.cookie.maxAge - (Date.now() - (req.session.lastActivity || Date.now()));
    res.json({
      authenticated: true,
      userId: req.session.userId,
      username: req.session.username,
      displayName: req.session.displayName,
      lastActivity: req.session.lastActivity,
      timeUntilExpiry: Math.max(0, timeUntilExpiry),
      sessionId: req.sessionID
    });
  } else {
    res.json({
      authenticated: false,
      message: 'No active session'
    });
  }
});

// Session test endpoint
app.get('/api/session-test', (req, res) => {
//   console.log(`🔍 [SESSION TEST] Request:`, {
//     sessionId: req.sessionID,
//     hasSession: !!req.session,
//     sessionKeys: req.session ? Object.keys(req.session) : 'no session',
//     cookies: req.headers.cookie || 'no cookies',
//     userAgent: req.headers['user-agent']?.substring(0, 50)
//   });

  // Set a test session value
  req.session.testValue = 'session-working-' + Date.now();

  res.json({
    message: 'Session test',
    sessionId: req.sessionID,
    testValue: req.session.testValue,
    cookies: req.headers.cookie || 'no cookies'
  });
});

// Get current authenticated user
app.get('/api/current-user', (req, res) => {
  const currentUser = getCurrentUser(req);
  if (currentUser) {
    res.json({ 
      authenticated: true, 
      user: currentUser 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Sign out endpoint
app.post('/api/sign-out', (req, res) => {
  if (req.session) {
    const userId = req.session.userId;
    req.session.destroy((err) => {
      if (err) {
        console.error('❌ Error destroying session:', err);
        return res.status(500).json({ error: 'Failed to sign out' });
      }
//       console.log(`✅ User ${userId} signed out successfully`);
      res.json({ success: true, message: 'Signed out successfully' });
    });
  } else {
    res.json({ success: true, message: 'No active session' });
  }
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Enhanced file type validation
    const allowedMimeTypes = ['application/pdf'];
    const allowedExtensions = ['.pdf'];
    
    // Check MIME type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF files are allowed'));
    }
    
    // Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      return cb(new Error('Only PDF files are allowed'));
    }
    
    // Check for suspicious file names
    const suspiciousPatterns = /[<>:"|?*]/;
    if (suspiciousPatterns.test(file.originalname)) {
      return cb(new Error('Invalid file name'));
    }
    
    cb(null, true);
  }
});

// RTF file upload configuration
const uploadRTF = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // RTF file type validation
    const allowedMimeTypes = ['application/rtf', 'text/rtf', 'application/octet-stream'];
    const allowedExtensions = ['.rtf'];
    
    // Check MIME type (be more permissive for RTF)
    if (!allowedMimeTypes.includes(file.mimetype) && !file.mimetype.startsWith('application/')) {
      return cb(new Error('Only RTF files are allowed'));
    }
    
    // Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      return cb(new Error('Only RTF files are allowed'));
    }
    
    // Check for suspicious file names
    const suspiciousPatterns = /[<>:"|?*]/;
    if (suspiciousPatterns.test(file.originalname)) {
      return cb(new Error('Invalid file name'));
    }
    
    cb(null, true);
  }
});

// PDF parsing endpoint with enhanced security
app.post('/api/parse-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    // Additional security checks
    if (req.file.size === 0) {
      return res.status(400).json({ error: 'Empty file provided' });
    }
    
    // Check for potential zip bombs or oversized content
    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large' });
    }

    // Parse PDF from buffer
    const data = await pdf(req.file.buffer);
    
    // Validate parsed content
    if (!data.text || data.text.length === 0) {
      return res.status(400).json({ error: 'Could not extract text from PDF' });
    }
    
    // PDF conversion to text is not necessary for larger AIs and knowledge bases.
    // Commenting out text extraction to keep PDFs as-is for AI processing
    // const markdown = convertPdfToMarkdown(data);
    
    // console.log(`📄 PDF parsed: ${data.numpages} pages, ${data.text.length} characters`);
    
    res.json({
      success: true,
      text: data.text, // Keep the extracted text for AI context
      // markdown, // Commented out - PDF conversion to text not needed for larger AIs
      pages: data.numpages,
      characters: data.text.length
    });
  } catch (error) {
    console.error('❌ PDF parsing error:', error);
    res.status(500).json({ error: `Failed to parse PDF: ${error.message}` });
  }
});

// RTF Processing endpoint
app.post('/api/process-rtf', uploadRTF.single('rtfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No RTF file uploaded' });
    }

//     console.log(`🔄 Processing RTF file: ${req.file.originalname}`);
    
    // Save uploaded file temporarily
    const tempRtfPath = `/tmp/${Date.now()}-${req.file.originalname}`;
    const cleanedRtfPath = tempRtfPath.replace('.rtf', '-STEP2-CLEANED.rtf');
    const outputMdPath = `/tmp/${Date.now()}-converted.md`;
    
    // console.log(`📄 Temp RTF path: ${tempRtfPath}`);
    // console.log(`📄 Cleaned RTF path: ${cleanedRtfPath}`);
    // console.log(`📄 Output MD path: ${outputMdPath}`);
    
    fs.writeFileSync(tempRtfPath, req.file.buffer);
//     console.log(`✅ Saved uploaded file to: ${tempRtfPath}`);
    
    // Step 1: Clean the RTF file
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
//     console.log(`🔄 Running RTF cleaner...`);
    try {
      const result = await execAsync(`node rtf-cleaner.js "${tempRtfPath}" "${cleanedRtfPath}"`);
//       console.log(`✅ RTF cleaning complete`);
      // console.log(`📄 Cleaner stdout:`, result.stdout);
      if (result.stderr) // console.log(`⚠️ Cleaner stderr:`, result.stderr);
      
      // Check if cleaned file exists and has content
      if (fs.existsSync(cleanedRtfPath)) {
        const cleanedContent = fs.readFileSync(cleanedRtfPath, 'utf8');
        // console.log(`📄 Cleaned RTF file size: ${cleanedContent.length} characters`);
        // console.log(`📄 Cleaned RTF first 200 chars: ${cleanedContent.substring(0, 200)}`);
      } else {
        console.error(`❌ Cleaned RTF file not found: ${cleanedRtfPath}`);
        return res.status(500).json({ error: 'Cleaned RTF file not found after cleaning' });
      }
    } catch (error) {
      console.error('❌ RTF cleaning error:', error);
      return res.status(500).json({ error: 'Failed to clean RTF file: ' + error.message });
    }
    
    // Step 2: Convert cleaned RTF to Markdown
//     console.log(`🔄 Running RTF to MD converter...`);
    try {
      const result = await execAsync(`node rtf-to-md.js "${cleanedRtfPath}" "${outputMdPath}"`);
//       console.log(`✅ RTF to MD conversion complete`);
      // console.log(`📄 Converter stdout:`, result.stdout);
      if (result.stderr) // console.log(`⚠️ Converter stderr:`, result.stderr);
      
      // Check if output file exists
      if (!fs.existsSync(outputMdPath)) {
        console.error(`❌ Markdown output file not found: ${outputMdPath}`);
        console.error(`❌ Current working directory: ${process.cwd()}`);
        console.error(`❌ Available files in /tmp:`);
        try {
          const tmpFiles = fs.readdirSync('/tmp');
          console.error(`❌ /tmp contents:`, tmpFiles);
        } catch (dirError) {
          console.error(`❌ Could not read /tmp directory:`, dirError.message);
        }
        return res.status(500).json({ error: 'Markdown output file not found after conversion' });
      }
      
      const markdownContent = fs.readFileSync(outputMdPath, 'utf8');
//       console.log(`✅ Read markdown content (${markdownContent.length} characters)`);
      
      // Clean up temporary files
      try {
        fs.unlinkSync(tempRtfPath);
        if (fs.existsSync(cleanedRtfPath)) {
          fs.unlinkSync(cleanedRtfPath);
        }
        fs.unlinkSync(outputMdPath);
//         console.log(`✅ Cleaned up temporary files`);
      } catch (cleanupError) {
        console.warn('⚠️ Warning: Could not clean up temporary files:', cleanupError.message);
      }
      
//       console.log(`✅ RTF processing complete: ${req.file.originalname}`);
      res.json({ 
        success: true, 
        markdown: markdownContent,
        originalName: req.file.originalname
      });
    } catch (error) {
      console.error('❌ RTF to MD conversion error:', error);
      console.error('❌ Error stdout:', error.stdout);
      console.error('❌ Error stderr:', error.stderr);
      return res.status(500).json({ error: 'Failed to convert RTF to Markdown: ' + error.message });
    }
  } catch (error) {
    console.error('❌ RTF processing error:', error);
    res.status(500).json({ error: `Failed to process RTF file: ${error.message}` });
  }
});

// Import API clients
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Initialize clients only if API keys are available
let personalChatClient, anthropic, openai, deepseek, chatgpt;

// DigitalOcean GenAI setup (Personal Chat) - KEEP IN CLOUD
if (process.env.DIGITALOCEAN_PERSONAL_API_KEY) {
  personalChatClient = new OpenAI({
    baseURL: process.env.DIGITALOCEAN_GENAI_ENDPOINT || 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1',
    apiKey: process.env.DIGITALOCEAN_PERSONAL_API_KEY
  });
//   console.log('✅ DigitalOcean Personal AI Agent connected');
} else {
//   console.log('⚠️  DigitalOcean Personal API key not configured - using mock responses');
}

// Anthropic setup (fallback)
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
//   console.log('✅ Anthropic Claude connected');
}

// OpenAI setup (fallback)
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
//   console.log('✅ OpenAI connected');
}

// ChatGPT setup (fallback)
if (process.env.CHATGPT_API_KEY) {
  chatgpt = new OpenAI({
    apiKey: process.env.CHATGPT_API_KEY
  });
//   console.log('✅ ChatGPT connected');
}

// DeepSeek setup (fallback)
if (process.env.DEEPSEEK_API_KEY) {
  deepseek = new OpenAI({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY
  });
//   console.log('✅ DeepSeek connected');
}

// Utility function
const estimateTokenCount = (text) => {
  const averageTokenLength = 4;
  return Math.ceil(text.length / averageTokenLength);
};

// PDF to Markdown conversion function
const convertPdfToMarkdown = (pdfData) => {
  let markdown = `# PDF Document\n\n`;
  markdown += `**Pages:** ${pdfData.numpages}\n`;
  markdown += `**Characters:** ${pdfData.text.length}\n\n`;
  
  // Split text into paragraphs and format
  const paragraphs = pdfData.text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Group lines into logical sections
  let currentSection = '';
  let sections = [];
  
  for (const paragraph of paragraphs) {
    // Check if this looks like a heading (all caps, shorter than 100 chars)
    if (paragraph.length < 100 && paragraph === paragraph.toUpperCase() && paragraph.length > 3) {
      if (currentSection) {
        sections.push(currentSection.trim());
      }
      currentSection = `## ${paragraph}\n\n`;
    } else {
      currentSection += `${paragraph}\n\n`;
    }
  }
  
  if (currentSection) {
    sections.push(currentSection.trim());
  }
  
  // If no sections were created, just use the raw text
  if (sections.length === 0) {
    markdown += pdfData.text.replace(/\n\n+/g, '\n\n');
  } else {
    markdown += sections.join('\n\n');
  }
  
  return markdown;
};

// Mock responses for local testing when cloud services unavailable
const mockAIResponses = {
  'personal-chat': (message) => `[Personal AI] I understand you're asking about: "${message}". This is a mock response for local testing. In production, this would connect to your personal AI agent.`,
  'anthropic-chat': (message) => `[Anthropic Claude] Here's my response to: "${message}". This is a mock response for local testing.`,
  'gemini-chat': (message) => `[Google Gemini] I can help with: "${message}". This is a mock response for local testing.`,
  'chatgpt-chat': (message) => `[ChatGPT] Here's my response to: "${message}". This is a mock response for local testing.`,
  'deepseek-r1-chat': (message) => `[DeepSeek R1] My analysis of: "${message}". This is a mock response for local testing.`
};

// Upload file to DigitalOcean Spaces bucket (legacy endpoint)
app.post('/api/upload-file', async (req, res) => {
  try {
    const { fileName, content, fileType } = req.body;
    
    if (!fileName || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'File name and content are required',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // console.log(`📤 Uploading file to DigitalOcean Spaces bucket: ${fileName} (${content.length} chars)`);
    
    // Generate a unique key for the file in the bucket
    const timestamp = Date.now();
    const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const bucketKey = `${cleanName}`;
    
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    // Check if bucket is configured
    if (!bucketUrl) {
      console.warn(`⚠️ DIGITALOCEAN_BUCKET not configured, skipping bucket operation`);
      return res.status(400).json({ 
        success: false, 
        message: 'DigitalOcean bucket not configured',
        error: 'BUCKET_NOT_CONFIGURED'
      });
    }
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: bucketKey,
      Body: content,
      ContentType: fileType || 'text/plain',
      Metadata: {
        'original-filename': fileName,
        'upload-timestamp': timestamp.toString()
      }
    });

    await s3Client.send(uploadCommand);
//     console.log(`✅ Successfully uploaded file to bucket: ${bucketKey}`);
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileInfo: {
        bucketKey,
        fileName,
        fileType: fileType || 'text/plain',
        size: content.length,
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error.Code === 'NoSuchBucket') {
      console.warn(`⚠️ Bucket ${bucketName} does not exist, cannot upload file`);
      res.status(400).json({ 
        success: false, 
        message: `Bucket ${bucketName} does not exist`,
        error: 'BUCKET_NOT_FOUND'
      });
    } else {
      console.error('❌ Error uploading file to bucket:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to upload file to bucket: ${error.message}`,
        error: 'UPLOAD_FAILED'
      });
    }
  }
});

// Admin alert endpoint - receive alerts from frontend
app.post('/api/admin-alert', async (req, res) => {
  try {
    const { severity, category, message, details } = req.body;
    
    // Send the alert through the system
    await sendAdminAlert({
      severity,
      category,
      message,
      details
    });
    
    res.json({ success: true, message: 'Alert sent to administrators' });
  } catch (error) {
    console.error('❌ Failed to process admin alert:', error.message);
    res.status(500).json({ success: false, error: 'Failed to process alert' });
  }
});

// Update user file metadata in user record
app.post('/api/user-file-metadata', async (req, res) => {
  try {
    const { userId, fileMetadata } = req.body;
    
    if (!userId || !fileMetadata) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and file metadata are required',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Get the user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    
    if (!userDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Initialize files array if it doesn't exist
    if (!userDoc.files) {
      userDoc.files = [];
    }

    // Check if file already exists (by bucketKey)
    const existingFileIndex = userDoc.files.findIndex(f => f.bucketKey === fileMetadata.bucketKey);
    
    if (existingFileIndex >= 0) {
      // Update existing file metadata
      userDoc.files[existingFileIndex] = {
        ...userDoc.files[existingFileIndex],
        ...fileMetadata,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add new file metadata with initialized knowledgeBases array
      userDoc.files.push({
        ...fileMetadata,
        knowledgeBases: [], // Initialize as empty array for consistency
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Save the updated user document
    await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
    
    console.log(`✅ Updated file metadata for user ${userId}: ${fileMetadata.fileName}`);
    
    res.json({
      success: true,
      message: 'File metadata updated successfully',
      fileCount: userDoc.files.length
    });
  } catch (error) {
    console.error('❌ Error updating user file metadata:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to update file metadata: ${error.message}`,
      error: 'UPDATE_FAILED'
    });
  }
});

// Update file KB associations when files are added to knowledge bases
app.post('/api/user-file-kb-association', async (req, res) => {
  try {
    const { userId, fileName, bucketKey, knowledgeBaseId, knowledgeBaseName, action } = req.body;
    
    if (!userId || !fileName || !bucketKey || !knowledgeBaseId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID, file name, bucket key, and knowledge base ID are required',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Get the user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    
    if (!userDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Initialize files array if it doesn't exist
    if (!userDoc.files) {
      userDoc.files = [];
    }

    // Find the file
    const fileIndex = userDoc.files.findIndex(f => f.bucketKey === bucketKey);
    
    if (fileIndex < 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'File not found in user record',
        error: 'FILE_NOT_FOUND'
      });
    }

    // Initialize knowledgeBases array if it doesn't exist
    if (!userDoc.files[fileIndex].knowledgeBases) {
      userDoc.files[fileIndex].knowledgeBases = [];
    }

    if (action === 'add') {
      // Add KB association if not already present
      const existingKB = userDoc.files[fileIndex].knowledgeBases.find(kb => kb.id === knowledgeBaseId);
      if (!existingKB) {
        userDoc.files[fileIndex].knowledgeBases.push({
          id: knowledgeBaseId,
          name: knowledgeBaseName || knowledgeBaseId,
          addedAt: new Date().toISOString()
        });
      }
    } else if (action === 'remove') {
      // Remove KB association
      userDoc.files[fileIndex].knowledgeBases = userDoc.files[fileIndex].knowledgeBases.filter(
        kb => kb.id !== knowledgeBaseId
      );
    }

    // Update the file's updatedAt timestamp
    userDoc.files[fileIndex].updatedAt = new Date().toISOString();

    // Save the updated user document
    await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
    
    console.log(`✅ Updated KB association for user ${userId}, file ${fileName}, action: ${action}`);
    
    res.json({
      success: true,
      message: 'File KB association updated successfully',
      knowledgeBaseCount: userDoc.files[fileIndex].knowledgeBases.length
    });
  } catch (error) {
    console.error('❌ Error updating file KB association:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to update file KB association: ${error.message}`,
      error: 'UPDATE_FAILED'
    });
  }
});

// Upload file to DigitalOcean Spaces bucket with user folder support
app.post('/api/upload-to-bucket', async (req, res) => {
  try {
    const { fileName, content, fileType, userFolder, isBinary } = req.body;
    
    if (!fileName || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'File name and content are required',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // console.log(`📤 Uploading file to DigitalOcean Spaces bucket: ${fileName} (${content.length} chars) to folder: ${userFolder || 'root'}`);
    
    // Generate a unique key for the file in the bucket
    const timestamp = Date.now();
    const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const bucketKey = userFolder ? `${userFolder}${cleanName}` : cleanName;
    
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    // Check if bucket is configured
    if (!bucketUrl) {
      console.warn(`⚠️ DIGITALOCEAN_BUCKET not configured, skipping bucket operation`);
      return res.status(400).json({ 
        success: false, 
        message: 'DigitalOcean bucket not configured',
        error: 'BUCKET_NOT_CONFIGURED'
      });
    }
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    // Decode binary data if flagged as binary (e.g., PDFs)
    let bodyContent = content;
    if (isBinary && fileType === 'application/pdf') {
      // Decode base64 to binary Buffer for proper PDF storage
      // This preserves selectable text and allows proper indexing
      bodyContent = Buffer.from(content, 'base64');
      console.log(`📄 Storing PDF as binary (${bodyContent.length} bytes): ${fileName}`);
    }

    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: bucketKey,
      Body: bodyContent,
      ContentType: fileType || 'text/plain',
      Metadata: {
        'original-filename': fileName,
        'upload-timestamp': timestamp.toString(),
        'user-folder': userFolder || 'root'
      }
    });

    await s3Client.send(uploadCommand);
//     console.log(`✅ Successfully uploaded file to bucket: ${bucketKey}`);
    
    // Update cache with fresh bucket status IMMEDIATELY after successful upload
    if (userFolder && userFolder !== 'root') {
      // Extract userId from folder path (e.g., "sun2archived/" -> "sun2")
      const userId = userFolder.split('/')[0];
      await updateUserBucketCache(userId);
      
      // Send admin notification
      try {
        const updateData = {
          userId: userId,
          fileName: fileName,
          bucketKey: bucketKey,
          fileSize: content.length,
          message: `User ${userId} uploaded file ${fileName} to their bucket`
        };
        
        addUpdateToAllAdmins('user_file_uploaded', updateData);
        console.log(`[*] User ${userId} uploaded file ${fileName} to bucket`);
        
        // Update session activity for the user who uploaded the file
        if (req.sessionID) {
          updateSessionActivity(req.sessionID, 'file_upload');
        }
      } catch (notificationError) {
        console.error(`❌ Error sending file upload notification:`, notificationError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileInfo: {
        bucketKey,
        fileName,
        fileType: fileType || 'text/plain',
        size: content.length,
        uploadedAt: new Date().toISOString(),
        userFolder: userFolder || 'root'
      }
    });
  } catch (error) {
    if (error.Code === 'NoSuchBucket') {
      console.warn(`⚠️ Bucket ${bucketName} does not exist, cannot upload file`);
      res.status(400).json({ 
        success: false, 
        message: `Bucket ${bucketName} does not exist`,
        error: 'BUCKET_NOT_FOUND'
      });
    } else {
      console.error('❌ Error uploading file to bucket:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to upload file to bucket: ${error.message}`,
        error: 'UPLOAD_FAILED'
      });
    }
  }
});

// Test endpoint to check if a specific file exists
app.get('/api/test-file/:bucketKey(*)', async (req, res) => {
  try {
    const { bucketKey } = req.params;
    const fileUrl = `https://maia.tor1.digitaloceanspaces.com/${bucketKey}`;
    
    console.log(`🔍 Testing file existence: ${fileUrl}`);
    
    const response = await fetch(fileUrl, { method: 'HEAD' });
    
    res.json({
      success: true,
      bucketKey,
      fileUrl,
      status: response.status,
      statusText: response.statusText,
      exists: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
  } catch (error) {
    console.error('❌ Error testing file:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Proxy PDF files from DigitalOcean Spaces to avoid CORS issues
app.get('/api/proxy-pdf/:bucketKey(*)', async (req, res) => {
  try {
    const { bucketKey } = req.params;
    
    console.log(`📄 Proxying PDF file with bucket key: ${bucketKey}`);
    
    // Use S3 client to fetch the file with proper authentication
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });
    
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: bucketKey
    });
    
    console.log(`📄 Fetching from S3: ${bucketName}/${bucketKey}`);
    
    const response = await s3Client.send(getObjectCommand);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bucketKey.split('/').pop()}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Stream the PDF content
    response.Body.pipe(res);
    
    console.log(`✅ Successfully streaming PDF: ${bucketKey}`);
    
  } catch (error) {
    console.error('❌ Error proxying PDF:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to proxy PDF file',
      error: 'PROXY_ERROR',
      details: error.message
    });
  }
});

// Get files from DigitalOcean Spaces bucket
app.get('/api/bucket-files', async (req, res) => {
  try {
//     console.log('📋 Listing files from DigitalOcean Spaces bucket');
    
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    // Check if bucket is configured
    if (!bucketUrl) {
      console.warn(`⚠️ DIGITALOCEAN_BUCKET not configured, skipping bucket operation`);
      return res.status(400).json({ 
        success: false, 
        message: 'DigitalOcean bucket not configured',
        error: 'BUCKET_NOT_CONFIGURED'
      });
    }
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 100
    });

    const result = await s3Client.send(listCommand);
    const files = result.Contents || [];
    
//     console.log(`✅ Found ${files.length} files in bucket`);
    
    res.json({
      success: true,
      files: files.map(file => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
        etag: file.ETag
      }))
    });
  } catch (error) {
    if (error.Code === 'NoSuchBucket') {
      console.warn(`⚠️ Bucket ${bucketName} does not exist, returning empty file list`);
      res.json({
        success: true,
        files: []
      });
    } else {
      console.error('❌ Error listing bucket files:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to list bucket files: ${error.message}`,
        error: 'LIST_FAILED'
      });
    }
  }
});

// Server-Sent Events endpoint for admin notifications
app.get('/api/admin/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Admin notification stream connected"}\n\n');

  // Store this connection for sending messages
  const clientId = Date.now() + Math.random();
  adminEventClients.set(clientId, res);

  // Send periodic heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      adminEventClients.delete(clientId);
      return;
    }
    res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
  }, 30000); // Every 30 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    adminEventClients.delete(clientId);
  });
});


// Helper function to send admin notifications
function sendAdminNotification(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  
  // SSE notification sent
  
  adminEventClients.forEach((res, clientId) => {
    try {
      if (!res.writableEnded) {
        res.write(`data: ${message}\n\n`);
      }
    } catch (error) {
      console.error(`❌ [SSE] [*] Error sending notification to client ${clientId}:`, error);
      adminEventClients.delete(clientId);
    }
  });
}

// Store for admin event clients
const adminEventClients = new Map();

// Admin notification endpoint
app.post('/api/admin/notify', (req, res) => {
  try {
    const { type, data } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({ error: 'Type and data are required' });
    }
    
    // Send notification to all connected admin clients
    sendAdminNotification(type, data);
    
    res.json({ success: true, message: 'Notification sent to admin clients' });
  } catch (error) {
    console.error('❌ Error sending admin notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Ensure user folder exists in DigitalOcean Spaces bucket
app.post('/api/bucket/ensure-user-folder', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required',
        error: 'MISSING_USER_ID'
      });
    }

//     console.log(`📁 Ensuring user folder exists for: ${userId}`);
    
    const { S3Client, PutObjectCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    // Check if bucket is configured
    if (!bucketUrl) {
      console.warn(`⚠️ DIGITALOCEAN_BUCKET not configured, skipping bucket operation`);
      return res.status(400).json({ 
        success: false, 
        message: 'DigitalOcean bucket not configured',
        error: 'BUCKET_NOT_CONFIGURED'
      });
    }
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    const userFolder = `${userId}/`;
    
    // First, check if folder already exists by looking for files in the folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: userFolder,
      MaxKeys: 1
    });

    const listResult = await s3Client.send(listCommand);
    const hasFiles = listResult.Contents && listResult.Contents.length > 0;
    
    if (hasFiles) {
//       console.log(`✅ User folder already exists: ${userFolder}`);
      return res.json({
        success: true,
        message: 'User folder already exists',
        folderExists: true,
        folderPath: userFolder,
        fileCount: listResult.Contents.length
      });
    }

    // Create folder by uploading a placeholder file
    const folderMarkerKey = `${userFolder}.folder-marker`;
    const folderMarkerContent = `Folder created for user: ${userId}\nCreated at: ${new Date().toISOString()}`;
    
    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: folderMarkerKey,
      Body: folderMarkerContent,
      ContentType: 'text/plain',
      Metadata: {
        'folder-type': 'user-folder-marker',
        'user-id': userId,
        'created-at': new Date().toISOString()
      }
    });

    await s3Client.send(uploadCommand);
//     console.log(`✅ Created user folder with marker: ${folderMarkerKey}`);
    
    res.json({
      success: true,
      message: 'User folder created successfully',
      folderExists: true,
      folderPath: userFolder,
      fileCount: 1,
      markerFile: folderMarkerKey
    });
    
  } catch (error) {
    if (error.Code === 'NoSuchBucket') {
      console.warn(`⚠️ Bucket ${bucketName} does not exist, cannot create user folder`);
      res.status(400).json({ 
        success: false, 
        message: `Bucket ${bucketName} does not exist`,
        error: 'BUCKET_NOT_FOUND'
      });
    } else {
      console.error('❌ Error ensuring user folder:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to ensure user folder: ${error.message}`,
        error: 'FOLDER_CREATION_FAILED'
      });
    }
  }
});

// Helper function to update user's bucket status in cache after file operations
async function updateUserBucketCache(userId) {
  try {
    // Fetch fresh user document from database
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      console.warn(`⚠️ [CACHE] User ${userId} not found for bucket cache update`);
      return;
    }

    // Fetch fresh bucket status from DigitalOcean API
    const bucketData = await getBucketStatusForUser(userId);
    
    const bucketStatus = {
      hasFolder: bucketData.hasFolder || false,
      fileCount: bucketData.fileCount || 0,
      totalSize: bucketData.totalSize || 0
    };

    // Create updated user object with fresh bucket status
    const userWithBucket = {
      ...userDoc,
      bucketStatus: bucketStatus
    };

    // Update individual user cache entry (single source of truth - no 'all' array!)
    setCache('users', userId, userWithBucket);

    console.log(`✅ [CACHE] Updated bucket cache for user ${userId}: ${bucketStatus.fileCount} files, ${bucketStatus.totalSize} bytes`);
  } catch (error) {
    console.error(`❌ [CACHE] Failed to update bucket cache for user ${userId}:`, error.message);
  }
}

// Clean up temporary files in user's root folder and ensure archived/ exists
async function cleanupUserBucket(userId) {
  try {
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    if (!bucketUrl) return;
    
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });
    
    // Step 1: List all files in root folder (temporary files)
    const listRootCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${userId}/`,
      Delimiter: '/' // Only get files in root, not subfolders
    });
    
    const rootResult = await s3Client.send(listRootCommand);
    const rootFiles = (rootResult.Contents || []).filter(file => 
      file.Key !== `${userId}/` && // Skip folder itself
      !file.Key.includes('/archived/') && // Skip archived subfolder
      !file.Key.endsWith('.folder-marker') &&
      file.Size > 0
    );
    
    // Step 2: Delete temporary files from root
    if (rootFiles.length > 0) {
      console.log(`🧹 [CLEANUP] Deleting ${rootFiles.length} temporary files from ${userId}/ root`);
      for (const file of rootFiles) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: file.Key
        });
        await s3Client.send(deleteCommand);
      }
    }
    
    // Step 3: Ensure archived/ folder exists
    const archivedMarkerKey = `${userId}/archived/.folder-marker`;
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: archivedMarkerKey,
      Body: '',
      ContentLength: 0
    });
    
    try {
      await s3Client.send(putCommand);
      if (rootFiles.length > 0) {
        console.log(`✅ [CLEANUP] ${userId}: Deleted ${rootFiles.length} temp files, ensured archived/ exists`);
      }
    } catch (error) {
      // Ignore errors - folder marker is optional
    }
    
  } catch (error) {
    console.error(`❌ [CLEANUP] Error cleaning bucket for ${userId}:`, error.message);
  }
}

// Reconcile user document files with actual bucket contents
async function reconcileUserFiles(userId) {
  try {
    // Get user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      return 0;
    }
    
    // Get actual files from bucket (only archived/ folder)
    const bucketData = await getBucketStatusForUser(userId);
    const actualFiles = bucketData.files || [];
    
    // Build a map of actual files by bucketKey
    const actualFileMap = new Map();
    for (const file of actualFiles) {
      actualFileMap.set(file.key, {
        fileName: file.key.split('/').pop(),
        bucketKey: file.key,
        bucketPath: `${userId}/archived/`,
        fileSize: file.size,
        fileType: file.key.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text',
        uploadedAt: file.lastModified || new Date().toISOString()
      });
    }
    
    // Initialize files array if it doesn't exist
    if (!userDoc.files) {
      userDoc.files = [];
    }
    
    // Filter out files that no longer exist in bucket or have wrong paths
    const validFiles = userDoc.files.filter(file => {
      const hasArchivedPath = file.bucketPath?.includes('/archived/');
      const existsInBucket = actualFileMap.has(file.bucketKey);
      return hasArchivedPath && existsInBucket;
    });
    
    // Add files from bucket that aren't in the document
    for (const [bucketKey, fileData] of actualFileMap) {
      const existsInDoc = validFiles.some(f => f.bucketKey === bucketKey);
      if (!existsInDoc) {
        validFiles.push({
          ...fileData,
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
    
    // Check if any changes were made
    const changesMade = validFiles.length !== userDoc.files.length;
    
    if (changesMade) {
      console.log(`🔄 [RECONCILE] ${userId}: ${userDoc.files.length} → ${validFiles.length} files`);
      userDoc.files = validFiles;
      userDoc.updatedAt = new Date().toISOString();
      
      // Save to database
      await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
    }
    
    return validFiles.length;
  } catch (error) {
    console.error(`❌ [RECONCILE] Error for user ${userId}:`, error.message);
    return 0;
  }
}

// Helper function to get bucket status (reusable for startup and API)
async function getBucketStatusForUser(userId) {
  try {
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    // Check if bucket is configured
    if (!bucketUrl) {
      return {
        success: false, 
        hasFolder: false,
        fileCount: 0,
        totalSize: 0,
        files: []
      };
    }
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    const userFolder = `${userId}/archived/`;  // Check archived subfolder
    
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: userFolder,
      MaxKeys: 1000
    });

    const result = await s3Client.send(listCommand);
    const files = result.Contents || [];
    
    // Filter out folder markers and count actual files
    const actualFiles = files.filter(file => 
      !file.Key.endsWith('.folder-marker') && 
      !file.Key.endsWith('/') && 
      file.Size > 0
    );
    
    const hasFolder = files.length > 0;
    const fileCount = actualFiles.length;
    const totalSize = actualFiles.reduce((sum, file) => sum + (file.Size || 0), 0);
    
    return {
      success: true,
      userId: userId,
      folderPath: userFolder,
      hasFolder: hasFolder,
      fileCount: fileCount,
      totalSize: totalSize,
      files: actualFiles.map(file => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
        etag: file.ETag
      })),
      createdAt: hasFolder ? files[0]?.LastModified : null
    };
    
  } catch (error) {
    if (error.Code === 'NoSuchBucket') {
      return {
        success: true,
        userId: userId,
        folderPath: `${userId}/`,
        hasFolder: false,
        fileCount: 0,
        totalSize: 0,
        files: [],
        createdAt: null
      };
    } else {
      console.error(`❌ Error getting bucket status for ${userId}:`, error.message);
      return {
        success: false,
        hasFolder: false,
        fileCount: 0,
        totalSize: 0,
        files: []
      };
    }
  }
}

// ============================================================================
// Agent Management Template Builder
// ============================================================================
// Builds a pre-computed template for agent/KB/summary status for each user
// This provides a single source of truth for status icons and Admin2 display

// Helper: Find which user owns an agent
async function getUserFromAgentId(agentId) {
  try {
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    const user = allUsers.find(u => u.assignedAgentId === agentId);
    return user?.userId || user?._id || null;
  } catch (error) {
    console.error('[TEMPLATE] Error finding user for agent:', error.message);
    return null;
  }
}

async function buildAgentManagementTemplate(userId) {
  const timestamp = new Date().toISOString();
  console.log(`[TEMPLATE] Building agent management template for ${userId}`);
  
  try {
    // Step 1: Get user document from Cloudant
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      console.warn(`[TEMPLATE] User ${userId} not found in database`);
      return null;
    }
    
    // Step 2: Initialize template structure
    const template = {
      userId: userId,
      timestamp: timestamp,
      agentStatus: {
        hasAgent: false,
        agentName: null,
        agentId: null,
        agentModel: null,
        agentStatus: null
      },
      kbStatus: {
        hasKB: false,
        attachedCount: 0,
        attachedKBs: [],
        availableCount: 0,
        availableKBs: [],
        needsWarning: false  // Only true if agent exists but NO KB attached and KBs are available
      },
      warning: {
        hasWarning: false,
        warningMessage: '',
        warningType: null
      },
      summaryStatus: {
        hasSummary: false,
        lastGenerated: null
      },
      agentBadgeText: ''
    };
    
    // Step 3: Get agent data if user has assigned agent
    let agentData = null;
    if (userDoc.assignedAgentId) {
      try {
        const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.assignedAgentId}`);
        agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
        
        if (agentData) {
          template.agentStatus = {
            hasAgent: true,
            agentName: agentData.name,
            agentId: userDoc.assignedAgentId,
            agentModel: agentData.model || 'unknown',
            agentStatus: agentData.status || 'unknown'
          };
        }
      } catch (error) {
        console.warn(`[TEMPLATE] Failed to fetch agent ${userDoc.assignedAgentId}:`, error.message);
      }
    }
    
    // Step 4: Get KB data if agent exists
    if (agentData) {
      // Get attached KBs from agent
      const attachedKBs = [];
      if (agentData.knowledge_bases && agentData.knowledge_bases.length > 0) {
        attachedKBs.push(...agentData.knowledge_bases);
      }
      
      // Get all available KBs for this user (from cache)
      const allKBs = await cacheManager.getCachedKnowledgeBases();
      // For Public User, show all KBs; for others, only their own
      const userKBs = userId === 'Public User' 
        ? allKBs 
        : allKBs.filter(kb => kb.name && kb.name.startsWith(userId));
      
      template.kbStatus = {
        hasKB: attachedKBs.length > 0,
        attachedCount: attachedKBs.length,
        attachedKBs: attachedKBs,
        availableCount: userKBs.length,
        availableKBs: userKBs,
        // Warning only if: agent exists AND no KB attached AND KBs are available
        needsWarning: attachedKBs.length === 0 && userKBs.length > 0
      };
      
      // Step 5: Build agent badge text (mimics AgentStatusIndicator logic)
      let badgeText = `Status: ${agentData.status} • Model: ${agentData.model}`;
      
      if (attachedKBs.length > 0) {
        const primaryKB = attachedKBs[0];
        const updatedDate = new Date(primaryKB.updated_at).toLocaleDateString();
        if (attachedKBs.length === 1) {
          badgeText += ` • Knowledge Base: ${primaryKB.name} (Updated: ${updatedDate})`;
        } else {
          badgeText += ` • Knowledge Bases: ${attachedKBs.length} attached (Primary: ${primaryKB.name})`;
        }
      }
      
      template.agentBadgeText = badgeText;
      
      // Step 6: Check for warnings (multiple KBs)
      if (attachedKBs.length > 1) {
        template.warning = {
          hasWarning: true,
          warningMessage: `Your agent has ${attachedKBs.length} knowledge bases attached. Multiple knowledge bases can cause data contamination and hallucinations in AI responses.`,
          warningType: 'multiple_kb'
        };
      }
    }
    
    // Step 7: Check for patient summary
    if (userDoc.patientSummary && userDoc.patientSummary.content) {
      template.summaryStatus = {
        hasSummary: true,
        lastGenerated: userDoc.patientSummary.createdAt || null,
        kbUsed: userDoc.patientSummary.kbUsed || null,
        tokens: userDoc.patientSummary.tokens || 0
      };
    }
    
    // Step 8: Cache the template
    agentManagementTemplates.set(userId, template);
    console.log(`[TEMPLATE] ✅ Template built for ${userId}: hasAgent=${template.agentStatus.hasAgent}, hasKB=${template.kbStatus.hasKB}, hasSummary=${template.summaryStatus.hasSummary}, needsWarning=${template.kbStatus.needsWarning}`);
    
    return template;
    
  } catch (error) {
    console.error(`[TEMPLATE] ❌ Failed to build template for ${userId}:`, error.message);
    return null;
  }
}

// Copy files from archived/ to root for KB indexing
app.post('/api/bucket/copy-files-for-kb', async (req, res) => {
  try {
    const { userId, fileKeys } = req.body;
    
    if (!userId || !fileKeys || !Array.isArray(fileKeys)) {
      return res.status(400).json({
        success: false,
        error: 'userId and fileKeys array required'
      });
    }

    const { S3Client, CopyObjectCommand } = await import('@aws-sdk/client-s3');
    
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    const copiedFiles = [];
    
    for (const sourceKey of fileKeys) {
      try {
        // Source: userId/archived/filename.pdf
        // Destination: userId/filename.pdf
        const fileName = sourceKey.split('/').pop();
        const destKey = `${userId}/${fileName}`;
        
        const copyCommand = new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: `${bucketName}/${sourceKey}`,
          Key: destKey
        });
        
        await s3Client.send(copyCommand);
        copiedFiles.push(destKey);
        console.log(`✅ Copied ${sourceKey} → ${destKey}`);
      } catch (copyError) {
        console.error(`❌ Failed to copy ${sourceKey}:`, copyError.message);
      }
    }
    
    res.json({
      success: true,
      copiedFiles: copiedFiles,
      count: copiedFiles.length
    });
    
  } catch (error) {
    console.error('❌ Error copying files for KB:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clean up temp files from root folder after KB creation
app.post('/api/bucket/cleanup-kb-temp-files', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    // List files in root folder (userId/) but NOT in archived/ subfolder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${userId}/`,
      MaxKeys: 1000
    });

    const result = await s3Client.send(listCommand);
    const files = result.Contents || [];
    
    // Filter to only root-level files (not in archived/ or other subfolders)
    const rootFiles = files.filter(file => {
      const pathParts = file.Key.split('/');
      // Should be exactly 2 parts: userId/filename.pdf (not userId/archived/filename.pdf)
      return pathParts.length === 2 && pathParts[1] !== '' && !file.Key.includes('/archived/');
    });

    const deletedFiles = [];
    
    for (const file of rootFiles) {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: file.Key
        });
        
        await s3Client.send(deleteCommand);
        deletedFiles.push(file.Key);
        console.log(`🗑️ Deleted temp file: ${file.Key}`);
      } catch (deleteError) {
        console.error(`❌ Failed to delete ${file.Key}:`, deleteError.message);
      }
    }
    
    res.json({
      success: true,
      deletedFiles: deletedFiles,
      count: deletedFiles.length
    });
    
  } catch (error) {
    console.error('❌ Error cleaning up temp files:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user-specific bucket status
app.get('/api/bucket/user-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get bucket files
    const bucketStatus = await getBucketStatusForUser(userId);
    
    // Get user document to merge in KB associations
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    
    if (userDoc && userDoc.files && bucketStatus.files) {
      // Create a map of file metadata by bucketKey
      const fileMetadataMap = new Map();
      for (const fileInfo of userDoc.files) {
        fileMetadataMap.set(fileInfo.bucketKey, fileInfo);
      }
      
      // Merge KB associations into bucket files
      bucketStatus.files = bucketStatus.files.map(bucketFile => {
        const metadata = fileMetadataMap.get(bucketFile.key);
        return {
          ...bucketFile,
          knowledgeBases: metadata?.knowledgeBases || []
        };
      });
    }
    res.json(bucketStatus);
  } catch (error) {
      console.error('❌ Error getting user bucket status:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to get user bucket status: ${error.message}`,
        error: 'STATUS_CHECK_FAILED'
      });
  }
});

// Delete file from DigitalOcean Spaces bucket
app.delete('/api/delete-bucket-file', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ 
        success: false, 
        message: 'File key is required',
        error: 'MISSING_KEY'
      });
    }
    
//     console.log(`🗑️ Deleting file from DigitalOcean Spaces bucket: ${key}`);
    
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    
    // Extract bucket name from the full URL environment variable
    const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
    const bucketName = bucketUrl ? bucketUrl.split('//')[1].split('.')[0] : 'maia.tor1';
    
    // Check if bucket is configured
    if (!bucketUrl) {
      console.warn(`⚠️ DIGITALOCEAN_BUCKET not configured, skipping bucket operation`);
      return res.status(400).json({ 
        success: false, 
        message: 'DigitalOcean bucket not configured',
        error: 'BUCKET_NOT_CONFIGURED'
      });
    }
    
    const s3Client = new S3Client({
      endpoint: process.env.DIGITALOCEAN_ENDPOINT_URL || 'https://tor1.digitaloceanspaces.com',
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: {
        accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
        secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
      }
    });

    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    await s3Client.send(deleteCommand);
//     console.log(`✅ Successfully deleted file from bucket: ${key}`);
    
    // Update cache with fresh bucket status after deletion
    const userId = key.split('/')[0]; // Extract user ID from key (e.g., "wed108/file.pdf" -> "wed108")
    await updateUserBucketCache(userId);
    
    res.json({
      success: true,
      message: 'File deleted successfully',
      deletedKey: key
    });
  } catch (error) {
    if (error.Code === 'NoSuchBucket') {
      console.warn(`⚠️ Bucket ${bucketName} does not exist, cannot delete file`);
      res.status(400).json({ 
        success: false, 
        message: `Bucket ${bucketName} does not exist`,
        error: 'BUCKET_NOT_FOUND'
      });
    } else {
      console.error('❌ Error deleting file from bucket:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to delete file from bucket: ${error.message}`,
        error: 'DELETE_FAILED'
      });
    }
  }
});

// Personal Chat endpoint (DigitalOcean Agent Platform)
app.post('/api/personal-chat', async (req, res) => {
  const startTime = Date.now();

  // Track Public User activity for chat requests (only if not authenticated)
  trackPublicUserActivity(req);

  // Determine the base URL dynamically from the request
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
  const baseUrl = `${protocol}://${host}`;

  try {
    // Process personal chat request
    let { chatHistory, newValue, timeline, uploadedFiles } = req.body;
    
    // Filter out any existing system messages since the GenAI agent has its own system prompt
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');

    // Keep the original user message clean for chat history
    const cleanUserMessage = newValue;
    
    // Prepare context for the AI (not for chat history)
    let aiContext = '';
    if (timeline && chatHistory.length === 0) {
      aiContext += `Timeline context: ${timeline}\n\n`;
    }
    
    if (uploadedFiles && uploadedFiles.length > 0) {
      const filesContext = uploadedFiles.map(file => 
        `File: ${file.name} (${file.type})\nContent:\n${file.content}`
      ).join('\n\n');
      aiContext += `Uploaded files context:\n${filesContext}\n\n`;
    }
    
    // Combine context with user message for AI, but keep original for chat history
    const aiUserMessage = aiContext ? `${aiContext}User query: ${newValue}` : newValue;

    // Get current user from authentication cookie (primary), request body (deep link users), or fall back to Public User
    let currentUser = 'Public User';
    
    // Check authentication cookie first
    const authCookie = req.cookies?.maia_auth;
    if (authCookie) {
      try {
        const authData = JSON.parse(authCookie);
        const now = new Date();
        const expiresAt = new Date(authData.expiresAt);
        
        // If cookie is valid and not expired, use the authenticated user
        if (now < expiresAt && authData.userId) {
          currentUser = authData.userId;
          // console.log(`🔐 [personal-chat] Using authenticated user from cookie: ${currentUser}`);
        }
      } catch (error) {
        // Invalid cookie, proceed with other methods
      }
    }
    
    // Fallback to request body (for deep link users who send currentUser explicitly)
    if (currentUser === 'Public User' && req.body.currentUser) {
      currentUser = req.body.currentUser?.userId || req.body.currentUser?.displayName || currentUser;
    }
    
    // Final fallback to session (legacy support)
    if (currentUser === 'Public User' && req.session?.userId) {
      currentUser = req.session.userId;
    }
    
    // Frontend now adds the user's message to chat history, so we don't need to add it here
    // The chatHistory already contains the user's message with the correct display name
    
    // Create a copy of chatHistory to avoid modifying the original
    const newChatHistory = [...chatHistory];

    // Determine which agent to use based on user assignment
    // Initialize with defaults (will be overridden by deep link logic or regular user logic)
    let agentModel = null;
    let agentName = 'Unknown Agent';
    let agentEndpoint = null;
    let agentId = null;
    let knowledgeBases = [];
    
    // Handle deep link users - they should use the agent assigned to the patient whose data is being shared
    if (currentUser && currentUser.startsWith('deep_link_')) {
      // console.log(`🔗 [personal-chat] Deep link user detected: ${currentUser}, finding patient's agent`);
      // console.log(`🔗 [DEBUG] Step 1: Deep link user ID: ${currentUser}`);
//       console.log(`🔗 [DEBUG] Step 1a: Request body currentUser:`, req.body.currentUser);
//       console.log(`🔗 [DEBUG] Step 1b: Session userId:`, req.session?.userId);
      
      try {
        // Get the deep link user's session to find the shareId
        // console.log(`🔗 [DEBUG] Step 2: Looking up deep link user document in maia_users...`);
        const deepLinkUserDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', currentUser);
//         console.log(`🔗 [DEBUG] Step 2 Result:`, deepLinkUserDoc ? {
//           userId: deepLinkUserDoc.userId,
//           shareId: deepLinkUserDoc.shareId,
//           displayName: deepLinkUserDoc.displayName
//         } : 'Document not found');
        
        if (deepLinkUserDoc && deepLinkUserDoc.shareId) {
          // console.log(`🔗 [personal-chat] Found shareId for deep link user: ${deepLinkUserDoc.shareId}`);
          // console.log(`🔗 [DEBUG] Step 3: Looking for chat with shareId: ${deepLinkUserDoc.shareId}`);
          
          // Find the chat document with this shareId to get the patient
          const allChats = await couchDBClient.getAllChats();
          // console.log(`🔗 [DEBUG] Step 3a: Found ${allChats.length} total chats`);
          
          const sharedChat = allChats.find(chat => chat.shareId === deepLinkUserDoc.shareId);
//           console.log(`🔗 [DEBUG] Step 3b: Shared chat found:`, sharedChat ? {
//             chatId: sharedChat._id,
//             shareId: sharedChat.shareId,
//             currentUser: sharedChat.currentUser,
//             currentUserType: typeof sharedChat.currentUser
//           } : 'No chat found with matching shareId');
          
          if (sharedChat && sharedChat.currentUser) {
            const patientUser = typeof sharedChat.currentUser === 'string' 
              ? sharedChat.currentUser 
              : sharedChat.currentUser.userId || sharedChat.currentUser.displayName;
            
            // console.log(`🔗 [personal-chat] Found patient for deep link: ${patientUser}`);
            // console.log(`🔗 [DEBUG] Step 4: Getting assigned agent for patient: ${patientUser}`);
            
            // Get the assigned agent for this patient
            const assignedAgentResponse = await fetch(`${baseUrl}/api/admin-management/users/${patientUser}/assigned-agent`);
            // console.log(`🔗 [DEBUG] Step 4a: Assigned agent response status: ${assignedAgentResponse.status}`);
            
            if (assignedAgentResponse.ok) {
              const assignedAgentData = await assignedAgentResponse.json();
//               console.log(`🔗 [DEBUG] Step 4b: Assigned agent data:`, assignedAgentData);
              
              if (assignedAgentData.assignedAgentId) {
                // console.log(`🔗 [personal-chat] Using patient's assigned agent: ${assignedAgentData.assignedAgentName} (${assignedAgentData.assignedAgentId})`);
                // console.log(`🔗 [DEBUG] Step 5: Getting agent details from DigitalOcean API...`);
                
                // Get the agent's deployment URL from DigitalOcean API
                const agentResponse = await doRequest(`/v2/gen-ai/agents/${assignedAgentData.assignedAgentId}`);
                const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
//                 console.log(`🔗 [DEBUG] Step 5a: Agent data from DigitalOcean:`, agentData ? {
//                   name: agentData.name,
//                   hasDeployment: !!agentData.deployment,
//                   deploymentUrl: agentData.deployment?.url,
//                   hasKnowledgeBases: !!agentData.knowledge_bases
//                 } : 'No agent data');
                
                if (agentData && agentData.deployment?.url) {
                  agentModel = agentData.name;
                  agentName = agentData.name;
                  agentId = assignedAgentData.assignedAgentId;
                  agentEndpoint = `${agentData.deployment.url}/api/v1`;
                  
                  // Get knowledge base info for this agent
                  if (agentData.knowledge_bases) {
                    knowledgeBases = agentData.knowledge_bases.map(kb => kb.name || kb.uuid);
                  }
                  
                  // console.log(`🔗 [personal-chat] Deep link user using patient's agent: ${agentData.name} (${agentEndpoint})`);
//                   console.log(`🔗 [DEBUG] Step 5b: Agent assignment successful:`, {
//                     agentModel,
//                     agentName,
//                     agentId,
//                     agentEndpoint,
//                     knowledgeBases
//                   });
                } else {
                  // console.log(`🔗 [personal-chat] Patient's agent ${assignedAgentData.assignedAgentName} has no deployment URL`);
                  // console.log(`🔗 [DEBUG] Step 5c: Agent has no deployment URL - agent assignment failed`);
                }
              } else {
                // console.log(`🔗 [personal-chat] Patient ${patientUser} has no assigned agent`);
                // console.log(`🔗 [DEBUG] Step 4c: Patient has no assigned agent - agent assignment failed`);
              }
            } else {
              // console.log(`🔗 [personal-chat] Failed to get assigned agent for patient ${patientUser}: ${assignedAgentResponse.status}`);
              // console.log(`🔗 [DEBUG] Step 4d: Failed to get assigned agent - HTTP ${assignedAgentResponse.status}`);
            }
          } else {
            // console.log(`🔗 [personal-chat] No chat found for shareId: ${deepLinkUserDoc.shareId}`);
            // console.log(`🔗 [DEBUG] Step 3c: No chat found with shareId - agent assignment failed`);
          }
        } else {
          // console.log(`🔗 [personal-chat] No shareId found for deep link user: ${currentUser}`);
          // console.log(`🔗 [DEBUG] Step 2c: No shareId in deep link user document - agent assignment failed`);
        }
      } catch (error) {
        console.warn(`🔗 [personal-chat] Error finding patient's agent for deep link user:`, error.message);
//         console.log(`🔗 [DEBUG] Step ERROR: Exception occurred - agent assignment failed:`, error);
      }
      
      // If we couldn't find the patient's agent, fall back to Public User's agent
      if (!agentModel) {
        // console.log(`🔗 [personal-chat] Falling back to Public User's agent for deep link user`);
        // console.log(`🔗 [DEBUG] Step FALLBACK: No agent found, falling back to Public User's agent`);
        currentUser = 'Public User';
      } else {
        // console.log(`🔗 [DEBUG] Step SUCCESS: Agent assignment completed successfully`);
//         console.log(`🔗 [DEBUG] Step SUCCESS: Agent details:`, {
//           agentModel,
//           agentName,
//           agentId,
//           agentEndpoint,
//           knowledgeBases
//         });
      }
    }
    
    
    // Skip this for deep link users since we already resolved their patient's agent above
    if (currentUser !== 'Public User' && !currentUser.startsWith('deep_link_')) {
      try {
        const assignedAgentResponse = await fetch(`${baseUrl}/api/admin-management/users/${currentUser}/assigned-agent`);
        if (assignedAgentResponse.ok) {
          const assignedAgentData = await assignedAgentResponse.json();
          if (assignedAgentData.assignedAgentId) {
            // Get the agent's deployment URL from DigitalOcean API
            try {
              const agentResponse = await doRequest(`/v2/gen-ai/agents/${assignedAgentData.assignedAgentId}`);
              const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
              
              if (agentData && agentData.deployment?.url) {
                agentModel = agentData.name;  // Use agent name for DigitalOcean API
                agentName = agentData.name;
                agentId = assignedAgentData.assignedAgentId;
                agentEndpoint = `${agentData.deployment.url}/api/v1`;  // Use agent's specific endpoint
                // console.log(`🔐 [personal-chat] Using assigned agent for user ${currentUser}: ${agentData.name} (${agentModel})`);
                // console.log(`🌐 [personal-chat] Using agent endpoint: ${agentEndpoint}`);
                
                // Get knowledge base info for this agent
                if (agentData.knowledge_bases) {
                  knowledgeBases = agentData.knowledge_bases.map(kb => kb.name || kb.uuid);
                }
              } else {
              }
            } catch (agentError) {
              console.warn(`Failed to get agent details for ${assignedAgentData.assignedAgentId}:`, agentError.message);
            }
          } else {
          }
        } else {
        }
      } catch (error) {
        console.warn(`Failed to check assigned agent for user ${currentUser}:`, error.message);
      }
    }
    
    // If no agent found for authenticated user, check for current agent selection
    if (!agentModel) {
      if (currentUser !== 'Public User') {
        // Check if user has a current agent selection stored in Cloudant
        try {
          const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', currentUser);
          if (userDoc && userDoc.assignedAgentId) {
            // Get the agent's deployment URL from DigitalOcean API
            const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.assignedAgentId}`);
            const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
            
            if (agentData && agentData.deployment?.url) {
              agentModel = agentData.name;  // Use agent name for DigitalOcean API
              agentName = agentData.name;
              agentId = userDoc.assignedAgentId;
              agentEndpoint = `${agentData.deployment.url}/api/v1`;  // Use agent's deployment URL
              // console.log(`🔐 [personal-chat] Using user's assigned agent: ${agentData.name} (${agentModel})`);
              // console.log(`🌐 [personal-chat] Using agent endpoint: ${agentEndpoint}`);
              
              // Get knowledge base info for this agent
              if (agentData.knowledge_bases) {
                knowledgeBases = agentData.knowledge_bases.map(kb => kb.name || kb.uuid);
              }
            } else {
              // console.log(`🔍 [personal-chat] User's current agent ${userDoc.currentAgentName} has no deployment URL`);
            }
          } else {
            // console.log(`🔍 [personal-chat] No current agent selection found for user ${currentUser}`);
            return res.status(400).json({ 
              message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
              requiresAgentSelection: true
            });
          }
        } catch (userError) {
          console.warn(`Failed to get current agent selection for user ${currentUser}:`, userError.message);
          return res.status(400).json({ 
            message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
            requiresAgentSelection: true
          });
        }
      } else {
        // For Public User, check if they have a current agent selection stored in Cloudant
        try {
          const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'Public User');
          
          // For Public User, use assignedAgentId as source of truth
          const userAgentId = userDoc?.assignedAgentId;
          
          if (userDoc && userAgentId) {
            // Check if the selected agent is still available to Public User (not owned by authenticated users)
            const isAgentAvailable = await isAgentAvailableToPublicUser(userAgentId);
            
            if (isAgentAvailable) {
              // Get the agent's deployment URL from DigitalOcean API
              const agentResponse = await doRequest(`/v2/gen-ai/agents/${userAgentId}`);
              const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
              
              if (agentData && agentData.deployment?.url) {
                agentModel = agentData.name;  // Use agent name for DigitalOcean API
                agentName = agentData.name;
                agentId = userAgentId;
                agentEndpoint = `${agentData.deployment.url}/api/v1`;  // Use agent's deployment URL
                
                // Get knowledge base info for this agent
                if (agentData.knowledge_bases) {
                  knowledgeBases = agentData.knowledge_bases.map(kb => kb.name || kb.uuid);
                }
              } else {
                // console.log(`🔍 [personal-chat] Public User's agent ${userDoc.currentAgentName || userDoc.assignedAgentName} has no deployment URL`);
              }
            } else {
              // Agent is no longer available to Public User (now owned by authenticated user)
              // Clear the invalid agent assignment (should not happen with assignedAgentId)
              const updatedUserDoc = {
                ...userDoc,
                assignedAgentId: null,
                assignedAgentName: null,
                agentAssignedAt: null,
                updatedAt: new Date().toISOString()
              };
              await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
              
              // Update cache to reflect the cleared assignment
              setCache('users', 'Public User', updatedUserDoc);
              
              // console.log(`🔍 [personal-chat] Public User's selected agent is now owned by an authenticated user, cleared selection`);
            }
          } else {
            // console.log(`🔍 [personal-chat] No current agent selection found for Public User`);
            return res.status(400).json({ 
              message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
              requiresAgentSelection: true
            });
          }
        } catch (userError) {
          console.error(`❌ Failed to get current agent selection for Public User:`, userError.message);
          return res.status(400).json({ 
            message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
            requiresAgentSelection: true
          });
        }
      }
    }

    const params = {
      messages: [
        ...chatHistory,
        { role: 'user', content: aiUserMessage }
      ],
      model: agentModel
    };

    // Log token usage and context info
    const totalTokens = estimateTokenCount(aiUserMessage);
    const contextSize = aiContext ? Math.round(aiContext.length / 1024 * 100) / 100 : 0;
    console.log(`[*] AI Query: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);
    console.log(`[*] Current user: ${currentUser}, Agent: ${agentName}, Connected KBs: [${knowledgeBases.join(', ')}]`);

    // Check if we have a valid agent configuration
    if (!agentId || !agentEndpoint) {
      console.error(`❌ No valid agent configuration found. AgentId: ${agentId}, Endpoint: ${agentEndpoint}`);
      return res.status(400).json({ 
        message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
        requiresAgentSelection: true
      });
    }

    // Get agent-specific API key
    let agentApiKey;
    try {
      agentApiKey = await getAgentApiKey(agentId);
      
      // API key retrieved successfully
      console.log(`🔑 Using API key: ${agentApiKey ? agentApiKey.substring(0, 10) + '...' : 'null'}`);
      
      // Check if we have a valid API key
      if (!agentApiKey) {
        console.error(`❌ No API key available for agent: ${agentId}`);
        return res.status(400).json({ 
          message: 'No API key available for the selected agent. Please contact support to configure agent authentication.',
          requiresAgentSelection: true
        });
      }
    } catch (error) {
      console.error(`❌ Failed to get agent-specific API key:`, error.message);
      return res.status(400).json({ 
        message: 'Failed to retrieve API key for the selected agent. Please contact support to configure agent authentication.',
        requiresAgentSelection: true
      });
    }

    // Create agent-specific OpenAI client
    // Note: Agent-specific endpoints may require different authentication
    const agentClient = new OpenAI({
      baseURL: agentEndpoint,
      apiKey: agentApiKey
    });

    let response;
    try {
      response = await agentClient.chat.completions.create(params);
    const responseTime = Date.now() - startTime;
      console.log(`[*] AI Response time: ${responseTime}ms`);
      
      // Track user activity for Admin Panel
      if (currentUser) {
        updateUserActivity(currentUser);
      }
    } catch (agentError) {
      console.error(`❌ Agent-specific endpoint failed: ${agentError.message}`);
      
      // Check if it's an authentication error
      if (agentError.status === 401 || agentError.message.includes('unauthorized') || agentError.message.includes('authentication')) {
        return res.status(400).json({ 
          message: 'Authentication failed for the selected agent. The API key may be invalid or expired. Please contact support.',
          requiresAgentSelection: true
        });
      }
      
      // Check if it's a forbidden error
      if (agentError.status === 403 || agentError.message.includes('forbidden')) {
        return res.status(400).json({ 
          message: 'Access denied for the selected agent. The API key may not have the required permissions. Please contact support.',
          requiresAgentSelection: true
        });
      }
      
      throw agentError; // Re-throw the error to be handled by the outer catch block
    }
    
    // Add the response with proper name field
//     console.log('🔍 [DEBUG] About to add AI response to newChatHistory:');
    // console.log('  - current length:', newChatHistory.length);
    // console.log('  - AI response:', response.choices[0].message);
    
    newChatHistory.push({
      ...response.choices[0].message,
      name: 'Personal AI'
    });
    
//     console.log('🔍 [DEBUG] After adding AI response:');
    // console.log('  - new length:', newChatHistory.length);
    // console.log('  - last message:', newChatHistory[newChatHistory.length - 1]);

    // Update user activity
    updateUserActivity(currentUser);

    // Invalidate chat cache since we may have modified chat data
    invalidateCache('chats');

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Personal AI error (${responseTime}ms):`, error.message);
    
    // Return error message in chat instead of mock response
    let { chatHistory } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');
    
    // Create helpful error message for user
    let errorMessage = '❌ **Error communicating with your Private AI:**\n\n';
    
    if (error.message.includes('exceeds maximum token limit')) {
      errorMessage += '**Token Limit Exceeded**\n\n';
      errorMessage += 'The combined size of your uploaded file and knowledge base exceeds the model\'s maximum context window (96,000 tokens).\n\n';
      errorMessage += '**Suggestions:**\n';
      errorMessage += '- Remove the uploaded file and rely only on your knowledge base\n';
      errorMessage += '- Try a shorter question\n';
      errorMessage += '- Split your document into smaller files';
    } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      errorMessage += '**Authentication Error**\n\n';
      errorMessage += 'Your API key may be invalid or expired. Please contact the administrator for assistance.';
    } else {
      errorMessage += `**Error Details:**\n\n${error.message}`;
    }
    
    const newChatHistory = [
      ...chatHistory,
      { role: 'assistant', content: errorMessage, name: 'System Error' }
    ];
    
    res.json(newChatHistory);
  }
});

// Fallback chat endpoints for other AI providers
app.post('/api/anthropic-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!anthropic) {
      return res.status(500).json({ message: 'Anthropic API key not configured' });
    }

    let { chatHistory, newValue, uploadedFiles } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');

    // Debug: Log the incoming chat history structure
//     console.log('🔍 Anthropic - Incoming chat history structure:', {
//       length: chatHistory.length,
//       sampleMessage: chatHistory[0] ? {
//         role: chatHistory[0].role,
//         content: chatHistory[0].content,
//         hasName: 'name' in chatHistory[0],
//         name: chatHistory[0].name,
//         allKeys: Object.keys(chatHistory[0])
//       } : 'No messages'
//     });

    // Debug: Check for empty content messages
    const emptyContentMessages = chatHistory.filter(msg => !msg.content || msg.content.trim() === '');
    if (emptyContentMessages.length > 0) {
//       console.log('⚠️ WARNING: Found messages with empty content:', emptyContentMessages.map((msg, index) => ({
//         index,
//         role: msg.role,
//         content: msg.content,
//         allKeys: Object.keys(msg)
//       })));
    }

    // Clean chat history to remove any 'name' fields that Anthropic doesn't support
    // AND filter out messages with empty content that cause API errors
    const cleanChatHistory = chatHistory
      .filter(msg => msg.content && msg.content.trim() !== '') // Remove empty content messages
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));

    // Keep the original user message clean for chat history
    const cleanUserMessage = newValue;
    
    // Prepare context for the AI
    let aiContext = '';
    if (uploadedFiles && uploadedFiles.length > 0) {
      const filesContext = uploadedFiles.map(file => 
        `File: ${file.name} (${file.type})\nContent:\n${file.content}`
      ).join('\n\n');
      aiContext = `Uploaded files context:\n${filesContext}\n\n`;
    }
    
    // Combine context with user message for AI
    const aiUserMessage = aiContext ? `${aiContext}User query: ${newValue}` : newValue;

    // Log token usage and context info
    const totalTokens = estimateTokenCount(aiUserMessage);
    const contextSize = aiContext ? Math.round(aiContext.length / 1024 * 100) / 100 : 0;
//     console.log(`🤖 Anthropic: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

    // Debug: Log what's being sent to Anthropic
//     console.log('🔍 Anthropic - Sending to API:', {
//       cleanChatHistoryLength: cleanChatHistory.length,
//       cleanChatHistorySample: cleanChatHistory[0] ? {
//         role: cleanChatHistory[0].role,
//         content: cleanChatHistory[0].content,
//         allKeys: Object.keys(cleanChatHistory[0])
//       } : 'No messages',
//       aiUserMessage: aiUserMessage.substring(0, 100) + '...'
//     });

    // Debug: Check cleaned messages for empty content
    const emptyCleanedMessages = cleanChatHistory.filter(msg => !msg.content || msg.content.trim() === '');
    if (emptyCleanedMessages.length > 0) {
//       console.log('⚠️ WARNING: Cleaned messages with empty content:', emptyCleanedMessages.map((msg, index) => ({
//         index,
//         role: msg.role,
//         content: msg.content
//       })));
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [
        ...cleanChatHistory,
        { role: 'user', content: aiUserMessage }
      ]
    });

    const responseTime = Date.now() - startTime;
//     console.log(`✅ Anthropic response: ${responseTime}ms`);

    // Frontend already adds the user message, so we only add the AI response
    const newChatHistory = [
      ...chatHistory,
      { role: 'assistant', content: response.content[0].text, name: 'Anthropic' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Anthropic error (${responseTime}ms):`, error.message);
    
    // Calculate token count for error messages (fallback if not available)
    let tokenCount = 0;
    try {
      // Reconstruct the message that would have been sent to AI
      const { chatHistory, newValue, uploadedFiles } = req.body;
      let aiUserMessage = newValue || '';
      
      // Add uploaded file content if present
      if (uploadedFiles && uploadedFiles.length > 0) {
        const fileContent = uploadedFiles.map(file => 
          file.type === 'pdf' && file.transcript ? file.transcript : file.content || ''
        ).join('\n\n');
        if (fileContent) {
          aiUserMessage = `File content:\n${fileContent}\n\nUser query: ${aiUserMessage}`;
        }
      }
      
      tokenCount = estimateTokenCount(aiUserMessage);
    } catch (tokenError) {
      console.warn('Could not calculate token count for error message:', tokenError);
    }
    
    // Check for specific error types
    if (error.message && error.message.includes('429')) {
      res.status(429).json({ 
        message: `Rate limit exceeded (${tokenCount} tokens sent). Please try again in a minute or use Personal AI for large documents.`,
        errorType: 'RATE_LIMIT',
        tokenCount: tokenCount
      });
    } else if (error.message && error.message.includes('Request too large')) {
      res.status(413).json({ 
        message: `Document too large for Anthropic (${tokenCount} tokens sent). Please use Personal AI for large documents.`,
        errorType: 'TOO_LARGE',
        tokenCount: tokenCount
      });
    } else {
    res.status(500).json({ message: `Server error: ${error.message}` });
    }
  }
});

// Additional fallback endpoints...
app.post('/api/gemini-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!process.env.GEMINI_API_KEY) {
      // Fallback to mock if no API key
      let { chatHistory = [], newValue, uploadedFiles = [] } = req.body;
      chatHistory = chatHistory.filter(msg => msg.role !== 'system');
      
      const mockResponse = mockAIResponses['gemini-chat'](newValue);
      const newChatHistory = [
        ...chatHistory,
        { role: 'assistant', content: mockResponse, name: 'Gemini' }
      ];
      
      return res.json(newChatHistory);
    }

    // Use actual Gemini API
    let { chatHistory = [], newValue, uploadedFiles = [] } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');

    // Debug: Log the incoming chat history structure
//     console.log('🔍 Gemini - Incoming chat history structure:', {
//       length: chatHistory.length,
//       sampleMessage: chatHistory[0] ? {
//         role: chatHistory[0].role,
//         content: chatHistory[0].content,
//         hasName: 'name' in chatHistory[0],
//         name: chatHistory[0].name,
//         allKeys: Object.keys(chatHistory[0])
//       } : 'No messages'
//     });

    // Debug: Check for empty content messages
    const emptyContentMessages = chatHistory.filter(msg => !msg.content || msg.content.trim() === '');
    if (emptyContentMessages.length > 0) {
//       console.log('⚠️ WARNING: Found messages with empty content:', emptyContentMessages.map((msg, index) => ({
//         index,
//         role: msg.role,
//         content: msg.content,
//         allKeys: Object.keys(msg)
//       })));
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

    // Keep the original user message clean for chat history
    const cleanUserMessage = newValue;
    
    // Prepare context for the AI
    let aiContext = '';
    if (uploadedFiles && uploadedFiles.length > 0) {
      const filesContext = uploadedFiles.map(file => 
        `File: ${file.name} (${file.type})\nContent:\n${file.content}`
      ).join('\n\n');
      aiContext = `Uploaded files context:\n${filesContext}\n\n`;
    }
    
    // Combine context with user message for AI
    const aiUserMessage = aiContext ? `${aiContext}User query: ${newValue}` : newValue;

    // Log token usage and context info
    const totalTokens = estimateTokenCount(aiUserMessage);
    const contextSize = aiContext ? Math.round(aiContext.length / 1024 * 100) / 100 : 0;
//     console.log(`🤖 Gemini: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

    // Clean chat history to remove empty content messages that cause API errors
    const cleanChatHistory = chatHistory.filter(msg => msg.content && msg.content.trim() !== '');
    
    // Start a chat session
    const chat = model.startChat({
      history: cleanChatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    });

    // Send the new message
    const result = await chat.sendMessage(aiUserMessage);
    const response = await result.response;
    const text = response.text();

    const responseTime = Date.now() - startTime;
//     console.log(`✅ Gemini response: ${responseTime}ms`);

    // Frontend already adds the user message, so we only add the AI response
    const newChatHistory = [
      ...chatHistory,
      { role: 'assistant', content: text, name: 'Gemini' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Gemini error (${responseTime}ms):`, error.message);
    
    // Calculate token count for error messages (fallback if not available)
    let tokenCount = 0;
    try {
      // Reconstruct the message that would have been sent to AI
      const { chatHistory, newValue, uploadedFiles } = req.body;
      let aiUserMessage = newValue || '';
      
      // Add uploaded file content if present
      if (uploadedFiles && uploadedFiles.length > 0) {
        const fileContent = uploadedFiles.map(file => 
          file.type === 'pdf' && file.transcript ? file.transcript : file.content || ''
        ).join('\n\n');
        if (fileContent) {
          aiUserMessage = `File content:\n${fileContent}\n\nUser query: ${aiUserMessage}`;
        }
      }
      
      tokenCount = estimateTokenCount(aiUserMessage);
    } catch (tokenError) {
      console.warn('Could not calculate token count for error message:', tokenError);
    }
    
    // Check for specific error types
    if (error.message && error.message.includes('429')) {
      res.status(429).json({ 
        message: `Rate limit exceeded (${tokenCount} tokens sent). Please try again in a minute or use Personal AI for large documents.`,
        errorType: 'RATE_LIMIT',
        tokenCount: tokenCount
      });
    } else if (error.message && error.message.includes('Request too large')) {
      res.status(413).json({ 
        message: `Document too large for Gemini (${tokenCount} tokens sent). Please use Personal AI for large documents.`,
        errorType: 'TOO_LARGE',
        tokenCount: tokenCount
      });
    } else {
    res.status(500).json({ message: `Server error: ${error.message}` });
    }
  }
});

app.post('/api/deepseek-r1-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!deepseek) {
      return res.status(500).json({ message: 'DeepSeek API key not configured' });
    }

    let { chatHistory = [], newValue, uploadedFiles = [] } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');

    // Keep the original user message clean for chat history
    const cleanUserMessage = newValue;
    
    // Prepare context for the AI
    let aiContext = '';
    if (uploadedFiles && uploadedFiles.length > 0) {
      const filesContext = uploadedFiles.map(file => 
        `File: ${file.name} (${file.type})\nContent:\n${file.content}`
      ).join('\n\n');
      aiContext = `Uploaded files context:\n${filesContext}\n\n`;
    }
    
    // Combine context with user message for AI
    const aiUserMessage = aiContext ? `${aiContext}User query: ${newValue}` : newValue;

    // Log token usage and context info
    const totalTokens = estimateTokenCount(aiUserMessage);
    const contextSize = aiContext ? Math.round(aiContext.length / 1024 * 100) / 100 : 0;
//     console.log(`🤖 DeepSeek: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

    // Clean chat history to remove empty content messages that cause API errors
    const cleanChatHistory = chatHistory.filter(msg => msg.content && msg.content.trim() !== '');
    
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        ...cleanChatHistory,
        { role: 'user', content: aiUserMessage }
      ]
    });

    const responseTime = Date.now() - startTime;
//     console.log(`✅ DeepSeek response: ${responseTime}ms`);

    // Frontend already adds the user message, so we only add the AI response
    const newChatHistory = [
      ...chatHistory,
      { role: 'assistant', content: response.choices[0].message.content, name: 'DeepSeek' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ DeepSeek error (${responseTime}ms):`, error.message);
    
    // Calculate token count for error messages (fallback if not available)
    let tokenCount = 0;
    try {
      // Reconstruct the message that would have been sent to AI
      const { chatHistory, newValue, uploadedFiles } = req.body;
      let aiUserMessage = newValue || '';
      
      // Add uploaded file content if present
      if (uploadedFiles && uploadedFiles.length > 0) {
        const fileContent = uploadedFiles.map(file => 
          file.type === 'pdf' && file.transcript ? file.transcript : file.content || ''
        ).join('\n\n');
        if (fileContent) {
          aiUserMessage = `File content:\n${fileContent}\n\nUser query: ${aiUserMessage}`;
        }
      }
      
      tokenCount = estimateTokenCount(aiUserMessage);
    } catch (tokenError) {
      console.warn('Could not calculate token count for error message:', tokenError);
    }
    
    // Check for specific error types
    if (error.message && error.message.includes('429')) {
      res.status(429).json({ 
        message: `Rate limit exceeded (${tokenCount} tokens sent). Please try again in a minute or use Personal AI for large documents.`,
        errorType: 'RATE_LIMIT',
        tokenCount: tokenCount
      });
    } else if (error.message && error.message.includes('Request too large')) {
      res.status(413).json({ 
        message: `Document too large for DeepSeek (${tokenCount} tokens sent). Please use Personal AI for large documents.`,
        errorType: 'TOO_LARGE',
        tokenCount: tokenCount
      });
    } else {
    res.status(500).json({ message: `Server error: ${error.message}` });
    }
  }
});

app.post('/api/chatgpt-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!chatgpt) {
      return res.status(500).json({ message: 'ChatGPT API key not configured' });
    }

    let { chatHistory = [], newValue, uploadedFiles = [] } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');

    // Debug: Log what we received
//     console.log('🔍 [ChatGPT] Received request:');
    // console.log('  - chatHistory length:', chatHistory.length);
    // console.log('  - newValue:', newValue);
    // console.log('  - uploadedFiles count:', uploadedFiles?.length || 0);
    // console.log('  - uploadedFiles details:', uploadedFiles?.map(f => ({
    //   name: f.name,
    //   type: f.type,
    //   contentLength: f.content?.length || 0
    // })));

    // Keep the original user message clean for chat history
    const cleanUserMessage = newValue;
    
    // Prepare context for the AI
    let aiContext = '';
    if (uploadedFiles && uploadedFiles.length > 0) {
      const filesContext = uploadedFiles.map(file => 
        `File: ${file.name} (${file.type})\nContent:\n${file.content}`
      ).join('\n\n');
      aiContext = `Uploaded files context:\n${filesContext}\n\n`;
//       console.log('🔍 [ChatGPT] Generated aiContext length:', aiContext.length);
    } else {
//       console.log('🔍 [ChatGPT] No uploaded files to process');
    }
    
    // Combine context with user message for AI
    const aiUserMessage = aiContext ? `${aiContext}User query: ${newValue}` : newValue;

    // Log token usage and context info
    const totalTokens = estimateTokenCount(aiUserMessage);
    const contextSize = aiContext ? Math.round(aiContext.length / 1024 * 100) / 100 : 0;
//     console.log(`🤖 ChatGPT: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

    // Clean chat history to remove empty content messages that cause API errors
    const cleanChatHistory = chatHistory.filter(msg => msg.content && msg.content.trim() !== '');
    
    // Format messages for ChatGPT API (remove name fields that cause validation errors)
    const formattedMessages = cleanChatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
      // Remove name field to avoid ChatGPT API validation errors
    }));
    
    const response = await chatgpt.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        ...formattedMessages,
        { role: 'user', content: aiUserMessage }
      ]
    });

    const responseTime = Date.now() - startTime;
//     console.log(`✅ ChatGPT response: ${responseTime}ms`);

    // Frontend already adds the user message, so we only add the AI response
    const newChatHistory = [
      ...chatHistory,
      { role: 'assistant', content: response.choices[0].message.content, name: 'ChatGPT' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ ChatGPT error (${responseTime}ms):`, error.message);
    
    // Calculate token count for error messages (fallback if not available)
    let tokenCount = 0;
    try {
      // First try to extract token count from the error message itself
      const tokenMatch = error.message.match(/Requested (\d+)/);
      if (tokenMatch) {
        tokenCount = parseInt(tokenMatch[1], 10);
        // console.log(`🔍 [Error] Extracted token count from error message: ${tokenCount}`);
      } else {
        // Fallback: reconstruct the message that would have been sent to AI
        const { chatHistory, newValue, uploadedFiles } = req.body;
        let aiUserMessage = newValue || '';
        
        // Add uploaded file content if present
        if (uploadedFiles && uploadedFiles.length > 0) {
          const fileContent = uploadedFiles.map(file => 
            file.type === 'pdf' && file.transcript ? file.transcript : file.content || ''
          ).join('\n\n');
          if (fileContent) {
            aiUserMessage = `File content:\n${fileContent}\n\nUser query: ${aiUserMessage}`;
          }
        }
        
        tokenCount = estimateTokenCount(aiUserMessage);
        // console.log(`🔍 [Error] Calculated token count from reconstructed message: ${tokenCount}`);
      }
    } catch (tokenError) {
      console.warn('Could not calculate token count for error message:', tokenError);
    }
    
    // Check for specific error types
    if (error.message && error.message.includes('429')) {
      res.status(429).json({ 
        message: `Rate limit exceeded (${tokenCount} tokens sent). Please try again in a minute or use Personal AI for large documents.`,
        errorType: 'RATE_LIMIT',
        tokenCount: tokenCount
      });
    } else if (error.message && error.message.includes('Request too large')) {
      res.status(413).json({ 
        message: `Document too large for ChatGPT (${tokenCount} tokens sent). Please use Personal AI for large documents.`,
        errorType: 'TOO_LARGE',
        tokenCount: tokenCount
      });
    } else {
    res.status(500).json({ message: `Server error: ${error.message}` });
    }
  }
});

// Group Chat Persistence Endpoints

// Save group chat to Cloudant
app.post('/api/save-group-chat', async (req, res) => {
  try {
    const { chatHistory, uploadedFiles, currentUser, connectedKB } = req.body;
    
    
    // For deep link users, use displayName for better readability in chat history
    const chatDisplayName = req.body.displayName || currentUser || 'Public User';
    
    if (!chatHistory || chatHistory.length === 0) {
      return res.status(400).json({ message: 'No chat history to save' });
    }

    // console.log(`💾 Attempting to save group chat with ${chatHistory.length} messages`);

    // Files are already processed by frontend (base64 conversion done there)
    // For database storage, exclude large content to prevent document size limits
    const processedUploadedFiles = (uploadedFiles || []).map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt,
      // Exclude large content fields to prevent Cloudant document size limits
      // content and originalFile contain large data that shouldn't be stored in chat documents
    }));

    // Generate a secure, random share ID
    const generateShareId = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const shareId = generateShareId();
    
    const groupChatDoc = {
      _id: `group_chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'group_chat',
      shareId: shareId,
      currentUser: chatDisplayName,
      patientOwner: currentUser, // The patient who owns this chat (never changes)
      connectedKB: connectedKB || 'No KB connected',
      chatHistory,
      uploadedFiles: processedUploadedFiles,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participantCount: chatHistory.filter(msg => msg.role === 'user').length,
      messageCount: chatHistory.length,
      isShared: true
    };

    // Debug: Log what's being sent to the database
//     console.log(`🔍 [SAVE] Document being saved:`, {
//       _id: groupChatDoc._id,
//       type: groupChatDoc.type,
//       uploadedFilesCount: groupChatDoc.uploadedFiles.length,
//       firstFileStructure: groupChatDoc.uploadedFiles[0] ? {
//         name: groupChatDoc.uploadedFiles[0].name,
//         type: groupChatDoc.uploadedFiles[0].type,
//         hasOriginalFile: !!groupChatDoc.uploadedFiles[0].originalFile,
//         originalFileKeys: groupChatDoc.uploadedFiles[0].originalFile ? Object.keys(groupChatDoc.uploadedFiles[0].originalFile) : 'none'
//       } : 'no files'
//     });

    // Use Cloudant client
    const result = await couchDBClient.saveChat(groupChatDoc);
    
    // Reload chat cache since we added new chat data
    await reloadChatCache();
    
    res.json({ 
      success: true, 
      chatId: result.id,
      shareId: shareId,
      message: 'Group chat saved successfully' 
    });
  } catch (error) {
    console.error('❌ Save group chat error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: `Failed to save group chat: ${error.message}` });
  }
});

// Load group chat by ID
app.get('/api/load-group-chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Use Cloudant client
    const chat = await couchDBClient.getChat(chatId);
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // console.log(`📄 Loaded chat: ${chatId}`);
    
    // Debug: Log the uploadedFiles structure
    if (chat.uploadedFiles && chat.uploadedFiles.length > 0) {
      chat.uploadedFiles.forEach((file, index) => {
        // console.log(`🔍 [DB-LOAD] File ${index}: ${file.name} (${file.type})`);
        if (file.originalFile) {
          // console.log(`🔍 [DB-LOAD] OriginalFile keys: ${Object.keys(file.originalFile)}`);
          if (file.originalFile.base64) {
            // console.log(`🔍 [DB-LOAD] Base64 length: ${file.originalFile.base64.length} chars`);
          } else {
            // console.log(`🔍 [DB-LOAD] No base64 property found`);
          }
        } else {
          // console.log(`🔍 [DB-LOAD] No originalFile property`);
        }
      });
    }
    
    res.json({
      id: chat._id,
      currentUser: chat.currentUser,
      connectedKB: chat.connectedKB,
      chatHistory: chat.chatHistory,
      uploadedFiles: chat.uploadedFiles || [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      isShared: chat.isShared
    });
  } catch (error) {
    console.error('❌ Load group chat error:', error);
    res.status(500).json({ message: `Failed to load group chat: ${error.message}` });
  }
});

// Public shared chat route - anyone with the link can access
app.get('/shared/:shareId', sessionMiddleware.createDeepLinkSession, sessionMiddleware.checkInactivityWarning, (req, res) => {
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  res.render('index.ejs', {
    CLOUDANT_DASHBOARD_URL: cloudantUrl
  });
});

// API endpoint to create deep link session when user identifies themselves
app.post('/api/deep-link-session', async (req, res) => {
  try {
    const { shareId, userId, userName, userEmail } = req.body;
    const sessionId = req.sessionID;
    
//     console.log('🔗 [Deep Link Session] Request data:', {
//       shareId,
//       userId,
//       userName,
//       userEmail,
//       sessionId,
//       hasSession: !!req.session
//     });
    
    if (!shareId || !userId || !sessionId) {
//       console.log('❌ [Deep Link Session] Missing required fields:', {
//         shareId: !!shareId,
//         userId: !!userId,
//         sessionId: !!sessionId
//       });
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Update existing session or create new one with user information
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    
    const sessionDoc = {
      _id: `session_${sessionId}`,
      type: 'session',
      sessionType: 'deeplink',
      userId: userId,
      userName: userName,
      userEmail: userEmail,
      isActive: true,
      lastActivity: now.toISOString(),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      warningShown: false,
      warningShownAt: null,
      deepLinkId: shareId,
      ownedBy: 'unknown_user'
    };
    
//     console.log('🔗 [Deep Link Session] Creating session for identified user:', {
//       sessionId,
//       userId,
//       userName,
//       shareId
//     });
    
    // Session stored in memory only
    
    // Update the express-session with user information
    req.session.userId = userId;
    req.session.userName = userName;
    req.session.userEmail = userEmail;
    req.session.sessionType = 'deeplink';
    req.session.deepLinkId = shareId;
    
//     console.log('✅ [Deep Link Session] Session created successfully for user:', userName);
//     console.log('✅ [Deep Link Session] Express session updated with user info:', {
//       userId: req.session.userId,
//       userName: req.session.userName,
//       sessionType: req.session.sessionType
//     });
    
    res.json({ success: true, message: 'Session created successfully' });
    
  } catch (error) {
    console.error('❌ [Deep Link Session] Error creating session:', error);
    res.status(500).json({ message: `Failed to create session: ${error.message}` });
  }
});

// API endpoint to cleanup deep link session when user closes window
app.post('/api/deep-link-session/cleanup', async (req, res) => {
  try {
    // Handle both JSON body and raw JSON string from sendBeacon
    let shareId, action;
    if (typeof req.body === 'string') {
      const parsed = JSON.parse(req.body);
      shareId = parsed.shareId;
      action = parsed.action;
    } else {
      shareId = req.body.shareId;
      action = req.body.action;
    }
    
    const sessionId = req.sessionID;
    
    if (!shareId || !sessionId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
//     console.log('🔗 [Deep Link Cleanup] Cleaning up session:', {
//       sessionId,
//       shareId,
//       action
//     });
    
    // Session cleanup handled in memory only
//     console.log('✅ [Deep Link Cleanup] Session cleaned up from memory:', sessionId);
    
    res.json({ success: true, message: 'Session cleaned up successfully' });
    
  } catch (error) {
    console.error('❌ [Deep Link Cleanup] Error cleaning up session:', error);
    res.status(500).json({ message: `Failed to cleanup session: ${error.message}` });
  }
});

// API endpoint to load shared chat by share ID
app.get('/api/shared/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    
    // Use Cloudant client to find chat by share ID
    const chat = await couchDBClient.getChatByShareId(shareId);
    
    if (!chat) {
      return res.status(404).json({ message: 'Shared chat not found' });
    }
    
    // Debug: Check what we're returning from the database
    
    res.json({
      id: chat._id,
      shareId: chat.shareId,
      currentUser: chat.currentUser,
      connectedKB: chat.connectedKB,
      chatHistory: chat.chatHistory,
      uploadedFiles: chat.uploadedFiles || [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      isShared: chat.isShared
    });
  } catch (error) {
    console.error('❌ Load shared chat error:', error);
    res.status(500).json({ message: `Failed to load shared chat: ${error.message}` });
  }
});

// Get all chats (frontend handles filtering)
app.get('/api/group-chats', async (req, res) => {
  try {
    // Get all chats - frontend will handle filtering based on authentication
    let allChats = getCache('chats');
    if (!isCacheValid('chats')) {
      allChats = await couchDBClient.getAllChats();
      setCache('chats', null, allChats);
    }
    
    // Transform the response to match the frontend GroupChat interface
    // Exclude large file content to prevent response size issues
    const transformedChats = allChats.map(chat => ({
      id: chat._id, // Map _id to id for frontend
      shareId: chat.shareId,
      currentUser: chat.currentUser,
      connectedKB: chat.connectedKB,
      chatHistory: chat.chatHistory,
      uploadedFiles: (chat.uploadedFiles || []).map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        // Exclude large base64 content from list view
        // Full content will be loaded when individual chat is accessed
        content: file.type === 'pdf' ? '[PDF content excluded from list]' : file.content,
        originalFile: file.originalFile ? {
          name: file.originalFile.name,
          size: file.originalFile.size,
          type: file.originalFile.type,
          // Exclude base64 content
          base64: '[Base64 content excluded from list]'
        } : undefined,
        uploadedAt: file.uploadedAt
      })),
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      participantCount: chat.participantCount,
      messageCount: chat.messageCount,
      isShared: chat.isShared
    }));
    
//     console.log(`📋 Returning ${transformedChats.length} total chats to frontend (file content excluded)`);
    res.json(transformedChats);
  } catch (error) {
    console.error('❌ Get chats error:', error);
    res.status(500).json({ message: `Failed to get chats: ${error.message}` });
  }
});

    // Update existing group chat
app.put('/api/group-chats/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { chatHistory, uploadedFiles, currentUser, connectedKB } = req.body;
    
    
    // For deep link users, use displayName for better readability in chat history
    const chatDisplayName = req.body.displayName || currentUser || 'Public User';
    
    if (!chatHistory || chatHistory.length === 0) {
      return res.status(400).json({ message: 'No chat history to update' });
    }

//     console.log(`🔄 Attempting to update group chat: ${chatId}`);

    // Get the existing chat
    const existingChat = await couchDBClient.getChat(chatId);
    
    if (!existingChat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Files are already processed by frontend (base64 conversion done there)
    // For database storage, exclude large content to prevent document size limits
    const processedUploadedFiles = (uploadedFiles || []).map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt,
      // Exclude large content fields to prevent Cloudant document size limits
      // content and originalFile contain large data that shouldn't be stored in chat documents
    }));

    // Update the chat document
    // For existing chats, preserve the original currentUser (owner) and patientOwner, only update content
    const updatedChatDoc = {
      ...existingChat,
      // Don't change currentUser or patientOwner - preserve original ownership
      chatHistory,
      uploadedFiles: processedUploadedFiles,
      updatedAt: new Date().toISOString(),
      participantCount: chatHistory.filter(msg => msg.role === 'user').length,
      messageCount: chatHistory.length
    };

    // Save the updated chat
    const result = await couchDBClient.saveChat(updatedChatDoc);
    
    // Reload chat cache since we modified chat data
    await reloadChatCache();
    
    res.json({ 
      success: true, 
      chatId: result.id,
      shareId: existingChat.shareId,
      message: 'Group chat updated successfully' 
    });
  } catch (error) {
    console.error('❌ Update group chat error:', error);
    res.status(500).json({ message: `Failed to update group chat: ${error.message}` });
  }
});

// Cleanup endpoint - delete all chats except "Public User" (for debugging)
app.post('/api/cleanup-chats', async (req, res) => {
  try {
    // console.log('🧹 Starting chat cleanup via API...');
    
    // Get all chats
    const allChats = await couchDBClient.getAllChats();
//     console.log(`📊 Found ${allChats.length} total chats`);
    
    // Filter to keep only "Public User" chats
    const chatsToKeep = allChats.filter(chat => 
      chat.currentUser === 'Public User' || 
      (typeof chat.currentUser === 'object' && chat.currentUser.userId === 'Public User')
    );
    
    const chatsToDelete = allChats.filter(chat => 
      chat.currentUser !== 'Public User' && 
      !(typeof chat.currentUser === 'object' && chat.currentUser.userId === 'Public User')
    );
    
//     console.log(`✅ Keeping ${chatsToKeep.length} chats for "Public User"`);
//     console.log(`🗑️  Deleting ${chatsToDelete.length} other chats`);
    
    // Delete the other chats
    for (const chat of chatsToDelete) {
//       console.log(`🗑️  Deleting chat: ${chat._id} (user: ${JSON.stringify(chat.currentUser)})`);
      await couchDBClient.deleteChat(chat._id);
    }
    
//     console.log('✅ Chat cleanup completed successfully!');
//     console.log(`📊 Final state: ${chatsToKeep.length} chats for "Public User"`);
    
    res.json({ 
      success: true, 
      message: 'Chat cleanup completed',
      kept: chatsToKeep.length,
      deleted: chatsToDelete.length
    });
    
  } catch (error) {
    console.error('❌ Chat cleanup failed:', error);
    res.status(500).json({ message: `Chat cleanup failed: ${error.message}` });
  }
});

// Delete a group chat
app.delete('/api/group-chats/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Get the chat to verify ownership
    const chat = await couchDBClient.getChat(chatId);
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // For now, allow deletion. Later we'll add ownership verification
    await couchDBClient.deleteChat(chatId);
    
//     console.log(`🗑️ Deleted chat: ${chatId}`);
    
    // Reload chat cache since we deleted chat data
    await reloadChatCache();
    
    res.json({ success: true, message: 'Group chat deleted successfully' });
  } catch (error) {
    console.error('❌ Delete group chat error:', error);
    res.status(500).json({ message: `Failed to delete group chat: ${error.message}` });
  }
});

// Legacy CouchDB Chat Persistence Endpoints (disabled for Group Chat)

// Save chat to CouchDB
app.post('/api/save-chat', async (req, res) => {
  try {
    const { chatHistory, uploadedFiles, patientId = 'demo_patient_001' } = req.body;
    
    if (!chatHistory || chatHistory.length === 0) {
      return res.status(400).json({ message: 'No chat history to save' });
    }

    // console.log(`💾 Attempting to save chat with ${chatHistory.length} messages`);

    const chatDoc = {
      _id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      patientId,
      chatHistory,
      uploadedFiles: uploadedFiles || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participantCount: chatHistory.filter(msg => msg.role === 'user').length,
      messageCount: chatHistory.length
    };

    // Use Cloudant client
    const result = await couchDBClient.saveChat(chatDoc);
    // console.log(`💾 Chat saved to ${couchDBClient.getServiceInfo().isCloudant ? 'Cloudant' : 'CouchDB'}: ${result.id}`);
    
    res.json({ 
      success: true, 
      chatId: result.id,
      message: 'Chat saved successfully' 
    });
  } catch (error) {
    console.error('❌ Save chat error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: `Failed to save chat: ${error.message}` });
  }
});

// Load saved chats for a patient
app.get('/api/load-chats/:patientId?', async (req, res) => {
  try {
    const patientId = req.params.patientId || 'demo_patient_001';
    
    // Use Cloudant client
    const allChats = await couchDBClient.getAllChats();
    const chats = allChats
      .filter(chat => chat.patientId === patientId)
      .map(chat => ({
        id: chat._id,
        patientId: chat.patientId,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        participantCount: chat.participantCount,
        messageCount: chat.messageCount,
        chatHistory: chat.chatHistory,
        uploadedFiles: chat.uploadedFiles || []
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

//     console.log(`📋 Loaded ${chats.length} chats for patient ${patientId}`);
    res.json(chats);
  } catch (error) {
    console.error('❌ Load chats error:', error);
    res.status(500).json({ message: `Failed to load chats: ${error.message}` });
  }
});

// Load a specific chat by ID
app.get('/api/load-chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Use Cloudant client
    const chat = await couchDBClient.getChat(chatId);
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // console.log(`📄 Loaded chat: ${chatId}`);
    res.json({
      id: chat._id,
      patientId: chat.patientId,
      chatHistory: chat.chatHistory,
      uploadedFiles: chat.uploadedFiles || [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    });
  } catch (error) {
    console.error('❌ Load chat error:', error);
    res.status(500).json({ message: `Failed to load chat: ${error.message}` });
  }
});

// Delete a chat
app.delete('/api/delete-chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Use Cloudant client
    await couchDBClient.deleteChat(chatId);
    
//     console.log(`🗑️  Deleted chat: ${chatId}`);
    res.json({ success: true, message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('❌ Delete chat error:', error);
    res.status(500).json({ message: `Failed to delete chat: ${error.message}` });
  }
});

// Clean up chats with missing name properties (for data format upgrades)
app.delete('/api/cleanup-invalid-chats', async (req, res) => {
  try {
    // console.log('🧹 Starting cleanup of chats with missing name properties...');
    
    // Get all chats
    const allChats = await couchDBClient.getAllChats();
//     console.log(`📊 Found ${allChats.length} total chats to analyze`);
    
    // Analyze chats for missing name properties
    const invalidChats = [];
    const validChats = [];
    
    for (const chat of allChats) {
      if (!chat.chatHistory || !Array.isArray(chat.chatHistory)) {
//         console.log(`⚠️  Chat ${chat._id} has invalid chatHistory structure`);
        invalidChats.push(chat);
        continue;
      }
      
      // Check if any user messages are missing the name property
      const hasInvalidMessages = chat.chatHistory.some(msg => 
        msg.role === 'user' && (!msg.name || typeof msg.name !== 'string')
      );
      
      if (hasInvalidMessages) {
//         console.log(`❌ Chat ${chat._id} has user messages missing name property`);
        invalidChats.push(chat);
      } else {
        validChats.push(chat);
      }
    }
    
//     console.log(`📋 Analysis complete:`);
//     console.log(`   ✅ Valid chats: ${validChats.length}`);
//     console.log(`   ❌ Invalid chats: ${invalidChats.length}`);
    
    // Delete only the invalid chats
    let deletedCount = 0;
    for (const chat of invalidChats) {
      try {
        await couchDBClient.deleteChat(chat._id);
        deletedCount++;
//         console.log(`🗑️  Deleted invalid chat: ${chat._id}`);
      } catch (error) {
        console.error(`❌ Failed to delete invalid chat ${chat._id}:`, error.message);
      }
    }
    
//     console.log(`✅ Cleanup completed successfully`);
    res.json({ 
      success: true, 
      message: `Cleanup completed: ${deletedCount} invalid chats removed`,
      deletedCount,
      totalInvalid: invalidChats.length,
      totalValid: validChats.length,
      totalAnalyzed: allChats.length,
      details: {
        validChats: validChats.length,
        invalidChats: invalidChats.length,
        deletedChats: deletedCount
      }
    });
  } catch (error) {
    console.error('❌ Cleanup invalid chats error:', error);
    res.status(500).json({ message: `Failed to cleanup invalid chats: ${error.message}` });
  }
});

// DigitalOcean API endpoints
const DIGITALOCEAN_API_KEY = process.env.DIGITALOCEAN_TOKEN;
const DIGITALOCEAN_BASE_URL = 'https://api.digitalocean.com';

// Helper function for DigitalOcean API requests
const doRequest = async (endpoint, options = {}) => {
  if (!DIGITALOCEAN_API_KEY) {
    throw new Error('DigitalOcean API key not configured');
  }

  const url = `${DIGITALOCEAN_BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${DIGITALOCEAN_API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  const config = {
    headers,
    ...options
  };

  // Log the request details for debugging agent creation
  if (options.method === 'POST' && endpoint.includes('/agents')) {
//     console.log('🌐 DIGITALOCEAN API REQUEST DETAILS:');
    // console.log('=====================================');
    // console.log(`URL: ${url}`);
    // console.log(`Method: ${config.method || 'GET'}`);
    // console.log(`Headers: ${JSON.stringify(headers, null, 2)}`);
    // console.log(`Body: ${options.body}`);
    // console.log('=====================================');
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ DigitalOcean API Error Response:`);
    console.error(`Status: ${response.status}`);
    console.error(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);
    console.error(`Body: ${errorText}`);
    throw new Error(`DigitalOcean API error: ${response.status} - ${errorText}`);
  }

  return response.json();
};

// Cache for agent API keys to avoid repeated API calls
const agentApiKeyCache = new Map();

// Agent-specific API keys (created via DigitalOcean API)
// Note: This object is used as a runtime cache. Hardcoded keys are no longer needed
// as all API keys are now stored in the database and loaded dynamically.
const agentApiKeys = {};

// Helper function to get agent-specific API key
const getAgentApiKey = async (agentId) => {
  // Declare agentName at function scope so it's available in error handling
  let agentName = agentId; // fallback to ID
  
  // Check if we have a cached key for this agent
  if (agentApiKeys[agentId]) {
    // Try to get agent name from cached users for better logging
    try {
      const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
      let userList;
      if (allUsers.rows) {
        userList = allUsers.rows.map(row => row.doc);
      } else if (Array.isArray(allUsers)) {
        userList = allUsers;
      } else {
        userList = Object.values(allUsers);
      }
      const userWithAgent = userList.find(user => user.assignedAgentId === agentId);
      if (userWithAgent && userWithAgent.assignedAgentName) {
        agentName = userWithAgent.assignedAgentName;
      }
    } catch (error) {
      // If we can't get the name, just use the ID
    }
    console.log(`🔑 Using cached API key for agent: ${agentName}`);
    return agentApiKeys[agentId];
  }

  // Check if we have the API key stored in the database
  try {
    // Find user with this agent assigned
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    
    // Handle different response structures from getAllDocuments
    let userList;
    if (allUsers.rows) {
      // Standard CouchDB response with rows
      userList = allUsers.rows.map(row => row.doc);
    } else if (Array.isArray(allUsers)) {
      // Direct array response
      userList = allUsers;
    } else {
      // Object with numeric keys (array-like)
      userList = Object.values(allUsers);
    }
    
    const userWithAgent = userList.find(user => user.assignedAgentId === agentId);
    
    // Update agentName if we found the user
    if (userWithAgent) {
      agentName = userWithAgent.assignedAgentName || userWithAgent._id || 'Unknown';
    }
    // Agent API key lookup
    
    if (userWithAgent && userWithAgent.agentApiKey) {
      console.log(`🔑 Using database-stored API key for agent: ${agentName} (user: ${userWithAgent._id || userWithAgent.userId})`);
      
      // Validate the stored API key by making a test request to the agent
      try {
        // Test the API key by making a simple request to the agent's health endpoint
        const agentInfo = await doRequest(`/v2/gen-ai/agents/${agentId}`);
        if (agentInfo && agentInfo.uuid) {
          console.log(`🔑 ✅ Stored API key for agent ${agentId} is valid`);
        }
      } catch (validationError) {
        console.warn(`🔑 ⚠️ Stored API key for agent ${agentId} (user: ${userWithAgent.userId}) appears invalid - creating new key`);
        // Create a new API key instead of throwing an error
        try {
          const newApiKeyResponse = await doRequest(`/v2/gen-ai/agents/${agentId}/api_keys`, {
            method: 'POST',
            body: JSON.stringify({
              name: `${userWithAgent.userId}-agent-${Date.now()}-api-key`
            })
          });
          
          const newApiKeyData = newApiKeyResponse.api_key || newApiKeyResponse.api_key_info || newApiKeyResponse.data || newApiKeyResponse;
          const newApiKey = newApiKeyData.key || newApiKeyData.secret_key;
          
          if (newApiKey) {
            console.log(`🔑 ✅ New API key created: ${newApiKey.substring(0, 10)}...`);
            
            // Update database with new API key
            const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userWithAgent.userId);
            if (userDoc) {
              userDoc.agentApiKey = newApiKey;
              await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
              agentApiKeys[agentId] = newApiKey;
              console.log(`🔑 ✅ New API key saved to database for agent ${agentId}`);
              return newApiKey;
            }
          } else {
            console.error(`🔑 ❌ Failed to extract new API key from response:`, newApiKeyResponse);
            throw new Error(`Failed to create new API key for agent ${agentId}`);
          }
        } catch (createError) {
          console.error(`🔑 ❌ Failed to create new API key for agent ${agentId}:`, createError.message);
          throw new Error(`Failed to create new API key for agent ${agentId}: ${createError.message}`);
        }
      }
      
      // TEMPORARY FIX: Create new API key for sat272 agent (old key is invalid)
      if (agentId === '43c7473e-9bdd-11f0-b074-4e013e2ddde4') {
        console.log(`🔑 [TEMPORARY FIX] Creating new API key for agent ${agentId} (old key invalid)`);
        try {
          // Create a new API key
          const newApiKeyResponse = await doRequest(`/v2/gen-ai/agents/${agentId}/api_keys`, {
            method: 'POST',
            body: JSON.stringify({
              name: `sat272-agent-27092025-api-key-${Date.now()}`
            })
          });
          
          // API key created
          
          // Extract the new API key
          const newApiKeyData = newApiKeyResponse.api_key || newApiKeyResponse.api_key_info || newApiKeyResponse.data || newApiKeyResponse;
          const newApiKey = newApiKeyData.key || newApiKeyData.secret_key;
          
          if (newApiKey) {
            console.log(`🔑 [TEMPORARY FIX] ✅ New API key created: ${newApiKey.substring(0, 10)}...`);
            
            // Update database with new API key
            const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'sat272');
            if (userDoc) {
              userDoc.agentApiKey = newApiKey;
              await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
              agentApiKeys[agentId] = newApiKey;
              console.log(`🔑 [TEMPORARY FIX] ✅ New API key saved to database for agent ${agentId}`);
              return newApiKey;
            }
          } else {
            console.error(`🔑 [TEMPORARY FIX] ❌ Failed to extract new API key from response:`, newApiKeyResponse);
          }
        } catch (fixError) {
          console.error(`🔑 [TEMPORARY FIX] ❌ Failed to create new API key:`, fixError.message);
        }
      }
      
      // Also cache it in memory for faster access
      agentApiKeys[agentId] = userWithAgent.agentApiKey;
      return userWithAgent.agentApiKey;
    }
  } catch (dbError) {
    console.warn(`🔑 Could not check database for API key of agent ${agentId}:`, dbError.message);
  }

  // Only allow fallback to global API key for public agent
  const isPublicAgent = agentId === '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4'; // public-agent-05102025
  
  if (isPublicAgent) {
    console.log(`🔑 No agent-specific key found for public agent ${agentId}, using global key`);
    return process.env.DIGITALOCEAN_PERSONAL_API_KEY;
  } else {
    console.error(`🔑 ❌ No valid API key found for agent ${agentName || agentId} - this should not happen for non-public agents`);
    throw new Error(`No valid API key available for agent ${agentId}`);
  }
};

// Helper function to check if an agent is available to Public User
const isAgentAvailableToPublicUser = async (agentId) => {
  try {
    // console.log(`🔍 [isAgentAvailableToPublicUser] Checking agent availability for: ${agentId}`);
    
    // Get all authenticated users (exclude both Public User and Unknown User)
    const usersResponse = await couchDBClient.findDocuments('maia_users', {
      selector: {
        _id: { $nin: ['Public User', 'Unknown User'] },
        credentialID: { $exists: true } // Only users with passkeys (authenticated users)
      }
    });
    
    // console.log(`🔍 [isAgentAvailableToPublicUser] Found ${usersResponse.docs.length} authenticated users`);
    
    const ownedAgentIds = new Set();
    usersResponse.docs.forEach(user => {
      // console.log(`🔍 [isAgentAvailableToPublicUser] Checking user: ${user._id}`);
      if (user.ownedAgents) {
        user.ownedAgents.forEach(agent => {
          if (typeof agent === 'string') {
            // Legacy format - just UUID
            ownedAgentIds.add(agent);
            // console.log(`🔍 [isAgentAvailableToPublicUser] Added owned agent (legacy): ${agent}`);
          } else if (agent.id) {
            // New format - object with id and name
            ownedAgentIds.add(agent.id);
            // console.log(`🔍 [isAgentAvailableToPublicUser] Added owned agent (new): ${agent.id}`);
          }
        });
      }
      
      // Also check for assignedAgentId (admin system)
      if (user.assignedAgentId) {
        ownedAgentIds.add(user.assignedAgentId);
        // console.log(`🔍 [isAgentAvailableToPublicUser] Added assigned agent: ${user.assignedAgentId}`);
      }
    });
    
//     console.log(`🔍 [isAgentAvailableToPublicUser] All owned agent IDs:`, Array.from(ownedAgentIds));
    
    // Check if agent is owned by pattern matching (e.g., "fri951-agent-*" belongs to user "fri951")
    const agents = await doRequest('/v2/gen-ai/agents');
    const agentArray = agents.agents || [];
    const selectedAgent = agentArray.find(agent => agent.uuid === agentId);
    
    // console.log(`🔍 [isAgentAvailableToPublicUser] Selected agent:`, selectedAgent ? selectedAgent.name : 'Not found');
    
    if (selectedAgent) {
      const agentNamePattern = /^([a-z0-9]+)-agent-/;
      const nameMatch = selectedAgent.name.match(agentNamePattern);
      // console.log(`🔍 [isAgentAvailableToPublicUser] Agent name pattern match:`, nameMatch);
      
      if (nameMatch) {
        const potentialOwner = nameMatch[1];
        const ownerExists = usersResponse.docs.some(user => user._id === potentialOwner);
        // console.log(`🔍 [isAgentAvailableToPublicUser] Potential owner: ${potentialOwner}, exists: ${ownerExists}`);
        
        if (ownerExists) {
          // console.log(`🔍 [isAgentAvailableToPublicUser] Agent ${selectedAgent.name} is owned by pattern match: ${potentialOwner}`);
          return false; // Not available to Public User
        }
      }
    }
    
    // Agent is available to Public User if it's not owned by any authenticated user
    const isAvailable = !ownedAgentIds.has(agentId);
    // console.log(`🔍 [isAgentAvailableToPublicUser] Agent ${agentId} available to Public User: ${isAvailable}`);
    return isAvailable;
  } catch (error) {
    console.warn('Failed to check agent availability for Public User:', error.message);
    // If we can't check, assume it's available (fallback to current behavior)
    return true;
  }
};

// List agents
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await doRequest('/v2/gen-ai/agents');
//     console.log(`🤖 Listed ${agents.agents?.length || 0} agents`);
    
    // Transform agents to match frontend expectations and include knowledge bases
    // Note: The /v2/gen-ai/agents endpoint doesn't include knowledge base details
    // We need to fetch each agent individually to get knowledge base information
    // DO API agents and KBs state loaded
    
    const allAgents = await Promise.all((agents.agents || []).map(async (agent) => {
      // Debug: Log the raw agent data from DigitalOcean API
//       console.log(`🔍 [DEBUG] Raw agent data from DigitalOcean API:`, {
//         id: agent.uuid,
//         name: agent.name,
//         knowledge_bases: agent.knowledge_bases
//       });
      
      // Fetch detailed agent data including knowledge bases
      let connectedKnowledgeBases = [];
      try {
        const agentDetails = await doRequest(`/v2/gen-ai/agents/${agent.uuid}`);
        const agentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
        
        if (agentData.knowledge_bases && agentData.knowledge_bases.length > 0) {
          connectedKnowledgeBases = agentData.knowledge_bases;
          // console.log(`🔍 [DEBUG] Found ${connectedKnowledgeBases.length} knowledge bases for agent ${agent.name}`);
        } else {
          // console.log(`🔍 [DEBUG] No knowledge bases found for agent ${agent.name}`);
        }
      } catch (error) {
//         console.log(`🔍 [DEBUG] Error fetching knowledge bases for agent ${agent.name}:`, error.message);
        connectedKnowledgeBases = [];
      }

      return {
      id: agent.uuid,
      name: agent.name,
      description: agent.instruction || '',
      model: agent.model?.name || 'Unknown',
      status: agent.deployment?.status?.toLowerCase().replace('status_', '') || 'unknown',
      instructions: agent.instruction || '',
      uuid: agent.uuid,
      deployment: agent.deployment,
        knowledgeBase: connectedKnowledgeBases[0], // Keep first KB for backward compatibility
        knowledgeBases: connectedKnowledgeBases, // Add all connected KBs
      created_at: agent.created_at,
      updated_at: agent.updated_at
      };
    }));
    
    // DEBUG: Log each agent with its KBs
    allAgents.forEach(agent => {
      const agentName = (agent.name || 'Unknown').padEnd(28);
      const agentId = (agent.id || 'Unknown').padEnd(15);
      const kbCount = (agent.knowledgeBases?.length || 0).toString().padEnd(9);
      const kbNames = agent.knowledgeBases?.slice(0, 2).map(kb => kb.name).join(', ') || 'None';
      const kbNamesTruncated = kbNames.length > 25 ? kbNames.substring(0, 22) + '...' : kbNames.padEnd(25);
      // Agent data processed
    });
    
    // Filter agents based on user ownership
    const currentUser = req.query.user || req.session?.userId || 'Public User';
    let filteredAgents = allAgents;
    
    // console.log(`🔍 [DEBUG] Filtering agents for user: ${currentUser}`);
    // console.log(`🔍 [DEBUG] Total agents available: ${allAgents.length}`);
    
    // Special case: if user=admin, return all agents without filtering
    if (currentUser === 'admin') {
      // console.log(`🔍 [DEBUG] Admin user - returning all agents without filtering`);
      filteredAgents = allAgents;
    } else {
    
    if (currentUser === 'Public User') {
      // Public User should only see agents not owned by authenticated users
      // Agents without owners effectively belong to Public User
      try {
        // console.log(`🔍 [DEBUG] Getting all authenticated users and their owned agents...`);
        // Get all authenticated users (exclude both Public User and Unknown User)
        const usersResponse = await couchDBClient.findDocuments('maia_users', {
          selector: {
            _id: { $nin: ['Public User', 'Unknown User'] },
            credentialID: { $exists: true } // Only users with passkeys (authenticated users)
          }
        });
        
        // console.log(`🔍 [DEBUG] Found ${usersResponse.docs.length} authenticated users with ownedAgents`);
//         console.log(`🔍 [DEBUG] Users found:`, usersResponse.docs.map(u => u._id));
        
        const ownedAgentIds = new Set();
        usersResponse.docs.forEach(user => {
//           console.log(`🔍 [DEBUG] User ${user._id} has ownedAgents:`, user.ownedAgents);
          if (user.ownedAgents) {
            user.ownedAgents.forEach(agent => {
              if (typeof agent === 'string') {
                // Legacy format - just UUID
                // console.log(`🔍 [DEBUG] Legacy format agent: ${agent}`);
                ownedAgentIds.add(agent);
              } else if (agent.id) {
                // New format - object with id and name
                // console.log(`🔍 [DEBUG] New format agent: ${agent.name} (${agent.id})`);
                ownedAgentIds.add(agent.id);
              }
            });
          }
          
          // Also check for assignedAgentId (admin system)
          if (user.assignedAgentId) {
            // console.log(`🔍 [DEBUG] User ${user._id} has assignedAgentId: ${user.assignedAgentId}`);
            ownedAgentIds.add(user.assignedAgentId);
          }
        });
        
//         console.log(`🔍 [DEBUG] All owned agent IDs:`, Array.from(ownedAgentIds));
        
        // Filter out agents owned by authenticated users
        // Public User gets all unowned agents
        filteredAgents = allAgents.filter(agent => {
          const isOwned = ownedAgentIds.has(agent.uuid);
          
          // Additional check: if agent name follows user pattern (e.g., "fri951-agent-*"), 
          // check if it should be owned by a specific user
          const agentNamePattern = /^([a-z0-9]+)-agent-/;
          const nameMatch = agent.name.match(agentNamePattern);
          if (nameMatch && !isOwned) {
            const potentialOwner = nameMatch[1];
            // Check if this user exists and should own this agent
            const ownerExists = usersResponse.docs.some(user => user._id === potentialOwner);
            if (ownerExists) {
              // console.log(`🔍 [DEBUG] Agent ${agent.name} (${agent.uuid}) - owned by pattern match: ${potentialOwner}`);
              return false; // Don't show to Public User
            }
          }
          
          // console.log(`🔍 [DEBUG] Agent ${agent.name} (${agent.uuid}) - owned: ${isOwned}`);
          return !isOwned;
        });
        
        console.log(`[*] Available agents for Unknown User: ${filteredAgents.length} (unowned agents, filtered out ${allAgents.length - filteredAgents.length} owned by authenticated users)`);
      } catch (error) {
        console.warn('Failed to filter agents for Unknown User, showing all:', error.message);
        // If filtering fails, show all agents (fallback to current behavior)
      }
    } else {
      // Authenticated user should only see their own agents
      try {
        // console.log(`🔍 [DEBUG] Getting owned agents for authenticated user: ${currentUser}`);
        const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', currentUser);
//         console.log(`🔍 [DEBUG] User document:`, userDoc);
        
        const ownedAgentIds = new Set();
        
        // Check ownedAgents array (new system)
        if (userDoc && userDoc.ownedAgents && userDoc.ownedAgents.length > 0) {
          userDoc.ownedAgents.forEach(agent => {
            if (typeof agent === 'string') {
              // Legacy format - just UUID
              // console.log(`🔍 [DEBUG] Legacy format agent: ${agent}`);
              ownedAgentIds.add(agent);
            } else if (agent.id) {
              // New format - object with id and name
              // console.log(`🔍 [DEBUG] New format agent: ${agent.name} (${agent.id})`);
              ownedAgentIds.add(agent.id);
            }
          });
        }
        
        // Check assignedAgentId (admin system)
        if (userDoc && userDoc.assignedAgentId) {
          // console.log(`🔍 [DEBUG] User has assignedAgentId: ${userDoc.assignedAgentId}`);
          ownedAgentIds.add(userDoc.assignedAgentId);
        }
        
//         console.log(`🔍 [DEBUG] User's owned agent IDs:`, Array.from(ownedAgentIds));
        
        // Check for pattern-based ownership (e.g., "fri951-agent-*" belongs to user "fri951")
        const agentNamePattern = new RegExp(`^${currentUser}-agent-`);
        const patternBasedAgents = allAgents.filter(agent => agentNamePattern.test(agent.name));
        
        if (patternBasedAgents.length > 0) {
//           console.log(`🔍 [DEBUG] Found ${patternBasedAgents.length} pattern-based agents for ${currentUser}:`, patternBasedAgents.map(a => a.name));
          patternBasedAgents.forEach(agent => {
            ownedAgentIds.add(agent.uuid);
          });
        }
        
        if (ownedAgentIds.size > 0) {
          filteredAgents = allAgents.filter(agent => {
            const isOwned = ownedAgentIds.has(agent.uuid);
            // console.log(`🔍 [DEBUG] Agent ${agent.name} (${agent.uuid}) - owned by user: ${isOwned}`);
            return isOwned;
          });
          
          console.log(`[*] Available agents for ${currentUser}: ${filteredAgents.length} (owned by user)`);
        } else {
          // User has no owned agents, show empty list
          filteredAgents = [];
          console.log(`[*] Available agents for ${currentUser}: 0 (no owned agents - agents must be assigned by admin)`);
        }
      } catch (error) {
        console.warn(`Failed to get owned agents for ${currentUser}, showing empty list:`, error.message);
        filteredAgents = [];
      }
    }
    }
    
    res.json(filteredAgents);
  } catch (error) {
    console.error('❌ List agents error:', error);
    res.status(500).json({ message: `Failed to list agents: ${error.message}` });
  }
});

// Get specific agent by ID
app.get('/api/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Get agent details from DigitalOcean API
    const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
    
    if (!agentData) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Extract knowledge base information
    let connectedKnowledgeBases = [];
    if (agentData.knowledge_bases && agentData.knowledge_bases.length > 0) {
      connectedKnowledgeBases = agentData.knowledge_bases;
    }
    
    // Transform agent data for frontend
    const transformedAgent = {
      id: agentData.uuid,
      name: agentData.name,
      description: agentData.instruction || '',
      model: agentData.model?.name || 'Unknown',
      status: agentData.deployment?.status?.toLowerCase().replace('status_', '') || 'unknown',
      instructions: agentData.instruction || '',
      uuid: agentData.uuid,
      deployment: agentData.deployment,
      knowledgeBase: connectedKnowledgeBases[0], // Keep first KB for backward compatibility
      knowledgeBases: connectedKnowledgeBases, // Add all connected KBs
      created_at: agentData.created_at,
      updated_at: agentData.updated_at
    };
    
    res.json(transformedAgent);
  } catch (error) {
    console.error('❌ Get agent error:', error);
    res.status(500).json({ message: `Failed to get agent: ${error.message}` });
  }
});

// Assign agent to user
app.post('/api/agents/:agentId/assign', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    // Get or create user document
    let userDoc;
    try {
      userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    } catch (error) {
      if (error.statusCode === 404) {
        // Create new user document
        userDoc = {
          _id: userId,
          ownedAgents: [],
          createdAt: new Date().toISOString()
        };
      } else {
        throw error;
      }
    }
    
    // Initialize ownedAgents array if it doesn't exist
    if (!userDoc.ownedAgents) {
      userDoc.ownedAgents = [];
    }
    
    // Get agent details to include both ID and name
    const agents = await doRequest('/v2/gen-ai/agents');
    const agentArray = agents.agents || [];
    const selectedAgent = agentArray.find(agent => agent.uuid === agentId);
    
    if (!selectedAgent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Check if agent is already assigned (by UUID)
    const isAlreadyAssigned = userDoc.ownedAgents.some(agent => agent.id === agentId);
    
    if (!isAlreadyAssigned) {
      // Add agent with both ID and name
      const agentInfo = {
        id: selectedAgent.uuid,
        name: selectedAgent.name,
        assignedAt: new Date().toISOString()
      };
      userDoc.ownedAgents.push(agentInfo);
      userDoc.updatedAt = new Date().toISOString();
      
      // Save updated user document
      await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
      
      console.log(`[*] Assigned agent ${selectedAgent.name} (${agentId}) to user ${userId}`);
      res.json({ 
        success: true, 
        message: `Agent ${selectedAgent.name} assigned to user ${userId}`,
        ownedAgents: userDoc.ownedAgents
      });
    } else {
      res.json({ 
        success: true, 
        message: `Agent ${selectedAgent.name} already assigned to user ${userId}`,
        ownedAgents: userDoc.ownedAgents
      });
    }
  } catch (error) {
    console.error('❌ Assign agent error:', error);
    res.status(500).json({ message: `Failed to assign agent: ${error.message}` });
  }
});

// Unassign agent from user
app.delete('/api/agents/:agentId/assign', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    // Get user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    
    // Check if agent is assigned (by UUID)
    const agentIndex = userDoc.ownedAgents.findIndex(agent => agent.id === agentId);
    
    if (agentIndex !== -1) {
      const agentName = userDoc.ownedAgents[agentIndex].name;
      // Remove agent from user's owned agents
      userDoc.ownedAgents.splice(agentIndex, 1);
      userDoc.updatedAt = new Date().toISOString();
      
      // Save updated user document
      await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
      
      console.log(`[*] Unassigned agent ${agentName} (${agentId}) from user ${userId}`);
      res.json({ 
        success: true, 
        message: `Agent ${agentName} unassigned from user ${userId}`,
        ownedAgents: userDoc.ownedAgents
      });
    } else {
      res.json({ 
        success: true, 
        message: `Agent was not assigned to user ${userId}`,
        ownedAgents: userDoc.ownedAgents || []
      });
    }
  } catch (error) {
    console.error('❌ Unassign agent error:', error);
    res.status(500).json({ message: `Failed to unassign agent: ${error.message}` });
  }
});

// Test route to check if API routes are working
app.get('/api/test', (req, res) => {
//   console.log('🔍 /api/test route hit');
  res.json({ message: 'API routes are working' });
});

// Get current agent
// Get Agent Management Template for a user
app.get('/api/users/:userId/agent-template', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Always rebuild template to ensure fresh data
    console.log(`[TEMPLATE] Rebuilding fresh template for ${userId}`);
    const template = await buildAgentManagementTemplate(userId);
    
    if (!template) {
      return res.status(404).json({ error: 'User not found or template build failed' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('[TEMPLATE] Error fetching template:', error);
    res.status(500).json({ error: 'Failed to get agent template' });
  }
});

app.get('/api/current-agent', async (req, res) => {
  // Determine the base URL dynamically from the request
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
  const baseUrl = `${protocol}://${host}`;
  
  try {
    // Get current user from auth cookie first, then fallback to session
    let currentUser = 'Public User';
    
    // Check for authentication cookie first
    const authCookie = req.cookies.maia_auth;
    if (authCookie) {
      try {
        const authData = JSON.parse(authCookie);
        
        // Check if cookie is still valid (less than 10 minutes old)
        const now = new Date();
        const expiresAt = new Date(authData.expiresAt);
        const timeToExpiry = Math.round((expiresAt - now) / 1000 / 60); // minutes
        
        
        if (now < expiresAt) {
          currentUser = authData.userId;
        } else {
          res.clearCookie('maia_auth');
        }
      } catch (error) {
        console.error(`❌ Invalid cookie format - clearing:`, error.message);
        res.clearCookie('maia_auth');
      }
    } else {
    }
    
    // Fallback to session-based auth if no valid cookie
    if (currentUser === 'Public User' && req.session && req.session.userId) {
      currentUser = req.session.userId;
    } else if (currentUser === 'Public User') {
    }
    
    // For authenticated users, check if they have an assigned agent
    let agentId = null;
    
    
    
    if (currentUser !== 'Public User') {
      // Handle deep link users - they should use the agent assigned to the patient whose data is being shared
      if (currentUser.startsWith('deep_link_')) {
//         console.log(`🔗 [current-agent] Deep link user detected: ${currentUser}, finding patient's agent`);
        // console.log(`🔗 [DEBUG] Step 1: Deep link user ID: ${currentUser}`);
        
        try {
          // Get the deep link user's session to find the shareId
          // console.log(`🔗 [DEBUG] Step 2: Looking up deep link user document in maia_users...`);
          let deepLinkUserDoc = getCache('users', currentUser);
          if (!isCacheValid('users', currentUser)) {
            deepLinkUserDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', currentUser);
            if (deepLinkUserDoc) {
              setCache('users', currentUser, deepLinkUserDoc);
            }
          }
//           console.log(`🔗 [DEBUG] Step 2 Result:`, deepLinkUserDoc ? {
//             userId: deepLinkUserDoc.userId,
//             shareId: deepLinkUserDoc.shareId,
//             displayName: deepLinkUserDoc.displayName
//           } : 'Document not found');
          
          if (deepLinkUserDoc && deepLinkUserDoc.shareId) {
//             console.log(`🔗 [current-agent] Found shareId for deep link user: ${deepLinkUserDoc.shareId}`);
            // console.log(`🔗 [DEBUG] Step 3: Looking for chat with shareId: ${deepLinkUserDoc.shareId}`);
            
            // Find the chat document with this shareId to get the patient
            let allChats = getCache('chats');
            if (!isCacheValid('chats')) {
              allChats = await couchDBClient.getAllChats();
              setCache('chats', null, allChats);
            }
            // console.log(`🔗 [DEBUG] Step 3a: Found ${allChats.length} total chats`);
            
            // Debug: Show all shareIds in chats
            const allShareIds = allChats.map(chat => chat.shareId).filter(Boolean);
//             console.log(`🔗 [DEBUG] Step 3a1: All shareIds in chats:`, allShareIds);
            // console.log(`🔗 [DEBUG] Step 3a2: Looking for shareId: ${deepLinkUserDoc.shareId}`);
            
            const sharedChat = allChats.find(chat => chat.shareId === deepLinkUserDoc.shareId);
//             console.log(`🔗 [DEBUG] Step 3b: Shared chat found:`, sharedChat ? {
//               chatId: sharedChat._id,
//               shareId: sharedChat.shareId,
//               currentUser: sharedChat.currentUser,
//               currentUserType: typeof sharedChat.currentUser
//             } : 'No chat found with matching shareId');
            
            if (sharedChat && sharedChat.currentUser) {
              const patientUser = typeof sharedChat.currentUser === 'string' 
                ? sharedChat.currentUser 
                : sharedChat.currentUser.userId || sharedChat.currentUser.displayName;
              
//               console.log(`🔗 [current-agent] Found patient for deep link: ${patientUser}`);
              // console.log(`🔗 [DEBUG] Step 4: Getting assigned agent for patient: ${patientUser}`);
              
              // Get the assigned agent for this patient
              const assignedAgentResponse = await fetch(`${baseUrl}/api/admin-management/users/${patientUser}/assigned-agent`);
              // console.log(`🔗 [DEBUG] Step 4a: Assigned agent response status: ${assignedAgentResponse.status}`);
              
              if (assignedAgentResponse.ok) {
                const assignedAgentData = await assignedAgentResponse.json();
//                 console.log(`🔗 [DEBUG] Step 4b: Assigned agent data:`, assignedAgentData);
                
                if (assignedAgentData.assignedAgentId) {
                  agentId = assignedAgentData.assignedAgentId;
//                   console.log(`🔗 [current-agent] Using patient's assigned agent: ${assignedAgentData.assignedAgentName} (${agentId})`);
                  // console.log(`🔗 [DEBUG] Step SUCCESS: Agent assignment completed successfully`);
                } else {
//                   console.log(`🔗 [current-agent] Patient ${patientUser} has no assigned agent`);
                  // console.log(`🔗 [DEBUG] Step 4c: Patient has no assigned agent - agent assignment failed`);
                }
              } else {
//                 console.log(`🔗 [current-agent] Failed to get assigned agent for patient ${patientUser}: ${assignedAgentResponse.status}`);
                // console.log(`🔗 [DEBUG] Step 4d: Failed to get assigned agent - HTTP ${assignedAgentResponse.status}`);
              }
            } else {
//               console.log(`🔗 [current-agent] No chat found for shareId: ${deepLinkUserDoc.shareId}`);
              // console.log(`🔗 [DEBUG] Step 3c: No chat found with shareId - agent assignment failed`);
            }
          } else {
//             console.log(`🔗 [current-agent] No shareId found for deep link user: ${currentUser}`);
            // console.log(`🔗 [DEBUG] Step 2c: No shareId in deep link user document - agent assignment failed`);
          }
    } catch (error) {
          console.warn(`🔗 [current-agent] Error finding patient's agent for deep link user:`, error.message);
//           console.log(`🔗 [DEBUG] Step ERROR: Exception occurred - agent assignment failed:`, error);
        }
        
        // If we couldn't find the patient's agent, fall back to Unknown User's agent
        if (!agentId) {
//           console.log(`🔗 [current-agent] Falling back to Unknown User's agent for deep link user`);
          // console.log(`🔗 [DEBUG] Step FALLBACK: No agent found, falling back to Unknown User's agent`);
          currentUser = 'Unknown User';
        }
      } else {
        // Regular authenticated user - check assigned agent
        try {
          // Checking assigned agent for user
          const assignedAgentResponse = await fetch(`${baseUrl}/api/admin-management/users/${currentUser}/assigned-agent`);
          if (assignedAgentResponse.ok) {
            const assignedAgentData = await assignedAgentResponse.json();
            if (assignedAgentData.assignedAgentId) {
              agentId = assignedAgentData.assignedAgentId;
//               console.log(`🔐 Using assigned agent for user ${currentUser}: ${assignedAgentData.assignedAgentName} (${agentId})`);
            } else {
              // No assigned agent for user
            }
          } else {
            // Failed to get assigned agent for user
          }
        } catch (error) {
          console.warn(`Failed to check assigned agent for user ${currentUser}:`, error.message);
        }
      }
    } else {
      // Using legacy agent lookup for unauthenticated user
    }
    
    // Get group chat count for current user
    let groupChatCount = 0;
    try {
      let allChats = getCache('chats');
      if (!isCacheValid('chats')) {
        allChats = await couchDBClient.getAllChats();
        setCache('chats', null, allChats);
      }
      // Get all chats for the current user
      const userChats = allChats.filter(chat => {
        if (typeof chat.currentUser === 'string') {
          return chat.currentUser === currentUser;
        } else if (typeof chat.currentUser === 'object' && chat.currentUser !== null) {
          return chat.currentUser.userId === currentUser || chat.currentUser.displayName === currentUser;
        }
        return false;
      });
      groupChatCount = userChats.length;
      

    } catch (error) {
      console.error('Error getting group chat count:', error);
    }
    
    // Use assigned agent ID if available, otherwise check for current agent selection
    if (!agentId) {
      if (currentUser !== 'Unknown User') {
        // For authenticated users: ALWAYS read fresh from database
        // This ensures we get the latest assignedAgentId after agent creation
        // No 429 risk - only one user at a time when Badge opens
        try {
          const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', currentUser);
          
            if (userDoc) {
            // Call bucket status function directly (not via HTTP)
            const bucketData = await getBucketStatusForUser(currentUser);
            
            const bucketStatus = {
              hasFolder: bucketData.hasFolder || false,
              fileCount: bucketData.fileCount || 0,
              totalSize: bucketData.totalSize || 0
            };
            
            // Update cache with fresh data including bucket status
            const userWithBucket = {
              ...userDoc,
              bucketStatus: bucketStatus
            };
            setCache('users', currentUser, userWithBucket);
            
            if (userDoc.assignedAgentId) {
              // Use assignedAgentId as the source of truth
            agentId = userDoc.assignedAgentId;
          } else {
              // No agent assigned yet
            return res.json({ 
              agent: null, 
              message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
                requiresAgentSelection: true
              });
            }
          } else {
            // User not found
            return res.json({ 
              agent: null, 
              message: 'User not found.',
              requiresAgentSelection: true
            });
          }
        } catch (userError) {
          console.warn(`Failed to get current agent selection for user ${currentUser}:`, userError.message);
          return res.json({ 
            agent: null, 
            message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
            requiresAgentSelection: true
          });
        }
      } else {
        // For Public User, check if they have a current agent selection stored in Cloudant
        try {
          // Always get fresh data from database for Public User to ensure validation
          const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'Public User');
          
          // Allow Public User to have agent selections (only public agents)
          if (userDoc && (userDoc.currentAgentId || userDoc.currentAgentName)) {
            // Validate that the selected agent is a public agent
            try {
              const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.currentAgentId}`);
              const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
              
              if (agentData && !agentData.name.startsWith('public-')) {
                // Clear invalid non-public agent selection
                console.log(`🔧 [current-agent] Clearing invalid non-public agent selection for Public User: ${agentData.name}`);
            userDoc.currentAgentId = null;
            userDoc.currentAgentName = null;
            userDoc.currentAgentEndpoint = null;
            userDoc.currentAgentSetAt = null;
            userDoc.updatedAt = new Date().toISOString();
            
            // Save the corrected document
            await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
              }
            } catch (error) {
              console.error(`❌ [current-agent] Error validating Public User agent selection:`, error);
              // On error, clear the selection to be safe
              userDoc.currentAgentId = null;
              userDoc.currentAgentName = null;
              userDoc.currentAgentEndpoint = null;
              userDoc.currentAgentSetAt = null;
              userDoc.updatedAt = new Date().toISOString();
              
              await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
            }
          }
          
          // Fix corrupted Public User assigned agent - should only be public agents
          if (userDoc && userDoc.assignedAgentId) {
            // Get the agent from DigitalOcean API to check its name
            try {
              const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.assignedAgentId}`);
              const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
              
              if (agentData && !agentData.name.startsWith('public-')) {
                console.log(`🔧 [current-agent] Fixing corrupted Public User agent assignment: ${agentData.name} -> null`);
                
                // Clear the corrupted assignment
                userDoc.assignedAgentId = null;
                userDoc.assignedAgentName = null;
                userDoc.agentAssignedAt = null;
                userDoc.updatedAt = new Date().toISOString();
                
                // Save the corrected document
                await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
                
                // Update cache
                setCache('users', 'Public User', userDoc);
                
                return res.json({ 
                  agent: null, 
                  message: 'Your previous agent assignment was invalid and has been cleared. Please choose a new agent via the Agent Management dialog.',
                  requiresAgentSelection: true
                });
              }
            } catch (agentError) {
              console.warn(`🔧 [current-agent] Could not validate Public User agent ${userDoc.assignedAgentId}:`, agentError.message);
            }
          }
          
          // Check for both currentAgentId and assignedAgentId (assignedAgentId is set by consistency fixes)
          const userAgentId = userDoc?.currentAgentId || userDoc?.assignedAgentId;
          
          if (userDoc && userAgentId) {
            // Check if the selected agent is still available to Public User (not owned by authenticated users)
            // console.log(`🔍 [DEBUG-current-agent] Validating agent availability for Public User: ${userAgentId}`);
            const isAgentAvailable = await isAgentAvailableToPublicUser(userAgentId);
            // console.log(`🔍 [DEBUG-current-agent] Agent ${userAgentId} available to Public User: ${isAgentAvailable}`);
            
            if (isAgentAvailable) {
              agentId = userAgentId;
              // console.log(`🔐 [current-agent] Using Public User's agent selection: ${userDoc.currentAgentName || userDoc.assignedAgentName} (${agentId})`);
            } else {
              // Agent is no longer available to Public User (now owned by authenticated user)
              // console.log(`🔍 [current-agent] Public User's selected agent ${userDoc.currentAgentName} is now owned by an authenticated user, clearing selection`);
              // Clear the invalid agent assignment (should not happen with assignedAgentId)
              const updatedUserDoc = {
                ...userDoc,
                assignedAgentId: null,
                assignedAgentName: null,
                agentAssignedAt: null,
                updatedAt: new Date().toISOString()
              };
              await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
              
              // Update cache to reflect the cleared assignment
              setCache('users', 'Public User', updatedUserDoc);
              
              return res.json({ 
                agent: null, 
                message: 'Your previous agent selection is no longer available. Please choose a new agent via the Agent Management dialog.',
                requiresAgentSelection: true
              });
            }
          } else {
            // Unknown User - no current agent selection available
            return res.json({ 
              agent: null, 
              message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
              requiresAgentSelection: true
            });
          }
        } catch (userError) {
          console.error(`❌ Failed to get Unknown User's current agent:`, userError);
          return res.json({ 
            agent: null, 
            message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
            requiresAgentSelection: true
          });
        }
      }
    }
    
    // Get agent details including associated knowledge bases
    let agentData;
    try {
      const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
      agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data || agentResponse;
    } catch (error) {
      console.error(`❌ Get current agent error:`, error);
      
      // If agent doesn't exist in DO API, log warning but don't automatically cleanup
      if (error.message.includes('404') || error.message.includes('not_found')) {
        console.warn(`⚠️ [AGENT WARNING] Agent ${agentId} not found in DO API for user ${currentUser} - manual cleanup required`);
        
        return res.json({ 
          agent: null, 
          message: 'Your previous agent is no longer available. Please choose a new agent via the Agent Management dialog.',
          requiresAgentSelection: true
        });
      }
      
      // For other errors, re-throw
      throw error;
    }
    
    // console.log(`📋 Agent details from API:`, JSON.stringify(agentData, null, 2));
    
    // Extract knowledge base information - SHOW ALL KBs ATTACHED TO AGENT (DigitalOcean API is source of truth)
    let connectedKnowledgeBases = [];
    let warning = null;
    
    if (agentData.knowledge_bases && agentData.knowledge_bases.length > 0) {
      // Agent Badge shows ALL KBs attached to the agent (no user filtering)
      connectedKnowledgeBases = agentData.knowledge_bases;
      
//       console.log(`📚 Agent Badge: Showing ${connectedKnowledgeBases.length} KBs attached to agent (DigitalOcean API source of truth)`);
      
      // Warning about multiple KBs (regardless of user permissions)
      if (connectedKnowledgeBases.length > 1) {
        warning = `⚠️ WARNING: This agent has ${connectedKnowledgeBases.length} knowledge bases attached. This can cause data contamination and hallucinations. Please ensure only one KB is attached.`;
      }
    } else {
//       console.log(`📚 No knowledge bases associated with agent`);
    }

    // Transform agent data for frontend
    const transformedAgent = {
      id: agentData.uuid,
      name: agentData.name,
      description: agentData.instruction || '',
      model: agentData.model?.name || 'Unknown',
      status: agentData.deployment?.status?.toLowerCase().replace('status_', '') || 'unknown',
      instructions: agentData.instruction || '',
      uuid: agentData.uuid,
      deployment: agentData.deployment,
      knowledgeBase: connectedKnowledgeBases[0], // Keep first KB for backward compatibility
      knowledgeBases: connectedKnowledgeBases, // Add all connected KBs
      // Backend session info removed - not essential for user experience
    };

    // Use the agent's deployment URL for the endpoint
    const endpoint = agentData.deployment?.url ? `${agentData.deployment.url}/api/v1` : null;
    

    


    // SECURITY CHECK: Validate agent ownership based on user type
    const agentName = agentData.name;
    
    if (currentUser === 'Public User') {
      // Public User can only see agents that start with 'public-'
      if (!agentName.startsWith('public-')) {
        console.error(`🚨 SECURITY VIOLATION: Public User assigned agent ${agentName} does not start with 'public-' - Admin intervention required`);
        
        return res.status(403).json({ 
          agent: null,
          message: 'Security violation detected: Public User can only access public agents. Please contact administrator.',
          requiresAgentSelection: true
        });
      }
    } else if (currentUser !== 'Unknown User' && !currentUser.startsWith('deep_link_')) {
      // Authenticated users can only see agents that match their user ID pattern
      const expectedPrefix = `${currentUser}-agent-`;
      
      if (!agentName.startsWith(expectedPrefix)) {
        console.error(`🚨 SECURITY VIOLATION: User ${currentUser} assigned agent ${agentName} does not match expected pattern ${expectedPrefix} - Admin intervention required`);
        
        return res.status(403).json({ 
          agent: null,
          message: 'Security violation detected: Agent assignment does not match user. Please contact administrator.',
          requiresAgentSelection: true
        });
      }
    }

    const response = { 
      agent: transformedAgent,
      endpoint: endpoint
    };
    
    if (warning) {
      response.warning = warning;
    }

        
        // DEBUG: Show complete agent data being sent to frontend
    // Agent data sent to frontend

    res.json(response);
  } catch (error) {
    console.error('❌ Get current agent error:', error);
    res.status(500).json({ message: `Failed to get current agent: ${error.message}` });
  }
});

// Attach knowledge base to agent (general route - must come before specific routes)
app.post('/api/agents/:agentId/knowledge-bases', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { knowledgeBaseId, action } = req.body;
    
    // Starting KB attachment process
    
    if (!knowledgeBaseId) {
      console.log(`[KB CREATE] ❌ Validation failed - knowledgeBaseId is required`);
      return res.status(400).json({ message: 'knowledgeBaseId is required' });
    }
    
    // Attaching knowledge base to agent
    
    // Use the DigitalOcean API to attach the knowledge base to the agent
    const result = await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${knowledgeBaseId}`, {
      method: 'POST'
    });
    
    // Wait a moment for the API to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the attachment by getting the agent details
    const agentDetails = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
    const attachedKBs = agentData.knowledge_bases || [];
    
    const isAttached = attachedKBs.some(kb => (kb.uuid || kb.id) === knowledgeBaseId);
    
    if (isAttached) {
      console.log(`✅ KB ${knowledgeBaseId} attached to agent ${agentId}`);
      res.json({
        success: true,
        message: 'Knowledge base attached successfully',
        result: { agent: agentData },
        verification: {
          attached: true,
          knowledgeBases: attachedKBs
        }
      });
    } else {
      console.log(`❌ KB ${knowledgeBaseId} failed to attach to agent ${agentId}`);
      res.json({
        success: false,
        message: 'Failed to attach knowledge base - verification failed',
        result: { agent: agentData },
        verification: {
          attached: false,
          knowledgeBases: attachedKBs
        }
      });
    }
  } catch (error) {
    console.error(`❌ Attach KB error:`, error.message);
    res.status(500).json({ message: `Failed to attach knowledge base: ${error.message}` });
  }
});

// Associate knowledge base with agent
app.post('/api/agents/:agentId/knowledge-bases/:kbId', async (req, res) => {
  try {
    const { agentId, kbId } = req.params;
    const currentUser = getCurrentUser(req);
    
//     console.log(`🔗 [DO API] Attempting to attach KB ${kbId} to agent ${agentId}`);


    // Check protection status using Cloudant directly (source of truth for security)
    let isProtected = false;
    let kbOwner = null;
    let kbDoc = null;
    
    try {
      // Query Cloudant directly for KB ownership and protection status
      kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
      

      
      if (kbDoc) {
        // Check if the knowledge base has owner information or is marked as protected
        if (kbDoc.owner || kbDoc.isProtected) {
          isProtected = true;
          kbOwner = kbDoc.owner || 'unknown';
          // console.log(`🔒 [SECURITY] KB ${kbId} is PROTECTED - owner: ${kbOwner}, isProtected: ${kbDoc.isProtected}`);
        } else {
          // console.log(`✅ [SECURITY] KB ${kbId} is UNPROTECTED - no owner restrictions`);
        }
      } else {
        // KB doesn't exist in Cloudant - create it with default unprotected status
        // console.log(`📝 [SYNC] KB ${kbId} not found in Cloudant - creating with default unprotected status`);
        
        try {
          // Get KB info from DigitalOcean using the same approach as the working endpoint
          const doResponse = await doRequest('/v2/gen-ai/knowledge_bases?page=1&per_page=1000');
          const doKBs = (doResponse.knowledge_bases || doResponse.data?.knowledge_bases || doResponse.data || []);
          const doKbInfo = doKBs.find(kb => kb.uuid === kbId || kb.id === kbId);
          
          if (doKbInfo) {
            const kbName = doKbInfo.name || doKbInfo.kb_name || kbId;
            
            // Create new KB document in Cloudant with default unprotected status
            const newKbDoc = {
              _id: kbId,
              kbName: kbName,
              uuid: kbId,
              created_at: new Date().toISOString(),
              isProtected: false, // Default to unprotected
              owner: null, // No owner by default
              source: 'digitalocean_sync'
            };
            
            await cacheManager.saveDocument(couchDBClient, "maia_knowledge_bases", newKbDoc);
            // console.log(`✅ [SYNC] Created KB document in Cloudant: ${kbName}`);
            
            // Update our local reference
            kbDoc = newKbDoc;
            isProtected = false;
            kbOwner = null;
          } else {
            // console.log(`⚠️ [SYNC] KB ${kbId} not found in DigitalOcean response`);
            // Fall back to treating as protected for safety
            isProtected = true;
            // console.log(`🔒 [SECURITY] Treating KB ${kbId} as PROTECTED due to not found in DO (fail-safe)`);
          }
          
        } catch (createError) {
//           console.log(`⚠️ [SYNC] Failed to create KB document in Cloudant:`, createError.message);
          // Fall back to treating as protected for safety
          isProtected = true;
          // console.log(`🔒 [SECURITY] Treating KB ${kbId} as PROTECTED due to sync failure (fail-safe)`);
        }
      }
    } catch (cloudantError) {
//       console.log(`❌ [SECURITY] Failed to check Cloudant KB protection status:`, cloudantError.message);
      // If we can't determine protection status, treat as protected for safety
      isProtected = true;
      // console.log(`🔒 [SECURITY] Treating KB ${kbId} as PROTECTED due to Cloudant check error (fail-safe)`);
    }

    // If the KB is protected, require authentication and ownership verification
    if (isProtected) {
      if (!currentUser) {
        // console.log(`🚨 [SECURITY] Protected KB requires authentication - blocking unauthenticated access`);
        return res.status(401).json({ 
          error: 'Authentication required for protected knowledge base',
          details: 'This knowledge base has owner restrictions'
        });
      }
      
      // Verify user has permission to access this protected knowledge base
//       console.log(`🔍 [DEBUG] Ownership check:`, {
//         kbOwner: kbOwner,
//         currentUserUsername: currentUser?.username,
//         isMatch: kbOwner === currentUser?.username
//       });
      
      if (kbOwner && kbOwner !== 'unknown' && kbOwner !== currentUser.username) {
        // console.log(`🔄 [OWNERSHIP TRANSFER] User ${currentUser.username} attempting to access KB owned by ${kbOwner}`);
        
        // Check if this KB is available for ownership transfer
        const kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
        const kbName = kbDoc?.kbName || kbDoc?.name || kbId;
        
        return res.status(403).json({ 
          error: 'Access denied: You do not have permission to access this knowledge base',
          details: 'Knowledge base ownership verification failed',
          requiresOwnershipTransfer: true,
          kbInfo: {
            id: kbId,
            name: kbName,
            currentOwner: kbOwner,
            requestedBy: currentUser.username
          },
          transferInstructions: 'This knowledge base requires ownership transfer. Please use the admin ownership transfer process.',
          adminEndpoint: '/api/admin/transfer-kb-ownership'
        });
      }
      
      // console.log(`✅ [SECURITY] User ${currentUser.username} verified as owner of protected KB ${kbId}`);
    } else {
      // console.log(`✅ [SECURITY] Unprotected KB ${kbId} - no authentication required`);
    }

    let attachSuccess = false;
    let attachResult = null;

    // First, try the standard attach endpoint
    try {
      // console.log(`🔄 [DO API] Attempt 1: Standard attach endpoint`);
      const result = await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${kbId}`, {
        method: 'POST'
        // No body needed - KB UUID is in the URL path
      });

//       console.log(`✅ [DO API] Standard attach response:`, JSON.stringify(result, null, 2));
      attachResult = result;
      
      // Check if the first attempt worked by looking at the response
      const agentData = result.agent || result.data?.agent || result.data || result;
      const attachedKBs = agentData.knowledge_bases || [];
      
//       console.log(`📚 [VERIFICATION] First attempt - Agent has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid));
      
      const isAttached = attachedKBs.some(kb => kb.uuid === kbId);
      if (isAttached) {
        // console.log(`✅ [VERIFICATION] KB ${kbId} successfully attached to agent ${agentId}`);
        
        // Update Cloudant with the successful attachment for security tracking
        try {
          const kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
          if (kbDoc) {
            // Update the KB document with attachment info
            const updatedKbDoc = {
              ...kbDoc,
              attachedToAgent: agentId,
              attachedAt: new Date().toISOString(),
              attachedBy: currentUser ? currentUser.username : 'unauthenticated'
            };
            await cacheManager.saveDocument(couchDBClient, "maia_knowledge_bases", updatedKbDoc);
            // console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
          }
        } catch (cloudantUpdateError) {
//           console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
          // Don't fail the operation if Cloudant update fails
        }
        
        // Rebuild agent management template for the user who owns this agent
        const userId = await getUserFromAgentId(agentId);
        if (userId) {
          try {
            await buildAgentManagementTemplate(userId);
            console.log(`[TEMPLATE] ✅ Rebuilt template for ${userId} after KB attachment`);
          } catch (templateError) {
            console.warn(`[TEMPLATE] Failed to rebuild template for ${userId}:`, templateError.message);
          }
        }
        
        res.json({ 
          success: true, 
          message: 'Knowledge base attached successfully', 
          result: { agent: agentData },
          verification: {
            attached: true,
            knowledgeBases: attachedKBs
          }
        });
        return; // Exit early if successful
      } else {
        // console.log(`❌ [VERIFICATION] First attempt failed - KB ${kbId} not found in response`);
        
        // Try to get the agent details separately to verify
        try {
          // console.log(`🔍 [VERIFICATION] Making separate API call to get agent details`);
          const agentDetails = await doRequest(`/v2/gen-ai/agents/${agentId}`);
//           console.log(`📚 [VERIFICATION] Agent details response:`, JSON.stringify(agentDetails, null, 2));
          
          const detailedAgentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
          const detailedKBs = detailedAgentData.knowledge_bases || [];
          
//           console.log(`📚 [VERIFICATION] Separate call - Agent has ${detailedKBs.length} KBs:`, detailedKBs.map(kb => kb.uuid));
          
          const isActuallyAttached = detailedKBs.some(kb => kb.uuid === kbId);
          if (isActuallyAttached) {
            // console.log(`✅ [VERIFICATION] KB ${kbId} successfully attached to agent ${agentId} (verified via separate call)`);
            
            // Update Cloudant with the successful attachment for security tracking
            try {
              const kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
              if (kbDoc) {
                // Update the KB document with attachment info
                const updatedKbDoc = {
                  ...kbDoc,
                  attachedToAgent: agentId,
                  attachedAt: new Date().toISOString(),
                  attachedBy: currentUser ? currentUser.username : 'unauthenticated'
                };
                await cacheManager.saveDocument(couchDBClient, "maia_knowledge_bases", updatedKbDoc);
                // console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
              }
            } catch (cloudantUpdateError) {
//               console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
              // Don't fail the operation if Cloudant update fails
            }
            
            res.json({ 
              success: true, 
              message: 'Knowledge base attached successfully', 
              result: { agent: detailedAgentData },
              verification: {
                attached: true,
                knowledgeBases: detailedKBs
              }
            });
            return; // Exit early if successful
          } else {
            // console.log(`❌ [VERIFICATION] KB ${kbId} still not attached after separate verification`);
          }
        } catch (verificationError) {
//           console.log(`❌ [VERIFICATION] Failed to get agent details:`, verificationError.message);
        }
      }
    } catch (attachError) {
//       console.log(`❌ [DO API] Standard attach failed:`, attachError.message);
    }
    
    // Always try the alternative approach as well
    try {
      // console.log(`🔄 [DO API] Attempt 2: Agent update endpoint`);
      const updateResult = await doRequest(`/v2/gen-ai/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify({
          knowledge_base_uuids: [kbId]
        })
      });
      
//       console.log(`✅ [DO API] Agent update response:`, JSON.stringify(updateResult, null, 2));
      attachResult = updateResult;
    } catch (updateError) {
//       console.log(`❌ [DO API] Agent update failed:`, updateError.message);
    }
    
    // Add a small delay to allow the API to process the attachment
    // console.log(`⏳ [VERIFICATION] Waiting 2 seconds for API to process attachment...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the attachment by fetching the agent's current knowledge bases
    // console.log(`🔍 [VERIFICATION] Verifying attachment for agent ${agentId}`);
    const verificationResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = verificationResponse.data || verificationResponse;
    const attachedKBs = agentData.knowledge_bases || [];
    
//     console.log(`📚 [VERIFICATION] Agent has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid));
    
    const isAttached = attachedKBs.some(kb => kb.uuid === kbId);
    if (isAttached) {
      // console.log(`✅ [VERIFICATION] KB ${kbId} successfully attached to agent ${agentId}`);
      
      // Update Cloudant with the successful attachment for security tracking
      try {
        const kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
        if (kbDoc) {
          // Update the KB document with attachment info
          const updatedKbDoc = {
            ...kbDoc,
            attachedToAgent: agentId,
            attachedAt: new Date().toISOString(),
            attachedBy: currentUser ? currentUser.username : 'unauthenticated'
          };
          await cacheManager.saveDocument(couchDBClient, "maia_knowledge_bases", updatedKbDoc);
          // console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
        }
      } catch (cloudantUpdateError) {
//         console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
        // Don't fail the operation if Cloudant update fails
      }
      
      // Rebuild agent management template for the user who owns this agent
      const userId = await getUserFromAgentId(agentId);
      if (userId) {
        try {
          await buildAgentManagementTemplate(userId);
          console.log(`[TEMPLATE] ✅ Rebuilt template for ${userId} after KB attachment (verification path)`);
        } catch (templateError) {
          console.warn(`[TEMPLATE] Failed to rebuild template for ${userId}:`, templateError.message);
        }
      }
      
      res.json({ 
        success: true, 
        message: 'Knowledge base attached successfully', 
        result: { agent: verificationResponse },
        verification: {
          attached: true,
          knowledgeBases: attachedKBs
        }
      });
      return; // Exit early if successful
    } else {
      // console.log(`❌ [VERIFICATION] KB ${kbId} was NOT attached to agent ${agentId}`);
      // console.log(`❌ [VERIFICATION] Expected KB: ${kbId}`);
      // console.log(`❌ [VERIFICATION] Found KBs: ${attachedKBs.map(kb => kb.uuid).join(', ')}`);
      
      // Provide a clear error message about the DigitalOcean API limitation
      const errorMessage = `DigitalOcean API limitation detected: Knowledge base attachment operations return success but do not actually attach KBs to agents. This appears to be a bug in the DigitalOcean API. Please contact DigitalOcean support or use the DigitalOcean dashboard to manually attach knowledge bases.`;
      
      res.status(500).json({ 
        success: false,
        message: errorMessage,
        result: { agent: agentData },
        verification: {
          attached: false,
          knowledgeBases: attachedKBs
        },
        api_limitation: true
      });
    }
  } catch (error) {
    console.error('❌ Attach KB error:', error);
    res.status(500).json({ message: `Failed to attach knowledge base: ${error.message}` });
  }
});

// Create agent
app.post('/api/agents', async (req, res) => {
  try {
    const { name, description, model, model_uuid, instructions, patientName, userId, knowledgeBaseId } = req.body;
    
    
    // Handle patient name pattern if provided
    let agentName;
    if (patientName) {
      // Generate agent name with current date using lowercase pattern
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      
      // Convert patient name to lowercase, remove spaces, keep only letters and numbers
      const cleanPatientName = patientName.toLowerCase().replace(/[^a-z0-9]/g, '');
      agentName = `${cleanPatientName}-agent-${day}${month}${year}`;
    } else if (name) {
      // Use provided name with validation
      agentName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    } else {
      return res.status(400).json({ 
        error: 'Either patientName or name parameter is required for agent creation' 
      });
    }
    
//     console.log(`🔍 Agent name: "${agentName}"`);
    
    // Determine which model to use - frontend sends model_uuid, backend expects model name
    let selectedModel;
    if (model_uuid) {
      // Frontend sent model_uuid, find the model by UUID
      const models = await doRequest('/v2/gen-ai/models');
      const modelArray = models.models || [];
      if (!Array.isArray(modelArray)) {
        return res.status(500).json({ message: 'Failed to get models from DigitalOcean API' });
      }
      
      // Filter out models without names and log for debugging
      const validModels = modelArray.filter(m => m && m.name);
//       console.log(`🔍 Found ${validModels.length} valid models out of ${modelArray.length} total`);
//       console.log(`🔍 Looking for model UUID: ${model_uuid}`);
//       console.log(`🔍 Available models: ${validModels.map(m => `${m.name} (${m.uuid})`).join(', ')}`);
      
      selectedModel = validModels.find(m => m.uuid === model_uuid);
      
      if (!selectedModel) {
        return res.status(400).json({ message: `Model with UUID '${model_uuid}' not found. Available models: ${validModels.map(m => `${m.name} (${m.uuid})`).join(', ')}` });
      }
    } else if (model) {
      // Backend expects model name, find by name
      const models = await doRequest('/v2/gen-ai/models');
      const modelArray = models.models || [];
      if (!Array.isArray(modelArray)) {
        return res.status(500).json({ message: 'Failed to get models from DigitalOcean API' });
      }
      
      // Filter out models without names and log for debugging
      const validModels = modelArray.filter(m => m && m.name);
//       console.log(`🔍 Found ${validModels.length} valid models out of ${modelArray.length} total`);
//       console.log(`🔍 Looking for model: ${model}`);
//       console.log(`🔍 Available models: ${validModels.map(m => m.name).join(', ')}`);
      
      selectedModel = validModels.find(m => m && m.name && typeof m.name === 'string' && m.name.toLowerCase().includes(model.toLowerCase()));
      
      if (!selectedModel) {
        return res.status(400).json({ message: `Model '${model}' not found. Available models: ${validModels.map(m => m.name).join(', ')}` });
      }
    } else {
      return res.status(400).json({ message: 'Either model or model_uuid is required' });
    }
    
    // Get available regions
    const regions = await doRequest('/v2/gen-ai/regions');
    const defaultRegion = regions.regions[0]?.region || 'tor1';
    
    // Use SystemPrompt.txt template if patientName is provided
    let agentDescription = description;
    let agentInstructions = instructions;
    
    if (patientName) {
      agentDescription = `A private medical AI assistant for ${patientName}.`;
      agentInstructions = `You are MAIA, a medical AI assistant, that can search through a patient's health records in a knowledge base and provide relevant answers to their requests. Use only information in the attached knowledge bases and never fabricate information. There is a lot of redundancy in a patient's knowledge base. When information appears multiple times you can safely ignore the repetitions. To ensure that all medications are accurately listed in the future, the assistant should adopt a systematic approach: Comprehensive Review: Thoroughly examine every chunk in the knowledge base to identify all medication entries, regardless of their status (active or stopped). Avoid Premature Filtering: Refrain from filtering medications based on their status unless explicitly instructed to do so. This ensures that all prescribed medications are included. Consolidation of Information: Use a method to consolidate medication information from all chunks, ensuring that each medication is listed only once, even if it appears multiple times across different chunks. Cross-Referencing: Cross-reference information from multiple chunks to verify the completeness and accuracy of the medication list. Systematic Extraction: Implement a systematic process or algorithm to extract medication information, reducing the likelihood of human error or oversight. If you are asked for a patient summary, use the following categories and format: Highlight the label and category headings. Display the patient's name followed by their age and sex. A concise medical history; including surgical history -- Doctors seen recently (say, within a year) and diagnoses of those visits -- Current Medications -- Stopped or Inactive Medications --Allergies --Brief social history: employment (or school) status; living situation; use of tobacco, alcohol, drugs --Radiology in the past year --Other testing in the past year (PFTs, EKGs, etc) Do not show your reasoning. Just provide the response in English. Always start your response with the patient's name, age and sex.`;
    }
    
    const agentData = {
      name: agentName,
      description: agentDescription,
      model_uuid: selectedModel.uuid,
      instruction: agentInstructions,
      region: defaultRegion,
      project_id: process.env.DIGITALOCEAN_PROJECT_ID || '37455431-84bd-4fa2-94cf-e8486f8f8c5e' // Default project ID
    };

    // Add knowledge base if provided
    if (knowledgeBaseId) {
      agentData.knowledge_base_uuids = [knowledgeBaseId];
    }

    // Log the exact payload being sent to DigitalOcean
//     console.log('🚀 DIGITALOCEAN AGENT CREATION PAYLOAD:');
    // console.log('========================================');
    // console.log(JSON.stringify(agentData, null, 2));
    // console.log('========================================');
//     console.log(`🔗 Endpoint: ${process.env.DIGITALOCEAN_BASE_URL}/v2/gen-ai/agents`);
    // console.log(`🔑 Token: ${process.env.DIGITALOCEAN_TOKEN ? 'Present' : 'Missing'}`);
//     console.log(`📋 Project ID: ${agentData.project_id}`);

    const agent = await doRequest('/v2/gen-ai/agents', {
      method: 'POST',
      body: JSON.stringify(agentData)
    });

//     console.log(`🤖 Created agent: ${agentName}`);
//     console.log(`📋 Agent response:`, JSON.stringify(agent, null, 2));
    
    // Handle different response structures from DigitalOcean API
    const responseData = agent.agent || agent.data || agent;
    
    if (!responseData) {
      console.error('❌ No agent data in response:', agent);
      return res.status(500).json({ message: 'Agent creation succeeded but no data returned' });
    }
    
    const agentId = responseData.uuid || responseData.id;
    
    // Create API key for the agent
    let agentApiKey = null;
    try {
      const apiKeyResponse = await doRequest(`/v2/gen-ai/agents/${agentId}/api_keys`, {
        method: 'POST',
        body: JSON.stringify({
          name: `${agentName}-api-key`
        })
      });
      
      const apiKeyData = apiKeyResponse.api_key || apiKeyResponse.api_key_info || apiKeyResponse.data || apiKeyResponse;
      // Try multiple possible field names for the API key
      agentApiKey = apiKeyData.key || apiKeyData.api_key || apiKeyData.secret_key;
      
      if (agentApiKey) {
        // Store the API key in the agentApiKeys object
        agentApiKeys[agentId] = agentApiKey;
      } else {
        console.error(`[AGENT CREATE] ❌ Failed to extract API key from response:`, apiKeyResponse);
        console.error(`[AGENT CREATE] ❌ Available fields in response:`, Object.keys(apiKeyData));
      }
    } catch (apiKeyError) {
      console.error(`[AGENT CREATE] ❌ Failed to create API key for agent ${agentId}:`, apiKeyError.message);
      // Don't fail the entire request if API key creation fails
    }
    
    // Store agent info in maia_users database if userId is provided
    if (userId && agentId) {
      try {
        
        // Get user document
        const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
        if (userDoc) {
          // Update user document with agent information (but keep workflow stage as 'approved' until deployment completes)
          const updatedUserDoc = {
            ...userDoc,
            assignedAgentId: agentId,
            assignedAgentName: agentName,
            agentApiKey: agentApiKey, // Store the API key
            agentAssignedAt: new Date().toISOString(),
            workflowStage: 'approved', // Keep as 'approved' until deployment completes
            approvalStatus: 'approved',
            updatedAt: new Date().toISOString()
          };
          
          // Save updated document
          await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
          
          // Invalidate user cache
          setCache('users', userId, updatedUserDoc);
          
        } else {
          console.warn(`[AGENT CREATE] ⚠️ User ${userId} not found in maia_users database`);
        }
      } catch (dbError) {
        console.error(`[AGENT CREATE] ❌ Failed to store agent info in maia_users for user ${userId}:`, dbError.message);
        // Don't fail the entire request if database storage fails
      }
    }
    
    // Start deployment tracking if userId is provided (from Admin Panel)
    if (userId && responseData.uuid) {
      
      // Import and call the deployment tracking function
      const { addToDeploymentTracking } = await import('./src/routes/admin-management-routes.js');
      addToDeploymentTracking(userId, responseData.uuid, agentName);
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Create agent error:', error);
    res.status(500).json({ message: `Failed to create agent: ${error.message}` });
  }
});

// Update agent
app.put('/api/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, description, model, instructions } = req.body;
    
    const agentData = {
      name,
      description,
      instruction: instructions
    };

    const agent = await doRequest(`/v2/gen-ai/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(agentData)
    });

//     console.log(`🤖 Updated agent: ${agentId}`);
    res.json(agent.data);
  } catch (error) {
    console.error('❌ Update agent error:', error);
    res.status(500).json({ message: `Failed to update agent: ${error.message}` });
  }
});

// Delete agent
app.delete('/api/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    await doRequest(`/v2/gen-ai/agents/${agentId}`, {
      method: 'DELETE'
    });

//     console.log(`🗑️  Deleted agent: ${agentId}`);
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('❌ Delete agent error:', error);
    res.status(500).json({ message: `Failed to delete agent: ${error.message}` });
  }
});

// List knowledge bases (replaced by unified endpoint below)

// Unified KB list with protection status
app.get('/api/knowledge-bases', async (req, res) => {
  try {
    // Get the current authenticated user from the request
    const currentUser = req.headers['x-current-user'] || req.query.user;
    
    // 1. Fetch KBs from DigitalOcean
    const doResponse = await doRequest('/v2/gen-ai/knowledge_bases?page=1&per_page=1000');
    const doKBs = (doResponse.knowledge_bases || doResponse.data?.knowledge_bases || doResponse.data || []).map(kb => ({
      ...kb,
      id: kb.uuid || kb.id // normalize id field
    }));

    // 2. Fetch protection metadata from Cloudant
    let protectionDocs = [];
    try {
      protectionDocs = await cacheManager.getAllDocuments(couchDBClient, 'maia_knowledge_bases');
    } catch (err) {
      console.warn('Could not fetch KB protection metadata from Cloudant:', err.message);
    }
    const protectionMap = {};
    for (const doc of protectionDocs) {
      if (doc.kbId || doc.id || doc._id) {
        protectionMap[doc.kbId || doc.id || doc._id] = doc;
      }
    }

    // 3. Merge protection info into DO KBs
    const mergedKBs = doKBs.map(kb => {
      const protection = protectionMap[kb.id] || {};
      return {
        ...kb,
        isProtected: !!protection.isProtected,
        owner: protection.owner || null
      };
    });

    // 4. Filter KBs by user ownership if a user is specified
    let filteredKBs = mergedKBs;
    if (currentUser) {
//       console.log(`🔐 Filtering KBs for user: ${currentUser}`);
//       console.log(`🔐 Total KBs before filtering: ${mergedKBs.length}`);
      
      // For authenticated users, show ONLY their own KBs (no shared KBs)
      filteredKBs = mergedKBs.filter(kb => {
        const hasOwner = kb.owner === currentUser;
        const hasNamePrefix = kb.name && kb.name.startsWith(`${currentUser}-`);
        const matches = hasOwner || hasNamePrefix;
        
        if (matches) {
//           console.log(`🔐 KB ${kb.name} (${kb.uuid}) matches user ${currentUser} - Owner: ${kb.owner || 'user-prefixed'}`);
        }
        
        return matches;
      });
      
//       console.log(`🔐 Filtered KBs for user ${currentUser}: ${filteredKBs.length} of ${mergedKBs.length} total`);
    } else {
      // For unauthenticated users, filter out protected KBs (those with username prefixes or explicit owners)
//       console.log(`🔐 Filtering KBs for unauthenticated user - hiding protected KBs`);
//       console.log(`🔐 Total KBs before filtering: ${mergedKBs.length}`);
      
      filteredKBs = mergedKBs.filter(kb => {
        // Check if KB has a username prefix (e.g., "wed271-kb1", "agropper-kb1")
        // Only consider it a username prefix if it's a short alphanumeric string followed by a dash
        // This excludes names like "casandra-fhir-download-json-06162025" which are descriptive names
        const hasUsernamePrefix = kb.name && /^[a-zA-Z0-9]{3,8}-[a-zA-Z0-9]+$/.test(kb.name);
        // Check if KB has an explicit owner
        const hasExplicitOwner = kb.owner && kb.owner !== null;
        // Check if KB is marked as protected
        const isProtected = kb.isProtected === true;
        
        // Show KB only if it's NOT protected (no username prefix, no explicit owner, not marked protected)
        const shouldShow = !hasUsernamePrefix && !hasExplicitOwner && !isProtected;
        
        if (!shouldShow) {
//           console.log(`🔐 KB ${kb.name} (${kb.uuid}) is PROTECTED - Owner: ${kb.owner || 'username-prefixed'}, Protected: ${isProtected}`);
        }
        
        return shouldShow;
      });
      
//       console.log(`🔐 Filtered KBs for unauthenticated user: ${filteredKBs.length} of ${mergedKBs.length} total (protected KBs hidden)`);
    }

    res.json(filteredKBs);
  } catch (error) {
    console.error('❌ Failed to fetch merged knowledge bases:', error);
    res.status(500).json({ error: 'Failed to fetch knowledge bases' });
  }
});

// List available models
app.get('/api/models', async (req, res) => {
  try {
    const models = await doRequest('/v2/gen-ai/models');
//     console.log(`🤖 Models response:`, JSON.stringify(models, null, 2));
    
    // Handle different response formats
    const modelData = models.data || models.models || models;
    const modelArray = Array.isArray(modelData) ? modelData : [];
    
//     console.log(`🤖 Found ${modelArray.length} available models`);
    res.json(modelArray);
  } catch (error) {
    console.error('❌ List models error:', error);
    res.status(500).json({ message: `Failed to list models: ${error.message}` });
  }
});

// Clear Public User agent assignment (admin endpoint)
app.post('/api/admin/clear-public-user-agent', async (req, res) => {
  try {
//     console.log('🔍 [admin] Clearing Public User agent assignment...');
    
    // Get Public User document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'Public User');
//     console.log('🔍 [admin] Current Public User document:', {
//       currentAgentId: userDoc.currentAgentId,
//       currentAgentName: userDoc.currentAgentName
//     });
    
    // Clear the agent assignment
    const updatedUserDoc = {
      ...userDoc,
      assignedAgentId: null,
      assignedAgentName: null,
      agentAssignedAt: null,
      updatedAt: new Date().toISOString()
    };
    
    // Save updated document
    await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
    
    // Update cache
    setCache('users', 'Public User', updatedUserDoc);
    
//     console.log('✅ [admin] Successfully cleared Public User agent assignment');
    
    res.json({ 
      success: true, 
      message: 'Public User agent assignment cleared successfully' 
    });
    
  } catch (error) {
    console.error('❌ [admin] Error clearing Public User agent assignment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear Public User agent assignment',
      details: error.message 
    });
  }
});

// Allow Public User to select public agents
app.post('/api/current-agent', async (req, res) => {
  try {
    const { agentId } = req.body;
    
    // Only allow Public User to select agents
    const authCookie = req.cookies.maia_auth;
    let currentUser = 'Public User';
    
    if (authCookie) {
      try {
        const authData = JSON.parse(authCookie);
        const now = new Date();
        const expiresAt = new Date(authData.expiresAt);
        
        if (now < expiresAt) {
          currentUser = authData.userId;
        }
      } catch (error) {
        // Invalid cookie, stay as Public User
      }
    }
    
    // Only allow Public User to select agents
    if (currentUser !== 'Public User') {
      return res.status(403).json({ 
        error: 'Agent selection is only available for Public User. Authenticated users have agents assigned by administrator.' 
      });
    }
    
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    
    // Validate that this is a public agent
    try {
      const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
      const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
      
      if (!agentData) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      if (!agentData.name.startsWith('public-')) {
        return res.status(403).json({ 
          error: 'Only public agents can be selected by Public User' 
        });
      }
      
      // Get or create Public User document
      let userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'Public User');
      if (!userDoc) {
        userDoc = {
          _id: 'Public User',
          userId: 'Public User',
          type: 'public',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      
      // Update agent selection
      userDoc.currentAgentId = agentId;
      userDoc.currentAgentName = agentData.name;
      userDoc.currentAgentEndpoint = agentData.deployment?.url ? `${agentData.deployment.url}/api/v1` : null;
      userDoc.currentAgentSetAt = new Date().toISOString();
      userDoc.updatedAt = new Date().toISOString();
      
      // Save to database
      await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
      
      // Update cache
      setCache('users', 'Public User', userDoc);
      
      console.log(`✅ [current-agent] Public User selected agent: ${agentData.name}`);
      
      res.json({ 
        success: true,
        message: `Public agent "${agentData.name}" selected successfully`,
        agent: {
          id: agentId,
          name: agentData.name,
          endpoint: userDoc.currentAgentEndpoint
        }
      });
      
    } catch (error) {
      console.error('❌ Error validating agent:', error);
      return res.status(500).json({ 
        error: `Failed to validate agent: ${error.message}` 
      });
    }
    
  } catch (error) {
    console.error('❌ Error in agent selection:', error);
    res.status(500).json({ 
      error: `Failed to select agent: ${error.message}` 
    });
  }
});
// Users cannot select their own agents to prevent security violations

// ============================================================================
// UNIFIED USER STATE MANAGEMENT ENDPOINTS
// ============================================================================


// Create knowledge base
app.post('/api/knowledge-bases', async (req, res) => {
  try {
    const { name, description, documents, username } = req.body;
    
    // Convert documents array to document_uuids if needed
    const document_uuids = documents ? documents.map(doc => doc.id || doc.bucketKey) : [];
    
    // Use username-prefixed KB name for better organization if username is provided
    const kbName = username ? `${username}-${name}` : name;
    const itemPath = username ? `${username}/` : "shared/";
    
    // Get available embedding models first
    let embeddingModelId = null;
    
    try {
      const modelsResponse = await doRequest('/v2/gen-ai/models');
      const models = modelsResponse.models || modelsResponse.data?.models || [];
      
      // Find embedding models that can be used for knowledge bases
      // These are typically text embedding models
      const embeddingModels = models.filter(model => 
        model.name && (
          model.name.toLowerCase().includes('embedding') ||
          model.name.toLowerCase().includes('gte') ||
          model.name.toLowerCase().includes('mini') ||
          model.name.toLowerCase().includes('mpnet')
        )
      );
      
      if (embeddingModels.length > 0) {
        // Prefer GTE Large as it's a high-quality embedding model
        const preferredModel = embeddingModels.find(model => 
          model.name.toLowerCase().includes('gte large')
        ) || embeddingModels[0];
        
        embeddingModelId = preferredModel.uuid;
      }
    } catch (modelError) {
      console.error(`❌ Failed to get embedding models:`, modelError.message);
    }
    
    const kbData = {
      name: kbName,
      description: `${kbName} description`,
      project_id: '90179b7c-8a42-4a71-a036-b4c2bea2fe59',
      database_id: '881761c6-e72d-4f35-a48e-b320cd1f46e4',
      region: "tor1",
      datasources: [
        {
          "spaces_data_source": {
            "bucket_name": "maia",
            "item_path": itemPath,
            "region": "tor1"
          }
        }
      ]
    };

    if (embeddingModelId) {
      kbData.embedding_model_uuid = embeddingModelId;
    }
    
    const knowledgeBase = await doRequest('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(kbData)
    });

    const kbId = knowledgeBase.knowledge_base?.uuid || knowledgeBase.data?.uuid || knowledgeBase.uuid;

    // Store user ownership information in Cloudant
    if (kbId) {
      try {
        const ownershipDoc = {
          _id: `kb_${kbId}`,
          kbId: kbId,
          kbName: kbName,
          owner: username || null, // null for shared KBs
          createdAt: new Date().toISOString(),
          isProtected: !!username, // Only protected if username is provided
          itemPath: itemPath
        };
        
        await couchDBClient.saveDocument('maia_knowledge_bases', ownershipDoc);
        
        if (username) {
          console.log(`✅ KB ${kbName} created and ownership stored for ${username}`);
        }
      } catch (ownershipError) {
        console.error(`❌ Failed to store KB ownership for ${kbId}:`, ownershipError.message);
      }
    }

    const responseData = knowledgeBase.data || knowledgeBase;

    res.json(responseData);
  } catch (error) {
    console.error('[KB CREATE] ❌ Create knowledge base error:', {
      error: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).json({ message: `Failed to create knowledge base: ${error.message}` });
  }
});

// Get knowledge base details
app.get('/api/knowledge-bases/:kbId', async (req, res) => {
  try {
    const { kbId } = req.params;
    
    const knowledgeBase = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
//     console.log(`📚 Retrieved knowledge base: ${kbId}`);
    res.json(knowledgeBase.data);
  } catch (error) {
    console.error('❌ Get knowledge base error:', error);
    res.status(500).json({ message: `Failed to get knowledge base: ${error.message}` });
  }
});

// Add data source to knowledge base
app.post('/api/knowledge-bases/:kbId/data-sources', async (req, res) => {
  try {
    const { kbId } = req.params;
    const { type, source } = req.body; // type: 'file', 'url', 'spaces'; source: file path, URL, or bucket name
    
    let dataSourceData;
    
    if (type === 'file') {
      dataSourceData = {
        type: 'file_upload',
        source: source
      };
    } else if (type === 'url') {
      dataSourceData = {
        type: 'url_crawl',
        source: source
      };
    } else if (type === 'spaces') {
      dataSourceData = {
        type: 'spaces_bucket',
        source: source
      };
    } else {
      return res.status(400).json({ message: 'Invalid data source type' });
    }

    const dataSource = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}/data_sources`, {
      method: 'POST',
      body: JSON.stringify(dataSourceData)
    });

//     console.log(`📚 Added data source to KB ${kbId}: ${type} - ${source}`);
    res.json(dataSource.data);
  } catch (error) {
    console.error('❌ Add data source error:', error);
    res.status(500).json({ message: `Failed to add data source: ${error.message}` });
  }
});

// Index data source
app.post('/api/knowledge-bases/:kbId/data-sources/:dsId/index', async (req, res) => {
  try {
    const { kbId, dsId } = req.params;
    
    const indexingJob = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}/data_sources/${dsId}/indexing_jobs`, {
      method: 'POST'
    });

//     console.log(`📚 Started indexing job for KB ${kbId}, data source ${dsId}`);
    res.json(indexingJob.data);
  } catch (error) {
    console.error('❌ Start indexing error:', error);
    res.status(500).json({ message: `Failed to start indexing: ${error.message}` });
  }
});

// Get indexing job status
app.get('/api/knowledge-bases/:kbId/data-sources/:dsId/indexing-jobs/:jobId', async (req, res) => {
  try {
    const { kbId, dsId, jobId } = req.params;
    
    const jobStatus = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}/data_sources/${dsId}/indexing_jobs/${jobId}`);
//     console.log(`📚 Retrieved indexing job status: ${jobId}`);
    res.json(jobStatus.data);
  } catch (error) {
    console.error('❌ Get indexing job status error:', error);
    res.status(500).json({ message: `Failed to get indexing job status: ${error.message}` });
  }
});

// Get knowledge base indexing status (for workflow monitoring)
app.get('/api/knowledge-bases/:kbId/indexing-status', async (req, res) => {
  try {
    const { kbId } = req.params;
    
//     console.log(`📊 Checking indexing status for KB: ${kbId}`);
    
    // Get the knowledge base details
    const kbResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
    const kbData = kbResponse.data || kbResponse;
    const kb = kbData.knowledge_base || kbData;
    
//     console.log(`📊 KB response structure:`, Object.keys(kb || {}));
    
    // Check if there's a last indexing job
    if (!kb.last_indexing_job) {
      return res.json({
        success: false,
        message: 'No indexing job found for this knowledge base',
        needsIndexing: true
      });
    }
    
    const lastJob = kb.last_indexing_job;
//     console.log(`📊 Last indexing job:`, lastJob);
    
    // Check if there are data source jobs
    if (!lastJob.data_source_jobs || lastJob.data_source_jobs.length === 0) {
      return res.json({
        success: false,
        message: 'No data source jobs found in indexing job',
        needsIndexing: true
      });
    }
    
    // Get the data source UUID from the first data source job
    const dataSourceJob = lastJob.data_source_jobs[0];
    const dataSourceUuid = dataSourceJob.data_source_uuid;
    
    if (!dataSourceUuid) {
      return res.json({
        success: false,
        message: 'No data source UUID found in indexing job',
        needsIndexing: true
      });
    }
    
//     console.log(`📊 Data source UUID: ${dataSourceUuid}`);
    
    // We already have the job status from the KB details, no need for additional API call
    const jobStatus = {
      uuid: lastJob.uuid,
      status: lastJob.status,
      phase: lastJob.phase,
      tokens: lastJob.tokens || 0,
      total_datasources: lastJob.total_datasources || 0,
      completed_datasources: lastJob.completed_datasources || 0,
      total_items_indexed: lastJob.total_items_indexed || 0,
      created_at: lastJob.created_at,
      updated_at: lastJob.updated_at,
      started_at: lastJob.started_at,
      finished_at: lastJob.finished_at
    };
    
//     console.log(`📊 Indexing job status: ${jobStatus.status}, Phase: ${jobStatus.phase}, Tokens: ${jobStatus.tokens}`);
    
    res.json({
      success: true,
      indexingJob: jobStatus
    });
    
  } catch (error) {
    console.error('❌ Get indexing status error:', error);
    res.status(500).json({ 
      success: false,
      message: `Failed to get indexing status: ${error.message}` 
    });
  }
});

// Test endpoint to start indexing job for a knowledge base
app.post('/api/test-start-indexing', async (req, res) => {
  try {
    const { kbId, kbName } = req.body;
    
    if (!kbId) {
      return res.status(400).json({
        success: false,
        message: 'Knowledge base ID is required'
      });
    }
    
//     console.log(`🚀 Starting indexing job for KB: ${kbName || kbId}`);
    
    // Get the knowledge base details to find data sources
    const kbResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
    const kbData = kbResponse.data || kbResponse;
    
    if (!kbData.datasources || kbData.datasources.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data sources found for this knowledge base'
      });
    }
    
    // Get the first data source (spaces_data_source)
    const dataSource = kbData.datasources[0];
    if (!dataSource.spaces_data_source) {
      return res.status(400).json({
        success: false,
        message: 'No spaces data source found'
      });
    }
    
    // Create indexing job using DigitalOcean API
    const indexingJobData = {
      data_source_uuid: dataSource.spaces_data_source.uuid
    };
    
//     console.log(`📊 Creating indexing job with data source: ${dataSource.spaces_data_source.uuid}`);
    
    const indexingJobResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}/indexing_jobs`, {
      method: 'POST',
      body: JSON.stringify(indexingJobData)
    });
    
    const indexingJob = indexingJobResponse.data || indexingJobResponse;
    
//     console.log(`✅ Indexing job created successfully: ${indexingJob.uuid}`);
//     console.log(`📊 Job status: ${indexingJob.status}`);
    
    res.json({
      success: true,
      message: 'Indexing job started successfully',
      indexingJob: {
        uuid: indexingJob.uuid,
        status: indexingJob.status,
        created_at: indexingJob.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Start indexing job error:', error);
    res.status(500).json({ 
      success: false,
      message: `Failed to start indexing job: ${error.message}` 
    });
  }
});

// Auto-start indexing for the most recent knowledge base
app.post('/api/auto-start-indexing', async (req, res) => {
  try {
//     console.log('🚀 AUTO-START INDEXING ENDPOINT CALLED!');
//     console.log('🚀 AUTO-START INDEXING: Getting most recent knowledge base...');
    
    // Get all knowledge bases
    const kbResponse = await doRequest('/v2/gen-ai/knowledge_bases');
    
    // For debugging, return the raw response structure
//     console.log('🔍 Raw KB response type:', typeof kbResponse);
//     console.log('🔍 Raw KB response keys:', Object.keys(kbResponse || {}));
    
    // Check if response has knowledge_bases array
    if (kbResponse && kbResponse.knowledge_bases && Array.isArray(kbResponse.knowledge_bases)) {
//       console.log('✅ Response has knowledge_bases array');
      const kbList = kbResponse.knowledge_bases;
//       console.log('🔍 KB list length:', kbList.length);
      
      if (kbList.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No knowledge bases found'
        });
      }
      
      const mostRecentKB = kbList[0];
//       console.log('🔍 Most recent KB object:', JSON.stringify(mostRecentKB, null, 2));
//       console.log(`📚 Most recent KB: ${mostRecentKB.name} (${mostRecentKB.uuid})`);
      // console.log(`📅 Created: ${mostRecentKB.created_at}`);
//       console.log(`📊 Current indexing status: ${mostRecentKB.last_indexing_job?.status || 'No indexing job'}`);
      
      // Check if this KB already has a completed indexing job
      if (mostRecentKB.last_indexing_job && mostRecentKB.last_indexing_job.status === 'INDEX_JOB_STATUS_COMPLETED') {
//         console.log(`ℹ️ KB ${mostRecentKB.name} already has a completed indexing job`);
        return res.json({
          success: true,
          message: 'Knowledge base already has a completed indexing job',
          knowledgeBase: {
            name: mostRecentKB.name,
            uuid: mostRecentKB.uuid,
            created_at: mostRecentKB.created_at
          },
          existingIndexingJob: {
            uuid: mostRecentKB.last_indexing_job.uuid,
            status: mostRecentKB.last_indexing_job.status,
            created_at: mostRecentKB.last_indexing_job.created_at,
            finished_at: mostRecentKB.last_indexing_job.finished_at
          }
        });
      }
    } else {
//       console.log('❌ Unexpected response structure');
      return res.status(500).json({
        success: false,
        message: 'Unexpected response structure from DigitalOcean API',
        response: kbResponse
      });
    }
    
    // Define mostRecentKB variable for the rest of the function
    const mostRecentKB = kbResponse.knowledge_bases[0];
    
    // Get the knowledge base details to find data sources
    const kbDetailsResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${mostRecentKB.uuid}`);
    const kbDetails = kbDetailsResponse.data || kbDetailsResponse;
    
    if (!kbDetails.datasources || kbDetails.datasources.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data sources found for this knowledge base'
      });
    }
    
    // Get the first data source (spaces_data_source)
    const dataSource = kbDetails.datasources[0];
    if (!dataSource.spaces_data_source) {
      return res.status(400).json({
        success: false,
        message: 'No spaces data source found'
      });
    }
    
//     console.log(`📊 Found data source: ${dataSource.spaces_data_source.uuid}`);
//     console.log(`📁 Bucket: ${dataSource.spaces_data_source.bucket_name}, Path: ${dataSource.spaces_data_source.item_path}`);
    
    // Create indexing job using DigitalOcean API
    const indexingJobData = {
      data_source_uuid: dataSource.spaces_data_source.uuid
    };
    
//     console.log(`🚀 Creating indexing job for KB: ${mostRecentKB.name}`);
    
    const indexingJobResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${mostRecentKB.uuid}/indexing_jobs`, {
      method: 'POST',
      body: JSON.stringify(indexingJobData)
    });
    
    const indexingJob = indexingJobResponse.data || indexingJobResponse;
    
//     console.log(`✅ Indexing job created successfully!`);
//     console.log(`📊 Job UUID: ${indexingJob.uuid}`);
//     console.log(`📊 Job Status: ${indexingJob.status}`);
//     console.log(`📊 Created At: ${indexingJob.created_at}`);
    
    // Now check the status immediately
//     console.log(`🔍 Checking indexing job status...`);
    const jobStatusResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${mostRecentKB.uuid}/data_sources/${dataSource.spaces_data_source.uuid}/indexing_jobs/${indexingJob.uuid}`);
    const jobStatus = jobStatusResponse.data || jobStatusResponse;
    
//     console.log(`📊 Current Job Status: ${jobStatus.status}`);
//     console.log(`📊 Tokens Processed: ${jobStatus.tokens_processed || 0}`);
//     console.log(`📊 Progress: ${jobStatus.progress || 'N/A'}`);
    
    res.json({
      success: true,
      message: 'Indexing job started successfully for most recent KB',
      knowledgeBase: {
        name: mostRecentKB.name,
        uuid: mostRecentKB.uuid,
        created_at: mostRecentKB.created_at
      },
      indexingJob: {
        uuid: indexingJob.uuid,
        status: indexingJob.status,
        created_at: indexingJob.created_at
      },
      currentStatus: {
        status: jobStatus.status,
        tokens_processed: jobStatus.tokens_processed || 0,
        progress: jobStatus.progress || 'N/A'
      }
    });
    
  } catch (error) {
    console.error('❌ Auto-start indexing error:', error);
    res.status(500).json({ 
      success: false,
      message: `Failed to auto-start indexing: ${error.message}` 
    });
  }
});

// Automated KB Creation and Patient Summary Generation
app.post('/api/automate-kb-and-summary', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userId, fileName, bucketKey } = req.body;
    
    if (!userId || !fileName || !bucketKey) {
      return res.status(400).json({
        success: false,
        message: 'userId, fileName, and bucketKey are required'
      });
    }
    
    console.log(`🤖 [AUTO PS] Starting automation for user ${userId}, file: ${fileName}`);
    
    // Step 1: Get user document
    const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
    if (!userDoc) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Step 2: Get user's assigned agent
    const agentId = userDoc.assignedAgentId;
    if (!agentId) {
      throw new Error(`User ${userId} has no assigned agent`);
    }
    
    console.log(`🤖 [AUTO PS] User has agent: ${agentId}`);
    
    // Step 3: Create Knowledge Base
    const kbName = `${userId}-kb-${Date.now()}`;
    console.log(`🤖 [AUTO PS] Creating KB "${kbName}" from file ${fileName}`);
    
    // Extract user folder from bucketKey (e.g., "fri1/archived/file.pdf" -> "fri1/")
    const userFolder = bucketKey.split('/').slice(0, 1).join('/') + '/';
    
    // Create KB with the user's folder as data source
    const kbCreateResponse = await doRequest('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify({
        name: kbName,
        datasources: [{
          spaces_data_source: {
            name: `${kbName}-datasource`,
            bucket_name: process.env.DIGITALOCEAN_SPACE_NAME,
            bucket_region: process.env.DIGITALOCEAN_SPACE_REGION,
            bucket_prefix: userFolder,
            access_key_id: process.env.DIGITALOCEAN_SPACE_KEY,
            secret_access_key: process.env.DIGITALOCEAN_SPACE_SECRET
          }
        }]
      })
    });
    
    const kbData = kbCreateResponse.data || kbCreateResponse;
    const kb = kbData.knowledge_base || kbData;
    const kbId = kb.uuid || kb.id;
    
    console.log(`🤖 [AUTO PS] Created KB: ${kbId}`);
    
    // Step 4: Attach KB to agent
    console.log(`🤖 [AUTO PS] Attaching KB to agent ${agentId}`);
    await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${kbId}`, {
      method: 'POST'
    });
    
    // Step 5: Start indexing
    console.log(`🤖 [AUTO PS] Starting indexing for KB ${kbId}`);
    const dataSourceUuid = kb.datasources[0].spaces_data_source.uuid;
    const indexingResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}/indexing_jobs`, {
      method: 'POST',
      body: JSON.stringify({
        data_source_uuid: dataSourceUuid
      })
    });
    
    const indexingJob = indexingResponse.data || indexingResponse;
    const jobId = indexingJob.uuid || indexingJob.id;
    
    // Step 6: Poll for indexing completion
    console.log(`🤖 [AUTO PS] Polling for indexing completion (job ${jobId})...`);
    let indexingComplete = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5 seconds * 60)
    let totalTokens = 0;
    
    while (!indexingComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;
      
      // Get indexing status
      const statusResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
      const statusData = statusResponse.data || statusResponse;
      const statusKb = statusData.knowledge_base || statusData;
      const lastJob = statusKb.last_indexing_job;
      
      if (lastJob) {
        const status = lastJob.status || '';
        const phase = lastJob.phase || '';
        totalTokens = lastJob.tokens || 0;
        
        console.log(`🤖 [AUTO PS] Indexing status: ${status}, Phase: ${phase}, Tokens: ${totalTokens}, Attempt: ${attempts}/${maxAttempts}`);
        
        // Check for completion
        if (status.includes('completed') || phase.includes('succeeded')) {
          indexingComplete = true;
          const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
          console.log(`🤖 [AUTO PS] Indexing complete in ${elapsedSeconds} seconds`);
        } else if (status.includes('failed') || phase.includes('failed')) {
          throw new Error(`Indexing failed: ${status} - ${phase}`);
        }
      }
    }
    
    if (!indexingComplete) {
      throw new Error('Indexing timeout after 5 minutes');
    }
    
    // Step 7: Update maia_kb document with file and token info
    console.log(`🤖 [AUTO PS] Updating maia_kb document for ${kbName}`);
    const kbDoc = await cacheManager.getDocument(couchDBClient, 'maia_kb', kbName);
    if (kbDoc) {
      kbDoc.files = [{
        name: fileName,
        bucketKey: bucketKey,
        indexedAt: new Date().toISOString()
      }];
      kbDoc.totalTokens = totalTokens;
      kbDoc.indexedAt = new Date().toISOString();
      await cacheManager.saveDocument(couchDBClient, 'maia_kb', kbDoc);
      console.log(`🤖 [AUTO PS] Updated maia_kb document with ${totalTokens} tokens`);
    }
    
    // Step 8: Generate patient summary via Personal AI
    console.log(`🤖 [AUTO PS] Requesting patient summary from Personal AI`);
    
    // Make request to Personal AI with the patient summary prompt
    const summaryResponse = await doRequest(`/v2/gen-ai/agents/${agentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: 'Create a comprehensive patient summary according to your agent instructions'
        }],
        stream: false
      })
    });
    
    const summaryData = summaryResponse.data || summaryResponse;
    const summary = summaryData.message?.content || summaryData.content || 'No summary generated';
    
    console.log(`🤖 [AUTO PS] Patient summary generated (${summary.length} characters)`);
    
    // Step 9: Save patient summary to user document
    console.log(`🤖 [AUTO PS] Saving patient summary to user document`);
    userDoc.patientSummary = {
      content: summary,
      createdAt: new Date().toISOString(),
      kbUsed: kbName,
      kbId: kbId,
      fileUsed: fileName,
      tokens: totalTokens
    };
    userDoc.updatedAt = new Date().toISOString();
    await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
    
    // Step 10: Rebuild agent template to update status icons
    console.log(`🤖 [AUTO PS] Rebuilding agent template for ${userId}`);
    await buildAgentManagementTemplate(userId);
    
    console.log(`🤖 [AUTO PS] ✅ Automation complete for ${userId}`);
    
    res.json({
      success: true,
      message: 'KB created and patient summary generated successfully',
      kbId: kbId,
      kbName: kbName,
      summary: summary,
      tokens: totalTokens,
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000)
    });
    
  } catch (error) {
    console.error(`🤖 [AUTO PS] ❌ Error:`, error);
    res.status(500).json({
      success: false,
      message: `Automation failed: ${error.message}`
    });
  }
});

// Re-index specific knowledge base by name
app.post('/api/reindex-specific-kb', async (req, res) => {
  try {
    const { kbName } = req.body;
    
    if (!kbName) {
      return res.status(400).json({
        success: false,
        message: 'Knowledge base name is required'
      });
    }
    
//     console.log(`🔄 RE-INDEXING SPECIFIC KB: Looking for "${kbName}"...`);
    
    // Get all knowledge bases
    const kbResponse = await doRequest('/v2/gen-ai/knowledge_bases');
    const kbList = kbResponse.knowledge_bases || [];
    
    // Find the specific KB by name
    const targetKB = kbList.find(kb => kb.name === kbName);
    
    if (!targetKB) {
      return res.status(404).json({
        success: false,
        message: `Knowledge base "${kbName}" not found`
      });
    }
    
//     console.log(`✅ Found target KB: ${targetKB.name} (${targetKB.uuid})`);
    // console.log(`📅 Created: ${targetKB.created_at}`);
//     console.log(`📊 Current indexing status: ${targetKB.last_indexing_job?.status || 'No indexing job'}`);
    
    // Get the knowledge base details to find data sources
//     console.log(`🔍 Fetching detailed info for KB: ${targetKB.uuid}`);
    const kbDetailsResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${targetKB.uuid}`);
    const kbDetails = kbDetailsResponse.data || kbDetailsResponse;
    
//     console.log(`🔍 KB details response keys:`, Object.keys(kbDetails || {}));
    
    // Extract the knowledge base data from the nested structure
    const kbData = kbDetails.knowledge_base || kbDetails;
//     console.log(`🔍 KB data keys:`, Object.keys(kbData || {}));
    
    // Check if we have data source information from the last indexing job
    if (kbData.last_indexing_job && kbData.last_indexing_job.data_source_jobs && kbData.last_indexing_job.data_source_jobs.length > 0) {
//       console.log(`✅ Found data source info from last indexing job`);
      const dataSourceJob = kbData.last_indexing_job.data_source_jobs[0];
//       console.log(`📊 Data source UUID: ${dataSourceJob.data_source_uuid}`);
//       console.log(`📊 Files indexed: ${dataSourceJob.indexed_file_count}/${dataSourceJob.total_file_count}`);
//       console.log(`📊 Bytes indexed: ${dataSourceJob.total_bytes_indexed}/${dataSourceJob.total_bytes}`);
      
      // Use the data source UUID from the last indexing job
      const dataSourceUuid = dataSourceJob.data_source_uuid;
      
      // Create indexing job using DigitalOcean API
      const indexingJobData = {
        data_source_uuid: dataSourceUuid
      };
      
//       console.log(`🚀 Creating re-indexing job for KB: ${targetKB.name}`);
      const startTime = Date.now();
      
      const indexingJobResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${targetKB.uuid}/indexing_jobs`, {
        method: 'POST',
        body: JSON.stringify(indexingJobData)
      });
      
      const indexingJob = indexingJobResponse.data || indexingJobResponse;
      const jobCreationTime = Date.now();
      
//       console.log(`✅ Re-indexing job created successfully!`);
//       console.log(`📊 Job UUID: ${indexingJob.uuid}`);
//       console.log(`📊 Job Status: ${indexingJob.status}`);
//       console.log(`📊 Created At: ${indexingJob.created_at}`);
//       console.log(`⏱️ Job creation took: ${jobCreationTime - startTime}ms`);
      
      // Now check the status immediately
//       console.log(`🔍 Checking initial indexing job status...`);
      const jobStatusResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${targetKB.uuid}/data_sources/${dataSourceUuid}/indexing_jobs/${indexingJob.uuid}`);
      const jobStatus = jobStatusResponse.data || jobStatusResponse;
      
//       console.log(`📊 Initial Job Status: ${jobStatus.status}`);
//       console.log(`📊 Tokens Processed: ${jobStatus.tokens_processed || 0}`);
//       console.log(`📊 Progress: ${jobStatus.progress || 'N/A'}`);
      
      res.json({
        success: true,
        message: `Re-indexing job started successfully for "${kbName}"`,
        knowledgeBase: {
          name: targetKB.name,
          uuid: targetKB.uuid,
          created_at: targetKB.created_at
        },
        indexingJob: {
          uuid: indexingJob.uuid,
          status: indexingJob.status,
          created_at: indexingJob.created_at
        },
        currentStatus: {
          status: jobStatus.status,
          tokens_processed: jobStatus.tokens_processed || 0,
          progress: jobStatus.progress || 'N/A'
        },
        timing: {
          job_creation_ms: jobCreationTime - startTime,
          start_time: new Date(startTime).toISOString()
        }
      });
      
    } else {
//       console.log(`❌ No data source information found in KB details`);
      return res.status(400).json({
        success: false,
        message: 'No data source information found for this knowledge base',
        kbDetails: kbDetails
      });
    }
    
//     console.log(`📊 Found data source: ${dataSource.spaces_data_source.uuid}`);
//     console.log(`📁 Bucket: ${dataSource.spaces_data_source.bucket_name}, Path: ${dataSource.spaces_data_source.item_path}`);
    
    // Create indexing job using DigitalOcean API
    const indexingJobData = {
      data_source_uuid: dataSource.spaces_data_source.uuid
    };
    
//     console.log(`🚀 Creating re-indexing job for KB: ${targetKB.name}`);
    const startTime = Date.now();
    
    const indexingJobResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${targetKB.uuid}/indexing_jobs`, {
      method: 'POST',
      body: JSON.stringify(indexingJobData)
    });
    
    const indexingJob = indexingJobResponse.data || indexingJobResponse;
    const jobCreationTime = Date.now();
    
//     console.log(`✅ Re-indexing job created successfully!`);
//     console.log(`📊 Job UUID: ${indexingJob.uuid}`);
//     console.log(`📊 Job Status: ${indexingJob.status}`);
//     console.log(`📊 Created At: ${indexingJob.created_at}`);
//     console.log(`⏱️ Job creation took: ${jobCreationTime - startTime}ms`);
    
    // Now check the status immediately
//     console.log(`🔍 Checking initial indexing job status...`);
    const jobStatusResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${targetKB.uuid}/data_sources/${dataSource.spaces_data_source.uuid}/indexing_jobs/${indexingJob.uuid}`);
    const jobStatus = jobStatusResponse.data || jobStatusResponse;
    
//     console.log(`📊 Initial Job Status: ${jobStatus.status}`);
//     console.log(`📊 Tokens Processed: ${jobStatus.tokens_processed || 0}`);
//     console.log(`📊 Progress: ${jobStatus.progress || 'N/A'}`);
    
    res.json({
      success: true,
      message: `Re-indexing job started successfully for "${kbName}"`,
      knowledgeBase: {
        name: targetKB.name,
        uuid: targetKB.uuid,
        created_at: targetKB.created_at
      },
      indexingJob: {
        uuid: indexingJob.uuid,
        status: indexingJob.status,
        created_at: indexingJob.created_at
      },
      currentStatus: {
        status: jobStatus.status,
        tokens_processed: jobStatus.tokens_processed || 0,
        progress: jobStatus.progress || 'N/A'
      },
      timing: {
        job_creation_ms: jobCreationTime - startTime,
        start_time: new Date(startTime).toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Re-index specific KB error:', error);
    res.status(500).json({ 
      success: false,
      message: `Failed to re-index specific KB: ${error.message}` 
    });
  }
});

// Test endpoint: Create KB from wed271 folder and monitor indexing
app.post('/api/test-large-file-indexing', async (req, res) => {
  try {
    // console.log(`🧪 TEST: Creating KB from wed271 folder with large file...`);
    
    // Create a unique KB name with timestamp
    const timestamp = Date.now();
    const cleanName = `test-large-file-${timestamp}`;
    
    // Ensure the name is valid for DigitalOcean API
    const validName = cleanName.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
    
//     console.log(`📚 Creating knowledge base: ${validName}`);
    
    // Get available embedding models first
    let embeddingModelId = null;
    
    try {
      const modelsResponse = await doRequest('/v2/gen-ai/models');
      const models = modelsResponse.models || modelsResponse.data?.models || [];
      
      // Find embedding models that can be used for knowledge bases
      const embeddingModels = models.filter(model => 
        model.name && (
          model.name.toLowerCase().includes('embedding') ||
          model.name.toLowerCase().includes('gte') ||
          model.name.toLowerCase().includes('mini') ||
          model.name.toLowerCase().includes('mpnet')
        )
      );
      
      if (embeddingModels.length > 0) {
        // Prefer GTE Large as it's a high-quality embedding model
        const preferredModel = embeddingModels.find(model => 
          model.name.toLowerCase().includes('gte large')
        ) || embeddingModels[0];
        
        embeddingModelId = preferredModel.uuid;
//         console.log(`📚 Using embedding model: ${preferredModel.name} (${embeddingModelId})`);
      } else {
//         console.log(`⚠️ No embedding models found, proceeding without specific embedding model`);
      }
    } catch (modelError) {
//       console.log(`⚠️ Failed to get models, proceeding without specific embedding model`);
    }
    
    const kbData = {
      name: validName,
      description: `${validName} - Test KB with large file from wed271 folder`,
      project_id: '90179b7c-8a42-4a71-a036-b4c2bea2fe59',
      database_id: '881761c6-e72d-4f35-a48e-b320cd1f46e4',
      region: "tor1",
      datasources: [
        {
          "spaces_data_source": {
            "bucket_name": "maia",
            "item_path": "wed271/",
            "region": "tor1"
          }
        }
      ]
    };

    if (embeddingModelId) {
      kbData.embedding_model_uuid = embeddingModelId;
    }

//     console.log(`🚀 Creating knowledge base with data source: wed271/`);
    const startTime = Date.now();
    
    const knowledgeBase = await doRequest('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(kbData)
    });

    const kbId = knowledgeBase.knowledge_base?.uuid || knowledgeBase.data?.uuid || knowledgeBase.uuid;
    const kbCreationTime = Date.now();
    
//     console.log(`✅ Created knowledge base: ${validName} (${kbId})`);
//     console.log(`⏱️ KB creation took: ${kbCreationTime - startTime}ms`);
    
    // Now start monitoring the indexing progress
//     console.log(`🔍 Starting indexing progress monitor...`);
    
    // Start monitoring in background
    monitorIndexingProgress(kbId, validName, startTime, baseUrl);
    
    res.json({
      success: true,
      message: `Test KB created successfully. Monitoring indexing progress...`,
      knowledgeBase: {
        name: validName,
        uuid: kbId,
        created_at: knowledgeBase.data?.created_at || knowledgeBase.created_at
      },
      timing: {
        kb_creation_ms: kbCreationTime - startTime,
        start_time: new Date(startTime).toISOString()
      },
      note: "Indexing progress will be logged to console. Check server logs for updates."
    });
    
  } catch (error) {
    console.error('❌ Test large file indexing error:', error);
    res.status(500).json({ 
      success: false,
      message: `Failed to create test KB: ${error.message}` 
    });
  }
});

// Helper function to monitor indexing progress
async function monitorIndexingProgress(kbId, kbName, startTime, baseUrl = 'http://localhost:3001') {
  let checkCount = 0;
  const maxChecks = 60; // Monitor for up to 60 minutes
  
  const monitorInterval = setInterval(async () => {
    try {
      checkCount++;
      const currentTime = Date.now();
      const elapsedMinutes = Math.round((currentTime - startTime) / 60000 * 100) / 100;
      
//       console.log(`\n📊 [${checkCount}] Checking indexing status for ${kbName} (${elapsedMinutes} minutes elapsed)...`);
      
      // Get the knowledge base details to find data sources
      const kbResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
      const kbData = kbResponse.data || kbResponse;
      
      if (kbData.knowledge_base) {
        const kb = kbData.knowledge_base;
        
        if (kb.last_indexing_job) {
          const job = kb.last_indexing_job;
//           console.log(`📊 Indexing Job Status: ${job.status}`);
//           console.log(`📊 Phase: ${job.phase}`);
//           console.log(`📊 Tokens: ${job.tokens || 'N/A'}`);
//           console.log(`📊 Progress: ${job.progress || 'N/A'}`);
          
          if (job.status === 'INDEX_JOB_STATUS_COMPLETED') {
            const totalTime = Math.round((currentTime - startTime) / 1000);
            const durationMinutes = Math.round(totalTime / 60);
            
            console.log(`\n🎉 [ADMIN NOTIFICATION] [*] INDEXING COMPLETED!`);
            console.log(`📊 [ADMIN NOTIFICATION] [*] Total time: ${totalTime} seconds (${durationMinutes} minutes)`);
            console.log(`📊 [ADMIN NOTIFICATION] [*] Final tokens: ${job.tokens || 'N/A'}`);
            console.log(`📊 [ADMIN NOTIFICATION] [*] Job UUID: ${job.uuid}`);
            
            // Send polling notification to admin clients
            try {
              const updateData = {
                    kbId: kbId,
                    kbName: kbName,
                    duration: totalTime,
                    durationMinutes: durationMinutes,
                    tokens: job.tokens || null,
                    jobUuid: job.uuid,
                    message: `Knowledge base ${kbName} indexing completed in ${totalTime} seconds`
              };
              
              addUpdateToAllAdmins('kb_indexing_completed', updateData);
              console.log(`📡 [POLLING] [*] Added KB indexing completion notification to admin sessions`);
            } catch (pollingError) {
              console.error(`❌ [POLLING] [*] Error adding KB indexing notification:`, pollingError.message);
            }
            
            clearInterval(monitorInterval);
            return;
          }
        } else {
//           console.log(`📊 No indexing job found yet...`);
        }
      }
      
      // Stop monitoring after max checks or if taking too long
      if (checkCount >= maxChecks) {
        // console.log(`\n⏰ Monitoring stopped after ${maxChecks} checks (${elapsedMinutes} minutes)`);
        clearInterval(monitorInterval);
        return;
      }
      
    } catch (error) {
      console.error(`❌ Error checking indexing status:`, error);
      checkCount++;
      
      if (checkCount >= maxChecks) {
        // console.log(`\n⏰ Monitoring stopped due to errors after ${checkCount} checks`);
        clearInterval(monitorInterval);
        return;
      }
    }
  }, 30000); // Check every 30 seconds
  
  // Also check immediately
  setTimeout(async () => {
    try {
//       console.log(`\n📊 [IMMEDIATE] Checking initial indexing status for ${kbName}...`);
      
      const kbResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
      const kbData = kbResponse.data || kbResponse;
      
      if (kbData.knowledge_base && kbData.knowledge_base.last_indexing_job) {
        const job = kbData.knowledge_base.last_indexing_job;
//         console.log(`📊 Initial Indexing Job Status: ${job.status}`);
//         console.log(`📊 Initial Phase: ${job.phase}`);
//         console.log(`📊 Initial Tokens: ${job.tokens || 'N/A'}`);
      } else {
//         console.log(`📊 No initial indexing job found yet...`);
      }
    } catch (error) {
      console.error(`❌ Error checking initial status:`, error);
    }
  }, 5000); // Check after 5 seconds
}

// Associate knowledge base with agent


// In-memory storage for agent-KB associations (since DigitalOcean API doesn't provide this)
const agentKnowledgeBaseAssociations = new Map();

// Get agent's associated knowledge bases
app.get('/api/agents/:agentId/knowledge-bases', async (req, res) => {
  try {
    const { agentId } = req.params;
    
//     console.log(`🔍 Fetching knowledge bases for agent: ${agentId}`);
    
    // Get agent details including associated knowledge bases
    const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentResponse.data || agentResponse;
    
    // Extract knowledge bases from agent data
    const knowledgeBases = agentData.knowledge_bases || [];
    
//     console.log(`📚 Found ${knowledgeBases.length} knowledge bases for agent ${agentId}`);
    
    res.json({
      knowledge_bases: knowledgeBases
    });
  } catch (error) {
    console.error('❌ Get agent knowledge bases error:', error);
    res.status(500).json({ message: `Failed to get agent knowledge bases: ${error.message}` });
  }
});



// Detach knowledge base from agent
app.delete('/api/agents/:agentId/knowledge-bases/:kbId', async (req, res) => {
  try {
    const { agentId, kbId } = req.params;
    
//     console.log(`🔗 [DO API] Detaching KB ${kbId} from agent ${agentId}`);

    // Note: Detachment is allowed without authentication as it's a safe operation
    // that follows the principle of least privilege - removing access is secure

    // Use the correct DigitalOcean API endpoint for detach
    const result = await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${kbId}`, {
      method: 'DELETE'
    });

//     console.log(`✅ [DO API] Detach response:`, JSON.stringify(result, null, 2));
    
    // Wait a moment for the API to process
    // console.log(`⏳ [VERIFICATION] Waiting 2 seconds for API to process detachment...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the detachment by getting the agent details
    // console.log(`🔍 [VERIFICATION] Verifying detachment for agent ${agentId}`);
    const agentDetails = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
    const attachedKBs = agentData.knowledge_bases || [];
    
//     console.log(`📚 [VERIFICATION] Agent has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid));
    
    const isStillAttached = attachedKBs.some(kb => kb.uuid === kbId);
    if (isStillAttached) {
      // console.log(`❌ [VERIFICATION] KB ${kbId} is still attached to agent ${agentId}`);
      res.json({
        success: false,
        message: 'Failed to detach knowledge base - it is still attached',
        result: { agent: agentData },
        verification: {
          attached: true,
          knowledgeBases: attachedKBs
        }
      });
    } else {
      // console.log(`✅ [VERIFICATION] KB ${kbId} successfully detached from agent ${agentId}`);
      
      // Rebuild agent management template for the user who owns this agent
      const userId = await getUserFromAgentId(agentId);
      if (userId) {
        try {
          await buildAgentManagementTemplate(userId);
          console.log(`[TEMPLATE] ✅ Rebuilt template for ${userId} after KB detachment`);
        } catch (templateError) {
          console.warn(`[TEMPLATE] Failed to rebuild template for ${userId}:`, templateError.message);
        }
      }
      
      res.json({
        success: true,
        message: 'Knowledge base detached successfully',
        result: { agent: agentData },
        verification: {
          attached: false,
          knowledgeBases: attachedKBs
        }
      });
    }
  } catch (error) {
    console.error('❌ Detach KB error:', error);
    res.status(500).json({ message: `Failed to detach knowledge base: ${error.message}` });
  }
});

// Manual sync of agent's current knowledge base (for when API doesn't provide this)
app.post('/api/sync-agent-kb', async (req, res) => {
  try {
    const { agentId, kbId, kbName } = req.body;
    
    if (!agentId || !kbId || !kbName) {
      return res.status(400).json({ message: 'agentId, kbId, and kbName are required' });
    }
    
    // Get the knowledge base details
    const kbResponse = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}`);
    const kbData = kbResponse.data || kbResponse;
    
    // Extract the actual KB data from the response
    const actualKbData = kbData.knowledge_base || kbData;
    
    // Store the association locally
    agentKnowledgeBaseAssociations.set(agentId, actualKbData);
    
//     console.log(`🔄 Manually synced KB ${kbName} (${kbId}) with agent ${agentId}`);
    
    res.json({ 
      success: true, 
      message: `Knowledge base ${kbName} synced with agent`,
      knowledgeBase: kbData
    });
  } catch (error) {
    console.error('❌ Sync agent KB error:', error);
    res.status(500).json({ message: `Failed to sync agent KB: ${error.message}` });
  }
});

// Setup MAIA environment (create agent + KB + associate)
app.post('/api/setup-maia', async (req, res) => {
  try {
    const { patientId = 'demo_patient_001' } = req.body;
    
    // Create knowledge base
    const kbData = {
      name: `MAIA Knowledge Base - ${patientId}`,
      description: `Health records and medical data for ${patientId}`
    };
    
    const knowledgeBase = await doRequest('/v2/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(kbData)
    });

    // Create agent
    const agentData = {
      name: `MAIA Agent - ${patientId}`,
      description: 'Personal AI agent for healthcare assistance',
      model: 'gpt-4o-mini',
      instructions: `You are a medical AI assistant for the patient. 
You have access to their health records and can provide personalized medical guidance.
Always maintain patient privacy and provide evidence-based recommendations.
If you're unsure about medical advice, recommend consulting with a healthcare provider.`,
      tools: []
    };

    const agent = await doRequest('/v2/agents', {
      method: 'POST',
      body: JSON.stringify(agentData)
    });

    // Associate knowledge base with agent
    await doRequest(`/v2/agents/${agent.data.id}/knowledge_bases/${knowledgeBase.data.id}`, {
      method: 'POST'
    });

//     console.log(`🚀 Setup MAIA environment for ${patientId}`);
    res.json({
      agent: agent.data,
      knowledgeBase: knowledgeBase.data
    });
  } catch (error) {
    console.error('❌ Setup MAIA error:', error);
    res.status(500).json({ message: `Failed to setup MAIA environment: ${error.message}` });
  }
});

// =============================================================================
// PASSKEY AUTHENTICATION ROUTES
// =============================================================================

// Import passkey routes
import passkeyRoutes, { setCouchDBClient as setPasskeyCouchDBClient, setCacheFunctions as setPasskeyCacheFunctions } from './src/routes/passkey-routes.js';

// Pass the CouchDB client to the passkey routes
setPasskeyCouchDBClient(couchDBClient);

// Mount passkey routes with session creation middleware
app.use('/api/passkey', sessionMiddleware.createSessionOnAuth, passkeyRoutes);

// Add KB protection check middleware
app.use('/api/connect-kb/:kbId', async (req, res, next) => {
  try {
    const { kbId } = req.params;
    
    // Check if KB is protected
    const protectionDoc = await couchDBClient.getDocument('maia_knowledge_bases', kbId);
    
    if (protectionDoc && protectionDoc.isProtected) {
      // KB is protected - require authentication
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          requiresAuth: true,
          kbName: protectionDoc.kbName
        });
      }
      
      // Check if user is the owner
      if (protectionDoc.owner !== userId) {
        return res.status(403).json({ 
          error: 'Access denied. You are not the owner of this knowledge base.',
          requiresAuth: true,
          kbName: protectionDoc.kbName
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error checking KB protection:', error);
    next();
  }
});

// =============================================================================
// KNOWLEDGE BASE PROTECTION ROUTES
// =============================================================================

// Import KB protection routes
import kbProtectionRoutes, { setCouchDBClient } from './src/routes/kb-protection-routes.js';

// Import admin routes
import adminRoutes, { setCouchDBClient as setAdminCouchDBClient } from './src/routes/admin-routes.js';
import adminManagementRoutes, { setCouchDBClient as setAdminManagementCouchDBClient, setSessionManager, updateUserActivity, checkAgentDeployments, addToDeploymentTracking, setDoRequestFunction, setCacheFunctions as setAdminCacheFunctions } from './src/routes/admin-management-routes.js';

// Unified cache system using CacheManager
// The cacheManager is imported from './src/utils/CacheManager.js'
// Legacy cache functions for backward compatibility
const isCacheValid = (cacheType, key = null) => cacheManager.isCacheValid(cacheType, key);
const setCache = (cacheType, key, data) => cacheManager.setCached(cacheType, key, data);
const getCache = (cacheType, key = null) => cacheManager.getCached(cacheType, key);

const invalidateCache = (cacheType, key = null) => {
  cacheManager.invalidateCache(cacheType, key);
};

// Reload chat cache from database
const reloadChatCache = async () => {
  try {
    const allChats = await couchDBClient.getAllChats();
    setCache('chats', null, allChats);
    console.log(`🔄 [CACHE] Reloaded ${allChats.length} saved chats into cache`);
  } catch (error) {
    console.error('❌ [CACHE] Failed to reload chat cache:', error.message);
  }
};

// MAIA2 routes removed - using consolidated maia_users database

// Pass the CouchDB client to the routes
setCouchDBClient(couchDBClient);

// Pass cache functions to routes that need them
const setCacheFunctions = (routeModule) => {
  if (routeModule.setCacheFunctions) {
    routeModule.setCacheFunctions({ isCacheValid, setCache, getCache, invalidateCache });
  }
};

// Set cache functions for passkey routes
setPasskeyCacheFunctions({ isCacheValid, setCache, getCache, invalidateCache });

// Set cache functions and DigitalOcean API function for admin-management routes
setAdminCacheFunctions({ isCacheValid, setCache, getCache, invalidateCache });
setDoRequestFunction(doRequest);

setAdminCouchDBClient(couchDBClient);
setAdminManagementCouchDBClient(couchDBClient);

// Pass the shared session manager to admin routes
setSessionManager(sessionManager);

// Mount KB protection routes
app.use('/api/kb-protection', kbProtectionRoutes);


// Mount admin routes
app.use('/api/admin', adminRoutes);

// Mount admin-management routes
app.use('/api/admin-management', adminManagementRoutes);

// =============================================================================
// DATABASE CLEANUP ENDPOINT
// =============================================================================

// Cleanup endpoint to replace maia_users with clean data
app.post('/api/cleanup-database', async (req, res) => {
  try {
    // console.log('🧹 Starting database cleanup via API...');
    
    // Essential users to keep
    const essentialUsers = [
      {
        _id: 'Unknown User',
        type: 'user',
        createdAt: new Date().toISOString()
      },
      {
        _id: 'admin',
        type: 'admin',
        isAdmin: true,
        createdAt: new Date().toISOString()
      },
      {
        _id: 'wed271',
        type: 'user',
        displayName: 'wed271',
        createdAt: new Date().toISOString(),
        credentialID: 'test-credential-id-wed271',
        approvalStatus: 'approved'
      },
      {
        _id: 'fri95',
        type: 'user', 
        displayName: 'fri95',
        createdAt: new Date().toISOString(),
        credentialID: 'test-credential-id-fri95',
        approvalStatus: 'pending'
      }
    ];
    
    // Get all current documents
    const allDocs = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
//     console.log(`📊 Current documents: ${allDocs.length}`);
    
    // Delete all current documents
//     console.log('🗑️  Deleting all current documents...');
    for (const doc of allDocs) {
      try {
        await couchDBClient.deleteDocument('maia_users', doc._id, doc._rev);
//         console.log(`  ✅ Deleted: ${doc._id}`);
      } catch (error) {
//         console.log(`  ⚠️  Error deleting ${doc._id}: ${error.message}`);
      }
    }
    
    // Insert essential users
    // console.log('📤 Inserting essential users...');
    for (const user of essentialUsers) {
      try {
        await cacheManager.saveDocument(couchDBClient, 'maia_users', user);
//         console.log(`  ✅ Inserted: ${user._id}`);
      } catch (error) {
//         console.log(`  ❌ Error inserting ${user._id}: ${error.message}`);
      }
    }
    
    // Verify cleanup
    const finalDocs = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
//     console.log(`✅ Cleanup complete! Final count: ${finalDocs.length} documents`);
    
    res.json({ 
      success: true, 
      message: 'Database cleanup completed',
      beforeCount: allDocs.length,
      afterCount: finalDocs.length,
      essentialUsers: essentialUsers.map(u => u._id)
    });
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Cleanup failed', 
      details: error.message 
    });
  }
});

// Fix agent ownership endpoint
app.post('/api/fix-agent-ownership', async (req, res) => {
  try {
//     console.log('🔧 Starting agent ownership fix via API...');
    
    // Define the correct agent ownership relationships
    const agentOwnership = {
      'Unknown User': {
        assignedAgentId: '059fc237-7077-11f0-b056-36d958d30bcf', // agent-08032025 UUID
        assignedAgentName: 'agent-08032025',
        ownedAgents: [
          { id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4', name: 'agent-05102025', assignedAt: new Date().toISOString() },
          { id: '059fc237-7077-11f0-b056-36d958d30bcf', name: 'agent-08032025', assignedAt: new Date().toISOString() }
        ]
      },
      'wed271': {
        assignedAgentId: '2960ae8d-8514-11f0-b074-4e013e2ddde4', // agent-08292025 UUID
        assignedAgentName: 'agent-08292025',
        ownedAgents: [
          { id: '2960ae8d-8514-11f0-b074-4e013e2ddde4', name: 'agent-08292025', assignedAt: new Date().toISOString() }
        ]
      }
    };
    
    const results = [];
    
    for (const [userId, agentData] of Object.entries(agentOwnership)) {
//       console.log(`📝 Updating ${userId}...`);
      
      try {
        // Get current user document
        let userDoc;
        try {
          userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
        } catch (error) {
          if (error.statusCode === 404) {
//             console.log(`  ❌ User ${userId} not found, skipping...`);
            results.push({ userId, status: 'not_found' });
            continue;
          }
          throw error;
        }
        
        // Update with agent ownership data
        const updatedUserDoc = {
          ...userDoc,
          assignedAgentId: agentData.assignedAgentId,
          assignedAgentName: agentData.assignedAgentName,
          ownedAgents: agentData.ownedAgents,
          agentAssignedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save updated document
        await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
//         console.log(`  ✅ Updated ${userId} with agent ownership`);
        results.push({ userId, status: 'updated', agents: agentData.ownedAgents.map(a => a.name) });
        
      } catch (error) {
//         console.log(`  ❌ Error updating ${userId}: ${error.message}`);
        results.push({ userId, status: 'error', error: error.message });
      }
    }
    
//     console.log('✅ Agent ownership fix completed!');
    
    res.json({ 
      success: true, 
      message: 'Agent ownership fix completed',
      results
    });
    
  } catch (error) {
    console.error('❌ Agent ownership fix failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Agent ownership fix failed', 
      details: error.message 
    });
  }
});

// Examine user documents endpoint
app.get('/api/examine-users', async (req, res) => {
  try {
//     console.log('🔍 Examining fri951 and wed271 user documents...');
    
    // Get fri951 user document
    const fri951Doc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'fri951');
    
    // Get wed271 user document
    const wed271Doc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'wed271');
    
    // Compare the documents
    const comparison = {
      fri951: fri951Doc,
      wed271: wed271Doc,
      differences: {},
      analysis: {}
    };
    
    // Get all unique keys from both documents
    const allKeys = new Set([...Object.keys(fri951Doc), ...Object.keys(wed271Doc)]);
    
    for (const key of allKeys) {
      const fri951Value = fri951Doc[key];
      const wed271Value = wed271Doc[key];
      
      if (JSON.stringify(fri951Value) !== JSON.stringify(wed271Value)) {
        comparison.differences[key] = {
          fri951: fri951Value,
          wed271: wed271Value
        };
      }
    }
    
    // Special analysis for credential data
    comparison.analysis = {
      fri951_credentialID: {
        type: typeof fri951Doc.credentialID,
        value: fri951Doc.credentialID,
        length: fri951Doc.credentialID ? fri951Doc.credentialID.length : 'N/A',
        isValidBase64: fri951Doc.credentialID ? /^[A-Za-z0-9_-]+$/.test(fri951Doc.credentialID) : false
      },
      wed271_credentialID: {
        type: typeof wed271Doc.credentialID,
        value: wed271Doc.credentialID,
        length: wed271Doc.credentialID ? wed271Doc.credentialID.length : 'N/A',
        isValidBase64: wed271Doc.credentialID ? /^[A-Za-z0-9_-]+$/.test(wed271Doc.credentialID) : false
      }
    };
    
    res.json(comparison);
    
  } catch (error) {
    console.error('❌ Error examining users:', error);
    res.status(500).json({ error: 'Failed to examine users' });
  }
});

// Simple GET endpoint to fix agent ownership
app.get('/api/fix-agent-ownership', async (req, res) => {
  try {
//     console.log('🔧 Starting agent ownership fix via GET...');
    
    // Define the correct agent ownership relationships
    const agentOwnership = {
      'Unknown User': {
        assignedAgentId: '059fc237-7077-11f0-b056-36d958d30bcf', // agent-08032025 UUID
        assignedAgentName: 'agent-08032025',
        ownedAgents: [
          { id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4', name: 'agent-05102025', assignedAt: new Date().toISOString() },
          { id: '059fc237-7077-11f0-b056-36d958d30bcf', name: 'agent-08032025', assignedAt: new Date().toISOString() }
        ]
      },
      'wed271': {
        assignedAgentId: '2960ae8d-8514-11f0-b074-4e013e2ddde4', // agent-08292025 UUID
        assignedAgentName: 'agent-08292025',
        ownedAgents: [
          { id: '2960ae8d-8514-11f0-b074-4e013e2ddde4', name: 'agent-08292025', assignedAt: new Date().toISOString() }
        ]
      }
    };
    
    const results = [];
    
    for (const [userId, agentData] of Object.entries(agentOwnership)) {
//       console.log(`📝 Updating ${userId}...`);
      
      try {
        // Get current user document
        let userDoc;
        try {
          userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', userId);
        } catch (error) {
          if (error.statusCode === 404) {
//             console.log(`  ❌ User ${userId} not found, skipping...`);
            results.push({ userId, status: 'not_found' });
            continue;
          }
          throw error;
        }
        
        // Update with agent ownership data
        const updatedUserDoc = {
          ...userDoc,
          assignedAgentId: agentData.assignedAgentId,
          assignedAgentName: agentData.assignedAgentName,
          ownedAgents: agentData.ownedAgents,
          agentAssignedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save updated document
        await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUserDoc);
//         console.log(`  ✅ Updated ${userId} with agent ownership`);
        results.push({ userId, status: 'updated', agents: agentData.ownedAgents.map(a => a.name) });
        
      } catch (error) {
//         console.log(`  ❌ Error updating ${userId}: ${error.message}`);
        results.push({ userId, status: 'error', error: error.message });
      }
    }
    
//     console.log('✅ Agent ownership fix completed!');
    
    res.json({ 
      success: true, 
      message: 'Agent ownership fix completed',
      results
    });
    
  } catch (error) {
    console.error('❌ Agent ownership fix failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Agent ownership fix failed', 
      details: error.message 
    });
  }
});

// MAIA2 routes removed - using consolidated maia_users database

// =============================================================================
// DEEP LINK USER MANAGEMENT
// =============================================================================

// Save deep link user information
app.post('/api/deep-link-users', async (req, res) => {
  try {
    const { name, email, shareId, accessTime, userAgent, ipAddress, isDeepLinkUser } = req.body;
    
    if (!name || !email || !shareId) {
      return res.status(400).json({ 
        error: 'Name, email, and shareId are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // console.log(`🔍 [Deep Link] Checking for existing user with name: ${name}`);

    // Check if a user with this name already exists
    const existingUsers = await couchDBClient.findDocuments('maia_users', {
      selector: {
        displayName: name,
        isDeepLinkUser: true
      }
    });

    if (existingUsers.docs && existingUsers.docs.length > 0) {
      const existingUser = existingUsers.docs[0];
      // console.log(`🔍 [Deep Link] Found existing user: ${existingUser.displayName} with email: ${existingUser.email}`);
      
      // Check if emails match
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        // console.log(`✅ [Deep Link] Email matches existing user, continuing with existing user`);
        
        // Update the existing user's access time and shareId
        const updatedUser = {
          ...existingUser,
          shareId,
          accessTime: accessTime || new Date().toISOString(),
          userAgent: userAgent || req.get('User-Agent'),
          ipAddress: ipAddress || req.ip || 'unknown',
          updatedAt: new Date().toISOString()
        };
        
        await cacheManager.saveDocument(couchDBClient, 'maia_users', updatedUser);
        
        return res.json({
          success: true,
          message: 'Using existing user account',
          userId: existingUser.userId,
          user: {
            name: existingUser.displayName,
            email: existingUser.email,
            shareId
          },
          isExistingUser: true
        });
      } else {
        // console.log(`⚠️ [Deep Link] Email mismatch - existing: ${existingUser.email}, new: ${email}`);
        
        // Return both emails for user choice
        return res.json({
          success: false,
          requiresEmailChoice: true,
          message: 'A user with this name already exists with a different email address',
          existingUser: {
            name: existingUser.displayName,
            email: existingUser.email,
            userId: existingUser.userId
          },
          newUser: {
            name,
            email
          }
        });
      }
    }

    // No existing user found, create new one
    // console.log(`🆕 [Deep Link] No existing user found, creating new user: ${name}`);

    // Create unique user ID for deep link users
    const userId = `deep_link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create user document
    const userDoc = {
      _id: userId,
      userId,
      displayName: name,
      email,
      shareId,
      accessTime,
      userAgent: userAgent || req.get('User-Agent'),
      ipAddress: ipAddress || req.ip || 'unknown',
      isDeepLinkUser: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'deep_link',
      environment: process.env.NODE_ENV || 'development'
    };

    // Save to maia_users database
    await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
    
//     console.log(`✅ Deep link user saved: ${name} (${email}) for share ${shareId}`);
    
    res.json({
      success: true,
      message: 'User information saved successfully',
      userId,
      user: {
        name,
        email,
        shareId
      },
      isExistingUser: false
    });

  } catch (error) {
    console.error('❌ Error saving deep link user:', error);
    res.status(500).json({ 
      error: 'Failed to save user information',
      details: error.message 
    });
  }
});

// Handle user email choice when there's a mismatch
app.post('/api/deep-link-users/choose-email', async (req, res) => {
  try {
    const { choice, existingUserId, newEmail, shareId, accessTime, userAgent, ipAddress } = req.body;
    
    if (!choice || !existingUserId || !shareId) {
      return res.status(400).json({ 
        error: 'Choice, existingUserId, and shareId are required' 
      });
    }

    // console.log(`🔍 [Deep Link] User chose: ${choice} for existing user: ${existingUserId}`);

    // Get the existing user
    const existingUser = await cacheManager.getDocument(couchDBClient, 'maia_users', existingUserId);
    
    if (!existingUser) {
      return res.status(404).json({ 
        error: 'Existing user not found' 
      });
    }

    let finalUser = existingUser;
    let message = 'Using existing user account';

    if (choice === 'new') {
      // User chose to use the new email - update the existing user
      // console.log(`🔄 [Deep Link] Updating existing user email from ${existingUser.email} to ${newEmail}`);
      
      finalUser = {
        ...existingUser,
        email: newEmail,
        shareId,
        accessTime: accessTime || new Date().toISOString(),
        userAgent: userAgent || req.get('User-Agent'),
        ipAddress: ipAddress || req.ip || 'unknown',
        updatedAt: new Date().toISOString()
      };
      
      await cacheManager.saveDocument(couchDBClient, 'maia_users', finalUser);
      message = 'Updated existing user with new email address';
    } else if (choice === 'existing') {
      // User chose to use the existing email - just update access info
      // console.log(`✅ [Deep Link] Using existing user email: ${existingUser.email}`);
      
      finalUser = {
        ...existingUser,
        shareId,
        accessTime: accessTime || new Date().toISOString(),
        userAgent: userAgent || req.get('User-Agent'),
        ipAddress: ipAddress || req.ip || 'unknown',
        updatedAt: new Date().toISOString()
      };
      
      await cacheManager.saveDocument(couchDBClient, 'maia_users', finalUser);
      message = 'Using existing user account';
    } else {
      return res.status(400).json({ 
        error: 'Invalid choice. Must be "existing" or "new"' 
      });
    }

    // console.log(`✅ [Deep Link] Email choice processed: ${message}`);
    
    res.json({
      success: true,
      message,
      userId: finalUser.userId,
      user: {
        name: finalUser.displayName,
        email: finalUser.email,
        shareId
      },
      isExistingUser: true
    });

  } catch (error) {
    console.error('❌ Error processing email choice:', error);
    res.status(500).json({ 
      error: 'Failed to process email choice',
      details: error.message 
    });
  }
});

// Get deep link user by share ID
app.get('/api/deep-link-users/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    // Get all users and filter by share ID
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    const deepLinkUsers = allUsers.filter(user => 
      user.isDeepLinkUser && user.shareId === shareId
    );
    
    if (deepLinkUsers.length === 0) {
      return res.status(404).json({ 
        error: 'No deep link users found for this share ID' 
      });
    }
    
    // Return user info without sensitive data
    const userInfo = deepLinkUsers.map(user => ({
      userId: user.userId,
      name: user.displayName,
      email: user.email,
      accessTime: user.accessTime,
      createdAt: user.createdAt
    }));
    
    res.json({
      success: true,
      users: userInfo
    });

  } catch (error) {
    console.error('❌ Error fetching deep link users:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user information',
      details: error.message 
    });
  }
});

// =============================================================================
// CATCH-ALL ROUTE FOR SPA
// =============================================================================

// Catch-all route for SPA
app.get('*', (req, res) => {
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  res.render('index.ejs', {
    CLOUDANT_DASHBOARD_URL: cloudantUrl
  });
});

// Add tooltip test route
app.get('/tooltip-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'tooltip-test.html'));
});

// Add Vue tooltip test route
app.get('/vue-tooltip-test', (req, res) => {
  const cloudantUrl = process.env.CLOUDANT_DASHBOARD || '#';
  res.render('index.ejs', {
    CLOUDANT_DASHBOARD_URL: cloudantUrl
  });
});

// Refresh users cache with bucket status (throttled)
async function refreshUsersListCacheThrottled() {
  try {
    console.log('🔄 [CACHE] Refreshing users cache with bucket status...');
    
    // Fetch all users from database
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    
    // Filter out non-user documents
    const filteredUsers = allUsers.filter(user => {
      // Handle database corruption: restore _id from userId if missing
      if (!user._id && user.userId) {
        user._id = user.userId;
      }
      
      const userId = user._id || user.userId;
      
      if (!userId) return false;
      if (userId.startsWith('_design/')) return false;
      if (userId === 'maia_config') return false;
      if (userId === 'Public User') return true;
      if (userId.startsWith('deep_link_')) return true;
      if (user.isAdmin) return false;
      return true;
    });
    
    // Fetch bucket status for each user and cache individually (throttled)
    for (let i = 0; i < filteredUsers.length; i++) {
      const user = filteredUsers[i];
      
      // Call bucket status function directly (not via HTTP)
      const bucketData = await getBucketStatusForUser(user._id);
      
      const bucketStatus = {
        hasFolder: bucketData.hasFolder || false,
        fileCount: bucketData.fileCount || 0,
        totalSize: bucketData.totalSize || 0
      };
      
      const userWithBucket = {
        ...user,
        bucketStatus: bucketStatus
      };
      
      // Cache INDIVIDUAL user entry (single source of truth)
      setCache('users', user._id, userWithBucket);
      
      // Throttle between users
      if (i < filteredUsers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ [CACHE] Refreshed ${filteredUsers.length} individual user entries with bucket status`);
  } catch (error) {
    console.error('❌ [CACHE] Failed to refresh users cache:', error.message);
  }
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
//   console.log(`🚀 MAIA Secure Server running on port ${PORT}`);
//   console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  // console.log(`👤 Single Patient Mode: ${process.env.SINGLE_PATIENT_MODE === 'true' ? 'Enabled' : 'Disabled'}`);
//       console.log(`🔗 Health check: ${process.env.ORIGIN || `http://localhost:${PORT}`}/health`);
//   console.log(`🔧 CODE VERSION: Updated AgentManagementDialog.vue with workflow fixes and console cleanup`);
  // console.log(`📅 Server started at: ${new Date().toISOString()}`);
  
  // Helper function to ensure bucket folders for all users
  async function ensureAllUserBuckets() {
    
    // Get all user IDs from database
    const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
    
    // Filter users (same logic as admin-management-routes.js)
    const filteredUsers = allUsers.filter(user => {
      // Exclude design documents
      if (user._id.startsWith('_design/')) {
        return false;
      }
      // Exclude configuration documents (not real users)
      if (user._id === 'maia_config') {
        return false;
      }
      // Always include these specific users regardless of admin status
      if (user._id === 'Public User' || user._id === 'wed271') {
        return true;
      }
      // Always include deep link users
      if (user._id.startsWith('deep-')) {
        return true;
      }
      // For all other users, exclude admin users
      const isAdmin = user.isAdmin;
      return !isAdmin;
    });
    
    // Process users with full data (same logic as admin-management-routes.js)
    const processedUsers = await Promise.all(filteredUsers.map(async user => {
      // Extract current agent information from ownedAgents if available
      let assignedAgentId = user.assignedAgentId || null;
      let assignedAgentName = user.assignedAgentName || null;
      
      // If we have ownedAgents but no assignedAgentId, use the first owned agent
      if (user.ownedAgents && user.ownedAgents.length > 0 && !assignedAgentId) {
        const firstAgent = user.ownedAgents[0];
        assignedAgentId = firstAgent.id;
        assignedAgentName = firstAgent.name;
      }
      
      // Check if passkey is valid
      const hasValidPasskey = !!(user.credentialID && 
        user.credentialPublicKey && 
        user.counter !== undefined);
      
      // Get bucket status for the user
      let bucketStatus = {
        hasFolder: false,
        fileCount: 0,
        totalSize: 0
      };
      
      // Check bucket status during startup (server is now fully ready)
      try {
        const bucketUrl = `http://localhost:${PORT}/api/bucket/user-status/${user._id}`;
        const bucketResponse = await fetch(bucketUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (bucketResponse.ok) {
          const bucketData = await bucketResponse.json();
          bucketStatus = {
            hasFolder: bucketData.hasFolder || false,
            fileCount: bucketData.fileCount || 0,
            totalSize: bucketData.totalSize || 0
          };
        }
      } catch (bucketError) {
        // Use default values if bucket check fails
      }
      
      // Determine workflow stage using the same logic as admin-management-routes.js
      let workflowStage = 'unknown';
      
      // Primary source of truth: stored workflowStage field
      if (user.workflowStage) {
        workflowStage = user.workflowStage;
      } else {
        // Fallback for legacy users without workflowStage field
        // Check if user has a passkey (look for credentialID field)
        if (!user.credentialID) {
          workflowStage = 'no_passkey';
        } else if (!user.approvalStatus && !user.email) {
          workflowStage = 'no_request_yet';
        } else if (!user.approvalStatus) {
          workflowStage = 'awaiting_approval';
        } else if (user.approvalStatus === 'pending') {
          workflowStage = 'awaiting_approval';
        } else if (user.approvalStatus === 'rejected') {
          workflowStage = 'rejected';
        } else if (user.approvalStatus === 'suspended') {
          workflowStage = 'suspended';
        } else if (user.approvalStatus === 'approved') {
          workflowStage = 'approved';
        }
      }
      
      return {
        userId: user._id,
        displayName: user.displayName || user._id,
        createdAt: user.createdAt,
        hasPasskey: !!user.credentialID,
        hasValidPasskey: hasValidPasskey,
        workflowStage: workflowStage,
        assignedAgentId: assignedAgentId,
        assignedAgentName: assignedAgentName,
        email: user.email || null,
        agentApiKey: user.agentApiKey || null,
        bucketStatus: bucketStatus
      };
    }));
    
    // Cache the processed users (not raw database documents)
    await cacheManager.cacheUsers(processedUsers);
    console.log(`✅ [STARTUP] Cached ${processedUsers.length} processed users for Admin2`);
    
    // Pre-cache agents for Admin2
    try {
      const agentsResponse = await doRequest('/v2/gen-ai/agents');
      const rawAgents = agentsResponse.agents || agentsResponse.data?.agents || [];
      
      // Transform agents to match frontend expectations (same as /api/admin-management/agents endpoint)
      const transformedAgents = rawAgents.map((agent) => {
        return {
          id: agent.id,
          name: agent.name,
          status: agent.status || 'unknown',
          model: agent.model || 'unknown',
          createdAt: agent.created_at,
          updatedAt: agent.updated_at,
          knowledgeBases: agent.knowledge_bases || [], // Use knowledge_bases from DO API
          endpoint: null,
          description: null
        };
      });
      
      await cacheManager.cacheAgents(transformedAgents);
    } catch (error) {
      console.warn('⚠️ [STARTUP] Failed to pre-cache agents:', error.message);
    }
    
    
    const userIds = allUsers.map(user => user.userId || user._id);
    const bucketChecks = [];
    
    for (const userId of userIds) {
      // Include all users - deep link users also need bucket folders
      bucketChecks.push(ensureUserBucket(userId));
    }
    
    try {
      await Promise.all(bucketChecks);
      // Bucket checks completed - no logging needed
    } catch (error) {
      console.error('❌ [STARTUP] Error ensuring user buckets:', error);
    }
  }

  // Helper function to ensure bucket folder for a specific user
  async function ensureUserBucket(userId) {
    try {
      // Check if bucket exists first
      const bucketUrl = process.env.DIGITALOCEAN_BUCKET;
      if (!bucketUrl) {
        console.log(`⚠️ [STARTUP] DIGITALOCEAN_BUCKET not configured, skipping bucket operations for ${userId}`);
        return;
      }

      // Skip HTTP requests during startup to avoid ECONNREFUSED errors
      // Bucket status checks will happen on-demand when users access the admin panel
        // Skip bucket status check during startup - no logging needed
    } catch (error) {
      console.error(`❌ [STARTUP] Error ensuring bucket for ${userId}:`, error);
    }
  }
  
  // UserStateManager removed - using direct database calls instead
    
    // Database consistency check - verify Public User document exists and is valid
    try {
      const publicUserDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', 'Public User');
      if (publicUserDoc) {
        console.log(`✅ [Database] Consistency check passed - Public User document valid`);
      } else {
        console.log(`⚠️ [Database] Consistency check warning - Public User document not found`);
      }
    } catch (error) {
      console.log(`❌ [Database] Consistency check failed: ${error.message}`);
    }
    
    // Initialize admin alert system
    initializeAlertSystem(cacheManager, couchDBClient, addUpdateToAllAdmins);
    console.log(`✅ [STARTUP] Admin alert system initialized`);
    
    // Server ready for requests
    console.log(`✅ [STARTUP] Server ready for authentication requests`);
    
    // Load saved chats into cache at startup
    try {
      const allChats = await couchDBClient.getAllChats();
      setCache('chats', null, allChats);
      console.log(`📚 [STARTUP] Loaded ${allChats.length} saved chats into cache`);
    } catch (error) {
      console.error('❌ [STARTUP] Failed to load saved chats into cache:', error.message);
    }
    
    // REMOVED: Old bucket/cache initialization - replaced by new individual cache code below
    // await ensureAllUserBuckets();
    
    // Session logs database will be created on first use (no need to read at startup)
    
    // Initialize users cache with bucket status during startup (throttled, safe)
    console.log(`🔄 [STARTUP] Initializing users cache with bucket status...`);
    try {
      // Fetch all users from database
      const allUsers = await cacheManager.getAllDocuments(couchDBClient, 'maia_users');
      console.log(`📊 [STARTUP] Fetched ${allUsers.length} total documents from maia_users`);
      
      // Filter out non-user documents
      const filteredUsers = allUsers.filter(user => {
        // Handle database corruption: restore _id from userId if missing
        if (!user._id && user.userId) {
          user._id = user.userId;
        }
        
        const userId = user._id || user.userId;
        
        if (!userId) {
          console.log(`  ❌ Excluding (no userId): ${JSON.stringify(user)}`);
          return false;
        }
        if (userId.startsWith('_design/')) return false;
        if (userId === 'maia_config') return false;
        if (userId === 'Public User') return true;
        if (userId.startsWith('deep_link_')) return true;
        if (user.isAdmin) return false;
        return true;
      });
      
      // Fetch bucket status for each user and cache individually (throttled to avoid rate limits)
      for (let i = 0; i < filteredUsers.length; i++) {
        const user = filteredUsers[i];
        
        // Step 1: Clean up temporary files and ensure archived/ folder exists
        await cleanupUserBucket(user._id);
        
        // Step 2: Reconcile files in user document with actual bucket contents
        await reconcileUserFiles(user._id);
        
        // Step 3: Fetch bucket status and cache the user
        const bucketData = await getBucketStatusForUser(user._id);
        
        const bucketStatus = {
          hasFolder: bucketData.hasFolder || false,
          fileCount: bucketData.fileCount || 0,
          totalSize: bucketData.totalSize || 0
        };
        
        // Get fresh user doc after reconciliation
        const freshUser = await cacheManager.getDocument(couchDBClient, 'maia_users', user._id) || user;
        
        // Store user with bucket status
        const userWithBucket = {
          ...freshUser,
          bucketStatus: bucketStatus
        };
        
        // Cache INDIVIDUAL user entry (not 'all' array - single source of truth!)
        setCache('users', user._id, userWithBucket);
        
        // Throttle: 100ms delay between users to avoid overwhelming the system
        if (i < filteredUsers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✅ [STARTUP] Cached ${filteredUsers.length} individual user entries`);
    } catch (error) {
      console.error(`❌ [STARTUP] CRITICAL: Failed to initialize users cache:`, error.message);
      console.error(`❌ [STARTUP] Server will not start - cache initialization is required`);
      process.exit(1);
    }
    
    // Pre-cache agents for Admin2
    try {
      const agentsResponse = await doRequest('/v2/gen-ai/agents');
      const rawAgents = agentsResponse.agents || agentsResponse.data?.agents || [];
      
      // Transform agents to match frontend expectations (same as /api/admin-management/agents endpoint)
      const transformedAgents = rawAgents.map((agent) => {
        return {
          id: agent.id,
          name: agent.name,
          status: agent.status || 'unknown',
          model: agent.model || 'unknown',
          createdAt: agent.created_at,
          updatedAt: agent.updated_at,
          knowledgeBases: agent.knowledge_bases || [], // Use knowledge_bases from DO API
          endpoint: null,
          description: null
        };
      });
      
      await cacheManager.cacheAgents(transformedAgents);
      
      // Create new maia_agents database and populate with DO API data
      try {
        await couchDBClient.createDatabase('maia_agents');
      } catch (createError) {
        // Database already exists or other error - continue silently
      }
      
      // Populate maia_agents with DO API data using agent name as _id
      for (const agent of rawAgents) {
        try {
          const agentDoc = {
            _id: agent.name, // Use agent name as _id since they're unique
            agentId: agent.id,
            agentName: agent.name,
            status: agent.status || 'unknown',
            model: agent.model || 'unknown',
            createdAt: agent.created_at || new Date().toISOString(),
            updatedAt: agent.updated_at || new Date().toISOString(),
            knowledgeBases: agent.knowledge_bases || [], // Array of attached KB IDs
            // Add all other fields from DO API
            ...agent
          };
          
          // Try to save the document
          await couchDBClient.saveDocument('maia_agents', agentDoc);
          
        } catch (saveError) {
          if (saveError.message.includes('conflict')) {
            // Document already exists, update it
            try {
              const existingDoc = await couchDBClient.getDocument('maia_agents', agent.name);
              const updatedDoc = {
                ...existingDoc,
                agentId: agent.id,
                agentName: agent.name,
                status: agent.status || 'unknown',
                model: agent.model || 'unknown',
                updatedAt: agent.updated_at || new Date().toISOString(),
                knowledgeBases: agent.knowledge_bases || [],
                // Update with latest DO API data
                ...agent
              };
              await couchDBClient.saveDocument('maia_agents', updatedDoc);
            } catch (updateError) {
              // Silent update failure
            }
          }
        }
      }
      
      // Cleanup: Remove agents that exist in Cloudant but not in DO API
      try {
        // Get all documents directly from CouchDB to ensure we only get existing ones
        const allDocsResponse = await couchDBClient.db.use('maia_agents').list();
        const doAgentNames = new Set(rawAgents.map(agent => agent.name));
        
        // Find agents in database that are NOT in DO API
        const agentsToDelete = allDocsResponse.rows.filter(doc => {
          // Skip invalid documents
          if (!doc.id || doc.id === 'undefined') {
            return false;
          }
          // Check if this agent exists in DO API
          return !doAgentNames.has(doc.id);
        });
        
        if (agentsToDelete.length > 0) {
          for (const agentToDelete of agentsToDelete) {
            try {
              await couchDBClient.deleteDocument('maia_agents', agentToDelete.id);
              console.log(`🟡 [STARTUP] Deleted agent: ${agentToDelete.id}`);
            } catch (deleteError) {
              // Silent delete failure
            }
          }
        }
      } catch (cleanupError) {
        console.warn('⚠️ [STARTUP] Failed to cleanup agents:', cleanupError.message);
      }
      
      console.log(`✅ [STARTUP] Loaded ${rawAgents.length} agents to maia_agents and cacheManager`);
      
    } catch (error) {
      console.warn('⚠️ [STARTUP] Failed to pre-cache agents:', error.message);
    }
    
    // Pre-cache knowledge bases for Admin2 - sync with DigitalOcean API source of truth
    try {
      // 1. Get knowledge bases from DigitalOcean API (source of truth)
      const doResponse = await doRequest('/v2/gen-ai/knowledge_bases?page=1&per_page=1000');
      const doKBs = (doResponse.knowledge_bases || doResponse.data?.knowledge_bases || doResponse.data || []);
      
      // 1.5. Create new maia_kb database and populate with DO API data
      try {
        await couchDBClient.createDatabase('maia_kb');
      } catch (createError) {
        // Database already exists or other error - continue silently
      }
      
      // Populate maia_kb with DO API data using kbName as _id
      for (const doKB of doKBs) {
        try {
          const kbDoc = {
            _id: doKB.name, // Use kbName as _id since they're unique and start with user names
            kbId: doKB.uuid,
            kbName: doKB.name,
            description: doKB.description || 'No description',
            status: doKB.status || 'unknown',
            createdAt: doKB.created_at || new Date().toISOString(),
            updatedAt: doKB.updated_at || new Date().toISOString(),
            // Add all other fields from DO API
            ...doKB
          };
          
          // Try to save the document
          await couchDBClient.saveDocument('maia_kb', kbDoc);
          
        } catch (saveError) {
          if (saveError.message.includes('conflict')) {
            // Document already exists, update it
            try {
              const existingDoc = await couchDBClient.getDocument('maia_kb', doKB.name);
              const updatedDoc = {
                ...existingDoc,
                kbId: doKB.uuid,
                kbName: doKB.name,
                description: doKB.description || 'No description',
                status: doKB.status || 'unknown',
                updatedAt: doKB.updated_at || new Date().toISOString(),
                // Update with latest DO API data
                ...doKB
              };
              await couchDBClient.saveDocument('maia_kb', updatedDoc);
            } catch (updateError) {
              // Silent update failure
            }
          }
        }
      }
      
      
      // Cleanup: Remove knowledge bases that exist in Cloudant but not in DO API
      try {
        // Get all documents directly from CouchDB to ensure we only get existing ones
        const allDocsResponse = await couchDBClient.db.use('maia_kb').list();
        const doKBNames = new Set(doKBs.map(kb => kb.name));
        
        // Find KBs in database that are NOT in DO API
        const kbsToDelete = allDocsResponse.rows.filter(doc => {
          // Skip invalid documents
          if (!doc.id || doc.id === 'undefined') {
            return false;
          }
          // Check if this KB exists in DO API
          return !doKBNames.has(doc.id);
        });
        
        if (kbsToDelete.length > 0) {
          for (const kbToDelete of kbsToDelete) {
            try {
              await couchDBClient.deleteDocument('maia_kb', kbToDelete.id);
              console.log(`🟡 [STARTUP] Deleted knowledge base: ${kbToDelete.id}`);
            } catch (deleteError) {
              // Silent delete failure
            }
          }
        }
      } catch (cleanupError) {
        console.warn('⚠️ [STARTUP] Failed to cleanup knowledge bases:', cleanupError.message);
      }
      
      // Continue with existing logic...
      
      // 2. Get existing protection metadata from local database
      const existingKBs = await cacheManager.getAllDocuments(couchDBClient, 'maia_knowledge_bases');
      
      const existingKBsMap = {};
      for (const doc of existingKBs) {
        if (doc.kbId || doc.id || doc._id) {
          existingKBsMap[doc.kbId || doc.id || doc._id] = doc;
        } else {
          console.log(`⚠️ [STARTUP] Skipping document with missing ID fields: _id=${doc._id}, kbId=${doc.kbId}, id=${doc.id}`);
        }
      }
      
      // 3. Check for inconsistencies and update database
      const doKBIds = new Set(doKBs.map(kb => kb.uuid));
      const existingKBIds = new Set(Object.keys(existingKBsMap));
      
      // Find KBs that exist in local DB but not in DO (deleted from DO)
      const deletedKBIds = [...existingKBIds].filter(id => !doKBIds.has(id));
      // Find KBs that exist in DO but not in local DB (new KBs created via DO dashboard)
      const newKBIds = [...doKBIds].filter(id => !existingKBIds.has(id));
      
      let dbUpdated = false;
      
      // Remove deleted KBs from local database
      if (deletedKBIds.length > 0) {
        for (const kbId of deletedKBIds) {
          try {
            await couchDBClient.deleteDocument('maia_knowledge_bases', existingKBsMap[kbId]._id);
            dbUpdated = true;
          } catch (deleteError) {
            // Silent delete failure
          }
        }
      }
      
      // Add new KBs to local database (with default protection settings)
      if (newKBIds.length > 0) {
        for (const kbId of newKBIds) {
          const doKB = doKBs.find(kb => kb.uuid === kbId);
          if (doKB) {
            try {
              const protectionDoc = {
                _id: `kb_${kbId}`,
                kbId: kbId,
                kbName: doKB.name,
                owner: null, // Will be set when user attaches KB to their agent
                isProtected: false, // Default to public
                createdAt: doKB.created_at || new Date().toISOString()
              };
              await couchDBClient.saveDocument('maia_knowledge_bases', protectionDoc);
              existingKBsMap[kbId] = protectionDoc;
              dbUpdated = true;
            } catch (saveError) {
              console.warn(`⚠️ [STARTUP] Failed to add new KB ${kbId}:`, saveError.message);
            }
          }
        }
      }
      
      if (dbUpdated) {
      }
      
      // 4. Merge DO KBs with protection info for caching
      const transformedKBs = doKBs.map(kb => {
        const protection = existingKBsMap[kb.uuid] || {};
        return {
          id: kb.uuid,
          name: kb.name,
          description: kb.description || 'No description',
          isProtected: !!protection.isProtected,
          owner: protection.owner || null,
          createdAt: kb.created_at || kb.createdAt
        };
      });
      
      await cacheManager.cacheKnowledgeBases(transformedKBs);
      
      console.log(`✅ [STARTUP] Loaded ${doKBs.length} knowledge bases to maia_kb and cacheManager`);
      
    } catch (error) {
      console.error('❌ [STARTUP] Failed to sync knowledge bases with DigitalOcean API:', error.message);
      console.error('❌ [STARTUP] Full error:', error);
      
      // Fallback to local database if DO API fails
      try {
        const allKBs = await cacheManager.getAllDocuments(couchDBClient, 'maia_knowledge_bases');
        const transformedKBs = allKBs.map(doc => ({
          id: doc.kbId || doc._id,
          name: doc.kbName || doc.name,
          description: doc.description || 'No description',
          isProtected: !!doc.isProtected,
          owner: doc.owner || null,
          createdAt: doc.createdAt || doc.timestamp
        })).filter(kb => !kb.id.startsWith('_design/'));
        
        await cacheManager.cacheKnowledgeBases(transformedKBs);
        console.log(`✅ [STARTUP] Loaded ${transformedKBs.length} knowledge bases from database (fallback) and cached for Admin2`);
      } catch (fallbackError) {
        console.warn('⚠️ [STARTUP] Failed to load knowledge bases from database (fallback):', fallbackError.message);
      }
    }
    
    // Pre-cache models for Admin2
    try {
      console.log('🔄 [STARTUP] Fetching models from DigitalOcean API...');
      const modelsResponse = await doRequest('/v2/gen-ai/models');
      const models = modelsResponse.models || modelsResponse.data?.models || [];
      await cacheManager.cacheModels(models);
      console.log(`✅ [STARTUP] Cached ${models.length} models for Admin2`);
    } catch (error) {
      console.warn('⚠️ [STARTUP] Failed to pre-cache models:', error.message);
    }
    
    // Deployment monitoring will be started automatically when agents are created
    // No need to start it on server startup since it only runs when there are active deployments
  
// Start cleanup job for expired deep links
  setInterval(async () => {
    try {
      const cleanedCount = await sessionManager.cleanupExpiredDeepLinks();
      if (cleanedCount > 0) {
        // console.log(`🧹 Cleaned up ${cleanedCount} expired deep links`);
      }
    } catch (error) {
      console.error('❌ Error in deep link cleanup job:', error);
    }
  }, 60 * 60 * 1000); // Run every hour
}); 

// Test endpoint for knowledge base creation debugging
app.post('/api/test-create-kb', async (req, res) => {
  try {
    // console.log('🧪 TEST ENDPOINT: Creating knowledge base for debugging');
    
    // Determine the base URL dynamically from the request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
    const baseUrl = `${protocol}://${host}`;
    
    // List all environment variables we need
    const envVars = {
      DIGITALOCEAN_TOKEN: process.env.DIGITALOCEAN_TOKEN ? 'Present' : 'Missing',
      DIGITALOCEAN_GENAI_ENDPOINT: process.env.DIGITALOCEAN_GENAI_ENDPOINT || 'Missing',
      DIGITALOCEAN_PROJECT_ID: process.env.DIGITALOCEAN_PROJECT_ID || 'Missing',
      DIGITALOCEAN_BASE_URL: process.env.DIGITALOCEAN_BASE_URL || 'Missing',
      DIGITALOCEAN_BUCKET: process.env.DIGITALOCEAN_BUCKET || 'Missing',
      DIGITALOCEAN_ENDPOINT_URL: process.env.DIGITALOCEAN_ENDPOINT_URL || 'Missing',
      DIGITALOCEAN_AWS_ACCESS_KEY_ID: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID ? 'Present' : 'Missing',
      DIGITALOCEAN_AWS_SECRET_ACCESS_KEY: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY ? 'Present' : 'Missing'
    };
    
//     console.log('🔍 Environment Variables Status:', envVars);
    
    // Get the models to find the embedding model ID using the same approach as working code
    let embeddingModelId = null;
    let modelsResponse = null;
    
    try {
      modelsResponse = await doRequest('/v2/gen-ai/models');
//       console.log(`🔍 Models response structure:`, Object.keys(modelsResponse));
      const models = modelsResponse.models || modelsResponse.data?.models || [];
//       console.log(`🔍 Found ${models.length} models`);
      
      // Find embedding models that can be used for knowledge bases
      // These are typically text embedding models
      const embeddingModels = models.filter(model => 
        model.name && (
          model.name.toLowerCase().includes('embedding') ||
          model.name.toLowerCase().includes('gte') ||
          model.name.toLowerCase().includes('mini') ||
          model.name.toLowerCase().includes('mpnet')
        )
      );
      
      if (embeddingModels.length > 0) {
        // Prefer GTE Large as it's a high-quality embedding model
        const preferredModel = embeddingModels.find(model => 
          model.name.toLowerCase().includes('gte large')
        ) || embeddingModels[0];
        
        embeddingModelId = preferredModel.uuid;
//         console.log(`📚 Using embedding model: ${preferredModel.name} (${embeddingModelId})`);
//         console.log(`🔍 embeddingModelId after assignment: ${embeddingModelId}`);
      } else {
//         console.log(`⚠️ No embedding models found, proceeding without specific embedding model`);
      }
    } catch (modelError) {
//       console.log(`⚠️ Failed to get models, proceeding without specific embedding model`);
    }
    
    // Get project ID from existing agents
    let projectId = null;
    try {
      const agentsResponse = await doRequest('/v2/gen-ai/agents');
      const agents = agentsResponse.agents || agentsResponse.data?.agents || [];
//       console.log(`🔍 Found ${agents.length} existing agents`);
      
      if (agents.length > 0) {
        projectId = agents[0].project_id;
//         console.log(`🔍 Using project ID from existing agent: ${projectId}`);
      }
    } catch (agentError) {
//       console.log(`⚠️ Failed to get agents, using default project ID`);
      projectId = '90179b7c-8a42-4a71-a036-b4c2bea2fe59';
    }
    
    // Get database UUID from environment or use default
    let databaseUuid = null;
    try {
      const databasesResponse = await doRequest('/v2/gen-ai/databases');
      const databases = databasesResponse.databases || databasesResponse.data?.databases || [];

      
      // Find genai-driftwood database
      const driftwoodDb = databases.find(db => 
        db.name && db.name.toLowerCase().includes('genai-driftwood')
      );
      
      if (driftwoodDb) {
        databaseUuid = driftwoodDb.uuid;
//         console.log(`📊 Found genai-driftwood database: ${driftwoodDb.name} (${databaseUuid})`);
      } else {
//         console.log(`⚠️ genai-driftwood database not found, using default`);
        databaseUuid = '881761c6-e72d-4f35-a48e-b320cd1f46e4';
      }
    } catch (dbError) {
//       console.log(`⚠️ Failed to get databases, using default database UUID`);
      databaseUuid = '881761c6-e72d-4f35-a48e-b320cd1f46e4';
    }
    
    // Test knowledge base creation with correct data source structure
    // Based on DigitalOcean API docs: spaces_data_source with bucket_name, item_path, and region
    // Use dynamic KB name with username prefix for better organization
    const username = "wed271"; // In production, this would come from the authenticated user
    const kbName = `${username}-kb1`;
    
    const testKbData = {
      name: kbName,
      description: `${kbName} description`,
      project_id: projectId,
      database_id: databaseUuid,
      region: "tor1",
      datasources: [
        {
          "spaces_data_source": {
            "bucket_name": "maia",
            "item_path": `${username}/`,
            "region": "tor1"
          }
        }
      ]
    };
    
    // Add embedding model if found
    if (embeddingModelId) {
      testKbData.embedding_model_uuid = embeddingModelId;
    }
    
//     console.log('📚 Creating knowledge base:', testKbData.name, 'with embedding model:', embeddingModelId || 'default');
    
    // Use the same approach as working code
    const knowledgeBase = await doRequest('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(testKbData)
    });
    
//     console.log('✅ Knowledge base created successfully:', knowledgeBase);
    
    res.json({
      success: true,
      message: 'Test knowledge base created successfully',
      data: knowledgeBase,
      environment: envVars,
      models: modelsResponse ? (modelsResponse.models?.length || modelsResponse.data?.models?.length || 0) : 0,
      embeddingModel: embeddingModelId ? 'Found' : 'Default',
      projectId,
      databaseUuid,
      username,
      kbName
    });
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message,
      stack: error.stack
    });
  }
}); 