# Hardcoded Secrets That Need to Be Fixed

## ✅ Fixed (Removed from Code)
1. **RESEND_API_KEY** - Hardcoded fallback removed from `src/routes/admin-routes.js`
2. **RESEND_FROM_EMAIL** - Hardcoded fallback removed from `src/routes/admin-routes.js`
3. **RESEND_ADMIN_EMAIL** - Hardcoded fallback removed from `src/routes/admin-routes.js`

## ❌ Still Have Hardcoded Fallbacks (Need to Fix)

### Critical Security Issues:

#### 1. Database Password (CRITICAL)
**File**: `src/utils/couchdb-client.js` line 9
**File**: `src/utils/knowledge-base-manager.js` line 9
```javascript
password: config.password || process.env.CLOUDANT_PASSWORD || process.env.COUCHDB_PASSWORD || 'MaiaSecure2024!'
```
**Risk**: HIGH - If env var not set, uses hardcoded password

#### 2. DigitalOcean AWS Access Keys (CRITICAL)
**File**: `server.js` (multiple locations, lines 1084-1085, 1449-1450, etc.)
```javascript
accessKeyId: process.env.DIGITALOCEAN_AWS_ACCESS_KEY_ID || 'DO00EZW8AB23ECHG3AQF',
secretAccessKey: process.env.DIGITALOCEAN_AWS_SECRET_ACCESS_KEY || 'f1Ru0xraU0lHApvOq65zSYMx9nzoylus4kn7F9XXSBs'
```
**Risk**: HIGH - Provides access to S3 bucket

#### 3. Session Secret (HIGH)
**File**: `server.js` line 473
```javascript
secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this'
```
**Risk**: HIGH - Weak session key can be compromised

#### 4. Project ID (MEDIUM)
**File**: `server.js` line 6372
```javascript
project_id: process.env.DIGITALOCEAN_PROJECT_ID || '37455431-84bd-4fa2-94cf-e8486f8f8c5e'
```
**Risk**: MEDIUM - Project identifier

## Recommendations

All these should:
1. Require environment variables to be set
2. Throw errors if missing in production
3. Only use defaults in development/localhost

Example pattern:
```javascript
if (!process.env.REQUIRED_VAR) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REQUIRED_VAR environment variable not set');
  }
  // Only use default in development
  return 'default-value';
}
```
