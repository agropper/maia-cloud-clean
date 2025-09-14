import dotenv from 'dotenv'
dotenv.config()

console.log('🚨 SERVER.JS IS LOADING - LINE 3');

// Import session management utilities
import { SessionManager } from './src/utils/session-manager.js';
import { SessionMiddleware } from './src/middleware/session-middleware.js';
import UserStateManagerClass from './src/utils/UserStateManager.js';

// Create singleton instance
const UserStateManager = new UserStateManagerClass();

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Unified Cloudant/CouchDB setup
import { createCouchDBClient } from './src/utils/couchdb-client.js';
import maia2Client from './src/utils/maia2-client.js';

const couchDBClient = createCouchDBClient();

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

// Initialize MAIA2 client
const initializeMAIA2 = async () => {
  try {
    await maia2Client.initialize();
//     console.log('✅ MAIA2 Client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize MAIA2 Client:', error);
  }
};

initializeMAIA2();



// Security middleware - Safari-compatible configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"], // Safari compatibility
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
console.log('[*] [Session] Using default memory session store (maia_sessions disabled)');

// Memory cache to track session creation events
const sessionEventCache = new Map();
const writtenSessions = new Set(); // Track which sessions have been written to database
console.log('[*] [Session] Memory cache initialized for session event tracking');

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
    
    // Debug message for relevant session events only
    console.log('[*] [Session Event] Captured authenticated event:', {
      eventKey,
      sessionId,
      userId,
      route,
      method,
      timestamp,
      hasSessionData: !!req.session,
      sessionKeys: req.session ? Object.keys(req.session) : []
    });
    
    // Log cache size
    console.log('[*] [Session Event] Cache size:', sessionEventCache.size);
    
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
  console.log('[*] [Session Event] Retrieved', events.length, 'events from cache');
  
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
});

// Stricter rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 uploads per windowMs
  message: 'Too many file uploads from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);
app.use('/api/parse-pdf', uploadLimiter);

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

// Admin panel route - PROTECTED
app.get('/admin', (req, res) => {
//   console.log('🔓 TEMPORARY: Admin access granted without authentication for testing');
  
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

// Admin registration route - no authentication required (this is how admins initially register)
app.get('/admin/register', (req, res) => {
  const appTitle = process.env.APP_TITLE || 'MAIA';
  const environment = process.env.NODE_ENV || 'development';
  
  res.render('index.ejs', {
    APP_TITLE: appTitle,
    ENVIRONMENT: environment,
    APP_VERSION: process.env.APP_VERSION || '1.0.0'
  });
});

// Serve static files with cache busting
app.use(express.static(path.join(__dirname, 'dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

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
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
    console.error('❌ [DEBUG] Error testing sessions:', error);
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
    sessionId: req.sessionID,
    hasSession: !!req.session,
    sessionKeys: req.session ? Object.keys(req.session) : 'no session',
    cookies: req.headers.cookie || 'no cookies',
    userAgent: req.headers['user-agent']?.substring(0, 50)
  });

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
    
    // Convert to markdown format
    const markdown = convertPdfToMarkdown(data);
    
    console.log(`📄 PDF parsed: ${data.numpages} pages, ${data.text.length} characters`);
    
    res.json({
      success: true,
      markdown,
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
    
    console.log(`📄 Temp RTF path: ${tempRtfPath}`);
    console.log(`📄 Cleaned RTF path: ${cleanedRtfPath}`);
    console.log(`📄 Output MD path: ${outputMdPath}`);
    
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
      console.log(`📄 Cleaner stdout:`, result.stdout);
      if (result.stderr) // console.log(`⚠️ Cleaner stderr:`, result.stderr);
      
      // Check if cleaned file exists and has content
      if (fs.existsSync(cleanedRtfPath)) {
        const cleanedContent = fs.readFileSync(cleanedRtfPath, 'utf8');
        console.log(`📄 Cleaned RTF file size: ${cleanedContent.length} characters`);
        console.log(`📄 Cleaned RTF first 200 chars: ${cleanedContent.substring(0, 200)}`);
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
      console.log(`📄 Converter stdout:`, result.stdout);
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

    console.log(`📤 Uploading file to DigitalOcean Spaces bucket: ${fileName} (${content.length} chars)`);
    
    // Generate a unique key for the file in the bucket
    const timestamp = Date.now();
    const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const bucketKey = `${cleanName}`;
    
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
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
    console.error('❌ Error uploading file to bucket:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to upload file to bucket: ${error.message}`,
      error: 'UPLOAD_FAILED'
    });
  }
});

// Upload file to DigitalOcean Spaces bucket with user folder support
app.post('/api/upload-to-bucket', async (req, res) => {
  try {
    const { fileName, content, fileType, userFolder } = req.body;
    
    if (!fileName || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'File name and content are required',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    console.log(`📤 Uploading file to DigitalOcean Spaces bucket: ${fileName} (${content.length} chars) to folder: ${userFolder || 'root'}`);
    
    // Generate a unique key for the file in the bucket
    const timestamp = Date.now();
    const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const bucketKey = userFolder ? `${userFolder}${cleanName}` : cleanName;
    
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
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

    const uploadCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: bucketKey,
      Body: content,
      ContentType: fileType || 'text/plain',
      Metadata: {
        'original-filename': fileName,
        'upload-timestamp': timestamp.toString(),
        'user-folder': userFolder || 'root'
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
        uploadedAt: new Date().toISOString(),
        userFolder: userFolder || 'root'
      }
    });
  } catch (error) {
    console.error('❌ Error uploading file to bucket:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to upload file to bucket: ${error.message}`,
      error: 'UPLOAD_FAILED'
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
    console.error('❌ Error listing bucket files:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to list bucket files: ${error.message}`,
      error: 'LIST_FAILED'
    });
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
    console.error('❌ Error ensuring user folder:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to ensure user folder: ${error.message}`,
      error: 'FOLDER_CREATION_FAILED'
    });
  }
});

// Get user-specific bucket status
app.get('/api/bucket/user-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
//     console.log(`📊 Getting bucket status for user: ${userId}`);
    
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
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

    const userFolder = `${userId}/`;
    
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
    
//     console.log(`📊 User ${userId} bucket status: ${fileCount} files, ${totalSize} bytes`);
    
    res.json({
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
    });
    
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
    
    res.json({
      success: true,
      message: 'File deleted successfully',
      deletedKey: key
    });
  } catch (error) {
    console.error('❌ Error deleting file from bucket:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to delete file from bucket: ${error.message}`,
      error: 'DELETE_FAILED'
    });
  }
});

