import dotenv from 'dotenv'
dotenv.config()

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
      // Initialize database
      await couchDBClient.initializeDatabase();
      await couchDBClient.createShareIdView(); // Create the share ID view
      
      // Get service info
      const serviceInfo = couchDBClient.getServiceInfo();
      console.log(`✅ Connected to ${serviceInfo.isCloudant ? 'Cloudant' : 'CouchDB'}`);
      console.log(`✅ Using database '${serviceInfo.databaseName}'`);
    } else {
      throw new Error('Database connection failed');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
};

// Initialize database
initializeDatabase();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https:", "wss:"],
      imgSrc: ["'self'", "data:", "https:"],
    },
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

// Session configuration for authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
}));

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

// Cache-busting headers for development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
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
      console.log(`✅ User ${userId} signed out successfully`);
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

    console.log(`🔄 Processing RTF file: ${req.file.originalname}`);
    
    // Save uploaded file temporarily
    const tempRtfPath = `/tmp/${Date.now()}-${req.file.originalname}`;
    const cleanedRtfPath = tempRtfPath.replace('.rtf', '-STEP2-CLEANED.rtf');
    const outputMdPath = `/tmp/${Date.now()}-converted.md`;
    
    console.log(`📄 Temp RTF path: ${tempRtfPath}`);
    console.log(`📄 Cleaned RTF path: ${cleanedRtfPath}`);
    console.log(`📄 Output MD path: ${outputMdPath}`);
    
    fs.writeFileSync(tempRtfPath, req.file.buffer);
    console.log(`✅ Saved uploaded file to: ${tempRtfPath}`);
    
    // Step 1: Clean the RTF file
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    console.log(`🔄 Running RTF cleaner...`);
    try {
      const result = await execAsync(`node rtf-cleaner.js "${tempRtfPath}" "${cleanedRtfPath}"`);
      console.log(`✅ RTF cleaning complete`);
      console.log(`📄 Cleaner stdout:`, result.stdout);
      if (result.stderr) console.log(`⚠️ Cleaner stderr:`, result.stderr);
      
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
    console.log(`🔄 Running RTF to MD converter...`);
    try {
      const result = await execAsync(`node rtf-to-md.js "${cleanedRtfPath}" "${outputMdPath}"`);
      console.log(`✅ RTF to MD conversion complete`);
      console.log(`📄 Converter stdout:`, result.stdout);
      if (result.stderr) console.log(`⚠️ Converter stderr:`, result.stderr);
      
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
      console.log(`✅ Read markdown content (${markdownContent.length} characters)`);
      
      // Clean up temporary files
      try {
        fs.unlinkSync(tempRtfPath);
        if (fs.existsSync(cleanedRtfPath)) {
          fs.unlinkSync(cleanedRtfPath);
        }
        fs.unlinkSync(outputMdPath);
        console.log(`✅ Cleaned up temporary files`);
      } catch (cleanupError) {
        console.warn('⚠️ Warning: Could not clean up temporary files:', cleanupError.message);
      }
      
      console.log(`✅ RTF processing complete: ${req.file.originalname}`);
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
let personalChatClient, anthropic, openai, deepseek;

// DigitalOcean GenAI setup (Personal Chat) - KEEP IN CLOUD
if (process.env.DIGITALOCEAN_PERSONAL_API_KEY) {
  personalChatClient = new OpenAI({
    baseURL: process.env.DIGITALOCEAN_GENAI_ENDPOINT || 'https://vzfujeetn2dkj4d5awhvvibo.agents.do-ai.run/api/v1',
    apiKey: process.env.DIGITALOCEAN_PERSONAL_API_KEY
  });
  console.log('✅ DigitalOcean Personal AI Agent connected');
} else {
  console.log('⚠️  DigitalOcean Personal API key not configured - using mock responses');
}

// Anthropic setup (fallback)
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log('✅ Anthropic Claude connected');
}

// OpenAI setup (fallback)
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI connected');
}

// DeepSeek setup (fallback)
if (process.env.DEEPSEEK_API_KEY) {
  deepseek = new OpenAI({
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY
  });
  console.log('✅ DeepSeek connected');
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
  'deepseek-r1-chat': (message) => `[DeepSeek R1] My analysis of: "${message}". This is a mock response for local testing.`
};

