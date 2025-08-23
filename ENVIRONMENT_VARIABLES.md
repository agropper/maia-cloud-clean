# Environment Variables Configuration

## **🎯 MILESTONE: Safari Compatibility & CSP Security (August 2025)**
**Status: ✅ COMPLETED**

### **What Was Accomplished:**
1. **Fixed Safari Content Security Policy (CSP) Issues**
   - Resolved `frame-ancestors` directive errors that prevented Safari from loading pages
   - Added Safari-compatible CSP directives for proper JavaScript execution
   - Implemented proper `workerSrc` and `childSrc` for PDF.js functionality

2. **Enhanced Security Configuration**
   - Comprehensive CSP with Safari compatibility
   - Added Safari-specific security headers for better compatibility
   - Implemented proper asset caching for production deployments

3. **Resolved Environment Variable Conflicts**
   - Fixed `RP_ID` vs `PASSKEY_RPID` naming inconsistencies
   - Updated `.env.backup` to use correct variable names
   - Standardized local and cloud environment configurations

4. **Improved Browser Compatibility**
   - Safari now loads pages completely (was showing partial "My MAIA Summarize")
   - Chrome continues to work as expected
   - PDF functionality works across all browsers

### **Technical Changes Made:**
- **CSP Configuration**: Added Safari-compatible directives including `frame-ancestors`, `workerSrc`, `childSrc`
- **Security Headers**: Added Safari-specific headers for better compatibility
- **Asset Caching**: Implemented proper caching for production assets
- **Environment Variables**: Standardized on `PASSKEY_RPID` and `PASSKEY_ORIGIN` naming

---

## **🔐 Required Environment Variables**

### **ADMIN_PASSWORD**
- **Purpose**: Administrative password for KB ownership transfers and other admin operations
- **Type**: String
- **Required**: Yes (for production deployments)
- **Security**: High - This password controls administrative access to the system

#### **Usage**
```bash
# In your .env file
ADMIN_PASSWORD=your-secure-admin-password-here

# In production (DigitalOcean App Platform)
ADMIN_PASSWORD=your-production-admin-password
```

#### **Security Requirements**
- **Minimum Length**: 12 characters
- **Complexity**: Include uppercase, lowercase, numbers, and special characters
- **Storage**: Never commit to version control
- **Rotation**: Change periodically (recommended: every 90 days)

#### **Example Secure Password**
```
ADMIN_PASSWORD=MAIA-Admin-2025-Secure!@#
```

## **🌐 Domain Configuration**

### **PASSKEY_RPID** ⭐ **CORRECTED VARIABLE NAME**
- **Purpose**: Domain for passkey authentication (Relying Party ID)
- **Type**: String (domain without protocol)
- **Required**: Yes (for passkey functionality)
- **Note**: This replaces the old `RP_ID` variable

```bash
# Local development
PASSKEY_RPID=localhost

# Production
PASSKEY_RPID=your-domain.com
```

### **PASSKEY_ORIGIN** ⭐ **CORRECTED VARIABLE NAME**
- **Purpose**: Full URL for passkey authentication (including protocol)
- **Type**: URL
- **Required**: Yes (for passkey functionality)
- **Note**: This replaces the old `ORIGIN` variable

```bash
# Local development
PASSKEY_ORIGIN=http://localhost:3001

# Production
PASSKEY_ORIGIN=https://your-domain.com
```

### **DOMAIN** ⭐ **NEW VARIABLE**
- **Purpose**: General domain setting for the application
- **Type**: String (domain without protocol)
- **Required**: No (but recommended for consistency)

```bash
# Local development
DOMAIN=localhost

# Production
DOMAIN=your-domain.com
```

### **ORIGIN** ⚠️ **DEPRECATED - Use PASSKEY_ORIGIN instead**
- **Purpose**: Base URL for the application (used for CORS and passkey configuration)
- **Type**: URL
- **Required**: No (defaults to localhost:3001 for development)
- **Status**: Deprecated - Use `PASSKEY_ORIGIN` for new deployments

```bash
# Local development
ORIGIN=http://localhost:3001

# Production
ORIGIN=https://your-domain.com
```

### **ALLOWED_ORIGINS**
- **Purpose**: Comma-separated list of allowed CORS origins
- **Type**: Comma-separated URLs
- **Required**: No (defaults to ORIGIN or localhost:3001)

```bash
# Multiple origins
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com,http://localhost:3001
```

## **🔑 AI Service Configuration**

### **ANTHROPIC_API_KEY**
- **Purpose**: API key for Anthropic Claude integration
- **Type**: String
- **Required**: Yes (for Claude functionality)

### **GEMINI_API_KEY**
- **Purpose**: API key for Google Gemini integration
- **Type**: String
- **Required**: Yes (for Gemini functionality)

### **DEEPSEEK_API_KEY**
- **Purpose**: API key for DeepSeek integration
- **Type**: String
- **Required**: Yes (for DeepSeek functionality)