// Personal Chat endpoint (DigitalOcean Agent Platform)
app.post('/api/personal-chat', async (req, res) => {
  const startTime = Date.now();

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

    // Get current user from request body (frontend) or fall back to session
    // Prioritize userId over displayName to ensure deep link users are detected correctly
    let currentUser = req.body.currentUser?.userId || req.body.currentUser?.displayName || req.session?.userId || 'Public User';
    
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
        const deepLinkUserDoc = await couchDBClient.getDocument('maia_users', currentUser);
//         console.log(`🔗 [DEBUG] Step 2 Result:`, deepLinkUserDoc ? {
          userId: deepLinkUserDoc.userId,
          shareId: deepLinkUserDoc.shareId,
          displayName: deepLinkUserDoc.displayName
        } : 'Document not found');
        
        if (deepLinkUserDoc && deepLinkUserDoc.shareId) {
          // console.log(`🔗 [personal-chat] Found shareId for deep link user: ${deepLinkUserDoc.shareId}`);
          // console.log(`🔗 [DEBUG] Step 3: Looking for chat with shareId: ${deepLinkUserDoc.shareId}`);
          
          // Find the chat document with this shareId to get the patient
          const allChats = await couchDBClient.getAllChats();
          // console.log(`🔗 [DEBUG] Step 3a: Found ${allChats.length} total chats`);
          
          const sharedChat = allChats.find(chat => chat.shareId === deepLinkUserDoc.shareId);
//           console.log(`🔗 [DEBUG] Step 3b: Shared chat found:`, sharedChat ? {
            chatId: sharedChat._id,
            shareId: sharedChat.shareId,
            currentUser: sharedChat.currentUser,
            currentUserType: typeof sharedChat.currentUser
          } : 'No chat found with matching shareId');
          
          if (sharedChat && sharedChat.currentUser) {
            const patientUser = typeof sharedChat.currentUser === 'string' 
              ? sharedChat.currentUser 
              : sharedChat.currentUser.userId || sharedChat.currentUser.displayName;
            
            // console.log(`🔗 [personal-chat] Found patient for deep link: ${patientUser}`);
            // console.log(`🔗 [DEBUG] Step 4: Getting assigned agent for patient: ${patientUser}`);
            
            // Get the assigned agent for this patient
            const assignedAgentResponse = await fetch(`http://localhost:3001/api/admin-management/users/${patientUser}/assigned-agent`);
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
                  name: agentData.name,
                  hasDeployment: !!agentData.deployment,
                  deploymentUrl: agentData.deployment?.url,
                  hasKnowledgeBases: !!agentData.knowledge_bases
                } : 'No agent data');
                
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
                    agentModel,
                    agentName,
                    agentId,
                    agentEndpoint,
                    knowledgeBases
                  });
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
          agentModel,
          agentName,
          agentId,
          agentEndpoint,
          knowledgeBases
        });
      }
    }
    
    
    // Skip this for deep link users since we already resolved their patient's agent above
    if (currentUser !== 'Public User' && !currentUser.startsWith('deep_link_')) {
      try {
        const assignedAgentResponse = await fetch(`http://localhost:3001/api/admin-management/users/${currentUser}/assigned-agent`);
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
          const userDoc = await couchDBClient.getDocument('maia_users', currentUser);
          if (userDoc && userDoc.currentAgentId) {
            // Get the agent's deployment URL from DigitalOcean API
            const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.currentAgentId}`);
            const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
            
            if (agentData && agentData.deployment?.url) {
              agentModel = agentData.name;  // Use agent name for DigitalOcean API
              agentName = agentData.name;
              agentId = userDoc.currentAgentId;
              agentEndpoint = `${agentData.deployment.url}/api/v1`;  // Use agent's deployment URL
              // console.log(`🔐 [personal-chat] Using user's current agent selection: ${agentData.name} (${agentModel})`);
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
          const userDoc = await couchDBClient.getDocument('maia_users', 'Public User');
          
          if (userDoc && userDoc.currentAgentId) {
            // Get the agent's deployment URL from DigitalOcean API
            const agentResponse = await doRequest(`/v2/gen-ai/agents/${userDoc.currentAgentId}`);
            const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data;
            
            if (agentData && agentData.deployment?.url) {
              agentModel = agentData.name;  // Use agent name for DigitalOcean API
              agentName = agentData.name;
              agentId = userDoc.currentAgentId;
              agentEndpoint = `${agentData.deployment.url}/api/v1`;  // Use agent's deployment URL
              
              // Get knowledge base info for this agent
              if (agentData.knowledge_bases) {
                knowledgeBases = agentData.knowledge_bases.map(kb => kb.name || kb.uuid);
              }
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
    console.log('  - current length:', newChatHistory.length);
    console.log('  - AI response:', response.choices[0].message);
    
    newChatHistory.push({
      ...response.choices[0].message,
      name: 'Personal AI'
    });
    
//     console.log('🔍 [DEBUG] After adding AI response:');
    console.log('  - new length:', newChatHistory.length);
    console.log('  - last message:', newChatHistory[newChatHistory.length - 1]);

    // Update agent activity
    updateAgentActivity(agentId, currentUser);

    // Invalidate chat cache since we may have modified chat data
    invalidateCache('chats');

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Personal AI error (${responseTime}ms):`, error.message);
    
    // Fallback to mock response on error
    let { chatHistory } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');
    
    const mockResponse = mockAIResponses['personal-chat'](req.body.newValue || '');
    const newChatHistory = [
      ...chatHistory,
      { role: 'assistant', content: mockResponse, name: 'Personal AI (Fallback)' }
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
      length: chatHistory.length,
      sampleMessage: chatHistory[0] ? {
        role: chatHistory[0].role,
        content: chatHistory[0].content,
        hasName: 'name' in chatHistory[0],
        name: chatHistory[0].name,
        allKeys: Object.keys(chatHistory[0])
      } : 'No messages'
    });

    // Debug: Check for empty content messages
    const emptyContentMessages = chatHistory.filter(msg => !msg.content || msg.content.trim() === '');
    if (emptyContentMessages.length > 0) {
//       console.log('⚠️ WARNING: Found messages with empty content:', emptyContentMessages.map((msg, index) => ({
        index,
        role: msg.role,
        content: msg.content,
        allKeys: Object.keys(msg)
      })));
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
      cleanChatHistoryLength: cleanChatHistory.length,
      cleanChatHistorySample: cleanChatHistory[0] ? {
        role: cleanChatHistory[0].role,
        content: cleanChatHistory[0].content,
        allKeys: Object.keys(cleanChatHistory[0])
      } : 'No messages',
      aiUserMessage: aiUserMessage.substring(0, 100) + '...'
    });

    // Debug: Check cleaned messages for empty content
    const emptyCleanedMessages = cleanChatHistory.filter(msg => !msg.content || msg.content.trim() === '');
    if (emptyCleanedMessages.length > 0) {
//       console.log('⚠️ WARNING: Cleaned messages with empty content:', emptyCleanedMessages.map((msg, index) => ({
        index,
        role: msg.role,
        content: msg.content
      })));
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
      length: chatHistory.length,
      sampleMessage: chatHistory[0] ? {
        role: chatHistory[0].role,
        content: chatHistory[0].content,
        hasName: 'name' in chatHistory[0],
        name: chatHistory[0].name,
        allKeys: Object.keys(chatHistory[0])
      } : 'No messages'
    });

    // Debug: Check for empty content messages
    const emptyContentMessages = chatHistory.filter(msg => !msg.content || msg.content.trim() === '');
    if (emptyContentMessages.length > 0) {
//       console.log('⚠️ WARNING: Found messages with empty content:', emptyContentMessages.map((msg, index) => ({
        index,
        role: msg.role,
        content: msg.content,
        allKeys: Object.keys(msg)
      })));
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
    console.log('  - chatHistory length:', chatHistory.length);
    console.log('  - newValue:', newValue);
    console.log('  - uploadedFiles count:', uploadedFiles?.length || 0);
    console.log('  - uploadedFiles details:', uploadedFiles?.map(f => ({
      name: f.name,
      type: f.type,
      contentLength: f.content?.length || 0
    })));

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

    console.log(`💾 Attempting to save group chat with ${chatHistory.length} messages`);

    // Files are already processed by frontend (base64 conversion done there)
    // Just ensure they're properly formatted for storage
    const processedUploadedFiles = (uploadedFiles || []).map(file => {
      if (file.type === 'pdf' && file.originalFile && file.originalFile.base64) {
        console.log(`📄 PDF with base64 data: ${file.name} (${Math.round(file.originalFile.base64.length / 1024)}KB base64)`);
      }
      return file;
    });

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
      _id: groupChatDoc._id,
      type: groupChatDoc.type,
      uploadedFilesCount: groupChatDoc.uploadedFiles.length,
      firstFileStructure: groupChatDoc.uploadedFiles[0] ? {
        name: groupChatDoc.uploadedFiles[0].name,
        type: groupChatDoc.uploadedFiles[0].type,
        hasOriginalFile: !!groupChatDoc.uploadedFiles[0].originalFile,
        originalFileKeys: groupChatDoc.uploadedFiles[0].originalFile ? Object.keys(groupChatDoc.uploadedFiles[0].originalFile) : 'none'
      } : 'no files'
    });

    // Use Cloudant client
    const result = await couchDBClient.saveChat(groupChatDoc);
    console.log(`💾 Group chat saved to ${couchDBClient.getServiceInfo().isCloudant ? 'Cloudant' : 'CouchDB'}: ${result.id}`);
    
    // Invalidate chat cache since we added new chat data
    invalidateCache('chats');
    
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
    
    console.log(`📄 Loaded chat: ${chatId}`);
    
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
      shareId,
      userId,
      userName,
      userEmail,
      sessionId,
      hasSession: !!req.session
    });
    
    if (!shareId || !userId || !sessionId) {
//       console.log('❌ [Deep Link Session] Missing required fields:', {
        shareId: !!shareId,
        userId: !!userId,
        sessionId: !!sessionId
      });
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
      sessionId,
      userId,
      userName,
      shareId
    });
    
    // Session stored in memory only
    
    // Update the express-session with user information
    req.session.userId = userId;
    req.session.userName = userName;
    req.session.userEmail = userEmail;
    req.session.sessionType = 'deeplink';
    req.session.deepLinkId = shareId;
    
//     console.log('✅ [Deep Link Session] Session created successfully for user:', userName);
//     console.log('✅ [Deep Link Session] Express session updated with user info:', {
      userId: req.session.userId,
      userName: req.session.userName,
      sessionType: req.session.sessionType
    });
    
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
      sessionId,
      shareId,
      action
    });
    
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
    
    console.log(`📄 Loaded shared chat: ${shareId}`);
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
    // Just ensure they're properly formatted for storage
    const processedUploadedFiles = (uploadedFiles || []).map(file => {
      if (file.type === 'pdf' && file.originalFile && file.originalFile.base64) {
        console.log(`📄 PDF with base64 data: ${file.name} (${Math.round(file.originalFile.base64.length / 1024)}KB base64)`);
      }
      return file;
    });

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
//     console.log(`🔄 Group chat updated: ${chatId}`);
    
    // Invalidate chat cache since we modified chat data
    invalidateCache('chats');
    
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
    console.log('🧹 Starting chat cleanup via API...');
    
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
    
    // Invalidate chat cache since we deleted chat data
    invalidateCache('chats');
    
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

    console.log(`💾 Attempting to save chat with ${chatHistory.length} messages`);

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
    console.log(`💾 Chat saved to ${couchDBClient.getServiceInfo().isCloudant ? 'Cloudant' : 'CouchDB'}: ${result.id}`);
    
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
    
    console.log(`📄 Loaded chat: ${chatId}`);
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
    console.log('🧹 Starting cleanup of chats with missing name properties...');
    
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
    console.log('=====================================');
    console.log(`URL: ${url}`);
    console.log(`Method: ${config.method || 'GET'}`);
    console.log(`Headers: ${JSON.stringify(headers, null, 2)}`);
    console.log(`Body: ${options.body}`);
    console.log('=====================================');
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
const agentApiKeys = {
  '2960ae8d-8514-11f0-b074-4e013e2ddde4': 'fnCsOfehzcEemiTKdowBFbjAIf7jSFwz', // agent-08292025
  '059fc237-7077-11f0-b056-36d958d30bcf': 'QDb19YdQi2adFlF76VLCg7qSk6BzS8sS', // agent-08032025
  '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4': '6_LUNA_A-MVAxNkuaPbE3FnErmcBF7JK'  // agent-05102025
};

// Helper function to get agent-specific API key
const getAgentApiKey = async (agentId) => {
  // Check if we have a hardcoded key for this agent
  if (agentApiKeys[agentId]) {
    console.log(`🔑 Using hardcoded API key for agent: ${agentId}`);
    return agentApiKeys[agentId];
  }

  // Fallback to global API key if no agent-specific key found
  console.log(`🔑 No agent-specific key found for ${agentId}, using global key`);
  return process.env.DIGITALOCEAN_PERSONAL_API_KEY;
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
    
//     console.log(`🔍 [isAgentAvailableToPublicUser] Selected agent:`, selectedAgent ? selectedAgent.name : 'Not found');
    
    if (selectedAgent) {
      const agentNamePattern = /^([a-z0-9]+)-agent-/;
      const nameMatch = selectedAgent.name.match(agentNamePattern);
//       console.log(`🔍 [isAgentAvailableToPublicUser] Agent name pattern match:`, nameMatch);
      
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
    const allAgents = await Promise.all((agents.agents || []).map(async (agent) => {
      // Debug: Log the raw agent data from DigitalOcean API
//       console.log(`🔍 [DEBUG] Raw agent data from DigitalOcean API:`, {
        id: agent.uuid,
        name: agent.name,
        knowledge_bases: agent.knowledge_bases
      });
      
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
        const userDoc = await couchDBClient.getDocument('maia_users', currentUser);
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
      userDoc = await couchDBClient.getDocument('maia_users', userId);
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
      await couchDBClient.saveDocument('maia_users', userDoc);
      
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
    const userDoc = await couchDBClient.getDocument('maia_users', userId);
    
    // Check if agent is assigned (by UUID)
    const agentIndex = userDoc.ownedAgents.findIndex(agent => agent.id === agentId);
    
    if (agentIndex !== -1) {
      const agentName = userDoc.ownedAgents[agentIndex].name;
      // Remove agent from user's owned agents
      userDoc.ownedAgents.splice(agentIndex, 1);
      userDoc.updatedAt = new Date().toISOString();
      
      // Save updated user document
      await couchDBClient.saveDocument('maia_users', userDoc);
      
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
app.get('/api/current-agent', async (req, res) => {
  
  try {
    // Get current user from session if available
    let currentUser = req.session?.userId || 'Public User';
    // console.log(`🔍 [current-agent] GET request - Current user: ${currentUser}`);
//     console.log(`🔍 [current-agent] Session data:`, {
      hasSession: !!req.session,
      userId: req.session?.userId,
      sessionId: req.sessionID
    });
    
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
            deepLinkUserDoc = await couchDBClient.getDocument('maia_users', currentUser);
            if (deepLinkUserDoc) {
              setCache('users', currentUser, deepLinkUserDoc);
            }
          }
//           console.log(`🔗 [DEBUG] Step 2 Result:`, deepLinkUserDoc ? {
            userId: deepLinkUserDoc.userId,
            shareId: deepLinkUserDoc.shareId,
            displayName: deepLinkUserDoc.displayName
          } : 'Document not found');
          
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
              chatId: sharedChat._id,
              shareId: sharedChat.shareId,
              currentUser: sharedChat.currentUser,
              currentUserType: typeof sharedChat.currentUser
            } : 'No chat found with matching shareId');
            
            if (sharedChat && sharedChat.currentUser) {
              const patientUser = typeof sharedChat.currentUser === 'string' 
                ? sharedChat.currentUser 
                : sharedChat.currentUser.userId || sharedChat.currentUser.displayName;
              
//               console.log(`🔗 [current-agent] Found patient for deep link: ${patientUser}`);
              // console.log(`🔗 [DEBUG] Step 4: Getting assigned agent for patient: ${patientUser}`);
              
              // Get the assigned agent for this patient
              const assignedAgentResponse = await fetch(`http://localhost:3001/api/admin-management/users/${patientUser}/assigned-agent`);
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
          const assignedAgentResponse = await fetch(`http://localhost:3001/api/admin-management/users/${currentUser}/assigned-agent`);
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
        // Check if user has a current agent selection stored in Cloudant
        try {
          let userDoc = getCache('users', currentUser);
          if (!isCacheValid('users', currentUser)) {
            userDoc = await couchDBClient.getDocument('maia_users', currentUser);
            if (userDoc) {
              setCache('users', currentUser, userDoc);
            }
          }
          if (userDoc && userDoc.currentAgentId) {
            agentId = userDoc.currentAgentId;
            // console.log(`🔐 [current-agent] Using user's current agent selection: ${userDoc.currentAgentName} (${agentId})`);
          } else {
            // No current agent selection found for user
            return res.json({ 
              agent: null, 
              message: 'No current agent selected. Please choose an agent via the Agent Management dialog.',
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
          const userDoc = await couchDBClient.getDocument('maia_users', 'Public User');
//           console.log(`🔍 [current-agent] Retrieved Public User document:`, userDoc);
          if (userDoc && userDoc.currentAgentId) {
            // Check if the selected agent is still available to Public User (not owned by authenticated users)
            // console.log(`🔍 [current-agent] Validating agent availability for Public User: ${userDoc.currentAgentId}`);
            const isAgentAvailable = await isAgentAvailableToPublicUser(userDoc.currentAgentId);
            // console.log(`🔍 [current-agent] Agent ${userDoc.currentAgentId} available to Public User: ${isAgentAvailable}`);
            
            if (isAgentAvailable) {
              agentId = userDoc.currentAgentId;
              // console.log(`🔐 [current-agent] Using Public User's current agent selection: ${userDoc.currentAgentName} (${agentId})`);
            } else {
              // Agent is no longer available to Public User (now owned by authenticated user)
              // console.log(`🔍 [current-agent] Public User's selected agent ${userDoc.currentAgentName} is now owned by an authenticated user, clearing selection`);
              // Clear the invalid agent selection
              const updatedUserDoc = {
                ...userDoc,
                currentAgentId: null,
                currentAgentName: null,
                currentAgentEndpoint: null,
                currentAgentSetAt: null,
                updatedAt: new Date().toISOString()
              };
              await couchDBClient.saveDocument('maia_users', updatedUserDoc);
              
              // Update the cache to reflect the cleared assignment
              UserStateManager.updateUserStateSection('Public User', 'agent', {
                currentAgentId: null,
                currentAgentName: null,
                currentAgentEndpoint: null,
                currentAgentSetAt: null,
                assignedAgentId: null,
                assignedAgentName: null
              });
              
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
    // console.log(`🔍 Found matching agent: ${matchingAgent.name} (${agentId})`);
    
    // Get agent details including associated knowledge bases
    const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data || agentResponse;
    
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
    

    


    const response = { 
      agent: transformedAgent,
      endpoint: endpoint
    };
    
    if (warning) {
      response.warning = warning;
    }

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
    
    if (!knowledgeBaseId) {
      return res.status(400).json({ message: 'knowledgeBaseId is required' });
    }
    
//     console.log(`🔗 Attaching knowledge base ${knowledgeBaseId} to agent ${agentId}`);
    
    // Use the DigitalOcean API to attach the knowledge base to the agent
    const result = await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${knowledgeBaseId}`, {
      method: 'POST'
    });
    
//     console.log(`✅ Knowledge base attached to agent successfully:`, result);
    
    // Wait a moment for the API to process
//     console.log(`⏳ Waiting 2 seconds for API to process attachment...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the attachment by getting the agent details
//     console.log(`🔍 Verifying attachment for agent ${agentId}`);
    const agentDetails = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
    const attachedKBs = agentData.knowledge_bases || [];
    
//     console.log(`📚 Agent now has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid || kb.id));
    
    const isAttached = attachedKBs.some(kb => (kb.uuid || kb.id) === knowledgeBaseId);
    if (isAttached) {
//       console.log(`✅ Knowledge base ${knowledgeBaseId} successfully attached to agent ${agentId}`);
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
//       console.log(`❌ Knowledge base ${knowledgeBaseId} failed to attach to agent ${agentId}`);
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
    console.error('❌ Attach KB error:', error);
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
            
            await couchDBClient.saveDocument("maia_knowledge_bases", newKbDoc);
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
        console.log(`🚨 [SECURITY] Protected KB requires authentication - blocking unauthenticated access`);
        return res.status(401).json({ 
          error: 'Authentication required for protected knowledge base',
          details: 'This knowledge base has owner restrictions'
        });
      }
      
      // Verify user has permission to access this protected knowledge base
//       console.log(`🔍 [DEBUG] Ownership check:`, {
        kbOwner: kbOwner,
        currentUserUsername: currentUser?.username,
        isMatch: kbOwner === currentUser?.username
      });
      
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
            await couchDBClient.saveDocument("maia_knowledge_bases", updatedKbDoc);
            // console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
          }
        } catch (cloudantUpdateError) {
//           console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
          // Don't fail the operation if Cloudant update fails
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
                await couchDBClient.saveDocument("maia_knowledge_bases", updatedKbDoc);
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
          await couchDBClient.saveDocument("maia_knowledge_bases", updatedKbDoc);
          // console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
        }
      } catch (cloudantUpdateError) {
//         console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
        // Don't fail the operation if Cloudant update fails
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
    const { name, description, model, model_uuid, instructions, patientName, knowledgeBaseId } = req.body;
    
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
    } else {
      // Use provided name with validation
      agentName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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
    console.log('========================================');
    console.log(JSON.stringify(agentData, null, 2));
    console.log('========================================');
//     console.log(`🔗 Endpoint: ${process.env.DIGITALOCEAN_BASE_URL}/v2/gen-ai/agents`);
    console.log(`🔑 Token: ${process.env.DIGITALOCEAN_TOKEN ? 'Present' : 'Missing'}`);
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
      protectionDocs = await couchDBClient.getAllDocuments('maia_knowledge_bases');
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
    const userDoc = await couchDBClient.getDocument('maia_users', 'Public User');
//     console.log('🔍 [admin] Current Public User document:', {
      currentAgentId: userDoc.currentAgentId,
      currentAgentName: userDoc.currentAgentName
    });
    
    // Clear the agent assignment
    const updatedUserDoc = {
      ...userDoc,
      currentAgentId: null,
      currentAgentName: null,
      currentAgentEndpoint: null,
      currentAgentSetAt: null,
      updatedAt: new Date().toISOString()
    };
    
    // Save updated document
    await couchDBClient.saveDocument('maia_users', updatedUserDoc);
    
    // Update the cache
    UserStateManager.updateUserStateSection('Public User', 'agent', {
      currentAgentId: null,
      currentAgentName: null,
      currentAgentEndpoint: null,
      currentAgentSetAt: null,
      assignedAgentId: null,
      assignedAgentName: null
    });
    
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

// Set current agent
app.post('/api/current-agent', async (req, res) => {
  try {
    const { agentId } = req.body;
    const currentUser = req.session?.userId || 'Unknown User';
    
    if (!agentId) {
      return res.status(400).json({ message: 'Agent ID is required' });
    }
    
    // Get the agent details
    const agents = await doRequest('/v2/gen-ai/agents');
    const agentArray = agents.agents || [];
    const selectedAgent = agentArray.find(agent => agent.uuid === agentId);
    
    if (!selectedAgent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // For Public User, check if the agent is available to them
    if (currentUser === 'Public User') {
      const isAgentAvailable = await isAgentAvailableToPublicUser(agentId);
      if (!isAgentAvailable) {
        return res.status(403).json({ 
          message: 'This agent is not available for selection. It may be assigned to another user.',
          requiresAgentSelection: true
        });
      }
    }
    
    // Store the current agent selection in Cloudant for the user
    if (currentUser !== 'Unknown User') {
      try {
        // Get user document from Cloudant
        const userDoc = await couchDBClient.getDocument('maia_users', currentUser);
        
        // Update user document with current agent selection
        const updatedUserDoc = {
          ...userDoc,
          currentAgentId: selectedAgent.uuid,
          currentAgentName: selectedAgent.name,
          currentAgentEndpoint: `${selectedAgent.deployment?.url}/api/v1`,
          currentAgentSetAt: new Date().toISOString()
        };
        
        // Save updated user document
        await couchDBClient.saveDocument('maia_users', updatedUserDoc);
//         console.log(`✅ Stored current agent selection for user ${currentUser}: ${selectedAgent.name} (${agentId})`);
        
        // Update user state cache - map current agent to assigned agent for consistency
        UserStateManager.updateUserStateSection(currentUser, 'agent', {
          currentAgentId: selectedAgent.uuid,
          currentAgentName: selectedAgent.name,
          currentAgentEndpoint: `${selectedAgent.deployment?.url}/api/v1`,
          currentAgentSetAt: new Date().toISOString(),
          assignedAgentId: selectedAgent.uuid, // Map current to assigned
          assignedAgentName: selectedAgent.name // Map current to assigned
        });
        
        // Debug: Verify the document was saved correctly
        const verifyDoc = await couchDBClient.getDocument('maia_users', currentUser);
//         console.log(`🔍 [DEBUG] Verification - user document after save:`, {
          currentAgentId: verifyDoc.currentAgentId,
          currentAgentName: verifyDoc.currentAgentName,
          currentAgentSetAt: verifyDoc.currentAgentSetAt
        });
      } catch (userError) {
        console.warn(`Failed to store current agent selection for user ${currentUser}:`, userError.message);
      }
    } else {
      // For Public User, store in their own document
      try {
        // Try to get existing Public User document
        let userDoc;
        try {
          userDoc = await couchDBClient.getDocument('maia_users', 'Public User');
        } catch (getError) {
          // Document doesn't exist, create new one
          userDoc = {
            _id: 'Public User',
            type: 'user',
            createdAt: new Date().toISOString()
          };
        }
        
        // Update user document with current agent selection
        const updatedUserDoc = {
          ...userDoc,
          _id: 'Public User', // Ensure _id is always set
          currentAgentId: selectedAgent.uuid,
          currentAgentName: selectedAgent.name,
          currentAgentEndpoint: `${selectedAgent.deployment?.url}/api/v1`,
          currentAgentSetAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save updated user document
//         console.log(`🔍 Saving Public User document:`, updatedUserDoc);
        await couchDBClient.saveDocument('maia_users', updatedUserDoc);
//         console.log(`✅ Stored current agent selection for Public User: ${selectedAgent.name} (${agentId})`);
        
        // Update user state cache for Public User - map current agent to assigned agent for consistency
        UserStateManager.updateUserStateSection('Public User', 'agent', {
          currentAgentId: selectedAgent.uuid,
          currentAgentName: selectedAgent.name,
          currentAgentEndpoint: `${selectedAgent.deployment?.url}/api/v1`,
          currentAgentSetAt: new Date().toISOString(),
          assignedAgentId: selectedAgent.uuid, // Map current to assigned
          assignedAgentName: selectedAgent.name // Map current to assigned
        });
      } catch (userError) {
        console.error(`❌ Failed to store current agent selection for Public User:`, userError);
      }
    }
    
    const endpoint = selectedAgent.deployment?.url + '/api/v1';
    
//     console.log(`✅ Set current agent to: ${selectedAgent.name} (${agentId})`);
//     console.log(`🔗 Endpoint: ${endpoint}`);
    
    res.json({ 
      success: true, 
      agent: {
        id: selectedAgent.uuid,
        name: selectedAgent.name,
        description: selectedAgent.instruction || '',
        model: selectedAgent.model?.name || 'Unknown',
        status: selectedAgent.deployment?.status?.toLowerCase().replace('status_', '') || 'unknown',
        instructions: selectedAgent.instruction || '',
        uuid: selectedAgent.uuid,
        deployment: selectedAgent.deployment
      },
      endpoint: endpoint
    });
  } catch (error) {
    console.error('❌ Set current agent error:', error);
    res.status(500).json({ message: `Failed to set current agent: ${error.message}` });
  }
});

// ============================================================================
// UNIFIED USER STATE MANAGEMENT ENDPOINTS
// ============================================================================

// Get cache statistics (for debugging) - MUST come before parameterized routes
app.get('/api/user-state/cache/stats', (req, res) => {
  try {
    const stats = UserStateManager.getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error(`❌ [user-state] Stats error:`, error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Get all users' state (for admin panel) - MUST come before /:userId route
app.get('/api/user-state/all', async (req, res) => {
  try {
    // console.log(`🔍 [user-state] GET all users request`);
    
    // Get all user states from cache
    const allUserIds = UserStateManager.getAllUserIds();
    const userStates = [];
    
    for (const userId of allUserIds) {
      const userState = UserStateManager.getUserState(userId);
      if (userState) {
        userStates.push(userState);
      }
    }
    
    // console.log(`✅ [user-state] Returning ${userStates.length} user states from cache`);
    res.json({ users: userStates });
  } catch (error) {
    console.error(`❌ [user-state] Error getting all users:`, error);
    res.status(500).json({ error: 'Failed to get all users state' });
  }
});

// Get complete user state (agent + KB + workflow)
app.get('/api/user-state/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // console.log(`🔍 [user-state] GET request for user: ${userId}`);
    
    // Get user state from cache
    let userState = UserStateManager.getUserState(userId);
    
    if (!userState) {
      // console.log(`🔄 [user-state] User ${userId} not in cache, fetching from database...`);
      
      // Fetch user document from database
      const userDoc = await couchDBClient.getDocument('maia_users', userId);
      if (!userDoc) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get KB assignments for this user
      let assignedKBs = [];
      try {
        // TODO: Implement KB assignment lookup
        // For now, return empty array
        assignedKBs = [];
      } catch (kbError) {
        console.error(`❌ [user-state] Error fetching KB assignments for ${userId}:`, kbError.message);
      }
      
      // Build user state from database
      userState = UserStateManager.buildUserStateFromDB(userDoc, assignedKBs, []);
      
      // Cache the user state
      UserStateManager.updateUserState(userId, userState);
    }
    
//     console.log(`✅ [user-state] Returning state for ${userId}:`, {
      currentAgent: userState.currentAgentName,
      assignedKBs: userState.assignedKnowledgeBases?.length || 0,
      workflowStage: userState.workflowStage
    });
    
    res.json(userState);
  } catch (error) {
    console.error(`❌ [user-state] Error:`, error);
    res.status(500).json({ error: 'Failed to get user state' });
  }
});

// Get specific section of user state
app.get('/api/user-state/:userId/:section', async (req, res) => {
  try {
    const { userId, section } = req.params;
    // console.log(`🔍 [user-state] GET request for user: ${userId}, section: ${section}`);
    
    // Validate section
    const validSections = ['agent', 'knowledge-bases', 'workflow'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ error: 'Invalid section. Must be: agent, knowledge-bases, or workflow' });
    }
    
    // Get user state from cache
    let userState = UserStateManager.getUserState(userId);
    
    if (!userState) {
      // If not in cache, fetch from database first
      const userDoc = await couchDBClient.getDocument('maia_users', userId);
      if (!userDoc) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Build and cache user state
      userState = UserStateManager.buildUserStateFromDB(userDoc, [], []);
      UserStateManager.updateUserState(userId, userState);
    }
    
    // Get specific section
    const sectionData = UserStateManager.getUserStateSection(userId, section);
    
//     console.log(`✅ [user-state] Returning ${section} for ${userId}:`, sectionData);
    res.json(sectionData);
  } catch (error) {
    console.error(`❌ [user-state] Error:`, error);
    res.status(500).json({ error: 'Failed to get user state section' });
  }
});

// Update user state (used by other endpoints to update cache)
app.post('/api/user-state/:userId/update', async (req, res) => {
  try {
    const { userId } = req.params;
    const { section, data } = req.body;
    
    // console.log(`🔄 [user-state] Update request for user: ${userId}, section: ${section}`);
    
    // Validate section
    const validSections = ['agent', 'knowledge-bases', 'workflow', 'all'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ error: 'Invalid section. Must be: agent, knowledge-bases, workflow, or all' });
    }
    
    if (section === 'all') {
      // Update complete user state
      UserStateManager.updateUserState(userId, data);
    } else {
      // Update specific section
      UserStateManager.updateUserStateSection(userId, section, data);
    }
    
    // console.log(`✅ [user-state] Updated ${section} for user ${userId}`);
    res.json({ success: true, message: `Updated ${section} for user ${userId}` });
  } catch (error) {
    console.error(`❌ [user-state] Update error:`, error);
    res.status(500).json({ error: 'Failed to update user state' });
  }
});

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
//         console.log(`📚 Using embedding model: ${preferredModel.name} (${embeddingModelId})`);
      } else {
//         console.log(`⚠️ No embedding models found, proceeding without specific embedding model`);
      }
    } catch (modelError) {
//       console.log(`⚠️ Failed to get models, proceeding without specific embedding model`);
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

//     console.log(`📚 Creating knowledge base: ${kbName}${embeddingModelId ? ` with embedding model: ${embeddingModelId}` : ''}`);
    const knowledgeBase = await doRequest('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(kbData)
    });

    const kbId = knowledgeBase.knowledge_base?.uuid || knowledgeBase.data?.uuid || knowledgeBase.uuid;
