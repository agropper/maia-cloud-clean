# Domain Configuration Guide

## Overview
This guide covers domain configuration for both local development and production deployment, including the new flexible passkey authentication system that automatically handles domain configuration and prevents common WebAuthn verification errors.

## Current Issue
The `.env.backup` file has domain references scattered throughout different sections, making it difficult to configure for different environments.

## Recommended Reorganization

### 1. Create a Dedicated Domain Section
Move all domain-related configuration to a single section near the top of the file:

```bash
# =============================================================================
# DOMAIN & ENVIRONMENT CONFIGURATION
# =============================================================================
# IMPORTANT: Update these values based on your deployment environment
# 
# For LOCAL DEVELOPMENT:
#   - RP_ID=localhost
#   - ORIGIN=http://localhost:3001
#   - CORS_ORIGIN=http://localhost:3001
#   - ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
#
# For PRODUCTION DEPLOYMENT:
#   - RP_ID=your-actual-domain.com (without https://)
#   - ORIGIN=https://your-actual-domain.com
#   - CORS_ORIGIN=https://your-actual-domain.com
#   - ALLOWED_ORIGINS=https://your-actual-domain.com
#
# Example for DigitalOcean App Platform:
#   - RP_ID=maia-cloud-clean-kjho4.ondigitalocean.app
#   - ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
#   - CORS_ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
#   - ALLOWED_ORIGINS=https://maia-cloud-clean-kjho4.ondigitalocean.app

NODE_ENV=development
PORT=3001
RP_ID=localhost
ORIGIN=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
```

### 2. Variables to Consolidate
The following variables should be moved to the domain section:

- `NODE_ENV` (from APPLICATION CONFIGURATION)
- `PORT` (from APPLICATION CONFIGURATION)
- `RP_ID` (from PASSKEY AUTHENTICATION)
- `ORIGIN` (from PASSKEY AUTHENTICATION)
- `CORS_ORIGIN` (from CORS SETTINGS)
- `ALLOWED_ORIGINS` (from CORS SETTINGS)

### 3. Benefits of This Organization
- **Single source of truth** for domain configuration
- **Clear examples** for different environments
- **Easier deployment** configuration
- **Reduced errors** from mismatched domain settings
- **Better documentation** for team members

### 4. Environment-Specific Examples

#### Local Development
```bash
NODE_ENV=development
RP_ID=localhost
ORIGIN=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
```

#### Production (DigitalOcean)
```bash
NODE_ENV=production
RP_ID=maia-cloud-clean-kjho4.ondigitalocean.app
ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
CORS_ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
ALLOWED_ORIGINS=https://maia-cloud-clean-kjho4.ondigitalocean.app
```

#### Production (Custom Domain)
```bash
NODE_ENV=production
RP_ID=yourdomain.com
ORIGIN=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

## Implementation Steps
1. Create the new DOMAIN & ENVIRONMENT CONFIGURATION section
2. Move all domain-related variables to this section
3. Remove the scattered domain references from other sections
4. Update the comments to reflect the new organization
5. Test the configuration in both local and production environments

## Passkey Authentication Configuration

### Overview
The passkey system now supports flexible configuration through multiple environment variable options, with automatic fallback logic.

### Environment Variable Priority
The system checks for passkey configuration in this order (highest to lowest priority):

1. **Explicit Passkey Variables** (highest priority)
   - `PASSKEY_RPID` - Specific domain for passkey authentication
   - `PASSKEY_ORIGIN` - Specific origin URL for passkey authentication

2. **General Domain Variables**
   - `DOMAIN` - General domain setting (used for both passkey and other services)
   - `HTTPS` - Protocol setting (true/false, defaults to http if not set)

3. **Production Fallback**
   - `NODE_ENV=production` - Uses hardcoded production domain

4. **Development Fallback** (lowest priority)
   - Defaults to `localhost` for local development

### Configuration Examples

#### Option 1: Explicit Passkey Configuration (Recommended)
```bash
# Most flexible and explicit
PASSKEY_RPID=your-domain.com
PASSKEY_ORIGIN=https://your-domain.com
```

#### Option 2: General Domain Configuration
```bash
# Good for consistent domain usage across all services
DOMAIN=your-domain.com
HTTPS=true
```

#### Option 3: Production Mode
```bash
# Simple but less flexible
NODE_ENV=production
```

### Important Notes

#### Trailing Slash Handling
- The system automatically removes trailing slashes from origins
- This prevents WebAuthn verification errors due to origin mismatch
- Example: `https://domain.com/` becomes `https://domain.com`

#### Protocol Detection
- If `HTTPS=true`, the system automatically uses `https://`
- If `HTTPS` is not set or false, the system uses `http://`
- Port numbers are automatically appended if `PORT` environment variable is set

### Troubleshooting

#### Common Issues
1. **"Failed to verify registration"** - Usually indicates domain/origin mismatch
2. **"Unexpected registration response origin"** - Check for trailing slash differences
3. **Passkey creation fails in cloud** - Verify environment variables are set correctly

#### Debug Information
The system logs detailed passkey configuration information on startup:
```
🔍 Passkey Configuration:
  - NODE_ENV: production
  - rpID: your-domain.com
  - origin: https://your-domain.com
  - ORIGIN env var: https://your-domain.com
```

### Migration from Old Configuration
If you were previously using hardcoded domain values:
1. Set the appropriate environment variables for your deployment
2. The system will automatically use the new flexible configuration
3. No code changes required - just environment variable updates