// Personal Chat endpoint (DigitalOcean Agent Platform)
app.post('/api/personal-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!personalChatClient) {
      return res.status(500).json({ message: 'DigitalOcean Personal API key not configured' });
    }

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

    const newChatHistory = [
      ...chatHistory,
      { role: 'user', content: cleanUserMessage }
    ];

    const params = {
      messages: [
        ...chatHistory,
        { role: 'user', content: aiUserMessage }
      ],
      model: 'agent-05102025'
    };

    // Log token usage and context info
    const totalTokens = estimateTokenCount(aiUserMessage);
    const contextSize = aiContext ? Math.round(aiContext.length / 1024 * 100) / 100 : 0;
    console.log(`🤖 Personal AI: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

    const response = await personalChatClient.chat.completions.create(params);
    const responseTime = Date.now() - startTime;
    console.log(`✅ Personal AI response: ${responseTime}ms`);
    
    // Add the response with proper name field
    newChatHistory.push({
      ...response.choices[0].message,
      name: 'Personal AI'
    });

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Personal AI error (${responseTime}ms):`, error.message);
    
    // Fallback to mock response on error
    let { chatHistory, newValue } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');
    
    const mockResponse = mockAIResponses['personal-chat'](newValue);
    const newChatHistory = [
      ...chatHistory,
      { role: 'user', content: newValue },
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
    console.log('🔍 Anthropic - Incoming chat history structure:', {
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
      console.log('⚠️ WARNING: Found messages with empty content:', emptyContentMessages.map((msg, index) => ({
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
    console.log(`🤖 Anthropic: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

    // Debug: Log what's being sent to Anthropic
    console.log('🔍 Anthropic - Sending to API:', {
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
      console.log('⚠️ WARNING: Cleaned messages with empty content:', emptyCleanedMessages.map((msg, index) => ({
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
    console.log(`✅ Anthropic response: ${responseTime}ms`);

    const newChatHistory = [
      ...chatHistory,
      { role: 'user', content: cleanUserMessage },
      { role: 'assistant', content: response.content[0].text, name: 'Anthropic' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Anthropic error (${responseTime}ms):`, error.message);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Additional fallback endpoints...
app.post('/api/gemini-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!process.env.GEMINI_API_KEY) {
      // Fallback to mock if no API key
      let { chatHistory, newValue, uploadedFiles } = req.body;
      chatHistory = chatHistory.filter(msg => msg.role !== 'system');
      
      const mockResponse = mockAIResponses['gemini-chat'](newValue);
      const newChatHistory = [
        ...chatHistory,
        { role: 'user', content: newValue },
        { role: 'assistant', content: mockResponse, name: 'Gemini' }
      ];
      
      return res.json(newChatHistory);
    }

    // Use actual Gemini API
    let { chatHistory, newValue, uploadedFiles } = req.body;
    chatHistory = chatHistory.filter(msg => msg.role !== 'system');

    // Debug: Log the incoming chat history structure
    console.log('🔍 Gemini - Incoming chat history structure:', {
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
      console.log('⚠️ WARNING: Found messages with empty content:', emptyContentMessages.map((msg, index) => ({
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
    console.log(`🤖 Gemini: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

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
    console.log(`✅ Gemini response: ${responseTime}ms`);

    const newChatHistory = [
      ...chatHistory,
      { role: 'user', content: cleanUserMessage },
      { role: 'assistant', content: text, name: 'Gemini' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ Gemini error (${responseTime}ms):`, error.message);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

app.post('/api/deepseek-r1-chat', async (req, res) => {
  const startTime = Date.now();
  try {
    if (!deepseek) {
      return res.status(500).json({ message: 'DeepSeek API key not configured' });
    }

    let { chatHistory, newValue, uploadedFiles } = req.body;
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
    console.log(`🤖 DeepSeek: ${totalTokens} tokens, ${contextSize}KB context, ${uploadedFiles?.length || 0} files`);

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
    console.log(`✅ DeepSeek response: ${responseTime}ms`);

    const newChatHistory = [
      ...chatHistory,
      { role: 'user', content: cleanUserMessage },
      { role: 'assistant', content: response.choices[0].message.content, name: 'DeepSeek' }
    ];

    res.json(newChatHistory);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ DeepSeek error (${responseTime}ms):`, error.message);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Group Chat Persistence Endpoints

// Save group chat to Cloudant
app.post('/api/save-group-chat', async (req, res) => {
  try {
    const { chatHistory, uploadedFiles, currentUser, connectedKB } = req.body;
    
    if (!chatHistory || chatHistory.length === 0) {
      return res.status(400).json({ message: 'No chat history to save' });
    }

    console.log(`💾 Attempting to save group chat with ${chatHistory.length} messages`);

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
      currentUser: currentUser || 'Unknown User',
      connectedKB: connectedKB || 'No KB connected',
      chatHistory,
      uploadedFiles: uploadedFiles || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participantCount: chatHistory.filter(msg => msg.role === 'user').length,
      messageCount: chatHistory.length,
      isShared: true
    };

    // Use Cloudant client
    const result = await couchDBClient.saveChat(groupChatDoc);
    console.log(`💾 Group chat saved to ${couchDBClient.getServiceInfo().isCloudant ? 'Cloudant' : 'CouchDB'}: ${result.id}`);
    
    res.json({ 
      success: true, 
      chatId: result._id,
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
    
    if (!chat || chat.type !== 'group_chat') {
      return res.status(404).json({ message: 'Group chat not found' });
    }
    
    console.log(`📄 Loaded group chat: ${chatId}`);
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
app.get('/shared/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// API endpoint to load shared chat by share ID
app.get('/api/shared/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    // Use Cloudant client to find chat by share ID
    const chat = await couchDBClient.getChatByShareId(shareId);
    
    if (!chat || chat.type !== 'group_chat') {
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

// Get all group chats for the current user
app.get('/api/group-chats', async (req, res) => {
  try {
    // For now, return all group chats. Later we'll filter by user
    const allChats = await couchDBClient.getAllChats();
    const groupChats = allChats.filter(chat => chat.type === 'group_chat');
    
    // Transform the response to match the frontend GroupChat interface
    const transformedChats = groupChats.map(chat => ({
      id: chat._id, // Map _id to id for frontend
      shareId: chat.shareId,
      currentUser: chat.currentUser,
      connectedKB: chat.connectedKB,
      chatHistory: chat.chatHistory,
      uploadedFiles: chat.uploadedFiles || [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      participantCount: chat.participantCount,
      messageCount: chat.messageCount,
      isShared: chat.isShared
    }));
    
    console.log(`📋 Found ${transformedChats.length} group chats`);
    console.log(`📋 Sample transformed chat:`, transformedChats[0] ? {
      id: transformedChats[0].id,
      shareId: transformedChats[0].shareId,
      currentUser: transformedChats[0].currentUser
    } : 'No chats found');
    res.json(transformedChats);
  } catch (error) {
    console.error('❌ Get group chats error:', error);
    res.status(500).json({ message: `Failed to get group chats: ${error.message}` });
  }
});

// Update existing group chat
app.put('/api/group-chats/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { chatHistory, uploadedFiles, currentUser, connectedKB } = req.body;
    
    if (!chatHistory || chatHistory.length === 0) {
      return res.status(400).json({ message: 'No chat history to update' });
    }

    console.log(`🔄 Attempting to update group chat: ${chatId}`);

    // Get the existing chat
    const existingChat = await couchDBClient.getChat(chatId);
    
    if (!existingChat || existingChat.type !== 'group_chat') {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    // Update the chat document
    const updatedChatDoc = {
      ...existingChat,
      chatHistory,
      uploadedFiles: uploadedFiles || [],
      updatedAt: new Date().toISOString(),
      participantCount: chatHistory.filter(msg => msg.role === 'user').length,
      messageCount: chatHistory.length
    };

    // Save the updated chat
    const result = await couchDBClient.saveChat(updatedChatDoc);
    console.log(`🔄 Group chat updated: ${chatId}`);
    
    res.json({ 
      success: true, 
      chatId: result._id,
      shareId: existingChat.shareId,
      message: 'Group chat updated successfully' 
    });
  } catch (error) {
    console.error('❌ Update group chat error:', error);
    res.status(500).json({ message: `Failed to update group chat: ${error.message}` });
  }
});

// Delete a group chat
app.delete('/api/group-chats/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Get the chat to verify ownership
    const chat = await couchDBClient.getChat(chatId);
    
    if (!chat || chat.type !== 'group_chat') {
      return res.status(404).json({ message: 'Group chat not found' });
    }
    
    // For now, allow deletion. Later we'll add ownership verification
    await couchDBClient.deleteChat(chatId);
    
    console.log(`🗑️ Deleted group chat: ${chatId}`);
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
      chatId: result._id,
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

    console.log(`📋 Loaded ${chats.length} chats for patient ${patientId}`);
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
    
    console.log(`🗑️  Deleted chat: ${chatId}`);
    res.json({ success: true, message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('❌ Delete chat error:', error);
    res.status(500).json({ message: `Failed to delete chat: ${error.message}` });
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
    console.log('🌐 DIGITALOCEAN API REQUEST DETAILS:');
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

// List agents
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await doRequest('/v2/gen-ai/agents');
    console.log(`🤖 Listed ${agents.agents?.length || 0} agents`);
    
    // Transform agents to match frontend expectations
    const transformedAgents = (agents.agents || []).map(agent => ({
      id: agent.uuid,
      name: agent.name,
      description: agent.instruction || '',
      model: agent.model?.name || 'Unknown',
      status: agent.deployment?.status?.toLowerCase().replace('status_', '') || 'unknown',
      instructions: agent.instruction || '',
      uuid: agent.uuid,
      deployment: agent.deployment,
      created_at: agent.created_at,
      updated_at: agent.updated_at
    }));
    
    res.json(transformedAgents);
  } catch (error) {
    console.error('❌ List agents error:', error);
    res.status(500).json({ message: `Failed to list agents: ${error.message}` });
  }
});

// Test route to check if API routes are working
app.get('/api/test', (req, res) => {
  console.log('🔍 /api/test route hit');
  res.json({ message: 'API routes are working' });
});

// Get current agent
app.get('/api/current-agent', async (req, res) => {
  try {
    if (!process.env.DIGITALOCEAN_GENAI_ENDPOINT) {
      console.log('🤖 No agent endpoint configured');
      return res.json({ agent: null });
    }

    // Extract agent UUID from the endpoint URL
    const endpointUrl = process.env.DIGITALOCEAN_GENAI_ENDPOINT;
    // console.log(`🔍 Endpoint URL: ${endpointUrl}`);
    
    // Get all agents and find the one with matching deployment URL
    const agentsResponse = await doRequest('/v2/gen-ai/agents');
    const agents = agentsResponse.agents || agentsResponse.data?.agents || [];
    
    // Find the agent whose deployment URL matches our endpoint
    const matchingAgent = agents.find(agent => 
      agent.deployment?.url === endpointUrl.replace('/api/v1', '')
    );
    
    if (!matchingAgent) {
      console.log('❌ No agent found with matching deployment URL');
      return res.json({ agent: null, message: 'No agent found with this deployment URL' });
    }
    
    const agentId = matchingAgent.uuid;
    // console.log(`🔍 Found matching agent: ${matchingAgent.name} (${agentId})`);
    
    // Get agent details including associated knowledge bases
    const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentResponse.agent || agentResponse.data?.agent || agentResponse.data || agentResponse;
    
    // console.log(`📋 Agent details from API:`, JSON.stringify(agentData, null, 2));
    
    // Extract knowledge base information
    let connectedKnowledgeBases = [];
    let warning = null;
    
    if (agentData.knowledge_bases && agentData.knowledge_bases.length > 0) {
      if (agentData.knowledge_bases.length > 1) {
        // Multiple KBs detected - this is a safety issue
        warning = `⚠️ WARNING: Agent has ${agentData.knowledge_bases.length} knowledge bases attached. This can cause data contamination and hallucinations. Please check the DigitalOcean dashboard and ensure only one KB is attached.`;
        console.log(`🚨 Multiple KBs detected: ${agentData.knowledge_bases.length} KBs attached to agent`);
      }
      
      connectedKnowledgeBases = agentData.knowledge_bases; // Return ALL connected KBs
      console.log(`📚 Found ${connectedKnowledgeBases.length} associated KBs:`);
      connectedKnowledgeBases.forEach((kb, index) => {
        console.log(`  ${index + 1}. ${kb.name} (${kb.uuid})`);
      });
    } else {
      console.log(`📚 No knowledge bases associated with agent`);
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
      knowledgeBases: connectedKnowledgeBases // Add all connected KBs
    };

    const endpoint = process.env.DIGITALOCEAN_GENAI_ENDPOINT + '/api/v1';
    
    console.log(`🤖 Current agent: ${transformedAgent.name} (${transformedAgent.id})`);
    if (connectedKnowledgeBases.length > 0) {
      console.log(`📚 Current KB: ${connectedKnowledgeBases[0].name} (${connectedKnowledgeBases[0].uuid})`);
    }

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

// Create agent
app.post('/api/agents', async (req, res) => {
  try {
    const { name, description, model, model_uuid, instructions } = req.body;
    
    // Validate agent name - DigitalOcean only allows lowercase, numbers, and dashes
    const validName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    console.log(`🔍 Original name: "${name}" -> Valid name: "${validName}"`);
    
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
      console.log(`🔍 Found ${validModels.length} valid models out of ${modelArray.length} total`);
      console.log(`🔍 Looking for model UUID: ${model_uuid}`);
      console.log(`🔍 Available models: ${validModels.map(m => `${m.name} (${m.uuid})`).join(', ')}`);
      
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
      console.log(`🔍 Found ${validModels.length} valid models out of ${modelArray.length} total`);
      console.log(`🔍 Looking for model: ${model}`);
      console.log(`🔍 Available models: ${validModels.map(m => m.name).join(', ')}`);
      
      selectedModel = validModels.find(m => m.name.toLowerCase().includes(model.toLowerCase()));
      
      if (!selectedModel) {
        return res.status(400).json({ message: `Model '${model}' not found. Available models: ${validModels.map(m => m.name).join(', ')}` });
      }
    } else {
      return res.status(400).json({ message: 'Either model or model_uuid is required' });
    }
    
    // Get available regions
    const regions = await doRequest('/v2/gen-ai/regions');
    const defaultRegion = regions.regions[0]?.region || 'tor1';
    
    const agentData = {
      name: validName,
      description,
      model_uuid: selectedModel.uuid,
      instruction: instructions,
      region: defaultRegion,
      project_id: process.env.DIGITALOCEAN_PROJECT_ID || '37455431-84bd-4fa2-94cf-e8486f8f8c5e' // Default project ID
    };

    // Log the exact payload being sent to DigitalOcean
    console.log('🚀 DIGITALOCEAN AGENT CREATION PAYLOAD:');
    console.log('========================================');
    console.log(JSON.stringify(agentData, null, 2));
    console.log('========================================');
    console.log(`🔗 Endpoint: ${process.env.DIGITALOCEAN_BASE_URL}/v2/gen-ai/agents`);
    console.log(`🔑 Token: ${process.env.DIGITALOCEAN_TOKEN ? 'Present' : 'Missing'}`);
    console.log(`📋 Project ID: ${agentData.project_id}`);

    const agent = await doRequest('/v2/gen-ai/agents', {
      method: 'POST',
      body: JSON.stringify(agentData)
    });

    console.log(`🤖 Created agent: ${validName}`);
    res.json(agent.data);
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

    console.log(`🤖 Updated agent: ${agentId}`);
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

    console.log(`🗑️  Deleted agent: ${agentId}`);
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

    res.json(mergedKBs);
  } catch (error) {
    console.error('❌ Failed to fetch merged knowledge bases:', error);
    res.status(500).json({ error: 'Failed to fetch knowledge bases' });
  }
});

// List available models
app.get('/api/models', async (req, res) => {
  try {
    const models = await doRequest('/v2/gen-ai/models');
    console.log(`🤖 Models response:`, JSON.stringify(models, null, 2));
    
    // Handle different response formats
    const modelData = models.data || models.models || models;
    const modelArray = Array.isArray(modelData) ? modelData : [];
    
    console.log(`🤖 Found ${modelArray.length} available models`);
    res.json(modelArray);
  } catch (error) {
    console.error('❌ List models error:', error);
    res.status(500).json({ message: `Failed to list models: ${error.message}` });
  }
});

// Set current agent
app.post('/api/current-agent', async (req, res) => {
  try {
    const { agentId } = req.body;
    
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
    
    // Set the current agent endpoint
    const endpoint = selectedAgent.deployment?.url + '/api/v1';
    process.env.DIGITALOCEAN_GENAI_ENDPOINT = endpoint;
    
    console.log(`✅ Set current agent to: ${selectedAgent.name} (${agentId})`);
    console.log(`🔗 Endpoint: ${endpoint}`);
    
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

// Create knowledge base
app.post('/api/knowledge-bases', async (req, res) => {
  try {
    const { name, description, document_uuids } = req.body;
    
    // Get available embedding models first
    let embeddingModelId = null;
    
    try {
      const modelsResponse = await doRequest('/v2/gen-ai/models');
      console.log(`🔍 Models response structure:`, Object.keys(modelsResponse));
      const models = modelsResponse.models || modelsResponse.data?.models || [];
      console.log(`🔍 Found ${models.length} models`);
      
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
        console.log(`📚 Using embedding model: ${preferredModel.name} (${embeddingModelId})`);
        console.log(`🔍 embeddingModelId after assignment: ${embeddingModelId}`);
      } else {
        console.log(`⚠️ No embedding models found, proceeding without specific embedding model`);
      }
    } catch (modelError) {
      console.log(`⚠️ Failed to get models, proceeding without specific embedding model`);
    }
    
    const kbData = {
      name,
      description,
      project_id: '90179b7c-8a42-4a71-a036-b4c2bea2fe59',
      database_uuid: 'genai-driftwood',
      datasources: [
        {
          type: 'text',
          content: 'This is a sample knowledge base for testing purposes.'
        }
      ]
    };

    // Try with embedding model ID
    // Try with embedding model UUID
    console.log(`🔍 embeddingModelId before check: ${embeddingModelId}`);
    if (embeddingModelId) {
      kbData.embedding_model_uuid = embeddingModelId;
      console.log(`🔍 Sending embedding model UUID: ${embeddingModelId}`);
    } else {
      console.log(`🔍 No embedding model specified, letting DigitalOcean choose default`);
    }

    console.log(`📚 Creating knowledge base: ${name}${embeddingModelId ? ` with embedding model: ${embeddingModelId}` : ''}`);
    console.log(`🔍 Request body: ${JSON.stringify(kbData, null, 2)}`);
    const knowledgeBase = await doRequest('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(kbData)
    });

    const kbId = knowledgeBase.data?.uuid || knowledgeBase.uuid;
    console.log(`✅ Created knowledge base: ${name} (${kbId})`);

    // If documents are provided, add them as data sources
    if (document_uuids && document_uuids.length > 0) {
      console.log(`📄 Adding ${document_uuids.length} documents to knowledge base`);
      
      for (const docId of document_uuids) {
        try {
          // For now, we'll create a simple text data source
          // In a real implementation, you'd need to store the document content
          const dataSourceData = {
            type: 'file_upload',
            source: `document_${docId}.txt` // Placeholder - in real app, you'd have actual file content
          };

          const dataSource = await doRequest(`/v2/gen-ai/knowledge_bases/${kbId}/data_sources`, {
            method: 'POST',
            body: JSON.stringify(dataSourceData)
          });

          console.log(`✅ Added document ${docId} as data source`);
        } catch (docError) {
          console.error(`❌ Failed to add document ${docId}:`, docError.message);
        }
      }
    }

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
    console.log(`📚 Retrieved knowledge base: ${kbId}`);
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

    console.log(`📚 Added data source to KB ${kbId}: ${type} - ${source}`);
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

    console.log(`📚 Started indexing job for KB ${kbId}, data source ${dsId}`);
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
    console.log(`📚 Retrieved indexing job status: ${jobId}`);
    res.json(jobStatus.data);
  } catch (error) {
    console.error('❌ Get indexing job status error:', error);
    res.status(500).json({ message: `Failed to get indexing job status: ${error.message}` });
  }
});

// Associate knowledge base with agent
app.post('/api/agents/:agentId/knowledge-bases/:kbId', async (req, res) => {
  try {
    const { agentId, kbId } = req.params;
    const currentUser = getCurrentUser(req);
    
    console.log(`🔗 [DO API] Attempting to attach KB ${kbId} to agent ${agentId}`);

    // Check protection status using Cloudant directly (source of truth for security)
    let isProtected = false;
    let kbOwner = null;
    
    try {
      // Query Cloudant directly for KB ownership and protection status
      const kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
      
      if (kbDoc) {
        // Check if the knowledge base has owner information or is marked as protected
        if (kbDoc.owner || kbDoc.isProtected) {
          isProtected = true;
          kbOwner = kbDoc.owner || 'unknown';
          console.log(`🔒 [SECURITY] KB ${kbId} is PROTECTED - owner: ${kbOwner}, isProtected: ${kbDoc.isProtected}`);
        } else {
          console.log(`✅ [SECURITY] KB ${kbId} is UNPROTECTED - no owner restrictions`);
        }
      } else {
        console.log(`❌ [SECURITY] KB ${kbId} not found in Cloudant - treating as protected for safety`);
        isProtected = true;
      }
    } catch (cloudantError) {
      console.log(`❌ [SECURITY] Failed to check Cloudant KB protection status:`, cloudantError.message);
      // If we can't determine protection status, treat as protected for safety
      isProtected = true;
      console.log(`🔒 [SECURITY] Treating KB ${kbId} as PROTECTED due to Cloudant check error (fail-safe)`);
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
      if (kbOwner && kbOwner !== 'unknown' && kbOwner !== currentUser.username) {
        console.log(`🔄 [OWNERSHIP TRANSFER] User ${currentUser.username} attempting to access KB owned by ${kbOwner}`);
        
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
      
      console.log(`✅ [SECURITY] User ${currentUser.username} verified as owner of protected KB ${kbId}`);
    } else {
      console.log(`✅ [SECURITY] Unprotected KB ${kbId} - no authentication required`);
    }

    let attachSuccess = false;
    let attachResult = null;

    // First, try the standard attach endpoint
    try {
      console.log(`🔄 [DO API] Attempt 1: Standard attach endpoint`);
      const result = await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${kbId}`, {
        method: 'POST'
        // No body needed - KB UUID is in the URL path
      });

      console.log(`✅ [DO API] Standard attach response:`, JSON.stringify(result, null, 2));
      attachResult = result;
      
      // Check if the first attempt worked by looking at the response
      const agentData = result.agent || result.data?.agent || result.data || result;
      const attachedKBs = agentData.knowledge_bases || [];
      
      console.log(`📚 [VERIFICATION] First attempt - Agent has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid));
      
      const isAttached = attachedKBs.some(kb => kb.uuid === kbId);
      if (isAttached) {
        console.log(`✅ [VERIFICATION] KB ${kbId} successfully attached to agent ${agentId}`);
        
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
            console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
          }
        } catch (cloudantUpdateError) {
          console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
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
        console.log(`❌ [VERIFICATION] First attempt failed - KB ${kbId} not found in response`);
        
        // Try to get the agent details separately to verify
        try {
          console.log(`🔍 [VERIFICATION] Making separate API call to get agent details`);
          const agentDetails = await doRequest(`/v2/gen-ai/agents/${agentId}`);
          console.log(`📚 [VERIFICATION] Agent details response:`, JSON.stringify(agentDetails, null, 2));
          
          const detailedAgentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
          const detailedKBs = detailedAgentData.knowledge_bases || [];
          
          console.log(`📚 [VERIFICATION] Separate call - Agent has ${detailedKBs.length} KBs:`, detailedKBs.map(kb => kb.uuid));
          
          const isActuallyAttached = detailedKBs.some(kb => kb.uuid === kbId);
          if (isActuallyAttached) {
            console.log(`✅ [VERIFICATION] KB ${kbId} successfully attached to agent ${agentId} (verified via separate call)`);
            
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
                console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
              }
            } catch (cloudantUpdateError) {
              console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
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
            console.log(`❌ [VERIFICATION] KB ${kbId} still not attached after separate verification`);
          }
        } catch (verificationError) {
          console.log(`❌ [VERIFICATION] Failed to get agent details:`, verificationError.message);
        }
      }
    } catch (attachError) {
      console.log(`❌ [DO API] Standard attach failed:`, attachError.message);
    }
    
    // Always try the alternative approach as well
    try {
      console.log(`🔄 [DO API] Attempt 2: Agent update endpoint`);
      const updateResult = await doRequest(`/v2/gen-ai/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify({
          knowledge_base_uuids: [kbId]
        })
      });
      
      console.log(`✅ [DO API] Agent update response:`, JSON.stringify(updateResult, null, 2));
      attachResult = updateResult;
    } catch (updateError) {
      console.log(`❌ [DO API] Agent update failed:`, updateError.message);
    }
    
    // Add a small delay to allow the API to process the attachment
    console.log(`⏳ [VERIFICATION] Waiting 2 seconds for API to process attachment...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the attachment by fetching the agent's current knowledge bases
    console.log(`🔍 [VERIFICATION] Verifying attachment for agent ${agentId}`);
    const verificationResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = verificationResponse.data || verificationResponse;
    const attachedKBs = agentData.knowledge_bases || [];
    
    console.log(`📚 [VERIFICATION] Agent has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid));
    
    const isAttached = attachedKBs.some(kb => kb.uuid === kbId);
    if (isAttached) {
      console.log(`✅ [VERIFICATION] KB ${kbId} successfully attached to agent ${agentId}`);
      
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
          console.log(`✅ [CLOUDANT] Updated KB ${kbId} attachment info in Cloudant`);
        }
      } catch (cloudantUpdateError) {
        console.log(`⚠️ [CLOUDANT] Failed to update KB attachment info:`, cloudantUpdateError.message);
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
      console.log(`❌ [VERIFICATION] KB ${kbId} was NOT attached to agent ${agentId}`);
      console.log(`❌ [VERIFICATION] Expected KB: ${kbId}`);
      console.log(`❌ [VERIFICATION] Found KBs: ${attachedKBs.map(kb => kb.uuid).join(', ')}`);
      
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

// In-memory storage for agent-KB associations (since DigitalOcean API doesn't provide this)
const agentKnowledgeBaseAssociations = new Map();

// Get agent's associated knowledge bases
app.get('/api/agents/:agentId/knowledge-bases', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    console.log(`🔍 Fetching knowledge bases for agent: ${agentId}`);
    
    // Get agent details including associated knowledge bases
    const agentResponse = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentResponse.data || agentResponse;
    
    // Extract knowledge bases from agent data
    const knowledgeBases = agentData.knowledge_bases || [];
    
    console.log(`📚 Found ${knowledgeBases.length} knowledge bases for agent ${agentId}`);
    
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
    
    console.log(`🔗 [DO API] Detaching KB ${kbId} from agent ${agentId}`);

    // Note: Detachment is allowed without authentication as it's a safe operation
    // that follows the principle of least privilege - removing access is secure

    // Use the correct DigitalOcean API endpoint for detach
    const result = await doRequest(`/v2/gen-ai/agents/${agentId}/knowledge_bases/${kbId}`, {
      method: 'DELETE'
    });

    console.log(`✅ [DO API] Detach response:`, JSON.stringify(result, null, 2));
    
    // Wait a moment for the API to process
    console.log(`⏳ [VERIFICATION] Waiting 2 seconds for API to process detachment...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify the detachment by getting the agent details
    console.log(`🔍 [VERIFICATION] Verifying detachment for agent ${agentId}`);
    const agentDetails = await doRequest(`/v2/gen-ai/agents/${agentId}`);
    const agentData = agentDetails.agent || agentDetails.data?.agent || agentDetails.data || agentDetails;
    const attachedKBs = agentData.knowledge_bases || [];
    
    console.log(`📚 [VERIFICATION] Agent has ${attachedKBs.length} KBs:`, attachedKBs.map(kb => kb.uuid));
    
    const isStillAttached = attachedKBs.some(kb => kb.uuid === kbId);
    if (isStillAttached) {
      console.log(`❌ [VERIFICATION] KB ${kbId} is still attached to agent ${agentId}`);
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
      console.log(`✅ [VERIFICATION] KB ${kbId} successfully detached from agent ${agentId}`);
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
    
    console.log(`🔄 Manually synced KB ${kbName} (${kbId}) with agent ${agentId}`);
    
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

    console.log(`🚀 Setup MAIA environment for ${patientId}`);
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

// Mount passkey routes
app.use('/api/passkey', passkeyRoutes);

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

// Pass the CouchDB client to the routes
setCouchDBClient(couchDBClient);
setAdminCouchDBClient(couchDBClient);

// Mount KB protection routes
app.use('/api/kb-protection', kbProtectionRoutes);

// Mount admin routes
app.use('/api/admin', adminRoutes);

// =============================================================================
// CATCH-ALL ROUTE FOR SPA
// =============================================================================

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 MAIA Secure Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`👤 Single Patient Mode: ${process.env.SINGLE_PATIENT_MODE === 'true' ? 'Enabled' : 'Disabled'}`);
      console.log(`🔗 Health check: ${process.env.ORIGIN || `http://localhost:${PORT}`}/health`);
}); 