//     console.log(`✅ Created knowledge base: ${kbName} (${kbId})`);

    // Store user ownership information in Cloudant
    if (kbId) {
      try {
//         console.log(`🔐 Attempting to store ownership info for KB ${kbId} (${kbName})`);
//         console.log(`🔐 Username: ${username}, isProtected: ${!!username}`);
        
        const ownershipDoc = {
          _id: `kb_${kbId}`,
          kbId: kbId,
          kbName: kbName,
          owner: username || null, // null for shared KBs
          createdAt: new Date().toISOString(),
          isProtected: !!username, // Only protected if username is provided
          itemPath: itemPath
        };
        
//         console.log(`🔐 Ownership document:`, JSON.stringify(ownershipDoc, null, 2));
        
        const result = await couchDBClient.saveDocument('maia_knowledge_bases', ownershipDoc);
//         console.log(`🔐 Save result:`, result);
        
        if (username) {
//           console.log(`✅ Stored ownership info for KB ${kbId} owned by ${username}`);
        } else {
//           console.log(`✅ Stored ownership info for KB ${kbId} as shared KB`);
        }
      } catch (ownershipError) {
        console.error(`❌ Failed to store ownership info for KB ${kbId}:`, ownershipError);
        console.error(`❌ Error details:`, ownershipError.stack);
        // Don't fail the request if ownership storage fails
      }
    } else {
      console.warn(`⚠️ Cannot store ownership info - KB ID is undefined`);
    }

    // Note: Documents are already accessible through the spaces_data_source
    // No need to add individual documents as separate data sources