### **DIGITALOCEAN_API_TOKEN**
- **Purpose**: API token for DigitalOcean Personal AI
- **Type**: String
- **Required**: Yes (for DigitalOcean AI functionality)

## **🗄️ Database Configuration**

### **CLOUDANT_URL**
- **Purpose**: Cloudant/CouchDB connection URL
- **Type**: URL
- **Required**: Yes

### **CLOUDANT_API_KEY**
- **Purpose**: Cloudant/CouchDB API key
- **Type**: String
- **Required**: Yes

## **🔒 Security Configuration**

### **SESSION_SECRET**
- **Purpose**: Secret key for Express session encryption
- **Type**: String
- **Required**: Yes
- **Security**: High - Must be unique and secure

```bash
SESSION_SECRET=your-super-secret-session-key-change-this
```

## **🛡️ Content Security Policy (CSP) Configuration**

### **Overview**
The application now includes a comprehensive Content Security Policy that ensures security while maintaining compatibility across all browsers, especially Safari.

### **CSP Directives Implemented**
```javascript
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
}
```

### **Safari-Specific Headers**
```javascript
// Safari-specific headers for better compatibility
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'SAMEORIGIN');
res.setHeader('X-XSS-Protection', '1; mode=block');

// Allow Safari to cache resources properly
if (req.path.startsWith('/assets/')) {
  res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year for assets
}
```

### **Why This Configuration Works**
1. **`frame-ancestors: 'self'`** - Fixes Safari frame loading issues
2. **`workerSrc: ['self', 'blob:', 'data:']`** - Enables PDF.js Web Workers in Safari
3. **`childSrc: ['self', 'blob:', 'data:']`** - Allows blob URLs for PDF rendering
4. **Safari-specific headers** - Improves compatibility and security
5. **Asset caching** - Better performance for production deployments

### **Browser Compatibility**
- **Chrome**: Full functionality with enhanced security
- **Safari**: Now fully compatible with proper page loading
- **Firefox**: Benefits from improved CSP configuration
- **Edge**: Enhanced security and compatibility

### **NODE_ENV**
- **Purpose**: Application environment (development/production)
- **Type**: String
- **Required**: No (defaults to development)
- **Values**: `development`, `production`

## **📱 Application Configuration**

### **PORT**
- **Purpose**: Server port number
- **Type**: Number
- **Required**: No (defaults to 3001)

### **SINGLE_PATIENT_MODE**
- **Purpose**: Enable single patient mode for simplified operation
- **Type**: Boolean
- **Required**: No (defaults to false)

```bash
SINGLE_PATIENT_MODE=true
```

## **📊 Logging Configuration**

### **ENABLE_REQUEST_LOGGING**
- **Purpose**: Enable detailed request logging
- **Type**: Boolean
- **Required**: No (defaults to false)

```bash
ENABLE_REQUEST_LOGGING=true
```

## **🔧 Development Configuration**

### **Example .env File**
```bash
# Admin Configuration
ADMIN_PASSWORD=MAIA-Admin-2025-Secure!@#

# Domain Configuration
ORIGIN=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3001

# AI Service Keys
ANTHROPIC_API_KEY=your-anthropic-key
GEMINI_API_KEY=your-gemini-key
DEEPSEEK_API_KEY=your-deepseek-key
DIGITALOCEAN_API_TOKEN=your-do-token

# Database Configuration
CLOUDANT_URL=your-cloudant-url
CLOUDANT_API_KEY=your-cloudant-key

# Security
SESSION_SECRET=your-super-secret-session-key-change-this

# Application
PORT=3001
NODE_ENV=development
SINGLE_PATIENT_MODE=false
ENABLE_REQUEST_LOGGING=true
```

## **🚀 Production Deployment**

### **DigitalOcean App Platform**
When deploying to DigitalOcean App Platform, set these environment variables in the dashboard:

1. **Go to your app** → **Settings** → **Environment Variables**
2. **Add each variable** with the appropriate value
3. **Ensure ADMIN_PASSWORD** is set to a secure production value
4. **Set NODE_ENV** to `production`
5. **Set ORIGIN** to your production domain

### **Security Checklist**
- [ ] **ADMIN_PASSWORD** is set and secure
- [ ] **SESSION_SECRET** is unique and secure
- [ ] **All API keys** are valid and active
- [ ] **Database credentials** are correct
- [ ] **CORS origins** are properly configured
- [ ] **NODE_ENV** is set to `production`

## **⚠️ Security Warnings**

1. **Never commit** `.env` files to version control
2. **Rotate passwords** and API keys regularly
3. **Use strong passwords** for admin access
4. **Monitor access logs** for suspicious activity
5. **Backup environment variables** securely
6. **Limit admin access** to authorized personnel only

---

**Last Updated**: 2025-08-15  
**Version**: 1.1.0  
**Security Level**: HIGH