//     console.log(`📚 Knowledge base created successfully with access to files in ${itemPath}`);

    res.json(knowledgeBase.data || knowledgeBase);
  } catch (error) {
    console.error('❌ Create knowledge base error:', error);
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
      console.log(`📅 Created: ${mostRecentKB.created_at}`);
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
    console.log(`📅 Created: ${targetKB.created_at}`);
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
    console.log(`🧪 TEST: Creating KB from wed271 folder with large file...`);
    
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
    monitorIndexingProgress(kbId, validName, startTime);
    
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
async function monitorIndexingProgress(kbId, kbName, startTime) {
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
            console.log(`\n🎉 INDEXING COMPLETED!`);
//             console.log(`📊 Total time: ${totalTime} seconds (${elapsedMinutes} minutes)`);
//             console.log(`📊 Final tokens: ${job.tokens || 'N/A'}`);
//             console.log(`📊 Job UUID: ${job.uuid}`);
            clearInterval(monitorInterval);
            return;
          }
        } else {
//           console.log(`📊 No indexing job found yet...`);
        }
      }
      
      // Stop monitoring after max checks or if taking too long
      if (checkCount >= maxChecks) {
        console.log(`\n⏰ Monitoring stopped after ${maxChecks} checks (${elapsedMinutes} minutes)`);
        clearInterval(monitorInterval);
        return;
      }
      
    } catch (error) {
      console.error(`❌ Error checking indexing status:`, error);
      checkCount++;
      
      if (checkCount >= maxChecks) {
        console.log(`\n⏰ Monitoring stopped due to errors after ${checkCount} checks`);
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
import passkeyRoutes, { setCouchDBClient as setPasskeyCouchDBClient } from './src/routes/passkey-routes.js';

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
import adminManagementRoutes, { setCouchDBClient as setAdminManagementCouchDBClient, setSessionManager, updateAgentActivity } from './src/routes/admin-management-routes.js';

// In-memory caching system to prevent redundant Cloudant calls
const dataCache = {
  users: new Map(), // userId -> userDocument
  chats: new Map(), // 'all' -> allChatsArray
  agentAssignments: new Map(), // userId -> { assignedAgentId, assignedAgentName }
  lastUpdated: {
    users: new Map(), // userId -> timestamp
    chats: 0, // timestamp
    agentAssignments: new Map() // userId -> timestamp
  },
  
  // Cache TTL (Time To Live) in milliseconds
  TTL: {
    users: 5 * 60 * 1000, // 5 minutes
    chats: 2 * 60 * 1000, // 2 minutes  
    agentAssignments: 5 * 60 * 1000 // 5 minutes
  }
};

// Cache helper functions
const isCacheValid = (cacheType, key = null) => {
  const now = Date.now();
  if (cacheType === 'chats') {
    return dataCache.lastUpdated.chats > 0 && (now - dataCache.lastUpdated.chats) < dataCache.TTL.chats;
  }
  if (key) {
    const lastUpdate = dataCache.lastUpdated[cacheType].get(key);
    return lastUpdate && (now - lastUpdate) < dataCache.TTL[cacheType];
  }
  return false;
};

const setCache = (cacheType, key, data) => {
  const now = Date.now();
  if (cacheType === 'chats') {
    dataCache.chats.set('all', data);
    dataCache.lastUpdated.chats = now;
  } else {
    dataCache[cacheType].set(key, data);
    dataCache.lastUpdated[cacheType].set(key, now);
  }
};

const getCache = (cacheType, key = null) => {
  if (cacheType === 'chats') {
    return dataCache.chats.get('all');
  }
  return dataCache[cacheType].get(key);
};

const invalidateCache = (cacheType, key = null) => {
  if (cacheType === 'chats') {
    dataCache.chats.clear();
    dataCache.lastUpdated.chats = 0;
  } else if (key) {
    dataCache[cacheType].delete(key);
    dataCache.lastUpdated[cacheType].delete(key);
  } else {
    dataCache[cacheType].clear();
    dataCache.lastUpdated[cacheType].clear();
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
setCacheFunctions(passkeyRoutes);
setAdminCouchDBClient(couchDBClient);
setAdminManagementCouchDBClient(couchDBClient);

// Pass the shared session manager to admin routes
setSessionManager(sessionManager);

// Mount KB protection routes
app.use('/api/kb-protection', kbProtectionRoutes);

// Mount admin routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin-management', adminManagementRoutes);

// =============================================================================
// DATABASE CLEANUP ENDPOINT
// =============================================================================

// Cleanup endpoint to replace maia_users with clean data
app.post('/api/cleanup-database', async (req, res) => {
  try {
    console.log('🧹 Starting database cleanup via API...');
    
    // Essential users to keep
    const essentialUsers = [
      {
        _id: 'Unknown User',
        type: 'user',
        createdAt: new Date().toISOString(),
        currentAgentId: null,
        currentAgentName: null
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
    const allDocs = await couchDBClient.getAllDocuments('maia_users');
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
    console.log('📤 Inserting essential users...');
    for (const user of essentialUsers) {
      try {
        await couchDBClient.saveDocument('maia_users', user);
//         console.log(`  ✅ Inserted: ${user._id}`);
      } catch (error) {
//         console.log(`  ❌ Error inserting ${user._id}: ${error.message}`);
      }
    }
    
    // Verify cleanup
    const finalDocs = await couchDBClient.getAllDocuments('maia_users');
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
        currentAgentId: '059fc237-7077-11f0-b056-36d958d30bcf', // agent-08032025 UUID
        currentAgentName: 'agent-08032025',
        ownedAgents: [
          { id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4', name: 'agent-05102025', assignedAt: new Date().toISOString() },
          { id: '059fc237-7077-11f0-b056-36d958d30bcf', name: 'agent-08032025', assignedAt: new Date().toISOString() }
        ]
      },
      'wed271': {
        currentAgentId: '2960ae8d-8514-11f0-b074-4e013e2ddde4', // agent-08292025 UUID
        currentAgentName: 'agent-08292025',
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
          userDoc = await couchDBClient.getDocument('maia_users', userId);
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
          currentAgentId: agentData.currentAgentId,
          currentAgentName: agentData.currentAgentName,
          ownedAgents: agentData.ownedAgents,
          currentAgentSetAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save updated document
        await couchDBClient.saveDocument('maia_users', updatedUserDoc);
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
    const fri951Doc = await couchDBClient.getDocument('maia_users', 'fri951');
    
    // Get wed271 user document
    const wed271Doc = await couchDBClient.getDocument('maia_users', 'wed271');
    
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
        currentAgentId: '059fc237-7077-11f0-b056-36d958d30bcf', // agent-08032025 UUID
        currentAgentName: 'agent-08032025',
        ownedAgents: [
          { id: '16c9edf6-2dee-11f0-bf8f-4e013e2ddde4', name: 'agent-05102025', assignedAt: new Date().toISOString() },
          { id: '059fc237-7077-11f0-b056-36d958d30bcf', name: 'agent-08032025', assignedAt: new Date().toISOString() }
        ]
      },
      'wed271': {
        currentAgentId: '2960ae8d-8514-11f0-b074-4e013e2ddde4', // agent-08292025 UUID
        currentAgentName: 'agent-08292025',
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
          userDoc = await couchDBClient.getDocument('maia_users', userId);
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
          currentAgentId: agentData.currentAgentId,
          currentAgentName: agentData.currentAgentName,
          ownedAgents: agentData.ownedAgents,
          currentAgentSetAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Save updated document
        await couchDBClient.saveDocument('maia_users', updatedUserDoc);
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
        
        await couchDBClient.saveDocument('maia_users', updatedUser);
        
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
    await couchDBClient.saveDocument('maia_users', userDoc);
    
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
    const existingUser = await couchDBClient.getDocument('maia_users', existingUserId);
    
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
      
      await couchDBClient.saveDocument('maia_users', finalUser);
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
      
      await couchDBClient.saveDocument('maia_users', finalUser);
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
    const allUsers = await couchDBClient.getAllDocuments('maia_users');
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

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
//   console.log(`🚀 MAIA Secure Server running on port ${PORT}`);
//   console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`👤 Single Patient Mode: ${process.env.SINGLE_PATIENT_MODE === 'true' ? 'Enabled' : 'Disabled'}`);
//       console.log(`🔗 Health check: ${process.env.ORIGIN || `http://localhost:${PORT}`}/health`);
//   console.log(`🔧 CODE VERSION: Updated AgentManagementDialog.vue with workflow fixes and console cleanup`);
  console.log(`📅 Server started at: ${new Date().toISOString()}`);
  
  // Helper function to ensure bucket folders for all users
  async function ensureAllUserBuckets() {
//     console.log('📁 [STARTUP] Ensuring bucket folders for all users...');
    
    const userIds = UserStateManager.getAllUserIds();
    const bucketChecks = [];
    
    for (const userId of userIds) {
      // Include all users - deep link users also need bucket folders
      bucketChecks.push(ensureUserBucket(userId));
    }
    
    try {
      await Promise.all(bucketChecks);
      // console.log(`✅ [STARTUP] Completed bucket checks for ${bucketChecks.length} users`);
    } catch (error) {
      console.error('❌ [STARTUP] Error ensuring user buckets:', error);
    }
  }

  // Helper function to ensure bucket folder for a specific user
  async function ensureUserBucket(userId) {
    try {
      // First check current status
      const statusResponse = await fetch(`http://localhost:3001/api/bucket/user-status/${userId}`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        // If user has no folder, create one
        if (!statusData.hasFolder) {
          // console.log(`📁 [STARTUP] Creating bucket folder for ${userId} (no folder found)`);
          const createResponse = await fetch('http://localhost:3001/api/bucket/ensure-user-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          });
          
          if (createResponse.ok) {
            const createData = await createResponse.json();
            UserStateManager.updateBucketStatus(userId, createData);
            // console.log(`✅ [STARTUP] Created bucket folder for ${userId}`);
          }
        } else {
          // User already has folder, just update cache
          UserStateManager.updateBucketStatus(userId, statusData);
        }
        return;
      }
      
      // If status check failed, try to create folder anyway
      // console.log(`📁 [STARTUP] Status check failed for ${userId}, attempting to create folder`);
      const createResponse = await fetch('http://localhost:3001/api/bucket/ensure-user-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      if (createResponse.ok) {
        const createData = await createResponse.json();
        UserStateManager.updateBucketStatus(userId, createData);
        // console.log(`✅ [STARTUP] Created bucket folder for ${userId}`);
      }
    } catch (error) {
      console.error(`❌ [STARTUP] Error ensuring bucket for ${userId}:`, error);
    }
  }
  
  // Initialize UserStateManager cache on startup
  try {
    // console.log(`🔄 [STARTUP] Initializing UserStateManager cache...`);
    await UserStateManager.initializeCache(
      async () => {
        // Function to get all user documents
        const allUsers = await couchDBClient.getAllDocuments('maia_users');
        // console.log(`🔍 [STARTUP] Found ${allUsers.length} total documents in database`);
        const filteredUsers = allUsers.filter(doc => 
          doc.type === 'user' || 
          doc.type === 'unknown' || 
          doc.type === null ||
          (doc._id && doc._id.startsWith('deep_link_'))
        );
        // console.log(`🔍 [STARTUP] Filtered to ${filteredUsers.length} users (type: user, unknown, or null)`);
        filteredUsers.forEach(user => {
          // console.log(`🔍 [STARTUP] User: ${user.userId || user._id}, type: ${user.type}, displayName: ${user.displayName}`);
        });
        return filteredUsers;
      },
      async (userId) => {
        // Function to get KB assignments for a user
        // TODO: Implement actual KB assignment lookup
        return [];
      }
    );
    // console.log(`✅ [STARTUP] UserStateManager cache initialized successfully`);
    
    // Ensure bucket folders for all users
//     console.log('🔄 [STARTUP] Ensuring bucket folders for all users...');
    await ensureAllUserBuckets();
//     console.log('✅ [STARTUP] Bucket folder checks completed');
  } catch (error) {
    console.error(`❌ [STARTUP] Failed to initialize UserStateManager cache:`, error);
  }
  
// Start cleanup job for expired deep links
  setInterval(async () => {
    try {
      const cleanedCount = await sessionManager.cleanupExpiredDeepLinks();
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired deep links`);
      }
    } catch (error) {
      console.error('❌ Error in deep link cleanup job:', error);
    }
  }, 60 * 60 * 1000); // Run every hour
}); 

// Test endpoint for knowledge base creation debugging
app.post('/api/test-create-kb', async (req, res) => {
  try {
    console.log('🧪 TEST ENDPOINT: Creating knowledge base for debugging');
    
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